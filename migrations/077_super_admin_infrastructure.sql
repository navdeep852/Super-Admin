-- ==============================================================================
-- Migration 077: VISTAAR Super Admin Infrastructure & Administrative Control Plane
-- Version: 3.0.0 (Phase 4.2 V9 Hardened Administrative Control Plane)
-- Target: Staging / Production Compatible Additive Extension
--
-- Components:
-- 1. Dedicated Administrative Tables:
--    - public.platform_admins (Platform RBAC: super_admin, billing_admin, support_agent; genuine MFA lifecycle)
--    - public.platform_gcap_nonces (Atomic GCAP Single-Use Nonce Registry)
--    - public.platform_workspace_suspensions (State-Preserving Multi-Branch Suspension Snapshot)
--    - public.platform_audit_logs (Immutable Append-Only Audit Trail)
--    - public.platform_system_settings (Platform Parameters & Tier Limits)
--    - public.platform_admin_invitations (Cryptographic Pre-Authorization & Invitation Registry)
--    - public.platform_bootstrap_registry (One-Time Bootstrap Lockout & Invariant Registry)
-- 2. Additive Workspace Extensions:
--    - public.workspaces (suspension_reason, suspended_at, suspended_by)
-- 3. Immutability Guards:
--    - enforce_platform_audit_immutability() trigger
-- 4. Authoritative Administrative RPCs:
--    - super_admin_get_platform_metrics()
--    - super_admin_suspend_workspace()
--    - super_admin_reactivate_workspace()
--    - cleanup_expired_gcap_nonces()
--    - super_admin_bootstrap_initial_admin()
--    - super_admin_create_admin_invitation()
--    - super_admin_provision_platform_admin()
--    - super_admin_enroll_mfa()
--    - super_admin_revoke_mfa()
-- ==============================================================================

BEGIN;

