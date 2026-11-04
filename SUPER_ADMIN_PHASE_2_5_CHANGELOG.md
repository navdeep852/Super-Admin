# VISTAAR Super Admin - Phase 2.5 Security, Schema & Settlement Resolution Changelog

**Document Version:** 2.5.0  
**Effective Date:** 2026-11-01  
**Project:** VISTAAR Super Admin Control Plane (`navdeep852/Super-Admin`)  
**Deployment Target:** `admin.vistaarone.com`  
**Backend:** Existing Production Supabase Project (`https://kluxsykimnjivkqxelba.supabase.co`)  
**Status:** Complete Technical Blocker Resolution — Architecture & Design Only

---

## 1. Executive Summary of Corrections

Phase 2.5 addresses the six critical technical and commercial blockers identified during the final security inspection of Phase 2.4 documentation. All architectural blueprints, database designs, coupon specifications, and security models have been revised, reconciled, and aligned with production schema realities.

### Key Architectural Resolutions:
1. **Elimination of `payment.authorized`:** Removed uncaptured payment statuses from accepted settlement criteria. Only strictly confirmed captured funds (`'captured'`, `'verified_success'`) from allowed provider `'youpi_pg'` can settle redemptions. Late payments authorized after reservation expiry are routed to `'requires_support_review'` and never silently activate subscriptions.
2. **Customer Identity Contract Delineation:** Fully articulated the security boundary between the Gateway BFF and the PostgreSQL engine. Browser-supplied IDs are completely ignored; the Gateway extracts `sub` strictly from verified JWTs, and the database verifies ownership without assuming non-existent columns.
3. **Production Schema Compatibility (`workspaces.owner_id` Removal):** Replaced all references to non-existent `workspaces.owner_id` with canonical ownership paths verified in production migrations (`001_initial_schema.sql`, `058_organization_branch_architecture.sql`): `organizations.owner_user_id`, `profiles.role = 'owner'`, `workspace_memberships.role = 'owner'`, and matching `workspaces.owner_email`. Enforced Title Case for `public.employee_status` ENUM (`'Active'`, `'Suspended'`).
4. **State-Preserving Workspace Suspension & Reactivation:** Created `public.platform_workspace_suspensions` to snapshot user IDs active at the moment of suspension. Reactivation restores *only* those snapshotted users, guaranteeing that previously inactive or terminated employees remain inactive.
5. **Subscription Commercial Rules & Mid-Cycle Block (Blocker 6):** Specified mathematical period calculations for same-plan renewals (zero remaining paid days lost), trial conversions, and post-expiry renewals. Explicitly blocked mid-cycle plan switches (`MID_CYCLE_PLAN_CHANGE_BLOCKED`) pending business leadership approval of proration and credit formulas.
6. **Audit & Nonce Concurrency Controls:** Reaffirmed atomic nonce insertion into `public.platform_gcap_nonces` and clarified the operator boundaries of PostgreSQL trigger-based immutability.

---

## 2. Issue-by-Issue Resolution Matrix

| # | Review Finding / Defect | Exact Architectural Correction | Document & Section | SQL / Stored Procedure Affected | Verification Method | Status / Remaining Blocker |
| :-: | :--- | :--- | :--- | :--- | :--- | :---: |
| **1** | `payment.authorized` accepted as settlement status without proof of captured funds. | Removed `'payment.authorized'`. Only `'captured'` and `'verified_success'` are accepted. Added strict `'youpi_pg'` provider check and late payment routing to `'requires_support_review'`. | `SUPER_ADMIN_SECURITY_DESIGN.md` §5<br/>`SUPER_ADMIN_COUPON_DESIGN.md` §5<br/>`SUPER_ADMIN_DATABASE_DESIGN.md` §8.3 | `settle_coupon_payment()` | Code inspection; Unit test rejecting `payment.authorized`. | **RESOLVED** (Production secret provisioning: Blocker 2) |
| **2** | Potential client injection of `p_customer_id` via browser checkout payloads. | Delineated Gateway vs DB responsibilities. Gateway extracts `sub` strictly from verified Supabase JWT; discards request body IDs. Database verifies active tenant permissions. | `SUPER_ADMIN_SECURITY_DESIGN.md` §3<br/>`SUPER_ADMIN_COUPON_DESIGN.md` §2<br/>`SUPER_ADMIN_IMPLEMENTATION_BLUEPRINT.md` §1 | `validate_and_reserve_coupon()`<br/>`activate_zero_payable_subscription()` | Code inspection; Gateway middleware test discarding body `customer_id`. | **RESOLVED** |
| **3** | Non-existent column `workspaces.owner_id` used in authorization checks. | Replaced with verified production schema paths: `organizations.owner_user_id`, `profiles.role = 'owner'`, `workspace_memberships.role = 'owner'`, and `workspaces.owner_email`. Enforced Title Case `'Active'`. | `SUPER_ADMIN_DATABASE_DESIGN.md` §4, §5, §6<br/>`SUPER_ADMIN_SECURITY_DESIGN.md` §3.2 | `validate_and_reserve_coupon()`<br/>`activate_zero_payable_subscription()` | Verified against production migrations `001` and `058`. | **RESOLVED** |
| **4** | Reactivating a workspace blindly restored all staff to `'Active'`, restoring fired/suspended staff. | Created `public.platform_workspace_suspensions`. Suspension snapshots active membership/profile IDs. Reactivation restores *only* snapshotted users. | `SUPER_ADMIN_DATABASE_DESIGN.md` §3.1, §4.1, §4.2<br/>`SUPER_ADMIN_SECURITY_DESIGN.md` §4 | `super_admin_suspend_workspace()`<br/>`super_admin_reactivate_workspace()` | Sandbox regression test with mixed active and inactive staff. | **RESOLVED** |
| **5** | Mid-cycle plan switches during active paid period lacked proration rules. | Implemented explicit database guard: mid-cycle switches during active paid period raise `MID_CYCLE_PLAN_CHANGE_BLOCKED` (`P0008`). Documented same-plan renewal date math. | `SUPER_ADMIN_COUPON_DESIGN.md` §4<br/>`SUPER_ADMIN_DATABASE_DESIGN.md` §5.1, §8.3 | `validate_and_reserve_coupon()`<br/>`settle_coupon_payment()` | Code inspection; Sandbox test attempting mid-cycle upgrade. | **RESOLVED** (Business policy sign-off: Blocker 6) |
| **6** | Limits of trigger-based audit immutability vs DB superuser not documented. | Documented that PostgreSQL triggers protect against application roles (`service_role`, `authenticated`). Superuser modifications are audited via external WAL log streaming. | `SUPER_ADMIN_SECURITY_DESIGN.md` §1 | `enforce_platform_audit_immutability()` | Architectural documentation. | **RESOLVED** |

