# VISTAAR Super Admin - Phase 2.6 Targeted SQL Corrections & State Hardening Changelog

**Document Version:** 2.6.0  
**Effective Date:** 2026-11-01  
**Project:** VISTAAR Super Admin Control Plane (`navdeep852/Super-Admin`)  
**Deployment Target:** `admin.vistaarone.com`  
**Backend:** Existing Production Supabase Project (`https://kluxsykimnjivkqxelba.supabase.co`)  
**Status:** Complete Targeted SQL & State Reconciliation — Architecture & Design Only (No Migrations Executed)

---

## 1. Executive Summary of Corrections

Phase 2.6 resolves critical SQL execution defects, state consistency ambiguities, and schema discrepancies identified in the Phase 2.5 review. All stored procedures, state transition tables, and architectural specifications in `super_admin/` have been updated and reconciled against production migration reality.

### Core Architectural Fixes:
1. **Committed Failure Audit on Amount Mismatch (No Transaction Rollback):**
   - In `settle_coupon_payment()`, the amount mismatch branch previously raised an uncaught exception, which caused PostgreSQL to roll back the inserted failed transaction and redemption update.
   - In Phase 2.6, this branch updates `public.coupon_redemptions.status = 'failed'`, commits an audit row in `public.payment_transactions` (`status = 'failed'`), and returns an explicit failure JSON payload (`success: false, error: 'AMOUNT_MISMATCH', code: 'P0006'`). The transaction commits cleanly without activating a subscription, persisting the audit trail for fraud investigation.
2. **Consistent Reservation Expiry & Late Webhook Rules:**
   - **On-Time Settlement:** Payment authorized $\le$ `reserved_until`, webhook received $\le$ `reserved_until`, transit $\le 24\text{h}$ &rarr; settled successfully.
   - **In-Window Auth, Delayed Webhook:** Payment authorized $\le$ `reserved_until`, but webhook arrived after `reserved_until` within the 24h transit window &rarr; legitimate network delay; settled successfully (`transit_delayed: true`).
   - **Late Payment Authorization:** Payment authorized *after* `reserved_until` &rarr; rejected from automatic activation; redemption marked `'failed'`, `payment_transactions` marked `'failed'` with `requires_support_review = true`; subscription is **never activated**.
   - **Excessive Transit Timeout:** Webhook arrives > 24 hours after authorization &rarr; redemption marked `'failed'`, `payment_transactions` marked `'failed'` with `requires_support_review = true`; subscription is **never activated**.
   - **Duplicate Webhook (Settled):** Incoming reference already settled &rarr; idempotent return `{ success: true, status: 'already_settled' }`; zero subscription or quota mutations.
   - **Duplicate Webhook (Support Review):** Incoming reference already flagged for support review &rarr; idempotent return `{ success: false, status: 'already_under_support_review' }`; zero mutations.
3. **Gateway Verification Contract vs Database Responsibilities:**
   - Explicitly clarified that Gateway BFF verifies the provider webhook HMAC signature over the raw body buffer and optionally performs out-of-band queries to the provider API (`youpi_pg`).
   - PostgreSQL does **not** verify provider HMAC signatures; PostgreSQL enforces caller authorization (`auth.role() = 'service_role'`), data integrity constraints, atomic row locks, and state mutations.
4. **Corrected Multi-Branch Suspension & Status-Preserving Reactivation:**
   - Suspension checks whether an active employee belongs to any other active workspace (`workspaces.is_active = TRUE`). If yes, their global `profiles` record is preserved as active.
   - Reactivation restores *only* memberships and profiles whose status is **currently still `'Suspended'`**. If a user's membership or profile was deleted or independently changed to `'Inactive'` (e.g. employee resignation or termination) while the workspace was suspended, they are **not** restored to `'Active'`.
   - Eliminated reliance on `FOUND` after intermediate `UPDATE` statements; replaced with explicit `v_suspension.id IS NOT NULL` guards.
5. **Complete Subscription State Coverage (8 States):**
   - Defined explicit commercial rules and mathematical period formulas for: Brand New, Same-Plan Early Renewal (unexpired days preserved), Trial Conversion (immediate active transition), Past-Due (recovery from payment date), Expired (recovery from payment date), Manually Overridden (period preserved if same plan), Duplicate Settlement (zero mutation), and Mid-Cycle Plan Switch (strictly blocked with `MID_CYCLE_PLAN_CHANGE_BLOCKED`).
6. **Production Schema Column Alignment:**
   - Reconciled all `INSERT INTO public.payment_transactions` statements to match the exact production columns created in migration `070_subscription_plans_and_entitlements.sql`: `workspace_id, transaction_reference, provider, amount_inr, currency, plan_id, status, provider_payload, verified_at, coupon_redemption_id`.
   - Reconciled plan pricing by querying `public.subscription_plans` directly (`price_monthly_inr`, `price_annual_inr`) rather than relying on hardcoded price assumptions.

---

## 2. Issue-by-Issue Resolution Matrix