-- Ensure pgcrypto extension is active for HMAC-SHA256 signature verification
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. Platform Administrators Table (public.platform_admins)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admins (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'super_admin' CHECK (role IN ('super_admin', 'billing_admin', 'support_agent')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    mfa_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_enrolled_at TIMESTAMPTZ,
    mfa_last_verified_at TIMESTAMPTZ,
    phone_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_role ON public.platform_admins(role, is_active);
CREATE INDEX IF NOT EXISTS idx_platform_admins_email ON public.platform_admins(email);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Strict platform admin isolation" ON public.platform_admins;
CREATE POLICY "Strict platform admin isolation" ON public.platform_admins
    FOR ALL USING (FALSE);

-- -----------------------------------------------------------------------------
-- 2. Dedicated GCAP Nonce Registry (public.platform_gcap_nonces)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_gcap_nonces (
    nonce UUID PRIMARY KEY,
    admin_id UUID NOT NULL REFERENCES public.platform_admins(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_platform_gcap_nonces_expiry ON public.platform_gcap_nonces(expires_at);

ALTER TABLE public.platform_gcap_nonces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Strict GCAP nonce isolation" ON public.platform_gcap_nonces;
CREATE POLICY "Strict GCAP nonce isolation" ON public.platform_gcap_nonces
    FOR ALL USING (FALSE);

CREATE OR REPLACE FUNCTION public.cleanup_expired_gcap_nonces()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM public.platform_gcap_nonces WHERE expires_at < timezone('utc'::text, now());
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_gcap_nonces() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_gcap_nonces() TO service_role;

-- -----------------------------------------------------------------------------
-- 3. State-Preserving Workspace Suspension Registry (public.platform_workspace_suspensions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_workspace_suspensions (
    id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
    admin_id UUID NOT NULL REFERENCES public.platform_admins(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    suspended_membership_user_ids UUID[] NOT NULL DEFAULT '{}',
    suspended_profile_user_ids UUID[] NOT NULL DEFAULT '{}',
    is_active_suspension BOOLEAN NOT NULL DEFAULT TRUE,
    suspended_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    reactivated_at TIMESTAMPTZ DEFAULT NULL,
    reactivated_by UUID REFERENCES public.platform_admins(id) ON DELETE RESTRICT DEFAULT NULL,
    reactivation_reason TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_suspensions_ws ON public.platform_workspace_suspensions(workspace_id) WHERE is_active_suspension = TRUE;

ALTER TABLE public.platform_workspace_suspensions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Strict suspension registry isolation" ON public.platform_workspace_suspensions;
CREATE POLICY "Strict suspension registry isolation" ON public.platform_workspace_suspensions
    FOR ALL USING (FALSE);

-- -----------------------------------------------------------------------------
-- 4. Platform Audit Logs Table (public.platform_audit_logs)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
    id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    admin_id UUID REFERENCES public.platform_admins(id) ON DELETE SET NULL,
    admin_email TEXT NOT NULL,
    admin_role TEXT NOT NULL,
    action TEXT NOT NULL,
    target_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
    target_user_id UUID DEFAULT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    client_ip TEXT,
    user_agent TEXT,
    record_hash TEXT,
    previous_record_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON public.platform_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_admin ON public.platform_audit_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_workspace ON public.platform_audit_logs(target_workspace_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_action ON public.platform_audit_logs(action);

ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Strict platform audit isolation" ON public.platform_audit_logs;
CREATE POLICY "Strict platform audit isolation" ON public.platform_audit_logs
    FOR ALL USING (FALSE);

CREATE OR REPLACE FUNCTION public.enforce_platform_audit_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY_VIOLATION: platform_audit_logs is an immutable append-only ledger. Updates and deletions are strictly prohibited.'
        USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_platform_audit_immutability() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_platform_audit_logs ON public.platform_audit_logs;
CREATE TRIGGER trg_protect_platform_audit_logs
    BEFORE UPDATE OR DELETE ON public.platform_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_platform_audit_immutability();

REVOKE UPDATE, DELETE, TRUNCATE ON public.platform_audit_logs FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE ON public.platform_audit_logs FROM service_role;

-- -----------------------------------------------------------------------------
-- 5. Platform System Settings (public.platform_system_settings)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES public.platform_admins(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.platform_system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Prevent direct client mutation of system settings" ON public.platform_system_settings;
CREATE POLICY "Prevent direct client mutation of system settings" ON public.platform_system_settings
    FOR ALL USING (FALSE);

-- -----------------------------------------------------------------------------
-- 6. Platform Administrator Invitations & Pre-Authorizations (public.platform_admin_invitations)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admin_invitations (
    id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'super_admin' CHECK (role IN ('super_admin', 'billing_admin', 'support_agent')),
    invited_by UUID NOT NULL REFERENCES public.platform_admins(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_invitations_lookup 
    ON public.platform_admin_invitations (target_user_id, status);

CREATE INDEX IF NOT EXISTS idx_platform_admin_invitations_email 
    ON public.platform_admin_invitations (lower(target_email), status);

ALTER TABLE public.platform_admin_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Strict platform admin invitations isolation" ON public.platform_admin_invitations;
CREATE POLICY "Strict platform admin invitations isolation" ON public.platform_admin_invitations
    FOR ALL USING (FALSE);

-- -----------------------------------------------------------------------------
-- 7. Dedicated Platform Bootstrap Invariant Registry (public.platform_bootstrap_registry)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_bootstrap_registry (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    is_bootstrapped BOOLEAN NOT NULL DEFAULT FALSE,
    bootstrapped_at TIMESTAMPTZ,
    bootstrapped_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    bootstrap_ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.platform_bootstrap_registry (id, is_bootstrapped)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_bootstrap_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Strict bootstrap registry isolation" ON public.platform_bootstrap_registry;
CREATE POLICY "Strict bootstrap registry isolation" ON public.platform_bootstrap_registry
    FOR ALL USING (FALSE);

-- -----------------------------------------------------------------------------
-- 8. Explicit Table-Level Privilege Lockdown (Defense-in-Depth)
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE 
    public.platform_admins, 
    public.platform_gcap_nonces, 
    public.platform_workspace_suspensions, 
    public.platform_audit_logs, 
    public.platform_system_settings, 
    public.platform_admin_invitations,
    public.platform_bootstrap_registry
FROM PUBLIC;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE 
            public.platform_admins, 
            public.platform_gcap_nonces, 
            public.platform_workspace_suspensions, 
            public.platform_audit_logs, 
            public.platform_system_settings, 
            public.platform_admin_invitations,
            public.platform_bootstrap_registry
        FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE 
            public.platform_admins, 
            public.platform_gcap_nonces, 
            public.platform_workspace_suspensions, 
            public.platform_audit_logs, 
            public.platform_system_settings, 
            public.platform_admin_invitations,
            public.platform_bootstrap_registry
        FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        -- 1. Full Admin Entities: SELECT, INSERT, UPDATE, DELETE
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
            public.platform_admins, 
            public.platform_system_settings,
            public.platform_admin_invitations 
        TO service_role;

        -- 2. Bootstrap Registry: SELECT, INSERT, UPDATE (no DELETE)
        GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_bootstrap_registry TO service_role;
        REVOKE DELETE ON TABLE public.platform_bootstrap_registry FROM service_role;

        -- 3. Nonce Replay Store: SELECT, INSERT, DELETE (write-once, cleanup-expired; no UPDATE)
        GRANT SELECT, INSERT, DELETE ON TABLE public.platform_gcap_nonces TO service_role;
        REVOKE UPDATE ON TABLE public.platform_gcap_nonces FROM service_role;

        -- 4. Security Action Audit: SELECT, INSERT, UPDATE (suspension & reactivation audit; no DELETE)
        GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_workspace_suspensions TO service_role;
        REVOKE DELETE ON TABLE public.platform_workspace_suspensions FROM service_role;

        -- 5. Immutable Audit Logs: SELECT, INSERT ONLY (immutable; no UPDATE or DELETE)
        GRANT SELECT, INSERT ON TABLE public.platform_audit_logs TO service_role;
        REVOKE UPDATE, DELETE ON TABLE public.platform_audit_logs FROM service_role;

        -- Deny high-risk DDL privileges across all platform administration tables
        REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE 
            public.platform_admins, 
            public.platform_gcap_nonces, 
            public.platform_workspace_suspensions, 
            public.platform_audit_logs, 
            public.platform_system_settings, 
            public.platform_admin_invitations,
            public.platform_bootstrap_registry
        FROM service_role;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 9. Additive Columns on Existing Tables
-- -----------------------------------------------------------------------------
ALTER TABLE public.workspaces
    ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES public.platform_admins(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 10. Authoritative Administrative RPC: super_admin_get_platform_metrics
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_admin_get_platform_metrics(
    p_admin_id UUID,
    p_session_aal TEXT,
    p_request_timestamp TIMESTAMPTZ,
    p_nonce UUID,
    p_signature TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_gateway_secret TEXT;
    v_canonical_string TEXT;
    v_expected_signature TEXT;
    v_admin_role TEXT;
    v_mfa_enrolled BOOLEAN;
    v_total_workspaces INTEGER;
    v_active_workspaces INTEGER;
    v_suspended_workspaces INTEGER;
    v_total_users INTEGER;
    v_active_subscriptions INTEGER;
    v_trialing_subscriptions INTEGER;
    v_tenant_gmv_sales NUMERIC(14, 2);
    v_gross_sub_revenue NUMERIC(14, 2);
    v_gst_component NUMERIC(14, 2);
    v_net_sub_revenue NUMERIC(14, 2);
    v_mrr NUMERIC(14, 2);
    v_arr NUMERIC(14, 2);
    v_total_coupons INTEGER := 0;
    v_active_coupons INTEGER := 0;
    v_total_redemptions INTEGER := 0;
    v_total_discount_granted NUMERIC(14, 2) := 0.00;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Assert Caller is Trusted Gateway Service Role
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrative metrics can only be invoked by the trusted Backend Gateway.'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validate Assertion Freshness (30-second skew window)
    IF p_request_timestamp IS NULL OR ABS(EXTRACT(EPOCH FROM (v_now - p_request_timestamp))) > 30 THEN
        RAISE EXCEPTION 'ASSERTION_EXPIRED: Request timestamp skewed or expired (allowed window: 30 seconds).'
            USING ERRCODE = '28000';
    END IF;

    -- 3. Atomic Nonce Consumption via Dedicated Registry Table
    BEGIN
        INSERT INTO public.platform_gcap_nonces (nonce, admin_id, action, consumed_at, expires_at)
        VALUES (p_nonce, p_admin_id, 'GET_PLATFORM_METRICS', v_now, v_now + INTERVAL '5 minutes');
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

    v_canonical_string := p_admin_id::TEXT || ':GET_PLATFORM_METRICS:ALL:NONE:' || coalesce(p_session_aal, '') || ':' || 
                          EXTRACT(EPOCH FROM p_request_timestamp)::BIGINT::TEXT || ':' || p_nonce::TEXT;
    v_expected_signature := encode(extensions.hmac(v_canonical_string::bytea, v_gateway_secret::bytea, 'sha256'), 'hex');

    IF p_signature IS DISTINCT FROM v_expected_signature THEN
        RAISE EXCEPTION 'AUTHENTICATION_FAILED: Gateway assertion signature mismatch.'
            USING ERRCODE = '28000';
    END IF;

    -- 5. Verify Session Assurance: Must be AAL2
    IF p_session_aal IS DISTINCT FROM 'aal2' THEN
        RAISE EXCEPTION 'MFA_ASSURANCE_REQUIRED: Administrative metrics access requires an AAL2 authenticated session (current: %).', coalesce(p_session_aal, 'none')
            USING ERRCODE = '42501';
    END IF;

    -- 6. Verify Administrator Status & Role in Database
    SELECT role, mfa_enrolled INTO v_admin_role, v_mfa_enrolled
    FROM public.platform_admins
    WHERE id = p_admin_id AND is_active = TRUE;

    IF v_admin_role IS NULL OR v_admin_role NOT IN ('super_admin', 'billing_admin') THEN
        RAISE EXCEPTION 'FORBIDDEN: Administrator is inactive or unauthorized to view platform metrics.'
            USING ERRCODE = '42501';
    END IF;

    IF v_mfa_enrolled IS NOT TRUE THEN
        RAISE EXCEPTION 'MFA_REQUIRED: Requesting administrator has not enrolled multi-factor authentication.'
            USING ERRCODE = '42501';
    END IF;

    -- 7. Metric Calculations
    SELECT COUNT(*), 
           COUNT(*) FILTER (WHERE is_active = TRUE),
           COUNT(*) FILTER (WHERE is_active = FALSE)
    INTO v_total_workspaces, v_active_workspaces, v_suspended_workspaces
    FROM public.workspaces;

    SELECT COUNT(*) INTO v_total_users FROM public.profiles;

    SELECT COUNT(*) FILTER (WHERE status = 'active'),
           COUNT(*) FILTER (WHERE status = 'trialing')
    INTO v_active_subscriptions, v_trialing_subscriptions
    FROM public.workspace_subscriptions;

    SELECT COALESCE(SUM(grand_total), 0.00) INTO v_tenant_gmv_sales
    FROM public.invoices
    WHERE status NOT IN ('Cancelled'::public.invoice_status, 'Draft'::public.invoice_status);

    SELECT COALESCE(SUM(amount_inr), 0.00) INTO v_gross_sub_revenue
    FROM public.payment_transactions
    WHERE status = 'verified_success';

    v_gst_component := ROUND((v_gross_sub_revenue - (v_gross_sub_revenue / 1.18)), 2);
    v_net_sub_revenue := v_gross_sub_revenue - v_gst_component;

    SELECT 
        COALESCE(SUM(
            CASE 
                WHEN ws.billing_interval = 'monthly' THEN sp.price_monthly_inr
                WHEN ws.billing_interval = 'annual' THEN ROUND(sp.price_annual_inr / 12.0, 2)
                ELSE 0.00 
            END
        ), 0.00)
    INTO v_mrr
    FROM public.workspace_subscriptions ws
    JOIN public.subscription_plans sp ON ws.plan_id = sp.id
    WHERE ws.status = 'active';

    v_arr := ROUND(v_mrr * 12.0, 2);

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coupons') THEN
        EXECUTE 'SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active = TRUE) FROM public.coupons'
        INTO v_total_coupons, v_active_coupons;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'coupon_redemptions') THEN
        EXECUTE 'SELECT COUNT(*), COALESCE(SUM(discount_amount_inr), 0.00) FROM public.coupon_redemptions WHERE status = ''applied'''
        INTO v_total_redemptions, v_total_discount_granted;
    END IF;

    RETURN jsonb_build_object(
        'workspaces', jsonb_build_object(
            'total', v_total_workspaces,
            'active', v_active_workspaces,
            'suspended', v_suspended_workspaces
        ),
        'users', jsonb_build_object('total_registered', v_total_users),
        'subscriptions', jsonb_build_object(
            'active_paid', v_active_subscriptions,
            'active_trial', v_trialing_subscriptions
        ),
        'revenue', jsonb_build_object(
            'tenant_gmv_sales_inr', v_tenant_gmv_sales,
            'gross_collected_subscription_inr', v_gross_sub_revenue,
            'gst_tax_collected_inr', v_gst_component,
            'net_platform_revenue_inr', v_net_sub_revenue,
            'mrr_inr', v_mrr,
            'arr_inr', v_arr
        ),
        'promotions', jsonb_build_object(
            'total_campaigns', v_total_coupons,
            'active_campaigns', v_active_coupons,
            'total_redemptions', v_total_redemptions,
            'total_discount_granted_inr', v_total_discount_granted
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_get_platform_metrics(UUID, TEXT, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_get_platform_metrics(UUID, TEXT, TIMESTAMPTZ, UUID, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 11. Authoritative Administrative RPC: super_admin_suspend_workspace
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_admin_suspend_workspace(
    p_workspace_id UUID,
    p_reason TEXT,
    p_admin_id UUID,
    p_session_aal TEXT,
    p_request_timestamp TIMESTAMPTZ,
    p_nonce UUID,
    p_signature TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_gateway_secret TEXT;
    v_canonical_string TEXT;
    v_expected_signature TEXT;
    v_admin_email TEXT;
    v_admin_role TEXT;
    v_mfa_enrolled BOOLEAN;
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
    IF p_request_timestamp IS NULL OR ABS(EXTRACT(EPOCH FROM (v_now - p_request_timestamp))) > 30 THEN
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

    v_canonical_string := p_admin_id::TEXT || ':SUSPEND_WORKSPACE:' || p_workspace_id::TEXT || ':NONE:' || 
                          coalesce(p_session_aal, '') || ':' || EXTRACT(EPOCH FROM p_request_timestamp)::BIGINT::TEXT || ':' || p_nonce::TEXT;
    v_expected_signature := encode(extensions.hmac(v_canonical_string::bytea, v_gateway_secret::bytea, 'sha256'), 'hex');

    IF p_signature IS DISTINCT FROM v_expected_signature THEN
        RAISE EXCEPTION 'AUTHENTICATION_FAILED: Gateway assertion signature mismatch.'
            USING ERRCODE = '28000';
    END IF;

    -- 5. Verify Session Assurance: Must be AAL2
    IF p_session_aal IS DISTINCT FROM 'aal2' THEN
        RAISE EXCEPTION 'MFA_ASSURANCE_REQUIRED: Workspace suspension requires an AAL2 authenticated session (current: %).', coalesce(p_session_aal, 'none')
            USING ERRCODE = '42501';
    END IF;

    -- 6. Verify Administrator Status & Role in Database
    SELECT email, role, mfa_enrolled INTO v_admin_email, v_admin_role, v_mfa_enrolled
    FROM public.platform_admins
    WHERE id = p_admin_id AND is_active = TRUE;

    IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
        RAISE EXCEPTION 'FORBIDDEN: Only active Super Admins can suspend workspaces.'
            USING ERRCODE = '42501';
    END IF;

    IF v_mfa_enrolled IS NOT TRUE THEN
        RAISE EXCEPTION 'MFA_REQUIRED: Requesting administrator has not enrolled multi-factor authentication.'
            USING ERRCODE = '42501';
    END IF;

    -- 7. Lock and Verify Target Workspace
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

    -- 8. Snapshot ONLY Memberships That Are Currently 'Active'
    SELECT COALESCE(array_agg(user_id), '{}') INTO v_active_membership_user_ids
    FROM public.workspace_memberships
    WHERE workspace_id = p_workspace_id AND status = 'Active';

    -- 9. Snapshot ONLY Profiles That Are Currently 'Active' and have NO other active branch
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

    -- 10. Record State-Preserving Suspension Snapshot
    INSERT INTO public.platform_workspace_suspensions (
        workspace_id, admin_id, reason, suspended_membership_user_ids, suspended_profile_user_ids, is_active_suspension
    ) VALUES (
        p_workspace_id, p_admin_id, p_reason, v_active_membership_user_ids, v_active_profile_user_ids, TRUE
    );

    -- 11. Deactivate Workspace
    UPDATE public.workspaces
    SET is_active = FALSE,
        suspension_reason = p_reason,
        suspended_at = v_now,
        suspended_by = p_admin_id,
        updated_at = v_now
    WHERE id = p_workspace_id;

    -- 12. Suspend ONLY the Snapshotted Active Memberships
    IF array_length(v_active_membership_user_ids, 1) > 0 THEN
        UPDATE public.workspace_memberships
        SET status = 'Suspended'
        WHERE workspace_id = p_workspace_id AND user_id = ANY(v_active_membership_user_ids);
    END IF;

    -- 13. Suspend ONLY the Snapshotted Active Profiles
    IF array_length(v_active_profile_user_ids, 1) > 0 THEN
        UPDATE public.profiles
        SET status = 'Suspended'::public.employee_status
        WHERE id = ANY(v_active_profile_user_ids);
    END IF;

    -- 14. Record Immutably in Platform Audit Log
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
        'profiles_suspended', coalesce(array_length(v_active_profile_user_ids, 1), 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_suspend_workspace(UUID, TEXT, UUID, TEXT, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_suspend_workspace(UUID, TEXT, UUID, TEXT, TIMESTAMPTZ, UUID, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 12. Authoritative Administrative RPC: super_admin_reactivate_workspace
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_admin_reactivate_workspace(
    p_workspace_id UUID,
    p_reason TEXT,
    p_admin_id UUID,
    p_session_aal TEXT,
    p_request_timestamp TIMESTAMPTZ,
    p_nonce UUID,
    p_signature TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_gateway_secret TEXT;
    v_canonical_string TEXT;
    v_expected_signature TEXT;
    v_admin_email TEXT;
    v_admin_role TEXT;
    v_mfa_enrolled BOOLEAN;
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
    IF p_request_timestamp IS NULL OR ABS(EXTRACT(EPOCH FROM (v_now - p_request_timestamp))) > 30 THEN
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

    v_canonical_string := p_admin_id::TEXT || ':REACTIVATE_WORKSPACE:' || p_workspace_id::TEXT || ':NONE:' || 
                          coalesce(p_session_aal, '') || ':' || EXTRACT(EPOCH FROM p_request_timestamp)::BIGINT::TEXT || ':' || p_nonce::TEXT;
    v_expected_signature := encode(extensions.hmac(v_canonical_string::bytea, v_gateway_secret::bytea, 'sha256'), 'hex');

    IF p_signature IS DISTINCT FROM v_expected_signature THEN
        RAISE EXCEPTION 'AUTHENTICATION_FAILED: Gateway assertion signature mismatch.'
            USING ERRCODE = '28000';
    END IF;

    -- 5. Verify Session Assurance: Must be AAL2
    IF p_session_aal IS DISTINCT FROM 'aal2' THEN
        RAISE EXCEPTION 'MFA_ASSURANCE_REQUIRED: Workspace reactivation requires an AAL2 authenticated session (current: %).', coalesce(p_session_aal, 'none')
            USING ERRCODE = '42501';
    END IF;

    -- 6. Verify Administrator Status & Role in Database
    SELECT email, role, mfa_enrolled INTO v_admin_email, v_admin_role, v_mfa_enrolled
    FROM public.platform_admins
    WHERE id = p_admin_id AND is_active = TRUE;

    IF v_admin_role IS NULL OR v_admin_role <> 'super_admin' THEN
        RAISE EXCEPTION 'FORBIDDEN: Only active Super Admins can reactivate workspaces.'
            USING ERRCODE = '42501';
    END IF;

    IF v_mfa_enrolled IS NOT TRUE THEN
        RAISE EXCEPTION 'MFA_REQUIRED: Requesting administrator has not enrolled multi-factor authentication.'
            USING ERRCODE = '42501';
    END IF;

    -- 7. Lock and Verify Target Workspace
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

    -- 8. Fetch the Most Recent Active Suspension Snapshot
    SELECT * INTO v_suspension
    FROM public.platform_workspace_suspensions
    WHERE workspace_id = p_workspace_id AND is_active_suspension = TRUE
    ORDER BY suspended_at DESC
    LIMIT 1
    FOR UPDATE;

    -- 9. Reactivate Target Workspace
    UPDATE public.workspaces
    SET is_active = TRUE,
        suspension_reason = NULL,
        suspended_at = NULL,
        suspended_by = NULL,
        updated_at = v_now
    WHERE id = p_workspace_id;

    -- 10. Restore ONLY the Snapshotted Memberships that are still 'Suspended'
    IF v_suspension.id IS NOT NULL AND array_length(v_suspension.suspended_membership_user_ids, 1) > 0 THEN
        UPDATE public.workspace_memberships
        SET status = 'Active'
        WHERE workspace_id = p_workspace_id 
          AND user_id = ANY(v_suspension.suspended_membership_user_ids)
          AND status = 'Suspended';
        GET DIAGNOSTICS v_restored_members = ROW_COUNT;
    END IF;

    -- 11. Restore ONLY the Snapshotted Profiles that are still 'Suspended' and not deleted
    IF v_suspension.id IS NOT NULL AND array_length(v_suspension.suspended_profile_user_ids, 1) > 0 THEN
        UPDATE public.profiles
        SET status = 'Active'::public.employee_status
        WHERE id = ANY(v_suspension.suspended_profile_user_ids)
          AND status = 'Suspended'::public.employee_status
          AND deleted_at IS NULL;
        GET DIAGNOSTICS v_restored_profiles = ROW_COUNT;
    END IF;

    -- 12. Close Suspension Record
    IF v_suspension.id IS NOT NULL THEN
        UPDATE public.platform_workspace_suspensions
        SET is_active_suspension = FALSE,
            reactivated_at = v_now,
            reactivated_by = p_admin_id,
            reactivation_reason = p_reason
        WHERE id = v_suspension.id;
    END IF;

    -- 13. Record in Platform Audit Log
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

REVOKE ALL ON FUNCTION public.super_admin_reactivate_workspace(UUID, TEXT, UUID, TEXT, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_reactivate_workspace(UUID, TEXT, UUID, TEXT, TIMESTAMPTZ, UUID, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 13. One-Time Bootstrap Administrative RPC: super_admin_bootstrap_initial_admin
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_admin_bootstrap_initial_admin(
    p_admin_id UUID,
    p_email TEXT,
    p_full_name TEXT,
    p_bootstrap_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_is_bootstrapped BOOLEAN;
    v_admin_count INTEGER;
    v_auth_email TEXT;
    v_expected_token TEXT;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Caller Authorization Check (Service Role Only)
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'FORBIDDEN: Only trusted Gateway BFF service_role can execute initial bootstrap'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Transaction-Level Advisory Lock to serialize concurrent bootstrap requests
    PERFORM pg_advisory_xact_lock(hashtext('platform_bootstrap_lock'));

    -- 3. Strict One-Time Invariant: Lock registry row and verify not already bootstrapped
    SELECT is_bootstrapped INTO v_is_bootstrapped
    FROM public.platform_bootstrap_registry
    WHERE id = 1
    FOR UPDATE;

    SELECT COUNT(*) INTO v_admin_count FROM public.platform_admins;

    IF v_is_bootstrapped IS TRUE OR v_admin_count > 0 THEN
        RAISE EXCEPTION 'BOOTSTRAP_ALREADY_COMPLETED: Platform administrator bootstrap has already been completed. Initial bootstrap is permanently locked out. Subsequent administrators must be invited by an active super_admin.'
            USING ERRCODE = '55000';
    END IF;

    -- 4. Verify Dedicated Bootstrap Secret Token against Database Setting
    v_expected_token := NULLIF(current_setting('app.settings.platform_bootstrap_secret', true), '');
    IF v_expected_token IS NULL OR p_bootstrap_token IS DISTINCT FROM v_expected_token THEN
        RAISE EXCEPTION 'AUTHENTICATION_FAILED: Invalid or missing bootstrap authorization token'
            USING ERRCODE = '28000';
    END IF;

    -- 5. Verify Auth Identity Existence in auth.users
    SELECT email INTO v_auth_email FROM auth.users WHERE id = p_admin_id;
    IF NOT FOUND OR v_auth_email IS NULL THEN
        RAISE EXCEPTION 'AUTH_IDENTITY_NOT_FOUND: User % does not exist in auth.users. Account must be created via Supabase Auth Admin API first.', p_admin_id
            USING ERRCODE = '55000';
    END IF;

    -- 6. Verify Exact Email Consistency with auth.users
    IF lower(p_email) <> lower(v_auth_email) THEN
        RAISE EXCEPTION 'IDENTITY_EMAIL_MISMATCH: Provided email % does not match Auth record email %', p_email, v_auth_email
            USING ERRCODE = '55001';
    END IF;

    -- 7. Insert Initial Root Super Administrator with mfa_enrolled = FALSE (MFA enrolled separately)
    INSERT INTO public.platform_admins (
        id, email, full_name, role, is_active, mfa_enrolled, updated_at
    ) VALUES (
        p_admin_id, v_auth_email, p_full_name, 'super_admin', TRUE, FALSE, v_now
    );

    -- 8. Mark Bootstrap Registry as Completed (Permanent Lockout)
    UPDATE public.platform_bootstrap_registry
    SET is_bootstrapped = TRUE,
        bootstrapped_at = v_now,
        bootstrapped_by = p_admin_id,
        bootstrap_ip = current_setting('request.headers', true)::jsonb->>'x-forwarded-for',
        updated_at = v_now
    WHERE id = 1;

    -- 9. Record Immutable Bootstrap Audit Log
    INSERT INTO public.platform_audit_logs (
        admin_id, admin_email, admin_role, action, target_user_id, details, client_ip
    ) VALUES (
        p_admin_id, v_auth_email, 'super_admin', 'BOOTSTRAP_INITIAL_ADMIN', p_admin_id,
        jsonb_build_object(
            'message', 'Initial platform super administrator bootstrapped via one-time dedicated authorization',
            'bootstrap_timestamp', v_now
        ),
        current_setting('request.headers', true)::jsonb->>'x-forwarded-for'
    );

    RETURN jsonb_build_object(
        'success', true,
        'action', 'BOOTSTRAP_INITIAL_ADMIN',
        'admin_id', p_admin_id,
        'email', v_auth_email,
        'role', 'super_admin',
        'mfa_enrolled', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_bootstrap_initial_admin(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_bootstrap_initial_admin(UUID, TEXT, TEXT, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 14. Dedicated MFA Enrollment RPC: super_admin_enroll_mfa
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_admin_enroll_mfa(
    p_admin_id UUID,
    p_session_aal TEXT,
    p_actor_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_admin RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Caller Authorization Check (Service Role Only)
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'FORBIDDEN: Only trusted Gateway BFF service_role can enroll administrator MFA'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Verify Session Assurance: Must be AAL2
    IF p_session_aal IS DISTINCT FROM 'aal2' THEN
        RAISE EXCEPTION 'MFA_ASSURANCE_REQUIRED: Administrator MFA enrollment requires an active AAL2 session assurance (current: %).', coalesce(p_session_aal, 'none')
            USING ERRCODE = '42501';
    END IF;

    -- 3. Lock and Verify Target Administrator
    SELECT * INTO v_admin
    FROM public.platform_admins
    WHERE id = p_admin_id
    FOR UPDATE;

    IF NOT FOUND OR v_admin.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'ADMIN_NOT_FOUND: Administrator % does not exist or is inactive.', p_admin_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 4. Update Administrator MFA Status
    UPDATE public.platform_admins
    SET mfa_enrolled = TRUE,
        mfa_enrolled_at = v_now,
        mfa_last_verified_at = v_now,
        updated_at = v_now
    WHERE id = p_admin_id;

    -- 5. Record in Platform Audit Log
    INSERT INTO public.platform_audit_logs (
        admin_id, admin_email, admin_role, action, target_user_id, details, client_ip
    ) VALUES (
        p_admin_id, v_admin.email, v_admin.role, 'ADMIN_MFA_ENROLLED', p_admin_id,
        jsonb_build_object(
            'enrolled_at', v_now,
            'session_assurance', p_session_aal,
            'actor_admin_id', coalesce(p_actor_admin_id, p_admin_id)
        ),
        current_setting('request.headers', true)::jsonb->>'x-forwarded-for'
    );

    RETURN jsonb_build_object(
        'success', true,
        'admin_id', p_admin_id,
        'email', v_admin.email,
        'mfa_enrolled', true,
        'mfa_enrolled_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_enroll_mfa(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_enroll_mfa(UUID, TEXT, UUID) TO service_role;

-- -----------------------------------------------------------------------------
-- 15. Dedicated MFA Revocation RPC: super_admin_revoke_mfa
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_admin_revoke_mfa(
    p_actor_admin_id UUID,
    p_target_admin_id UUID,
    p_reason TEXT,
    p_session_aal TEXT,
    p_request_timestamp TIMESTAMPTZ,
    p_nonce UUID,
    p_signature TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_gateway_secret TEXT;
    v_canonical_string TEXT;
    v_expected_signature TEXT;
    v_actor_email TEXT;
    v_actor_role TEXT;
    v_actor_active BOOLEAN;
    v_actor_mfa BOOLEAN;
    v_target RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Caller Authorization Check (Service Role Only)
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'FORBIDDEN: Only trusted Gateway BFF service_role can revoke administrator MFA'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validate Assertion Freshness (30-second skew window)
    IF p_request_timestamp IS NULL OR ABS(EXTRACT(EPOCH FROM (v_now - p_request_timestamp))) > 30 THEN
        RAISE EXCEPTION 'ASSERTION_EXPIRED: Request timestamp skewed or expired (allowed window: 30 seconds).'
            USING ERRCODE = '28000';
    END IF;

    -- 3. Atomic Nonce Consumption via Dedicated Registry Table
    BEGIN
        INSERT INTO public.platform_gcap_nonces (nonce, admin_id, action, consumed_at, expires_at)
        VALUES (p_nonce, p_actor_admin_id, 'REVOKE_MFA', v_now, v_now + INTERVAL '5 minutes');
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

    v_canonical_string := p_actor_admin_id::TEXT || ':REVOKE_MFA:' || p_target_admin_id::TEXT || ':NONE:' || 
                          coalesce(p_session_aal, '') || ':' || EXTRACT(EPOCH FROM p_request_timestamp)::BIGINT::TEXT || ':' || p_nonce::TEXT;
    v_expected_signature := encode(extensions.hmac(v_canonical_string::bytea, v_gateway_secret::bytea, 'sha256'), 'hex');

    IF p_signature IS DISTINCT FROM v_expected_signature THEN
        RAISE EXCEPTION 'AUTHENTICATION_FAILED: Gateway assertion signature mismatch.'
            USING ERRCODE = '28000';
    END IF;

    -- 5. Verify Requesting Actor Status, Role, and MFA Policy
    SELECT email, role, is_active, mfa_enrolled 
    INTO v_actor_email, v_actor_role, v_actor_active, v_actor_mfa
    FROM public.platform_admins
    WHERE id = p_actor_admin_id;

    IF v_actor_email IS NULL OR v_actor_active IS NOT TRUE THEN
        RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: Requesting actor % does not exist or is inactive.', p_actor_admin_id
            USING ERRCODE = '42501';
    END IF;

    IF v_actor_role <> 'super_admin' THEN
        RAISE EXCEPTION 'FORBIDDEN: Only active Super Admins can revoke MFA policy (actor role: %).', v_actor_role
            USING ERRCODE = '42501';
    END IF;

    IF v_actor_mfa IS NOT TRUE THEN
        RAISE EXCEPTION 'MFA_REQUIRED: Requesting actor % has not enrolled multi-factor authentication.', p_actor_admin_id
            USING ERRCODE = '42501';
    END IF;

    IF p_session_aal IS DISTINCT FROM 'aal2' THEN
        RAISE EXCEPTION 'MFA_ASSURANCE_REQUIRED: MFA revocation requires an AAL2 authenticated session (current: %).', coalesce(p_session_aal, 'none')
            USING ERRCODE = '42501';
    END IF;

    -- 6. Lock and Verify Target Administrator
    SELECT * INTO v_target
    FROM public.platform_admins
    WHERE id = p_target_admin_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TARGET_NOT_FOUND: Administrator % does not exist.', p_target_admin_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 7. Reset MFA Enrollment
    UPDATE public.platform_admins
    SET mfa_enrolled = FALSE,
        mfa_enrolled_at = NULL,
        mfa_last_verified_at = NULL,
        updated_at = v_now
    WHERE id = p_target_admin_id;

    -- 8. Record in Platform Audit Log
    INSERT INTO public.platform_audit_logs (
        admin_id, admin_email, admin_role, action, target_user_id, details, client_ip
    ) VALUES (
        p_actor_admin_id, v_actor_email, v_actor_role, 'ADMIN_MFA_REVOKED', p_target_admin_id,
        jsonb_build_object(
            'target_email', v_target.email,
            'reason', p_reason,
            'assertion_nonce', p_nonce
        ),
        current_setting('request.headers', true)::jsonb->>'x-forwarded-for'
    );

    RETURN jsonb_build_object(
        'success', true,
        'target_admin_id', p_target_admin_id,
        'mfa_enrolled', false,
        'revoked_by', p_actor_admin_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_revoke_mfa(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_revoke_mfa(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 16. Authoritative Administrative RPC: super_admin_create_admin_invitation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_admin_create_admin_invitation(
    p_target_user_id UUID,
    p_target_email TEXT,
    p_role TEXT,
    p_session_aal TEXT,
    p_expires_in_hours INTEGER DEFAULT 24,
    p_actor_admin_id UUID DEFAULT NULL,
    p_request_timestamp TIMESTAMPTZ DEFAULT NULL,
    p_nonce UUID DEFAULT NULL,
    p_signature TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_gateway_secret TEXT;
    v_canonical_string TEXT;
    v_expected_signature TEXT;
    v_actor_email TEXT;
    v_actor_role TEXT;
    v_actor_active BOOLEAN;
    v_actor_mfa BOOLEAN;
    v_auth_email TEXT;
    v_invitation_id UUID;
    v_expires_at TIMESTAMPTZ;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Caller Authorization Check (Service Role Only)
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'FORBIDDEN: Only trusted Gateway BFF service_role can create administrator invitations'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validate Assertion Freshness (30-second skew window)
    IF p_request_timestamp IS NULL OR ABS(EXTRACT(EPOCH FROM (v_now - p_request_timestamp))) > 30 THEN
        RAISE EXCEPTION 'ASSERTION_EXPIRED: Request timestamp skewed or expired (allowed window: 30 seconds).'
            USING ERRCODE = '28000';
    END IF;

    -- 3. Atomic Nonce Consumption via Dedicated Registry Table
    BEGIN
        INSERT INTO public.platform_gcap_nonces (nonce, admin_id, action, consumed_at, expires_at)
        VALUES (p_nonce, p_actor_admin_id, 'CREATE_ADMIN_INVITATION', v_now, v_now + INTERVAL '5 minutes');
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

    v_canonical_string := p_actor_admin_id::TEXT || ':CREATE_ADMIN_INVITATION:' || p_target_user_id::TEXT || ':' || 
                          p_role || ':' || coalesce(p_session_aal, '') || ':' || EXTRACT(EPOCH FROM p_request_timestamp)::BIGINT::TEXT || ':' || p_nonce::TEXT;
    v_expected_signature := encode(extensions.hmac(v_canonical_string::bytea, v_gateway_secret::bytea, 'sha256'), 'hex');

    IF p_signature IS DISTINCT FROM v_expected_signature THEN
        RAISE EXCEPTION 'AUTHENTICATION_FAILED: Gateway assertion signature mismatch.'
            USING ERRCODE = '28000';
    END IF;

    -- 5. Verify Session Assurance: Must be AAL2
    IF p_session_aal IS DISTINCT FROM 'aal2' THEN
        RAISE EXCEPTION 'MFA_ASSURANCE_REQUIRED: Administrator invitation requires an AAL2 authenticated session (current: %).', coalesce(p_session_aal, 'none')
            USING ERRCODE = '42501';
    END IF;

    -- 6. Verify Requesting Actor Status, Role, and MFA Policy
    SELECT email, role, is_active, mfa_enrolled 
    INTO v_actor_email, v_actor_role, v_actor_active, v_actor_mfa
    FROM public.platform_admins
    WHERE id = p_actor_admin_id;

    IF v_actor_email IS NULL OR v_actor_active IS NOT TRUE THEN
        RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: Requesting actor % does not exist or is inactive.', p_actor_admin_id
            USING ERRCODE = '42501';
    END IF;

    IF v_actor_role <> 'super_admin' THEN
        RAISE EXCEPTION 'FORBIDDEN: Only active Super Admins can issue platform administrator invitations (actor role: %).', v_actor_role
            USING ERRCODE = '42501';
    END IF;

    IF v_actor_mfa IS NOT TRUE THEN
        RAISE EXCEPTION 'MFA_REQUIRED: Requesting actor % has not enrolled multi-factor authentication.', p_actor_admin_id
            USING ERRCODE = '42501';
    END IF;

    -- 7. Validate Target Role
    IF p_role NOT IN ('super_admin', 'billing_admin', 'support_agent') THEN
        RAISE EXCEPTION 'INVALID_ROLE: Role % is not a valid platform administrator role.', p_role
            USING ERRCODE = '22023';
    END IF;

    -- 8. Verify Target Auth Identity Existence in auth.users
    SELECT email INTO v_auth_email FROM auth.users WHERE id = p_target_user_id;
    IF NOT FOUND OR v_auth_email IS NULL THEN
        RAISE EXCEPTION 'AUTH_IDENTITY_NOT_FOUND: Target user % does not exist in auth.users. Account must be created via Supabase Auth Admin API first.', p_target_user_id
            USING ERRCODE = '55000';
    END IF;

    -- 9. Verify Exact Target Email Consistency
    IF lower(p_target_email) <> lower(v_auth_email) THEN
        RAISE EXCEPTION 'IDENTITY_EMAIL_MISMATCH: Target email % does not match Auth record email %', p_target_email, v_auth_email
            USING ERRCODE = '55001';
    END IF;

    -- 10. Verify Target Is Not Already an Active Administrator
    IF EXISTS (SELECT 1 FROM public.platform_admins WHERE id = p_target_user_id AND is_active = TRUE) THEN
        RAISE EXCEPTION 'ALREADY_ADMIN: Identity % is already an active platform administrator.', v_auth_email
            USING ERRCODE = '55002';
    END IF;

    -- 11. Revoke Any Existing Pending Invitations for this Target
    UPDATE public.platform_admin_invitations
    SET status = 'revoked', updated_at = v_now
    WHERE target_user_id = p_target_user_id AND status = 'pending';

    -- 12. Compute Expiration & Insert New Invitation
    v_expires_at := v_now + (COALESCE(p_expires_in_hours, 24) || ' hours')::INTERVAL;
    
    INSERT INTO public.platform_admin_invitations (
        target_user_id, target_email, role, invited_by, status, expires_at, created_at, updated_at
    ) VALUES (
        p_target_user_id, lower(v_auth_email), p_role, p_actor_admin_id, 'pending', v_expires_at, v_now, v_now
    ) RETURNING id INTO v_invitation_id;

    -- 13. Record in Platform Audit Log
    INSERT INTO public.platform_audit_logs (
        admin_id, admin_email, admin_role, action, target_user_id, details, client_ip
    ) VALUES (
        p_actor_admin_id, v_actor_email, v_actor_role, 'CREATE_ADMIN_INVITATION', p_target_user_id,
        jsonb_build_object(
            'invitation_id', v_invitation_id,
            'target_email', v_auth_email,
            'approved_role', p_role,
            'expires_at', v_expires_at,
            'assertion_nonce', p_nonce
        ),
        current_setting('request.headers', true)::jsonb->>'x-forwarded-for'
    );

    RETURN jsonb_build_object(
        'success', true,
        'invitation_id', v_invitation_id,
        'target_user_id', p_target_user_id,
        'target_email', v_auth_email,
        'role', p_role,
        'expires_at', v_expires_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_create_admin_invitation(UUID, TEXT, TEXT, TEXT, INTEGER, UUID, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_create_admin_invitation(UUID, TEXT, TEXT, TEXT, INTEGER, UUID, TIMESTAMPTZ, UUID, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 17. Authoritative Administrative RPC: super_admin_provision_platform_admin
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.super_admin_provision_platform_admin(
    p_admin_id UUID,
    p_email TEXT,
    p_full_name TEXT,
    p_role TEXT,
    p_session_aal TEXT,
    p_actor_admin_id UUID,
    p_request_timestamp TIMESTAMPTZ,
    p_nonce UUID,
    p_signature TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_gateway_secret TEXT;
    v_canonical_string TEXT;
    v_expected_signature TEXT;
    v_actor_email TEXT;
    v_actor_role TEXT;
    v_actor_active BOOLEAN;
    v_actor_mfa BOOLEAN;
    v_auth_email TEXT;
    v_existing_admin RECORD;
    v_existing_email_admin RECORD;
    v_invitation RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Caller Authorization Check (Service Role Only)
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'FORBIDDEN: Only trusted Gateway BFF service_role can provision platform administrators'
            USING ERRCODE = '42501';
    END IF;

    -- 2. Validate Assertion Freshness (30-second skew window)
    IF p_request_timestamp IS NULL OR ABS(EXTRACT(EPOCH FROM (v_now - p_request_timestamp))) > 30 THEN
        RAISE EXCEPTION 'ASSERTION_EXPIRED: Request timestamp skewed or expired (allowed window: 30 seconds).'
            USING ERRCODE = '28000';
    END IF;

    -- 3. Atomic Nonce Consumption via Dedicated Registry Table
    BEGIN
        INSERT INTO public.platform_gcap_nonces (nonce, admin_id, action, consumed_at, expires_at)
        VALUES (p_nonce, p_actor_admin_id, 'PROVISION_PLATFORM_ADMIN', v_now, v_now + INTERVAL '5 minutes');
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

    v_canonical_string := p_actor_admin_id::TEXT || ':PROVISION_PLATFORM_ADMIN:' || p_admin_id::TEXT || ':' || 
                          p_role || ':' || coalesce(p_session_aal, '') || ':' || EXTRACT(EPOCH FROM p_request_timestamp)::BIGINT::TEXT || ':' || p_nonce::TEXT;
    v_expected_signature := encode(extensions.hmac(v_canonical_string::bytea, v_gateway_secret::bytea, 'sha256'), 'hex');

    IF p_signature IS DISTINCT FROM v_expected_signature THEN
        RAISE EXCEPTION 'AUTHENTICATION_FAILED: Gateway assertion signature mismatch.'
            USING ERRCODE = '28000';
    END IF;

    -- 5. Verify Session Assurance: Must be AAL2
    IF p_session_aal IS DISTINCT FROM 'aal2' THEN
        RAISE EXCEPTION 'MFA_ASSURANCE_REQUIRED: Administrator provisioning requires an AAL2 authenticated session (current: %).', coalesce(p_session_aal, 'none')
            USING ERRCODE = '42501';
    END IF;

    -- 6. Verify Requesting Actor Status, Role, and MFA Policy
    SELECT email, role, is_active, mfa_enrolled 
    INTO v_actor_email, v_actor_role, v_actor_active, v_actor_mfa
    FROM public.platform_admins
    WHERE id = p_actor_admin_id;

    IF v_actor_email IS NULL OR v_actor_active IS NOT TRUE THEN
        RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: Requesting actor % does not exist or is inactive.', p_actor_admin_id
            USING ERRCODE = '42501';
    END IF;

    IF v_actor_role <> 'super_admin' THEN
        RAISE EXCEPTION 'FORBIDDEN: Only active Super Admins can provision platform administrators (actor role: %).', v_actor_role
            USING ERRCODE = '42501';
    END IF;

    IF v_actor_mfa IS NOT TRUE THEN
        RAISE EXCEPTION 'MFA_REQUIRED: Requesting actor % has not enrolled multi-factor authentication.', p_actor_admin_id
            USING ERRCODE = '42501';
    END IF;

    -- 7. Validate Target Role Parameter
    IF p_role NOT IN ('super_admin', 'billing_admin', 'support_agent') THEN
        RAISE EXCEPTION 'INVALID_ROLE: Role % is not a valid platform administrator role.', p_role
            USING ERRCODE = '22023';
    END IF;

    -- 8. Verify Auth Identity Existence in auth.users
    SELECT email INTO v_auth_email FROM auth.users WHERE id = p_admin_id;
    IF NOT FOUND OR v_auth_email IS NULL THEN
        RAISE EXCEPTION 'AUTH_IDENTITY_NOT_FOUND: User with ID % does not exist in auth.users. Account must be created via Supabase Auth Admin API first.', p_admin_id
            USING ERRCODE = '55000';
    END IF;

    -- 9. Verify Exact Target Email Consistency with auth.users
    IF lower(p_email) <> lower(v_auth_email) THEN
        RAISE EXCEPTION 'IDENTITY_EMAIL_MISMATCH: Provided email % does not match Auth record email %', p_email, v_auth_email
            USING ERRCODE = '55001';
    END IF;

    -- 10. Explicit Administrator Invitation / Pre-Authorization Verification
    -- Lock latest invitation row FOR UPDATE to serialize concurrent provisioning requests
    SELECT * INTO v_invitation
    FROM public.platform_admin_invitations
    WHERE target_user_id = p_admin_id
      AND lower(target_email) = lower(v_auth_email)
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED_PROVISIONING: No invitation exists for identity % (UUID: %). Domain membership alone does not grant administrative privileges.',
            v_auth_email, p_admin_id
            USING ERRCODE = '55001';
    END IF;

    -- Check Invitation Status Cleanly without uncommitted pre-rollback updates
    IF v_invitation.status = 'accepted' THEN
        RAISE EXCEPTION 'INVITATION_ALREADY_CONSUMED: The administrator invitation for % has already been consumed at %.',
            v_auth_email, v_invitation.consumed_at
            USING ERRCODE = '55001';
    END IF;

    IF v_invitation.status = 'revoked' THEN
        RAISE EXCEPTION 'INVITATION_REVOKED: The administrator invitation for % has been revoked.',
            v_auth_email
            USING ERRCODE = '55001';
    END IF;

    IF v_invitation.status = 'expired' OR v_invitation.expires_at < v_now THEN
        RAISE EXCEPTION 'INVITATION_EXPIRED: The administrator invitation for % expired at %.',
            v_auth_email, v_invitation.expires_at
            USING ERRCODE = '55001';
    END IF;

    IF v_invitation.status <> 'pending' THEN
        RAISE EXCEPTION 'INVITATION_INVALID_STATUS: The administrator invitation for % has invalid status %.',
            v_auth_email, v_invitation.status
            USING ERRCODE = '55001';
    END IF;

    -- Check Approved Role Consistency
    IF v_invitation.role <> p_role THEN
        RAISE EXCEPTION 'ROLE_MISMATCH: Requested role % does not match approved invitation role %.',
            p_role, v_invitation.role
            USING ERRCODE = '42501';
    END IF;

    -- 11. Overwrite Protection: Check Existing Admin by ID
    SELECT * INTO v_existing_admin FROM public.platform_admins WHERE id = p_admin_id;
    IF FOUND THEN
        IF lower(v_existing_admin.email) <> lower(v_auth_email) THEN
            RAISE EXCEPTION 'OVERWRITE_PROTECTION_TRIGGERED: Cannot overwrite existing administrator (id: %, email: %) with identity %',
                p_admin_id, v_existing_admin.email, v_auth_email
                USING ERRCODE = '55002';
        END IF;
    END IF;

    -- 12. Duplicate Email Rejection: Check Existing Admin with Same Email under Different UUID
    SELECT * INTO v_existing_email_admin FROM public.platform_admins WHERE lower(email) = lower(v_auth_email);
    IF FOUND AND v_existing_email_admin.id <> p_admin_id THEN
        RAISE EXCEPTION 'DUPLICATE_ADMIN_EMAIL: Email % is already registered to platform administrator with ID %',
            v_auth_email, v_existing_email_admin.id
            USING ERRCODE = '55003';
    END IF;

    -- 13. Atomically Consume the Invitation (Single-Use Enforced)
    UPDATE public.platform_admin_invitations
    SET status = 'accepted',
        consumed_at = v_now,
        updated_at = v_now
    WHERE id = v_invitation.id;

    -- 14. Upsert Authorized Administrator Record with mfa_enrolled = FALSE (MFA enrolled separately)
    INSERT INTO public.platform_admins (
        id, email, full_name, role, is_active, mfa_enrolled, updated_at
    ) VALUES (
        p_admin_id, v_auth_email, p_full_name, p_role, TRUE, FALSE, v_now
    )
    ON CONFLICT (id) DO UPDATE SET 
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        is_active = TRUE,
        updated_at = v_now;

    -- 15. Record Immutable Action in Platform Audit Log
    INSERT INTO public.platform_audit_logs (
        admin_id,
        admin_email,
        admin_role,
        action,
        target_user_id,
        details,
        client_ip
    ) VALUES (
        p_actor_admin_id,
        v_actor_email,
        v_actor_role,
        'PROVISION_PLATFORM_ADMIN',
        p_admin_id,
        jsonb_build_object(
            'target_email', v_auth_email,
            'target_full_name', p_full_name,
            'assigned_role', p_role,
            'invitation_id', v_invitation.id,
            'invited_by', v_invitation.invited_by,
            'assertion_nonce', p_nonce
        ),
        current_setting('request.headers', true)::jsonb->>'x-forwarded-for'
    );

    RETURN jsonb_build_object(
        'success', true,
        'admin_id', p_admin_id,
        'email', v_auth_email,
        'role', p_role,
        'invitation_id', v_invitation.id,
        'mfa_enrolled', false
    );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_provision_platform_admin(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_provision_platform_admin(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, UUID, TEXT) TO service_role;

COMMIT;