---

## 3. Complete Corrected SQL Specifications

### 3.1 Dedicated Suspension Tracking Table (`public.platform_workspace_suspensions`)
```sql
CREATE TABLE IF NOT EXISTS public.platform_workspace_suspensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
    suspended_by UUID NOT NULL REFERENCES public.platform_admins(id) ON DELETE RESTRICT,
    suspension_reason TEXT NOT NULL,
    suspended_membership_user_ids UUID[] NOT NULL DEFAULT '{}',
    suspended_profile_user_ids UUID[] NOT NULL DEFAULT '{}',
    is_active_suspension BOOLEAN NOT NULL DEFAULT TRUE,
    suspended_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    reactivated_at TIMESTAMPTZ,
    reactivated_by UUID REFERENCES public.platform_admins(id) ON DELETE RESTRICT,
    reactivation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_platform_suspensions_ws_active 
    ON public.platform_workspace_suspensions(workspace_id) 
    WHERE is_active_suspension = TRUE;

ALTER TABLE public.platform_workspace_suspensions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform_workspace_suspensions_isolation" 
    ON public.platform_workspace_suspensions FOR ALL USING (FALSE);
```

### 3.2 Corrected `super_admin_suspend_workspace`
```sql
CREATE OR REPLACE FUNCTION public.super_admin_suspend_workspace(
    p_workspace_id UUID,
    p_reason TEXT,
    p_admin_id UUID,
    p_request_timestamp TIMESTAMPTZ,
    p_nonce UUID,
    p_signature TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_record RECORD;
    v_ws RECORD;
    v_active_membership_ids UUID[];
    v_active_profile_ids UUID[];
    v_suspension_id UUID;
    v_computed_sig TEXT;
    v_secret TEXT;
    v_skew INTERVAL;
BEGIN
    -- 1. Enforce Execution Grant
    IF auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative mutations must be executed through the trusted Gateway.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validate Timestamp Skew Window (30 seconds)
    v_skew := abs(timezone('utc'::text, now()) - p_request_timestamp);
    IF v_skew > INTERVAL '30 seconds' THEN
        RAISE EXCEPTION 'INVALID_ASSERTION: Request timestamp skew exceeds acceptable window.'
            USING ERRCODE = '28000';
    END IF;

    -- 3. Atomic Nonce Consumption
    BEGIN
        INSERT INTO public.platform_gcap_nonces (nonce, admin_id, action, expires_at)
        VALUES (p_nonce, p_admin_id, 'suspend_workspace', timezone('utc'::text, now()) + INTERVAL '5 minutes');
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'REPLAY_DETECTED: GCAP assertion nonce has already been consumed.'
                USING ERRCODE = '23505';
    END;

    -- 4. Cryptographic Signature Verification
    v_secret := current_setting('app.settings.gateway_assertion_secret', true);
    IF v_secret IS NULL OR length(v_secret) < 32 THEN
        RAISE EXCEPTION 'SECURITY_CONFIGURATION_ERROR: Gateway assertion secret is invalid.'
            USING ERRCODE = 'F0001';
    END IF;

    v_computed_sig := encode(
        extensions.hmac(
            p_admin_id::TEXT || ':suspend_workspace:' || p_workspace_id::TEXT || ':' || 
            to_char(p_request_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || ':' || 
            p_nonce::TEXT,
            v_secret::BYTEA,
            'sha256'
        ),
        'hex'
    );

    IF v_computed_sig != p_signature THEN
        RAISE EXCEPTION 'CRYPTOGRAPHIC_VERIFICATION_FAILED: Assertion signature mismatch.'
            USING ERRCODE = '28000';
    END IF;

    -- 5. Validate Active Super Admin Identity
    SELECT * INTO v_admin_record 
    FROM public.platform_admins 
    WHERE id = p_admin_id AND is_active = TRUE AND role = 'super_admin';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FORBIDDEN: Verified identity lacks active super_admin privileges.'
            USING ERRCODE = '42501';
    END IF;

    -- 6. Lock Workspace
    SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'WORKSPACE_NOT_FOUND: Workspace ID % does not exist.', p_workspace_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_ws.is_active = FALSE THEN
        RETURN jsonb_build_object(
            'success', true,
            'workspace_id', p_workspace_id,
            'status', 'already_suspended'
        );
    END IF;

    -- 7. Snapshot Active Memberships
    SELECT coalesce(array_agg(user_id), '{}') INTO v_active_membership_ids
    FROM public.workspace_memberships
    WHERE workspace_id = p_workspace_id AND status = 'Active';

    -- 8. Snapshot Active Profiles
    SELECT coalesce(array_agg(p.id), '{}') INTO v_active_profile_ids
    FROM public.profiles p
    WHERE p.workspace_id = p_workspace_id AND p.status = 'Active'
      AND NOT EXISTS (
          SELECT 1 FROM public.workspace_memberships wm2
          JOIN public.workspaces w2 ON wm2.workspace_id = w2.id
          WHERE wm2.user_id = p.id AND wm2.workspace_id != p_workspace_id
            AND wm2.status = 'Active' AND w2.is_active = TRUE
      );

    -- 9. Insert Snapshot Record
    INSERT INTO public.platform_workspace_suspensions (
        workspace_id, suspended_by, suspension_reason,
        suspended_membership_user_ids, suspended_profile_user_ids,
        is_active_suspension
    )
    VALUES (
        p_workspace_id, p_admin_id, p_reason,
        v_active_membership_ids, v_active_profile_ids,
        TRUE
    )
    RETURNING id INTO v_suspension_id;

    -- 10. Suspend Workspace, Snapshotted Memberships & Snapshotted Profiles
    UPDATE public.workspaces SET is_active = FALSE WHERE id = p_workspace_id;

    IF array_length(v_active_membership_ids, 1) > 0 THEN
        UPDATE public.workspace_memberships 
        SET status = 'Suspended'
        WHERE workspace_id = p_workspace_id AND user_id = ANY(v_active_membership_ids);
    END IF;

    IF array_length(v_active_profile_ids, 1) > 0 THEN
        UPDATE public.profiles 
        SET status = 'Suspended'
        WHERE id = ANY(v_active_profile_ids);
    END IF;

    -- 11. Immutable Audit Logging
    INSERT INTO public.platform_audit_logs (
        admin_id, action, resource_type, resource_id,
        new_state, reason, details
    )
    VALUES (
        p_admin_id, 'suspend_workspace', 'workspaces', p_workspace_id,
        jsonb_build_object('is_active', false, 'suspension_id', v_suspension_id),
        p_reason,
        jsonb_build_object(
            'assertion_nonce', p_nonce,
            'suspended_memberships_count', array_length(v_active_membership_ids, 1),
            'suspended_profiles_count', array_length(v_active_profile_ids, 1)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'workspace_id', p_workspace_id,
        'suspension_id', v_suspension_id,
        'status', 'suspended',
        'suspended_memberships', coalesce(array_length(v_active_membership_ids, 1), 0),
        'suspended_profiles', coalesce(array_length(v_active_profile_ids, 1), 0)
    );
END;
$$;
```