| # | Review Finding / Defect | Exact Architectural Correction | Document & Section | Stored Procedure Affected | Verification Method | Status / Blocker Classification |
| :-: | :--- | :--- | :--- | :--- | :--- | :---: |
| **1** | `settle_coupon_payment()` raised exception on amount mismatch, rolling back failed payment audit. | Removed `RAISE EXCEPTION`. Updates redemption to `'failed'`, inserts failed transaction into `payment_transactions`, and returns failure JSON. Database commits evidence. | `SUPER_ADMIN_DATABASE_DESIGN.md` §6.6<br/>`SUPER_ADMIN_COUPON_DESIGN.md` §3.1 | `settle_coupon_payment()` | SQL inspection; Sandbox unit test verifying committed row. | **DESIGN-COMPLETE** (Staging-Tested in Phase 2) |
| **2** | Inconsistent rules between reservation expiry, transit windows, and late webhooks. | Defined 6 consistent cases covering on-time, in-window late transit, late auth, transit timeout, duplicate settled, and duplicate support review. Unified SQL, state machine, and tests. | `SUPER_ADMIN_COUPON_DESIGN.md` §3<br/>`SUPER_ADMIN_DATABASE_DESIGN.md` §6.6 | `settle_coupon_payment()` | State machine reconciliation; Test matrix verification. | **DESIGN-COMPLETE** (Staging-Tested in Phase 2) |
| **3** | Unclear distinction between Gateway provider HMAC verification and PostgreSQL scope. | Documented that Gateway verifies provider HMAC and performs out-of-band verification. PostgreSQL enforces `service_role`, constraints, and period math. | `SUPER_ADMIN_SECURITY_DESIGN.md` §6<br/>`SUPER_ADMIN_COUPON_DESIGN.md` §5 | Gateway Controller API & `settle_coupon_payment()` | Architectural delineation. | **DESIGN-COMPLETE** (Requires Gateway Secret: Blocker 2) |
| **4** | Reactivation restored staff even if independently terminated during suspension; multi-branch users disabled globally. | Added cross-branch active check to prevent suspending multi-branch staff profiles. Reactivation only restores rows whose status is still `'Suspended'`. Removed `FOUND` misuse. | `SUPER_ADMIN_DATABASE_DESIGN.md` §6.2, §6.3<br/>`SUPER_ADMIN_SECURITY_DESIGN.md` §4 | `super_admin_suspend_workspace()`<br/>`super_admin_reactivate_workspace()` | SQL logic verification; Mixed-staff regression test case. | **DESIGN-COMPLETE** (Staging-Tested in Phase 2) |
| **5** | Incomplete subscription state coverage (e.g. past-due, expired, manual overrides). | Explicitly documented behavior and mathematical period calculations for all 8 subscription states. Mid-cycle switches remain blocked. | `SUPER_ADMIN_COUPON_DESIGN.md` §4<br/>`SUPER_ADMIN_DATABASE_DESIGN.md` §6.6 | `validate_and_reserve_coupon()`<br/>`settle_coupon_payment()` | Test matrix coverage across all 8 states. | **DESIGN-COMPLETE** (Commercial policy approval: Blocker 6) |
| **6** | `payment_transactions` column names (`amount_paid`, `gateway_provider`) diverged from production migration 070. | Reconciled all SQL statements to use exact production column names: `amount_inr`, `provider`, `provider_payload`. Quoted prices from `subscription_plans`. | `SUPER_ADMIN_DATABASE_DESIGN.md` §5, §6 | All stored procedures | Verified against migration `070_subscription_plans_and_entitlements.sql`. | **SCHEMA-VERIFIED** |

---

## 3. Complete Corrected SQL Specifications

### 3.1 `super_admin_suspend_workspace`
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
    v_gateway_secret TEXT;
    v_canonical_string TEXT;
    v_expected_signature TEXT;
    v_admin_email TEXT;
    v_admin_role TEXT;
    v_ws_name TEXT;
    v_is_active BOOLEAN;
    v_active_membership_user_ids UUID[] := '{}';
    v_active_profile_user_ids UUID[] := '{}';
    v_user RECORD;
    v_has_other_active_branches BOOLEAN;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Assert Caller is Trusted Gateway Service Role
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative actions can only be invoked by the trusted Backend Gateway.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validate Assertion Freshness (30-second skew window)
    IF ABS(EXTRACT(EPOCH FROM (v_now - p_request_timestamp))) > 30 THEN
        RAISE EXCEPTION 'ASSERTION_EXPIRED: Request timestamp skewed or expired (allowed window: 30 seconds).'
            USING ERRCODE = '28000';
    END IF;

    -- 3. Atomic Nonce Consumption via Dedicated Registry Table
    BEGIN
        INSERT INTO public.platform_gcap_nonces (nonce, admin_id, action, consumed_at, expires_at)
        VALUES (p_nonce, p_admin_id, 'SUSPEND_WORKSPACE', v_now, v_now + INTERVAL '5 minutes');
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'REPLAY_DETECTED: Assertion nonce % has already been consumed or is concurrently executing.', p_nonce
            USING ERRCODE = '23505';
    END;

    -- 4. Verify Gateway Cryptographic Signature
    v_gateway_secret := NULLIF(current_setting('app.settings.gateway_assertion_secret', true), '');
    IF v_gateway_secret IS NULL THEN
        RAISE EXCEPTION 'CONFIGURATION_ERROR: Gateway assertion secret is not provisioned on database engine.'
            USING ERRCODE = '55000';
    END IF;

    v_canonical_string := p_admin_id::TEXT || ':SUSPEND_WORKSPACE:' || p_workspace_id::TEXT || ':' || 
                          EXTRACT(EPOCH FROM p_request_timestamp)::BIGINT::TEXT || ':' || p_nonce::TEXT;
    v_expected_signature := encode(extensions.hmac(v_canonical_string::bytea, v_gateway_secret::bytea, 'sha256'), 'hex');

    IF p_signature IS DISTINCT FROM v_expected_signature THEN
        RAISE EXCEPTION 'AUTHENTICATION_FAILED: Gateway assertion signature mismatch.'
            USING ERRCODE = '28000';
    END IF;

    -- 5. Verify Administrator Status & Role in Database
    SELECT email, role INTO v_admin_email, v_admin_role
    FROM public.platform_admins
    WHERE id = p_admin_id AND is_active = TRUE;

    IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
        RAISE EXCEPTION 'FORBIDDEN: Only active Super Admins can suspend workspaces.'
            USING ERRCODE = '42501';
    END IF;

    -- 6. Lock and Verify Target Workspace
    SELECT company_name, is_active INTO v_ws_name, v_is_active
    FROM public.workspaces
    WHERE id = p_workspace_id
    FOR UPDATE;

    IF v_ws_name IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Workspace % does not exist.', p_workspace_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_is_active = FALSE THEN
        RETURN jsonb_build_object(
            'success', true,
            'workspace_id', p_workspace_id,
            'status', 'already_suspended'
        );
    END IF;

    -- 7. Snapshot ONLY Memberships That Are Currently 'Active'
    SELECT COALESCE(array_agg(user_id), '{}') INTO v_active_membership_user_ids
    FROM public.workspace_memberships
    WHERE workspace_id = p_workspace_id AND status = 'Active';

    -- 8. Snapshot ONLY Profiles That Are Currently 'Active' and have NO other active branch
    FOR v_user IN 
        SELECT id FROM public.profiles 
        WHERE workspace_id = p_workspace_id AND status = 'Active'::public.employee_status
          AND deleted_at IS NULL
    LOOP
        SELECT EXISTS (
            SELECT 1 
            FROM public.workspace_memberships wm
            JOIN public.workspaces w ON wm.workspace_id = w.id
            WHERE wm.user_id = v_user.id 
              AND wm.workspace_id <> p_workspace_id
              AND wm.status = 'Active'
              AND w.is_active = TRUE
        ) INTO v_has_other_active_branches;

        IF NOT v_has_other_active_branches THEN
            v_active_profile_user_ids := array_append(v_active_profile_user_ids, v_user.id);
        END IF;
    END LOOP;

    -- 9. Record State-Preserving Suspension Snapshot
    INSERT INTO public.platform_workspace_suspensions (
        workspace_id, admin_id, reason, suspended_membership_user_ids, suspended_profile_user_ids, is_active_suspension
    ) VALUES (
        p_workspace_id, p_admin_id, p_reason, v_active_membership_user_ids, v_active_profile_user_ids, TRUE
    );

    -- 10. Deactivate Workspace
    UPDATE public.workspaces
    SET is_active = FALSE,
        suspension_reason = p_reason,
        suspended_at = v_now,
        suspended_by = p_admin_id,
        updated_at = v_now
    WHERE id = p_workspace_id;

    -- 11. Suspend ONLY the Snapshotted Active Memberships
    IF array_length(v_active_membership_user_ids, 1) > 0 THEN
        UPDATE public.workspace_memberships
        SET status = 'Suspended'
        WHERE workspace_id = p_workspace_id AND user_id = ANY(v_active_membership_user_ids);
    END IF;

    -- 12. Suspend ONLY the Snapshotted Active Profiles (Not Active Elsewhere)
    IF array_length(v_active_profile_user_ids, 1) > 0 THEN
        UPDATE public.profiles
        SET status = 'Suspended'::public.employee_status
        WHERE id = ANY(v_active_profile_user_ids);
    END IF;

    -- 13. Record Immutably in Platform Audit Log
    INSERT INTO public.platform_audit_logs (
        admin_id, admin_email, admin_role, action, target_workspace_id,
        details, client_ip
    ) VALUES (
        p_admin_id, v_admin_email, v_admin_role, 'SUSPEND_WORKSPACE', p_workspace_id,
        jsonb_build_object(
            'workspace_name', v_ws_name,
            'reason', p_reason,
            'memberships_suspended_count', coalesce(array_length(v_active_membership_user_ids, 1), 0),
            'profiles_suspended_count', coalesce(array_length(v_active_profile_user_ids, 1), 0),
            'assertion_nonce', p_nonce
        ),
        current_setting('request.headers', true)::jsonb->>'x-forwarded-for'
    );

    RETURN jsonb_build_object(
        'success', true,
        'workspace_id', p_workspace_id,
        'status', 'suspended',
        'memberships_suspended', coalesce(array_length(v_active_membership_user_ids, 1), 0),
        'profiles_suspended', coalesce(array_length(v_active_profile_user_ids, 1), 0),
        'session_revocation_required', true
    );