### 3.3 Corrected `super_admin_reactivate_workspace`
```sql
CREATE OR REPLACE FUNCTION public.super_admin_reactivate_workspace(
    p_workspace_id UUID,
    p_reason TEXT,
    p_admin_id UUID,
    p_request_timestamp TIMESTAMPTZ,
    p_nonce UUID,
    p_signature TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_record RECORD;
    v_ws RECORD;
    v_suspension RECORD;
    v_computed_sig TEXT;
    v_secret TEXT;
    v_skew INTERVAL;
BEGIN
    -- 1. Enforce Execution Grant
    IF auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative mutations must be executed through the trusted Gateway.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validate Timestamp Skew Window (30 seconds)
    v_skew := abs(timezone('utc'::text, now()) - p_request_timestamp);
    IF v_skew > INTERVAL '30 seconds' THEN
        RAISE EXCEPTION 'INVALID_ASSERTION: Request timestamp skew exceeds acceptable window.'
            USING ERRCODE = '28000';
    END IF;

    -- 3. Atomic Nonce Consumption
    BEGIN
        INSERT INTO public.platform_gcap_nonces (nonce, admin_id, action, expires_at)
        VALUES (p_nonce, p_admin_id, 'reactivate_workspace', timezone('utc'::text, now()) + INTERVAL '5 minutes');
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'REPLAY_DETECTED: GCAP assertion nonce has already been consumed.'
                USING ERRCODE = '23505';
    END;

    -- 4. Cryptographic Signature Verification
    v_secret := current_setting('app.settings.gateway_assertion_secret', true);
    IF v_secret IS NULL OR length(v_secret) < 32 THEN
        RAISE EXCEPTION 'SECURITY_CONFIGURATION_ERROR: Gateway assertion secret is invalid.'
            USING ERRCODE = 'F0001';
    END IF;

    v_computed_sig := encode(
        extensions.hmac(
            p_admin_id::TEXT || ':reactivate_workspace:' || p_workspace_id::TEXT || ':' || 
            to_char(p_request_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || ':' || 
            p_nonce::TEXT,
            v_secret::BYTEA,
            'sha256'
        ),
        'hex'
    );

    IF v_computed_sig != p_signature THEN
        RAISE EXCEPTION 'CRYPTOGRAPHIC_VERIFICATION_FAILED: Assertion signature mismatch.'
            USING ERRCODE = '28000';
    END IF;

    -- 5. Validate Active Super Admin Identity
    SELECT * INTO v_admin_record 
    FROM public.platform_admins 
    WHERE id = p_admin_id AND is_active = TRUE AND role = 'super_admin';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FORBIDDEN: Verified identity lacks active super_admin privileges.'
            USING ERRCODE = '42501';
    END IF;

    -- 6. Lock Workspace
    SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'WORKSPACE_NOT_FOUND: Workspace ID % does not exist.', p_workspace_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_ws.is_active = TRUE THEN
        RETURN jsonb_build_object(
            'success', true,
            'workspace_id', p_workspace_id,
            'status', 'already_active'
        );
    END IF;

    -- 7. Locate Active Suspension Snapshot
    SELECT * INTO v_suspension
    FROM public.platform_workspace_suspensions
    WHERE workspace_id = p_workspace_id AND is_active_suspension = TRUE
    ORDER BY suspended_at DESC
    LIMIT 1
    FOR UPDATE;

    -- 8. Reactivate Workspace
    UPDATE public.workspaces SET is_active = TRUE WHERE id = p_workspace_id;

    -- 9. State-Preserving Restoration
    IF FOUND AND v_suspension.id IS NOT NULL THEN
        IF array_length(v_suspension.suspended_membership_user_ids, 1) > 0 THEN
            UPDATE public.workspace_memberships 
            SET status = 'Active'
            WHERE workspace_id = p_workspace_id 
              AND user_id = ANY(v_suspension.suspended_membership_user_ids);
        END IF;

        IF array_length(v_suspension.suspended_profile_user_ids, 1) > 0 THEN
            UPDATE public.profiles 
            SET status = 'Active'
            WHERE id = ANY(v_suspension.suspended_profile_user_ids);
        END IF;

        UPDATE public.platform_workspace_suspensions
        SET is_active_suspension = FALSE,
            reactivated_at = timezone('utc'::text, now()),
            reactivated_by = p_admin_id,
            reactivation_reason = p_reason
        WHERE id = v_suspension.id;
    END IF;

    -- 10. Immutable Audit Logging
    INSERT INTO public.platform_audit_logs (
        admin_id, action, resource_type, resource_id,
        new_state, reason, details
    )
    VALUES (
        p_admin_id, 'reactivate_workspace', 'workspaces', p_workspace_id,
        jsonb_build_object('is_active', true),
        p_reason,
        jsonb_build_object(
            'assertion_nonce', p_nonce,
            'restored_memberships_count', coalesce(array_length(v_suspension.suspended_membership_user_ids, 1), 0),
            'restored_profiles_count', coalesce(array_length(v_suspension.suspended_profile_user_ids, 1), 0)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'workspace_id', p_workspace_id,
        'status', 'active',
        'restored_memberships', coalesce(array_length(v_suspension.suspended_membership_user_ids, 1), 0),
        'restored_profiles', coalesce(array_length(v_suspension.suspended_profile_user_ids, 1), 0)
    );
END;
$$;
```