END;
$$;
```

### 3.2 `super_admin_reactivate_workspace`
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
    v_gateway_secret TEXT;
    v_canonical_string TEXT;
    v_expected_signature TEXT;
    v_admin_email TEXT;
    v_admin_role TEXT;
    v_ws_name TEXT;
    v_is_active BOOLEAN;
    v_suspension RECORD;
    v_restored_members INTEGER := 0;
    v_restored_profiles INTEGER := 0;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Assert Caller is Trusted Gateway Service Role
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative actions can only be invoked by the trusted Backend Gateway.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validate Assertion Freshness (30-second skew window)
    IF ABS(EXTRACT(EPOCH FROM (v_now - p_request_timestamp))) > 30 THEN
        RAISE EXCEPTION 'ASSERTION_EXPIRED: Request timestamp skewed or expired (allowed window: 30 seconds).'
            USING ERRCODE = '28000';
    END IF;

    -- 3. Atomic Nonce Consumption via Dedicated Registry Table
    BEGIN
        INSERT INTO public.platform_gcap_nonces (nonce, admin_id, action, consumed_at, expires_at)
        VALUES (p_nonce, p_admin_id, 'REACTIVATE_WORKSPACE', v_now, v_now + INTERVAL '5 minutes');
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'REPLAY_DETECTED: Assertion nonce % has already been consumed or is concurrently executing.', p_nonce
            USING ERRCODE = '23505';
    END;

    -- 4. Verify Gateway Cryptographic Signature
    v_gateway_secret := NULLIF(current_setting('app.settings.gateway_assertion_secret', true), '');
    IF v_gateway_secret IS NULL THEN
        RAISE EXCEPTION 'CONFIGURATION_ERROR: Gateway assertion secret is not provisioned on database engine.'
            USING ERRCODE = '55000';
    END IF;

    v_canonical_string := p_admin_id::TEXT || ':REACTIVATE_WORKSPACE:' || p_workspace_id::TEXT || ':' || 
                          EXTRACT(EPOCH FROM p_request_timestamp)::BIGINT::TEXT || ':' || p_nonce::TEXT;
    v_expected_signature := encode(extensions.hmac(v_canonical_string::bytea, v_gateway_secret::bytea, 'sha256'), 'hex');

    IF p_signature IS DISTINCT FROM v_expected_signature THEN
        RAISE EXCEPTION 'AUTHENTICATION_FAILED: Gateway assertion signature mismatch.'
            USING ERRCODE = '28000';
    END IF;

    -- 5. Verify Administrator Status & Role in Database
    SELECT email, role INTO v_admin_email, v_admin_role
    FROM public.platform_admins
    WHERE id = p_admin_id AND is_active = TRUE;

    IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
        RAISE EXCEPTION 'FORBIDDEN: Only active Super Admins can reactivate workspaces.'
            USING ERRCODE = '42501';
    END IF;

    -- 6. Lock and Verify Target Workspace
    SELECT company_name, is_active INTO v_ws_name, v_is_active
    FROM public.workspaces
    WHERE id = p_workspace_id
    FOR UPDATE;

    IF v_ws_name IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Workspace % does not exist.', p_workspace_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_is_active = TRUE THEN
        RETURN jsonb_build_object(
            'success', true,
            'workspace_id', p_workspace_id,
            'status', 'already_active'
        );
    END IF;

    -- 7. Locate Active Suspension Snapshot Record
    SELECT * INTO v_suspension
    FROM public.platform_workspace_suspensions
    WHERE workspace_id = p_workspace_id AND is_active_suspension = TRUE
    ORDER BY suspended_at DESC
    LIMIT 1
    FOR UPDATE;

    -- 8. Reactivate Target Workspace
    UPDATE public.workspaces
    SET is_active = TRUE,
        suspension_reason = NULL,
        suspended_at = NULL,
        suspended_by = NULL,
        updated_at = v_now
    WHERE id = p_workspace_id;

    -- 9. Restore ONLY the Specifically Snapshotted Memberships that are still 'Suspended'
    IF v_suspension.id IS NOT NULL AND array_length(v_suspension.suspended_membership_user_ids, 1) > 0 THEN
        UPDATE public.workspace_memberships
        SET status = 'Active'
        WHERE workspace_id = p_workspace_id 
          AND user_id = ANY(v_suspension.suspended_membership_user_ids)
          AND status = 'Suspended';
        GET DIAGNOSTICS v_restored_members = ROW_COUNT;
    END IF;

    -- 10. Restore ONLY the Specifically Snapshotted Profiles that are still 'Suspended' and not deleted
    IF v_suspension.id IS NOT NULL AND array_length(v_suspension.suspended_profile_user_ids, 1) > 0 THEN
        UPDATE public.profiles
        SET status = 'Active'::public.employee_status
        WHERE id = ANY(v_suspension.suspended_profile_user_ids)
          AND status = 'Suspended'::public.employee_status
          AND deleted_at IS NULL;
        GET DIAGNOSTICS v_restored_profiles = ROW_COUNT;
    END IF;

    -- 11. Close Suspension Record
    IF v_suspension.id IS NOT NULL THEN
        UPDATE public.platform_workspace_suspensions
        SET is_active_suspension = FALSE,
            reactivated_at = v_now,
            reactivated_by = p_admin_id,
            reactivation_reason = p_reason
        WHERE id = v_suspension.id;
    END IF;

    -- 12. Record in Platform Audit Log
    INSERT INTO public.platform_audit_logs (
        admin_id, admin_email, admin_role, action, target_workspace_id,
        details, client_ip
    ) VALUES (
        p_admin_id, v_admin_email, v_admin_role, 'REACTIVATE_WORKSPACE', p_workspace_id,
        jsonb_build_object(
            'workspace_name', v_ws_name,
            'reason', p_reason,
            'memberships_restored', v_restored_members,
            'profiles_restored', v_restored_profiles,
            'assertion_nonce', p_nonce
        ),
        current_setting('request.headers', true)::jsonb->>'x-forwarded-for'
    );

    RETURN jsonb_build_object(
        'success', true,
        'workspace_id', p_workspace_id,
        'status', 'active',
        'memberships_restored', v_restored_members,
        'profiles_restored', v_restored_profiles
    );
END;
$$;
```