### 3.4 Corrected `validate_and_reserve_coupon` (Schema-Safe & Mid-Cycle Guard)
```sql
CREATE OR REPLACE FUNCTION public.validate_and_reserve_coupon(
    p_coupon_code VARCHAR(50),
    p_workspace_id UUID,
    p_plan_id VARCHAR(50),
    p_billing_interval VARCHAR(20),
    p_customer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_effective_user_id UUID;
    v_ws RECORD;
    v_coupon RECORD;
    v_existing_sub RECORD;
    v_is_authorized BOOLEAN := FALSE;
    v_base_price_inr NUMERIC(10, 2);
    v_discount_inr NUMERIC(10, 2) := 0.00;
    v_final_payable_inr NUMERIC(10, 2);
    v_active_confirmed_redemptions INT;
    v_user_confirmed_redemptions INT;
    v_prior_successful_subs INT;
    v_redemption_id UUID;
    v_ttl_timestamp TIMESTAMPTZ;
BEGIN
    -- 1. Identify Caller Context
    v_caller_role := auth.role();

    IF v_caller_role = 'service_role' THEN
        IF p_customer_id IS NULL THEN
            RAISE EXCEPTION 'MISSING_CUSTOMER_CONTEXT: p_customer_id is required when invoking via service_role.'
                USING ERRCODE = '42501';
        END IF;
        v_effective_user_id := p_customer_id;
    ELSE
        v_effective_user_id := auth.uid();
        IF v_effective_user_id IS NULL THEN
            RAISE EXCEPTION 'UNAUTHENTICATED: Caller must be authenticated.'
                USING ERRCODE = '28000';
        END IF;
    END IF;

    -- 2. Lock Workspace
    SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'WORKSPACE_NOT_FOUND: Workspace ID % does not exist.', p_workspace_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_ws.is_active = FALSE THEN
        RAISE EXCEPTION 'WORKSPACE_SUSPENDED: Target workspace is currently suspended.'
            USING ERRCODE = '42501';
    END IF;

    -- 3. Verify Workspace Authorization (Canonical Production Schema)
    SELECT 
        EXISTS (
            SELECT 1 FROM public.organizations org
            WHERE org.id = v_ws.organization_id AND org.owner_user_id = v_effective_user_id
        ) OR
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = v_effective_user_id 
              AND p.workspace_id = p_workspace_id 
              AND p.role IN ('owner', 'admin')
              AND p.status = 'Active'
        ) OR
        EXISTS (
            SELECT 1 FROM public.workspace_memberships wm
            WHERE wm.user_id = v_effective_user_id 
              AND wm.workspace_id = p_workspace_id 
              AND wm.role IN ('owner', 'admin')
              AND wm.status = 'Active'
        ) OR
        EXISTS (
            SELECT 1 FROM auth.users u
            WHERE u.id = v_effective_user_id AND lower(u.email) = lower(v_ws.owner_email)
        )
    INTO v_is_authorized;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'FORBIDDEN: Customer % lacks active subscription-management authority over workspace %.',
            v_effective_user_id, p_workspace_id
            USING ERRCODE = '42501';
    END IF;

    -- 4. Commercial Rule (Blocker 6): Mid-Cycle Plan Changes Blocked
    SELECT * INTO v_existing_sub
    FROM public.workspace_subscriptions
    WHERE workspace_id = p_workspace_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND AND v_existing_sub.status = 'active' AND v_existing_sub.current_period_end > timezone('utc'::text, now()) THEN
        IF v_existing_sub.plan_id != p_plan_id OR v_existing_sub.billing_interval != p_billing_interval THEN
            RAISE EXCEPTION 'MID_CYCLE_PLAN_CHANGE_BLOCKED: Mid-cycle plan or billing interval modifications during an active paid subscription are currently restricted. Upgrades/downgrades must be processed at renewal or through billing support.'
                USING ERRCODE = 'P0008';
        END IF;
    END IF;

    -- 5. Lock Coupon Row
    SELECT * INTO v_coupon 
    FROM public.coupons 
    WHERE upper(code) = upper(p_coupon_code) 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_COUPON: Coupon code % does not exist.', p_coupon_code
            USING ERRCODE = 'P0002';
    END IF;

    IF v_coupon.is_active = FALSE THEN
        RAISE EXCEPTION 'COUPON_INACTIVE: This promotional campaign is currently disabled.'
            USING ERRCODE = 'P0003';
    END IF;

    IF timezone('utc'::text, now()) < v_coupon.valid_from THEN
        RAISE EXCEPTION 'COUPON_NOT_STARTED: This campaign has not yet commenced.'
            USING ERRCODE = 'P0004';
    END IF;

    IF v_coupon.valid_until IS NOT NULL AND timezone('utc'::text, now()) > v_coupon.valid_until THEN
        RAISE EXCEPTION 'COUPON_EXPIRED: This promotional code has expired.'
            USING ERRCODE = 'P0005';
    END IF;

    -- 6. Targeting & Eligibility Validations
    IF v_coupon.applicable_plans != 'all' AND NOT (v_coupon.applicable_plan_ids @> ARRAY[p_plan_id]::VARCHAR[]) THEN
        RAISE EXCEPTION 'PLAN_INELIGIBLE: Coupon is not valid for subscription plan %.', p_plan_id
            USING ERRCODE = 'P0006';
    END IF;

    IF v_coupon.applicable_interval != 'all' AND v_coupon.applicable_interval != p_billing_interval THEN
        RAISE EXCEPTION 'INTERVAL_INELIGIBLE: Coupon is not valid for billing interval %.', p_billing_interval
            USING ERRCODE = 'P0006';
    END IF;

    SELECT COUNT(*) INTO v_prior_successful_subs
    FROM public.payment_transactions
    WHERE workspace_id = p_workspace_id AND status = 'verified_success';

    IF v_coupon.customer_targeting = 'new_customers_only' AND v_prior_successful_subs > 0 THEN
        RAISE EXCEPTION 'NEW_CUSTOMERS_ONLY: Promotion is restricted to first-time subscribers.'
            USING ERRCODE = 'P0007';
    END IF;

    IF v_coupon.customer_targeting = 'existing_customers_only' AND v_prior_successful_subs = 0 THEN
        RAISE EXCEPTION 'EXISTING_CUSTOMERS_ONLY: Promotion is restricted to existing subscribers.'
            USING ERRCODE = 'P0007';
    END IF;

    IF v_coupon.first_subscription_only = TRUE AND v_prior_successful_subs > 0 THEN
        RAISE EXCEPTION 'FIRST_SUBSCRIPTION_ONLY: Promotion applies only to the initial subscription.'
            USING ERRCODE = 'P0007';
    END IF;

    -- 7. Quota Verification
    SELECT COUNT(*) INTO v_active_confirmed_redemptions
    FROM public.coupon_redemptions
    WHERE coupon_id = v_coupon.id 
      AND (status = 'applied' OR (status = 'reserved' AND reserved_until > timezone('utc'::text, now())));

    IF v_coupon.max_total_redemptions IS NOT NULL AND v_active_confirmed_redemptions >= v_coupon.max_total_redemptions THEN
        RAISE EXCEPTION 'CAMPAIGN_EXHAUSTED: Global redemption limit reached for this promotion.'
            USING ERRCODE = 'P0007';
    END IF;

    SELECT COUNT(*) INTO v_user_confirmed_redemptions
    FROM public.coupon_redemptions
    WHERE coupon_id = v_coupon.id 
      AND workspace_id = p_workspace_id
      AND (status = 'applied' OR (status = 'reserved' AND reserved_until > timezone('utc'::text, now())));

    IF v_user_confirmed_redemptions >= v_coupon.max_redemptions_per_workspace THEN
        RAISE EXCEPTION 'WORKSPACE_QUOTA_EXCEEDED: Workspace has reached redemption limit for this coupon.'
            USING ERRCODE = 'P0007';
    END IF;

    -- 8. Base Pricing Resolution
    IF p_plan_id = 'starter' AND p_billing_interval = 'monthly' THEN v_base_price_inr := 999.00;
    ELSIF p_plan_id = 'starter' AND p_billing_interval = 'annual' THEN v_base_price_inr := 9990.00;
    ELSIF p_plan_id = 'business' AND p_billing_interval = 'monthly' THEN v_base_price_inr := 2499.00;
    ELSIF p_plan_id = 'business' AND p_billing_interval = 'annual' THEN v_base_price_inr := 24990.00;
    ELSIF p_plan_id = 'enterprise' AND p_billing_interval = 'monthly' THEN v_base_price_inr := 7999.00;
    ELSIF p_plan_id = 'enterprise' AND p_billing_interval = 'annual' THEN v_base_price_inr := 79990.00;
    ELSE
        RAISE EXCEPTION 'INVALID_PLAN: Unknown plan and interval combination.'
            USING ERRCODE = 'P0006';
    END IF;

    IF v_base_price_inr < v_coupon.min_purchase_amount_inr THEN
        RAISE EXCEPTION 'MIN_PURCHASE_NOT_MET: Minimum order value of ₹% required.', v_coupon.min_purchase_amount_inr
            USING ERRCODE = 'P0006';
    END IF;

    -- 9. Discount Computation
    IF v_coupon.discount_type = 'percentage' THEN
        v_discount_inr := round((v_base_price_inr * (v_coupon.discount_value / 100.0)), 2);
        IF v_coupon.max_discount_cap_inr IS NOT NULL AND v_discount_inr > v_coupon.max_discount_cap_inr THEN
            v_discount_inr := v_coupon.max_discount_cap_inr;
        END IF;
    ELSIF v_coupon.discount_type = 'fixed' THEN
        v_discount_inr := least(v_base_price_inr, v_coupon.discount_value);
    END IF;

    v_final_payable_inr := greatest(0.00, v_base_price_inr - v_discount_inr);
    v_ttl_timestamp := timezone('utc'::text, now()) + INTERVAL '15 minutes';

    -- 10. Record Reservation
    INSERT INTO public.coupon_redemptions (
        coupon_id, workspace_id, user_id, plan_id, billing_interval,
        base_price_inr, discount_amount_inr, final_payable_inr,
        status, reserved_until, workspace_name_snapshot, customer_email_snapshot
    )
    VALUES (
        v_coupon.id, p_workspace_id, v_effective_user_id, p_plan_id, p_billing_interval,
        v_base_price_inr, v_discount_inr, v_final_payable_inr,
        'reserved', v_ttl_timestamp, v_ws.company_name, v_ws.owner_email
    )
    RETURNING id INTO v_redemption_id;

    RETURN jsonb_build_object(
        'redemption_id', v_redemption_id,
        'coupon_code', v_coupon.code,
        'plan_id', p_plan_id,
        'billing_interval', p_billing_interval,
        'base_price_inr', v_base_price_inr,
        'discount_amount_inr', v_discount_inr,
        'final_payable_inr', v_final_payable_inr,
        'reserved_until', v_ttl_timestamp,
        'currency', 'INR'
    );
END;
$$;
```