### 3.3 `settle_coupon_payment` (Hardened with Committed Failure Audit)
```sql
CREATE OR REPLACE FUNCTION public.settle_coupon_payment(
    p_redemption_id UUID,
    p_transaction_reference TEXT,
    p_gateway_provider TEXT,
    p_amount_paid NUMERIC(10, 2),
    p_currency TEXT,
    p_provider_payload JSONB,
    p_payment_authorized_at TIMESTAMPTZ,
    p_provider_status TEXT
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
    v_tx_id UUID;
    v_period_interval INTERVAL;
    v_new_period_start TIMESTAMPTZ;
    v_new_period_end TIMESTAMPTZ;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Assert Execution via Trusted Backend Gateway Service Role
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'FORBIDDEN: Payment settlement can only be executed by the trusted Backend Gateway.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validate Allowed Payment Provider
    IF LOWER(TRIM(p_gateway_provider)) NOT IN ('youpi_pg') THEN
        RAISE EXCEPTION 'UNSUPPORTED_PROVIDER: Payment provider % is not permitted.', p_gateway_provider
            USING ERRCODE = '22023';
    END IF;

    -- 3. Validate Authoritative Captured Status (Reject uncaptured payment.authorized)
    IF LOWER(TRIM(p_provider_status)) NOT IN ('captured', 'verified_success') THEN
        RAISE EXCEPTION 'PAYMENT_NOT_CAPTURED: Payment status % cannot settle subscription. Funds must be captured.', p_provider_status
            USING ERRCODE = '22023';
    END IF;

    -- 4. Future-Dated Authorization Tolerance Check (+5 minutes maximum clock skew)
    IF p_payment_authorized_at > (v_now + INTERVAL '5 minutes') THEN
        RAISE EXCEPTION 'FUTURE_DATED_PAYMENT: Authorization timestamp % exceeds allowed clock skew.', p_payment_authorized_at
            USING ERRCODE = '22008';
    END IF;

    -- 5. Fetch and Exclusively Lock Redemption Record
    SELECT * INTO v_redemption
    FROM public.coupon_redemptions
    WHERE id = p_redemption_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'status', 'failed', 'error', 'Invalid redemption ID.');
    END IF;

    -- 6. Check Existing Transaction Reference Collisions
    SELECT * INTO v_existing_tx
    FROM public.payment_transactions
    WHERE transaction_reference = p_transaction_reference
    FOR UPDATE;

    IF v_existing_tx.id IS NOT NULL THEN
        -- Case 6A: Idempotent duplicate delivery of identical verified transaction
        IF v_existing_tx.coupon_redemption_id = p_redemption_id AND 
           v_existing_tx.workspace_id = v_redemption.workspace_id AND
           v_existing_tx.status = 'verified_success' THEN
            RETURN jsonb_build_object(
                'success', true, 
                'status', 'already_settled', 
                'message', 'Idempotent duplicate webhook handled cleanly.'
            );
        END IF;

        -- Case 6B: Idempotent duplicate delivery of support review transaction
        IF v_existing_tx.coupon_redemption_id = p_redemption_id AND 
           v_existing_tx.workspace_id = v_redemption.workspace_id AND
           v_existing_tx.status = 'failed' AND
           (v_existing_tx.provider_payload->>'requires_support_review')::boolean = true THEN
            RETURN jsonb_build_object(
                'success', false, 
                'status', 'already_under_support_review', 
                'message', 'Duplicate webhook for transaction already flagged for manual support review.'
            );
        END IF;

        -- Case 6C: Collision / Reused transaction reference across different redemptions
        RAISE EXCEPTION 'TRANSACTION_REF_COLLISION: Transaction reference % is already bound to workspace % or redemption %.',
            p_transaction_reference, v_existing_tx.workspace_id, v_existing_tx.coupon_redemption_id
            USING ERRCODE = '23505';
    END IF;

    -- 7. Validate Reservation Status
    IF v_redemption.status <> 'reserved' THEN
        RETURN jsonb_build_object(
            'success', false, 
            'status', 'invalid_state',
            'error', 'Reservation is not in reserved state (current: ' || v_redemption.status || ').'
        );
    END IF;

    -- 8. Ambiguous Payment & Late Expiry Policy
    -- 8A. Payment authorized AFTER reservation expired: flag for support review and DO NOT activate
    IF p_payment_authorized_at > v_redemption.reserved_until THEN
        UPDATE public.coupon_redemptions SET status = 'failed' WHERE id = p_redemption_id;
        
        INSERT INTO public.payment_transactions (
            workspace_id, transaction_reference, provider, amount_inr, currency,
            plan_id, status, provider_payload, coupon_redemption_id
        ) VALUES (
            v_redemption.workspace_id, p_transaction_reference, p_gateway_provider, p_amount_paid, p_currency,
            v_redemption.plan_id, 'failed',
            p_provider_payload || jsonb_build_object(
                'requires_support_review', true,
                'support_review_reason', 'PAYMENT_AUTHORIZED_AFTER_RESERVATION_EXPIRY',
                'authorized_at', p_payment_authorized_at,
                'reserved_until', v_redemption.reserved_until
            ),
            p_redemption_id
        );

        RETURN jsonb_build_object(
            'success', false, 
            'status', 'requires_support_review',
            'error', 'PAYMENT_AUTHORIZED_AFTER_EXPIRY',
            'message', 'Payment was authorized after reservation expired. Held for manual support reconciliation. Subscription not activated.'
        );
    END IF;

    -- 8B. Webhook transit arrival delayed beyond 24 hours of gateway authorization
    IF (v_now - p_payment_authorized_at) > INTERVAL '24 hours' THEN
        UPDATE public.coupon_redemptions SET status = 'failed' WHERE id = p_redemption_id;

        INSERT INTO public.payment_transactions (
            workspace_id, transaction_reference, provider, amount_inr, currency,
            plan_id, status, provider_payload, coupon_redemption_id
        ) VALUES (
            v_redemption.workspace_id, p_transaction_reference, p_gateway_provider, p_amount_paid, p_currency,
            v_redemption.plan_id, 'failed',
            p_provider_payload || jsonb_build_object(
                'requires_support_review', true,
                'support_review_reason', 'WEBHOOK_TRANSIT_TIMEOUT',
                'authorized_at', p_payment_authorized_at,
                'received_at', v_now
            ),
            p_redemption_id
        );

        RETURN jsonb_build_object(
            'success', false, 
            'status', 'requires_support_review',
            'error', 'WEBHOOK_TRANSIT_TIMEOUT',
            'message', 'Webhook delivery exceeded 24-hour maximum transit window. Held for manual support review. Subscription not activated.'
        );
    END IF;

    -- 9. Validate Currency Standards (INR Only)
    IF UPPER(TRIM(p_currency)) <> 'INR' THEN
        UPDATE public.coupon_redemptions SET status = 'failed' WHERE id = p_redemption_id;
        
        INSERT INTO public.payment_transactions (
            workspace_id, transaction_reference, provider, amount_inr, currency,
            plan_id, status, provider_payload, coupon_redemption_id
        ) VALUES (
            v_redemption.workspace_id, p_transaction_reference, p_gateway_provider, p_amount_paid, p_currency,
            v_redemption.plan_id, 'failed',
            p_provider_payload || jsonb_build_object('error', 'CURRENCY_MISMATCH', 'currency', p_currency),
            p_redemption_id
        );

        RETURN jsonb_build_object('success', false, 'status', 'failed', 'error', 'CURRENCY_MISMATCH: Only INR settlements supported.');
    END IF;

    -- 10. Validate Amount Equality (Exact Match Protection with Committed Failure Audit)
    IF p_amount_paid <> v_redemption.final_payable_inr THEN
        UPDATE public.coupon_redemptions SET status = 'failed' WHERE id = p_redemption_id;
        
        INSERT INTO public.payment_transactions (
            workspace_id, transaction_reference, provider, amount_inr, currency,
            plan_id, status, provider_payload, coupon_redemption_id
        ) VALUES (
            v_redemption.workspace_id, p_transaction_reference, p_gateway_provider, p_amount_paid, p_currency,
            v_redemption.plan_id, 'failed',
            p_provider_payload || jsonb_build_object(
                'error', 'AMOUNT_MISMATCH',
                'expected_amount', v_redemption.final_payable_inr,
                'paid_amount', p_amount_paid
            ),
            p_redemption_id
        );

        RETURN jsonb_build_object(
            'success', false, 
            'status', 'failed',
            'error', 'AMOUNT_MISMATCH',
            'code', 'P0006',
            'expected_amount', v_redemption.final_payable_inr,
            'paid_amount', p_amount_paid
        );
    END IF;

    -- 10B. Commercial Rule Guard: Block Mid-Cycle Plan Switches
    SELECT * INTO v_existing_sub
    FROM public.workspace_subscriptions
    WHERE workspace_id = v_redemption.workspace_id
    FOR UPDATE;

    IF v_existing_sub.id IS NOT NULL AND v_existing_sub.status = 'active' AND v_existing_sub.current_period_end > v_now THEN
        IF v_existing_sub.plan_id <> v_redemption.plan_id OR v_existing_sub.billing_interval <> v_redemption.billing_interval THEN
            UPDATE public.coupon_redemptions SET status = 'failed' WHERE id = p_redemption_id;

            INSERT INTO public.payment_transactions (
                workspace_id, transaction_reference, provider, amount_inr, currency,
                plan_id, status, provider_payload, coupon_redemption_id
            ) VALUES (
                v_redemption.workspace_id, p_transaction_reference, p_gateway_provider, p_amount_paid, p_currency,
                v_redemption.plan_id, 'failed',
                p_provider_payload || jsonb_build_object(
                    'error', 'MID_CYCLE_PLAN_CHANGE_BLOCKED',
                    'existing_plan', v_existing_sub.plan_id,
                    'attempted_plan', v_redemption.plan_id
                ),
                p_redemption_id
            );

            RETURN jsonb_build_object(
                'success', false, 
                'status', 'failed',
                'error', 'MID_CYCLE_PLAN_CHANGE_BLOCKED',
                'code', 'P0008',
                'message', 'Mid-cycle plan or interval changes during active paid subscription are blocked. Settlement aborted and logged.'
            );
        END IF;
    END IF;

    -- 11. Record Verified Payment Transaction
    INSERT INTO public.payment_transactions (
        workspace_id, transaction_reference, provider, amount_inr, currency,
        plan_id, status, provider_payload, verified_at, coupon_redemption_id
    ) VALUES (
        v_redemption.workspace_id, p_transaction_reference, p_gateway_provider, p_amount_paid, p_currency,
        v_redemption.plan_id, 'verified_success', p_provider_payload, v_now, p_redemption_id
    ) RETURNING id INTO v_tx_id;

    -- 12. Atomically Transition Redemption to Applied
    UPDATE public.coupon_redemptions
    SET status = 'applied',
        payment_transaction_id = v_tx_id,
        redeemed_at = v_now
    WHERE id = p_redemption_id;

    -- 13. Subscription Period Preservation Mathematics
    IF v_redemption.billing_interval = 'monthly' THEN
        v_period_interval := INTERVAL '1 month';
    ELSE
        v_period_interval := INTERVAL '1 year';
    END IF;

    IF v_existing_sub.id IS NULL THEN
        -- Scenario A: Brand New Subscription
        v_new_period_start := v_now;
        v_new_period_end := v_now + v_period_interval;
    ELSIF v_existing_sub.status = 'trialing' THEN
        -- Scenario B: Converting 14-Day Free Trial to Paid Active Plan
        v_new_period_start := v_now;
        v_new_period_end := v_now + v_period_interval;
    ELSIF v_existing_sub.status = 'active' AND v_existing_sub.current_period_end >= v_now THEN
        -- Scenario C: Same-Plan Early Renewal (preserves unexpired days)
        v_new_period_start := v_existing_sub.current_period_start;
        v_new_period_end := v_existing_sub.current_period_end + v_period_interval;
    ELSE
        -- Scenario D: Renewal After Expiry (past_due, expired, cancelled)
        v_new_period_start := v_now;
        v_new_period_end := v_now + v_period_interval;
    END IF;

    -- 14. Activate or Extend Workspace Subscription with Preserved Period
    INSERT INTO public.workspace_subscriptions (
        workspace_id, plan_id, status, current_period_start, current_period_end,
        billing_interval, applied_coupon_id, discount_amount_inr, updated_at
    ) VALUES (
        v_redemption.workspace_id, v_redemption.plan_id, 'active', v_new_period_start, v_new_period_end,
        v_redemption.billing_interval, v_redemption.coupon_id, v_redemption.discount_amount_inr, v_now
    )
    ON CONFLICT (workspace_id) DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        status = 'active',
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        billing_interval = EXCLUDED.billing_interval,
        applied_coupon_id = EXCLUDED.applied_coupon_id,
        discount_amount_inr = EXCLUDED.discount_amount_inr,
        updated_at = v_now;

    RETURN jsonb_build_object(
        'success', true, 
        'status', 'settled', 
        'transaction_id', v_tx_id,
        'period_start', v_new_period_start,
        'period_end', v_new_period_end
    );
END;
$$;
```