### 3.5 Corrected `settle_coupon_payment` (Captured Funds Only & Late Handling)
```sql
CREATE OR REPLACE FUNCTION public.settle_coupon_payment(
    p_redemption_id UUID,
    p_transaction_reference VARCHAR(100),
    p_gateway_provider VARCHAR(50),
    p_amount_paid NUMERIC(10, 2),
    p_currency VARCHAR(10),
    p_gateway_payload JSONB,
    p_payment_authorized_at TIMESTAMPTZ,
    p_provider_status VARCHAR(50)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_redemption RECORD;
    v_existing_tx RECORD;
    v_existing_sub RECORD;
    v_sub_start TIMESTAMPTZ;
    v_sub_end TIMESTAMPTZ;
    v_interval INTERVAL;
BEGIN
    -- 1. Enforce Webhook Controller Role
    IF auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'FORBIDDEN: Payment settlement must be invoked via verified Gateway Controller.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Strict Gateway Provider Check
    IF p_gateway_provider NOT IN ('youpi_pg') THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_PROVIDER: Gateway provider % is unauthorized.', p_gateway_provider
            USING ERRCODE = 'P0009';
    END IF;

    -- 3. Strict Captured Status Check (ELIMINATED payment.authorized)
    IF p_provider_status NOT IN ('captured', 'verified_success') THEN
        RAISE EXCEPTION 'UNCONFIRMED_PAYMENT_STATUS: Settlement requires confirmed captured funds. Status: %.', p_provider_status
            USING ERRCODE = 'P0010';
    END IF;

    -- 4. Future-Dating Tolerance (+5 minutes)
    IF p_payment_authorized_at > (timezone('utc'::text, now()) + INTERVAL '5 minutes') THEN
        RAISE EXCEPTION 'FUTURE_DATED_PAYMENT: Authorization timestamp cannot be in the future.'
            USING ERRCODE = '22008';
    END IF;

    -- 5. Lock Redemption Row
    SELECT * INTO v_redemption 
    FROM public.coupon_redemptions 
    WHERE id = p_redemption_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'REDEMPTION_NOT_FOUND: Redemption ID % does not exist.', p_redemption_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 6. Lock and Validate Transaction Reference Uniqueness
    SELECT * INTO v_existing_tx 
    FROM public.payment_transactions 
    WHERE transaction_reference = p_transaction_reference 
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing_tx.coupon_redemption_id = p_redemption_id 
           AND v_existing_tx.workspace_id = v_redemption.workspace_id 
           AND v_existing_tx.status = 'verified_success' THEN
            -- Idempotent Duplicate Delivery
            RETURN jsonb_build_object(
                'success', true,
                'status', 'already_settled',
                'redemption_id', p_redemption_id,
                'transaction_reference', p_transaction_reference
            );
        ELSE
            RAISE EXCEPTION 'TRANSACTION_REF_COLLISION: Transaction reference % already bound to another context.', p_transaction_reference
                USING ERRCODE = '23505';
        END IF;
    END IF;

    -- 7. Late Payment & Reservation Expiry Handling
    IF p_payment_authorized_at > v_redemption.reserved_until THEN
        -- Payment was authorized after reservation expired: ROUTE TO MANUAL SUPPORT REVIEW
        INSERT INTO public.payment_transactions (
            workspace_id, coupon_redemption_id, transaction_reference,
            gateway_provider, amount_paid, currency, status, gateway_payload
        )
        VALUES (
            v_redemption.workspace_id, p_redemption_id, p_transaction_reference,
            p_gateway_provider, p_amount_paid, p_currency, 'requires_support_review',
            p_gateway_payload || jsonb_build_object(
                'late_transit_flag', true,
                'authorized_at', p_payment_authorized_at,
                'reserved_until', v_redemption.reserved_until
            )
        );

        UPDATE public.coupon_redemptions 
        SET status = 'failed' 
        WHERE id = p_redemption_id;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'requires_support_review',
            'reason', 'Payment authorized after coupon reservation expired. Subscription not activated.'
        );
    END IF;

    -- Transit Window Check (Max 24h)
    IF timezone('utc'::text, now()) > (p_payment_authorized_at + INTERVAL '24 hours') THEN
        INSERT INTO public.payment_transactions (
            workspace_id, coupon_redemption_id, transaction_reference,
            gateway_provider, amount_paid, currency, status, gateway_payload
        )
        VALUES (
            v_redemption.workspace_id, p_redemption_id, p_transaction_reference,
            p_gateway_provider, p_amount_paid, p_currency, 'requires_support_review',
            p_gateway_payload || jsonb_build_object(
                'excessive_transit_delay', true,
                'authorized_at', p_payment_authorized_at
            )
        );

        UPDATE public.coupon_redemptions 
        SET status = 'failed' 
        WHERE id = p_redemption_id;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'requires_support_review',
            'reason', 'Webhook transit time exceeded 24-hour delivery window. Subscription not activated.'
        );
    END IF;

    IF v_redemption.status != 'reserved' THEN
        RAISE EXCEPTION 'INVALID_REDEMPTION_STATE: Redemption is currently in % state.', v_redemption.status
            USING ERRCODE = 'P0008';
    END IF;

    -- 8. Currency & Exact Amount Matching
    IF p_currency != 'INR' THEN
        RAISE EXCEPTION 'CURRENCY_MISMATCH: Currency must be INR.'
            USING ERRCODE = 'P0006';
    END IF;

    IF p_amount_paid != v_redemption.final_payable_inr THEN
        INSERT INTO public.payment_transactions (
            workspace_id, coupon_redemption_id, transaction_reference,
            gateway_provider, amount_paid, currency, status, gateway_payload
        )
        VALUES (
            v_redemption.workspace_id, p_redemption_id, p_transaction_reference,
            p_gateway_provider, p_amount_paid, p_currency, 'failed',
            p_gateway_payload || jsonb_build_object('error', 'AMOUNT_MISMATCH')
        );

        UPDATE public.coupon_redemptions SET status = 'failed' WHERE id = p_redemption_id;

        RAISE EXCEPTION 'AMOUNT_MISMATCH: Paid amount ₹% does not match required amount ₹%.', 
            p_amount_paid, v_redemption.final_payable_inr
            USING ERRCODE = 'P0006';
    END IF;

    -- 9. Commercial Rule (Blocker 6): Mid-Cycle Plan Changes Blocked
    SELECT * INTO v_existing_sub
    FROM public.workspace_subscriptions
    WHERE workspace_id = v_redemption.workspace_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND AND v_existing_sub.status = 'active' AND v_existing_sub.current_period_end > timezone('utc'::text, now()) THEN
        IF v_existing_sub.plan_id != v_redemption.plan_id OR v_existing_sub.billing_interval != v_redemption.billing_interval THEN
            RAISE EXCEPTION 'MID_CYCLE_PLAN_CHANGE_BLOCKED: Mid-cycle plan or billing interval modifications during an active paid subscription are currently restricted. Settlement aborted to prevent financial corruption.'
                USING ERRCODE = 'P0008';
        END IF;
    END IF;

    -- 10. Subscription Period Math (Same-Plan Renewal & Lapsed Renewal)
    IF v_redemption.billing_interval = 'annual' THEN
        v_interval := INTERVAL '1 year';
    ELSE
        v_interval := INTERVAL '1 month';
    END IF;

    IF FOUND AND v_existing_sub.status = 'active' AND v_existing_sub.current_period_end >= timezone('utc'::text, now()) THEN
        -- Same-Plan Early Renewal: Preserve unexpired paid days
        v_sub_start := v_existing_sub.current_period_start;
        v_sub_end := v_existing_sub.current_period_end + v_interval;
    ELSE
        -- Brand New, Trial Conversion, or Renewal After Expiry
        v_sub_start := timezone('utc'::text, now());
        v_sub_end := timezone('utc'::text, now()) + v_interval;
    END IF;

    -- 11. Atomic Settlement Mutations
    INSERT INTO public.payment_transactions (
        workspace_id, coupon_redemption_id, transaction_reference,
        gateway_provider, amount_paid, currency, status, gateway_payload
    )
    VALUES (
        v_redemption.workspace_id, p_redemption_id, p_transaction_reference,
        p_gateway_provider, p_amount_paid, p_currency, 'verified_success', p_gateway_payload
    );

    UPDATE public.coupon_redemptions 
    SET status = 'applied', redeemed_at = timezone('utc'::text, now())
    WHERE id = p_redemption_id;

    INSERT INTO public.workspace_subscriptions (
        workspace_id, plan_id, billing_interval, status,
        current_period_start, current_period_end, created_at, updated_at
    )
    VALUES (
        v_redemption.workspace_id, v_redemption.plan_id, v_redemption.billing_interval,
        'active', v_sub_start, v_sub_end, timezone('utc'::text, now()), timezone('utc'::text, now())
    )
    ON CONFLICT (workspace_id) DO UPDATE
    SET plan_id = EXCLUDED.plan_id,
        billing_interval = EXCLUDED.billing_interval,
        status = 'active',
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        updated_at = timezone('utc'::text, now());

    RETURN jsonb_build_object(
        'success', true,
        'redemption_id', p_redemption_id,
        'status', 'settled',
        'workspace_id', v_redemption.workspace_id,
        'plan_id', v_redemption.plan_id,
        'current_period_start', v_sub_start,
        'current_period_end', v_sub_end
    );
END;
$$;
```

---

## 4. Formal Test Case Specifications

### 4.1 Payment Settlement Test Suite
- **Test PS-01: Rejection of Uncaptured Status (`payment.authorized`)**
  - Input: `p_provider_status = 'payment.authorized'`.
  - Expected: Immediate exception `UNCONFIRMED_PAYMENT_STATUS (P0010)`; zero records created; subscription untouched.
- **Test PS-02: Rejection of Unauthorized Gateway Provider**
  - Input: `p_gateway_provider = 'razorpay'`.
  - Expected: Immediate exception `INVALID_PAYMENT_PROVIDER (P0009)`.
- **Test PS-03: Future-Dated Payment Tolerance Enforcement**
  - Input: `p_payment_authorized_at = NOW() + INTERVAL '10 minutes'`.
  - Expected: Exception `FUTURE_DATED_PAYMENT (22008)`.
- **Test PS-04: Ambiguous Late Payment Transit Routing**
  - Setup: Reservation expired at `T0`. Webhook arrives with `p_payment_authorized_at = T0 + 5m`.
  - Expected: Function completes with `{ success: false, status: 'requires_support_review' }`. `payment_transactions` record inserted with status `'requires_support_review'`. Redemption marked `'failed'`. **Subscription is NOT activated.**
- **Test PS-05: Duplicate Webhook Idempotency**
  - Setup: Webhook settles transaction `TX100`. Second identical webhook for `TX100` delivered.
  - Expected: Returns `{ success: true, status: 'already_settled' }`. No duplicate rows; period dates unchanged.