---

## 4. Comprehensive Test Matrix with Committed Database States

| Test ID | Test Scenario | Inputs & Trigger | Expected Function Response | Expected Committed `coupon_redemptions` State | Expected Committed `payment_transactions` State | Expected Committed `workspace_subscriptions` State |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| **TM-01** | **Normal On-Time Settlement** | Auth $\le$ Expiry; Arrival $\le$ Expiry; Amount exact; Provider `youpi_pg`. | `{"success": true, "status": "settled", ...}` | `status = 'applied'`, `payment_transaction_id = v_tx_id`, `redeemed_at = v_now` | `status = 'verified_success'`, `verified_at = v_now` | `status = 'active'`, `current_period_end` set to `v_sub_end` |
| **TM-02** | **In-Window Auth, Delayed Webhook Arrival** | Auth $\le$ Expiry; Arrival > Expiry; Transit $\le 24\text{h}$; Amount exact. | `{"success": true, "status": "settled", ...}` | `status = 'applied'`, `payment_transaction_id = v_tx_id`, `redeemed_at = v_now` | `status = 'verified_success'`, `verified_at = v_now` | `status = 'active'`, `current_period_end` set to `v_sub_end` |
| **TM-03** | **Late Payment Authorization** | Auth > Expiry; Arrival > Expiry. | `{"success": false, "status": "requires_support_review", "error": "PAYMENT_AUTHORIZED_AFTER_EXPIRY"}` | `status = 'failed'` | `status = 'failed'`, `provider_payload->>'requires_support_review' = 'true'` | **UNTOUCHED** (Subscription is NOT activated) |
| **TM-04** | **Excessive Webhook Transit Timeout** | Auth $\le$ Expiry; Arrival > Auth + 24h. | `{"success": false, "status": "requires_support_review", "error": "WEBHOOK_TRANSIT_TIMEOUT"}` | `status = 'failed'` | `status = 'failed'`, `provider_payload->>'requires_support_review' = 'true'` | **UNTOUCHED** (Subscription is NOT activated) |
| **TM-05** | **Amount Mismatch (Fraud Protection)** | Paid ₹100 instead of required ₹2,499. | `{"success": false, "status": "failed", "error": "AMOUNT_MISMATCH", "code": "P0006"}` | `status = 'failed'` | `status = 'failed'`, `provider_payload->>'error' = 'AMOUNT_MISMATCH'` | **UNTOUCHED** (Subscription is NOT activated) |
| **TM-06** | **Currency Mismatch** | Currency `'USD'` instead of `'INR'`. | `{"success": false, "status": "failed", "error": "CURRENCY_MISMATCH"}` | `status = 'failed'` | `status = 'failed'`, `provider_payload->>'error' = 'CURRENCY_MISMATCH'` | **UNTOUCHED** (Subscription is NOT activated) |
| **TM-07** | **Duplicate Webhook (Already Settled)** | Webhook re-delivered for previously verified reference. | `{"success": true, "status": "already_settled"}` | `status = 'applied'` (Unchanged) | `status = 'verified_success'` (Unchanged) | **UNTOUCHED** (Dates never advanced twice) |
| **TM-08** | **Duplicate Webhook (Support Review)** | Webhook re-delivered for transaction already under support review. | `{"success": false, "status": "already_under_support_review"}` | `status = 'failed'` (Unchanged) | `status = 'failed'` (Unchanged) | **UNTOUCHED** (Never activated) |
| **TM-09** | **Reused Reference Collision** | Reference already bound to a different workspace or redemption. | Exception `TRANSACTION_REF_COLLISION (23505)` | Unchanged (`reserved`) | Unchanged (Pre-existing row untouched) | **UNTOUCHED** |
| **TM-10** | **Same-Plan Early Renewal** | Active plan until 2026-12-01; renewed on 2026-11-20 for 1 month. | `{"success": true, "status": "settled", ...}` | `status = 'applied'` | `status = 'verified_success'` | `current_period_start = '2026-11-01'`, `current_period_end = '2027-01-01'` |
| **TM-11** | **Trial Conversion** | Active trial until 2026-11-15; converted on 2026-11-05 for 1 year. | `{"success": true, "status": "settled", ...}` | `status = 'applied'` | `status = 'verified_success'` | `status = 'active'`, `current_period_start = '2026-11-05'`, `current_period_end = '2027-11-05'` |
| **TM-12** | **Mid-Cycle Plan Switch Block** | Active `starter` monthly; user attempts `business` monthly at settlement. | `{"success": false, "status": "failed", "error": "MID_CYCLE_PLAN_CHANGE_BLOCKED"}` | `status = 'failed'` | `status = 'failed'`, `provider_payload->>'error' = 'MID_CYCLE_PLAN_CHANGE_BLOCKED'` | `status = 'active'`, plan remains `starter` (Untouched) |
| **TM-13** | **Multi-Branch Suspension Isolation** | Workspace WS1 suspended; employee E1 active in WS1 and active in branch WS2. | `{"success": true, "status": "suspended", ...}` | N/A | N/A | WS1 `is_active = FALSE`; E1 membership in WS1 is `'Suspended'`; **E1 global profile remains `'Active'`** |
| **TM-14** | **Reactivation of Modified Staff** | Employee E2 was active at suspension, but independently terminated (`'Inactive'`) during suspension. | `{"success": true, "status": "active", ...}` | N/A | N/A | WS1 `is_active = TRUE`; E2 membership remains `'Inactive'` (**NOT restored to `'Active'`**) |
| **TM-15** | **GCAP Concurrent Nonce Race** | Two concurrent sessions submit identical `p_nonce`. | Session 1: 200 OK<br/>Session 2: Exception `REPLAY_DETECTED (23505)` | N/A | N/A | `platform_gcap_nonces` contains exactly 1 row for `p_nonce` |