### 4.2 Customer Identity & Authorization Test Suite
- **Test CI-01: Derivation from `auth.uid()` in Direct Checkout**
  - Setup: Logged in as Customer A. Invoke `validate_and_reserve_coupon` with Customer A's workspace.
  - Expected: Reservation succeeds. `user_id` in redemption row is Customer A.
- **Test CI-02: Rejection of Injected `customer_id` via Gateway**
  - Setup: Attacker attempts to pass `p_customer_id = 'victim-uuid'` through API.
  - Gateway Test: Gateway derives customer identity strictly from JWT `sub` claims, discarding request body `customer_id`.
- **Test CI-03: Workspace Ownership Resolution (No `workspaces.owner_id`)**
  - Test Case 3A: Workspace with `organizations.owner_user_id = auth.uid()` &rarr; Authorized.
  - Test Case 3B: Profile with `role = 'owner'` & `status = 'Active'` &rarr; Authorized.
  - Test Case 3C: `workspace_memberships` with `role = 'owner'` & `status = 'Active'` &rarr; Authorized.
  - Test Case 3D: `workspaces.owner_email = auth.users.email` &rarr; Authorized.
  - Test Case 3E: User has no match &rarr; `FORBIDDEN (42501)`.

### 4.3 Subscription Period & Commercial Rules Test Suite
- **Test SP-01: Same-Plan Early Renewal**
  - Setup: Active `business` monthly (`2026-11-01` to `2026-12-01`). Renewed on `2026-11-20`.
  - Expected: New period is `2026-11-01` to `2027-01-01`. Exactly 11 unexpired days preserved.
- **Test SP-02: Mid-Cycle Plan Switch Block (Blocker 6)**
  - Setup: Active `starter` monthly (`2026-11-01` to `2026-12-01`). User attempts `business` monthly on `2026-11-15`.
  - Expected: Both `validate_and_reserve_coupon` and `settle_coupon_payment` abort with `MID_CYCLE_PLAN_CHANGE_BLOCKED (P0008)`.
- **Test SP-03: Trial Conversion**
  - Setup: Workspace in `trialing` (`2026-11-01` to `2026-11-15`). Converts on `2026-11-05` to `business` annual.
  - Expected: Trial terminated; new period is `2026-11-05` to `2027-11-05` with status `'active'`.

### 4.4 State-Preserving Suspension & Reactivation Test Suite
- **Test SR-01: Snapshot Preservation Across Mixed Staff**
  - Setup: Workspace WS1 has Employee E1 (`Active`), Employee E2 (`Active`), and Employee E3 (`Suspended` due to disciplinary action).
  - Step 1: Admin suspends WS1.
    - Check: WS1 is `is_active = FALSE`. E1 and E2 become `Suspended`. E3 remains `Suspended`.
    - Check: `platform_workspace_suspensions` stores `suspended_membership_user_ids = [E1, E2]`.
  - Step 2: Admin reactivates WS1.
    - Check: WS1 is `is_active = TRUE`. E1 and E2 restored to `Active`. **E3 remains `Suspended`.**
    - Verification: E3 is never accidentally granted access.

### 4.5 Atomic Nonce Concurrency Race Test
- **Test NC-01: Concurrent Replay Race**
  - Execution: Launch two simultaneous PostgreSQL sessions issuing `super_admin_suspend_workspace` with the exact same `p_nonce`.
  - Expected: Session 1 succeeds (`INSERT INTO platform_gcap_nonces` commits). Session 2 immediately aborts with `REPLAY_DETECTED (23505)`.

---

## 5. Architectural Fact Categorization

| Claim / Component | Categorization | Source of Authority / Justification |
| :--- | :---: | :--- |
| `workspaces.owner_id` does NOT exist in production | **VERIFIED** | Inspected `001_initial_schema.sql` and `058_organization_branch_architecture.sql`. Column does not exist. |
| `public.employee_status` ENUM uses Title Case (`'Active'`, `'Suspended'`) | **VERIFIED** | Inspected `001_initial_schema.sql` line 14: `CREATE TYPE employee_status AS ENUM ('Active', 'Suspended', 'Inactive', 'Pending')`. |
| Payment Provider is `'youpi_pg'` | **VERIFIED** | Production billing codebase in `Vistaar/` uses `youpi_pg` gateway integration. |
| Single-active subscription model per workspace (`workspace_subscriptions.workspace_id` unique/PK) | **VERIFIED** | Inspected production schema `001_initial_schema.sql`. |
| GCAP Assertion Skew Window $\le 30\text{ seconds}$ | **ASSUMED** | Industry best-practice for server-to-server HMAC assertion envelopes. |
| Reservation TTL = $15\text{ minutes}$ | **ASSUMED** | Standard e-commerce cart lock window; balances seat hold with capacity release. |
| Concurrent Nonce Unique Constraint Serialization | **VERIFIED** | PostgreSQL B-Tree unique index serialization semantics. |
| Audit Trigger Immutability vs Superuser | **VERIFIED** | PostgreSQL engine architecture: triggers do not prevent superuser direct mutations. |

---

## 6. Project Blocker Register

| Blocker ID | Severity | Description | Current State & Mitigation | Required Action for Next Phase |
| :---: | :---: | :--- | :--- | :--- |
| **BLOCKER 1** | **CRITICAL** | Gateway Assertion Secret (`GATEWAY_ASSERTION_SECRET`) | Documented requirement for 32+ byte cryptographically secure secret. Must be shared between Gateway and PostgreSQL `app.settings`. | Provision secret in staging environment during Phase 2. |
| **BLOCKER 2** | **CRITICAL** | Gateway Webhook Secret (`GATEWAY_WEBHOOK_SECRET`) | Documented requirement for HMAC secret shared with `youpi_pg`. Webhook rejects unsigned requests. | Provision webhook secret in staging gateway during Phase 2. |
| **BLOCKER 3** | **HIGH** | Root Platform Super Admin Provisioning Ceremony | Public registration is disabled. Offline provisioning script (`scripts/provision-super-admin.js`) specified. | Execute provisioning script during Phase 2 sandbox testing. |
| **BLOCKER 4** | **CRITICAL** | Dedicated Non-Production Staging Database | Absolute restriction: zero direct migrations against live production DB `kluxsykimnjivkqxelba`. | Human operator must provision staging database instance before Phase 2. |
| **BLOCKER 5** | **MEDIUM** | One-Time Discount Scope Limitation | Schema explicitly constrains `discount_duration = 'once'`. Multi-month repeating discounts are deferred. | Confirmed for v1.0 release; recurring coupon logic deferred to v2. |
| **BLOCKER 6** | **CRITICAL** | Mid-Cycle Subscription Plan Switch Commercial Policy | VISTAAR manual renewal lacks automated proration/credit engine. Stored procedures strictly block mid-cycle switches (`MID_CYCLE_PLAN_CHANGE_BLOCKED`). | Business leadership must define and sign off on mid-cycle credit formulas before unlocking automated tier upgrades. |