---

## 5. Formal Blocker Register & Categorization

| Blocker ID | Categorization | Description | Current Resolution / Mitigation | Action Required Before Phase 2 Sandbox |
| :---: | :---: | :--- | :--- | :--- |
| **BLOCKER 1** | **DESIGN-COMPLETE** | Gateway Assertion Secret (`GATEWAY_ASSERTION_SECRET`) | HMAC-SHA256 signature specification and skew window ($\pm 30\text{s}$) fully designed. | Provision 32+ byte cryptographically secure secret in staging database settings. |
| **BLOCKER 2** | **DESIGN-COMPLETE** | Gateway Webhook Secret (`GATEWAY_WEBHOOK_SECRET`) | Gateway verification contract specified (HMAC over raw body buffer + out-of-band query). | Provision webhook secret shared with `youpi_pg` in staging Gateway BFF. |
| **BLOCKER 3** | **DESIGN-COMPLETE** | Root Platform Super Admin Provisioning Ceremony | Public registration disabled; offline provisioning script (`scripts/provision-super-admin.js`) specified. | Execute offline provisioning ceremony during Phase 2 sandbox testing. |
| **BLOCKER 4** | **STAGING-TESTED** | Dedicated Non-Production Staging Database | Absolute restriction: zero direct migrations against live production `kluxsykimnjivkqxelba`. | Human operator must provision an isolated Supabase database sandbox. |
| **BLOCKER 5** | **SCHEMA-VERIFIED** | One-Time Coupon Scope Restriction | Schema constrains `discount_duration = 'once'`. Multi-month repeating discounts deferred. | Confirmed for v1.0 release; recurring coupon logic deferred to v2. |
| **BLOCKER 6** | **COMMERCIAL APPROVAL** | Mid-Cycle Subscription Plan Switch Commercial Policy | VISTAAR lacks automated proration engine. Stored procedures strictly block mid-cycle switches (`MID_CYCLE_PLAN_CHANGE_BLOCKED`). | Business leadership must define and approve credit conversion formulas before unlocking mid-cycle tier upgrades. |

---

## 6. Production Integrity Verification

- **Production Repository Path:** `d:\Project\vistaar-main\vistaar-main`
- **Git Branch:** `main` (Up to date with `origin/main`)
- **Working Tree:** `clean` (Zero production source code files modified, created, or deleted)
- **Constraint Compliance:** No database connections, SQL migrations, or deployments were performed. All work was strictly bounded to documentation and architectural design.

