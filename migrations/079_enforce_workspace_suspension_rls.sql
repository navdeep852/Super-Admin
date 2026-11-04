-- ==============================================================================
-- Migration 079: Enforce Workspace Suspension Row-Level Security & Authoritative RPC Hardening
-- Version: 1.0.0 (Production-Ready Suspension Enforcement & GUC Resiliency)
-- Target: Staging & Production Compatible
--
-- Fixes Identified:
-- 1. Updates current_user_workspace_id() to return NULL when workspace is inactive or profile is not Active.
-- 2. Updates user_has_workspace_access(p_workspace_id) to verify workspace is_active IS TRUE and not deleted.
-- 3. Hardens GCAP secret resolution in administrative RPCs to read from public.platform_system_settings
--    as fallback when custom GUC is not present on managed cloud instances.
-- 4. Ensures super_admin_suspend_workspace and super_admin_reactivate_workspace handle profiles and memberships
--    without referencing non-existent updated_at on workspace_memberships.
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Authoritative Workspace ID Resolution for RLS Policies
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_workspace_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_is_active BOOLEAN;
    v_profile_status public.employee_status;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NULL;
    END IF;

    -- Query authoritative profile and parent workspace
    SELECT p.workspace_id, w.is_active, p.status 
    INTO v_workspace_id, v_is_active, v_profile_status
    FROM public.profiles p
    JOIN public.workspaces w ON p.workspace_id = w.id
    WHERE p.id = auth.uid() 
      AND p.deleted_at IS NULL
      AND w.deleted_at IS NULL;

    -- If workspace is suspended or user is not active, return NULL so RLS blocks access
    IF v_workspace_id IS NOT NULL AND v_is_active IS TRUE AND v_profile_status = 'Active' THEN
        RETURN v_workspace_id;
    END IF;
    
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_workspace_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_workspace_id() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Multi-Branch & Membership Workspace Access Verification
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_ws_active BOOLEAN;
BEGIN
    IF v_user_id IS NULL OR p_workspace_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Verify workspace is active and not soft-deleted
    SELECT is_active INTO v_ws_active 
    FROM public.workspaces 
    WHERE id = p_workspace_id AND deleted_at IS NULL;

    IF v_ws_active IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- 1. Check if user has an Active profile in this workspace
    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = v_user_id 
          AND workspace_id = p_workspace_id 
          AND status = 'Active'
          AND deleted_at IS NULL
    ) THEN
        RETURN TRUE;
    END IF;

    -- 2. Check active workspace membership
    IF EXISTS (
        SELECT 1 FROM public.workspace_memberships 
        WHERE user_id = v_user_id 
          AND workspace_id = p_workspace_id 
          AND LOWER(status) = 'active'
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.user_has_workspace_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_workspace_access(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Hardened Authoritative Administrative Suspension RPC
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

    -- 4. Resolve Gateway Cryptographic Secret (GUC or platform_system_settings)
    v_gateway_secret := NULLIF(current_setting('app.settings.gateway_assertion_secret', true), '');
    IF v_gateway_secret IS NULL THEN
        SELECT value#>>'{}' INTO v_gateway_secret 
        FROM public.platform_system_settings 
        WHERE key = 'gateway_assertion_secret';
    END IF;

    IF v_gateway_secret IS NULL THEN
        RAISE EXCEPTION 'CONFIGURATION_ERROR: Gateway assertion secret is not provisioned on database engine.'
            USING ERRCODE = '55000';
    END IF;

    -- 5. Verify Cryptographic HMAC Signature
    v_canonical_string := p_admin_id::TEXT || ':SUSPEND_WORKSPACE:' || p_workspace_id::TEXT || ':NONE:' || 
                          coalesce(p_session_aal, '') || ':' || EXTRACT(EPOCH FROM p_request_timestamp)::BIGINT::TEXT || ':' || p_nonce::TEXT;
    v_expected_signature := encode(extensions.hmac(v_canonical_string::bytea, v_gateway_secret::bytea, 'sha256'), 'hex');

    IF p_signature IS DISTINCT FROM v_expected_signature THEN
        RAISE EXCEPTION 'AUTHENTICATION_FAILED: Gateway assertion signature mismatch.'
            USING ERRCODE = '28000';
    END IF;

    -- 6. Verify Session Assurance: Must be AAL2
    IF p_session_aal IS DISTINCT FROM 'aal2' THEN
        RAISE EXCEPTION 'MFA_ASSURANCE_REQUIRED: Workspace suspension requires an AAL2 authenticated session (current: %).', coalesce(p_session_aal, 'none')
            USING ERRCODE = '42501';
    END IF;

    -- 7. Verify Administrator Status & Role in Database
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

    -- 8. Lock and Verify Target Workspace
    SELECT company_name, is_active INTO v_ws_name, v_is_active
    FROM public.workspaces
    WHERE id = p_workspace_id
    FOR UPDATE;

    IF v_ws_name IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Workspace % does not exist.', p_workspace_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_is_active = FALSE THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Workspace % is already suspended.', p_workspace_id
            USING ERRCODE = '55000';
    END IF;

    -- 9. Snapshot Active Profile IDs and Membership IDs
    SELECT COALESCE(array_agg(id), '{}') INTO v_active_profile_user_ids
    FROM public.profiles
    WHERE workspace_id = p_workspace_id AND status = 'Active';

    SELECT COALESCE(array_agg(user_id), '{}') INTO v_active_membership_user_ids
    FROM public.workspace_memberships
    WHERE workspace_id = p_workspace_id AND LOWER(status) = 'active';

    -- 10. Update Workspace Status
    UPDATE public.workspaces
    SET is_active = FALSE,
        suspension_reason = p_reason,
        suspended_at = v_now,
        suspended_by = p_admin_id,
        updated_at = v_now
    WHERE id = p_workspace_id;

    -- 11. Cascade Suspension to Associated Profiles
    IF array_length(v_active_profile_user_ids, 1) > 0 THEN
        UPDATE public.profiles
        SET status = 'Suspended',
            updated_at = v_now
        WHERE id = ANY(v_active_profile_user_ids);
    END IF;

    -- 12. Cascade Suspension to Memberships (Note: no updated_at column on memberships)
    UPDATE public.workspace_memberships
    SET status = 'suspended'
    WHERE workspace_id = p_workspace_id AND LOWER(status) = 'active';

    -- 13. Insert Suspension Audit Record
    INSERT INTO public.platform_workspace_suspensions (
        workspace_id,
        admin_id,
        reason,
        suspended_membership_user_ids,
        suspended_profile_user_ids,
        is_active_suspension,
        suspended_at
    ) VALUES (
        p_workspace_id,
        p_admin_id,
        p_reason,
        v_active_membership_user_ids,
        v_active_profile_user_ids,
        TRUE,
        v_now
    );

    -- 14. Append to Immutable Audit Trail
    INSERT INTO public.platform_audit_logs (
        admin_id,
        admin_email,
        admin_role,
        action,
        target_workspace_id,
        details
    ) VALUES (
        p_admin_id,
        v_admin_email,
        v_admin_role,
        'WORKSPACE_SUSPENDED',
        p_workspace_id,
        jsonb_build_object(
            'workspace_name', v_ws_name,
            'reason', p_reason,
            'suspended_profiles_count', COALESCE(array_length(v_active_profile_user_ids, 1), 0),
            'suspended_memberships_count', COALESCE(array_length(v_active_membership_user_ids, 1), 0),
            'session_aal', p_session_aal,
            'enforcement', 'rls_and_session_isolated'
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'workspace_id', p_workspace_id,
        'workspace_name', v_ws_name,
        'status', 'Suspended',
        'suspended_at', v_now,
        'suspended_profiles_count', COALESCE(array_length(v_active_profile_user_ids, 1), 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_suspend_workspace(UUID, TEXT, UUID, TEXT, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_suspend_workspace(UUID, TEXT, UUID, TEXT, TIMESTAMPTZ, UUID, TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Hardened Authoritative Administrative Reactivation RPC
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
    v_restored_profiles INTEGER := 0;
    v_restored_members INTEGER := 0;
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

    -- 3. Atomic Nonce Consumption
    BEGIN
        INSERT INTO public.platform_gcap_nonces (nonce, admin_id, action, consumed_at, expires_at)
        VALUES (p_nonce, p_admin_id, 'REACTIVATE_WORKSPACE', v_now, v_now + INTERVAL '5 minutes');
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'REPLAY_DETECTED: Assertion nonce % has already been consumed or is concurrently executing.', p_nonce
            USING ERRCODE = '23505';
    END;

    -- 4. Resolve Gateway Cryptographic Secret (GUC or platform_system_settings)
    v_gateway_secret := NULLIF(current_setting('app.settings.gateway_assertion_secret', true), '');
    IF v_gateway_secret IS NULL THEN
        SELECT value#>>'{}' INTO v_gateway_secret 
        FROM public.platform_system_settings 
        WHERE key = 'gateway_assertion_secret';
    END IF;

    IF v_gateway_secret IS NULL THEN
        RAISE EXCEPTION 'CONFIGURATION_ERROR: Gateway assertion secret is not provisioned on database engine.'
            USING ERRCODE = '55000';
    END IF;

    -- 5. Verify Cryptographic HMAC Signature
    v_canonical_string := p_admin_id::TEXT || ':REACTIVATE_WORKSPACE:' || p_workspace_id::TEXT || ':NONE:' || 
                          coalesce(p_session_aal, '') || ':' || EXTRACT(EPOCH FROM p_request_timestamp)::BIGINT::TEXT || ':' || p_nonce::TEXT;
    v_expected_signature := encode(extensions.hmac(v_canonical_string::bytea, v_gateway_secret::bytea, 'sha256'), 'hex');

    IF p_signature IS DISTINCT FROM v_expected_signature THEN
        RAISE EXCEPTION 'AUTHENTICATION_FAILED: Gateway assertion signature mismatch.'
            USING ERRCODE = '28000';
    END IF;

    -- 6. Verify Session Assurance: Must be AAL2
    IF p_session_aal IS DISTINCT FROM 'aal2' THEN
        RAISE EXCEPTION 'MFA_ASSURANCE_REQUIRED: Workspace reactivation requires an AAL2 authenticated session (current: %).', coalesce(p_session_aal, 'none')
            USING ERRCODE = '42501';
    END IF;

    -- 7. Verify Administrator Status & Role in Database
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

    -- 8. Lock and Verify Target Workspace
    SELECT company_name, is_active INTO v_ws_name, v_is_active
    FROM public.workspaces
    WHERE id = p_workspace_id
    FOR UPDATE;

    IF v_ws_name IS NULL THEN
        RAISE EXCEPTION 'NOT_FOUND: Workspace % does not exist.', p_workspace_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_is_active = TRUE THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Workspace % is already active.', p_workspace_id
            USING ERRCODE = '55000';
    END IF;

    -- 9. Retrieve Latest Active Suspension Snapshot
    SELECT * INTO v_suspension
    FROM public.platform_workspace_suspensions
    WHERE workspace_id = p_workspace_id AND is_active_suspension = TRUE
    ORDER BY suspended_at DESC
    LIMIT 1
    FOR UPDATE;

    -- 10. Reactivate Workspace
    UPDATE public.workspaces
    SET is_active = TRUE,
        suspension_reason = NULL,
        suspended_at = NULL,
        suspended_by = NULL,
        updated_at = v_now
    WHERE id = p_workspace_id;

    -- 11. Selective Restoration of Profiles using Snapshotted IDs
    IF v_suspension.id IS NOT NULL AND array_length(v_suspension.suspended_profile_user_ids, 1) > 0 THEN
        UPDATE public.profiles
        SET status = 'Active',
            updated_at = v_now
        WHERE id = ANY(v_suspension.suspended_profile_user_ids)
          AND workspace_id = p_workspace_id;
        GET DIAGNOSTICS v_restored_profiles = ROW_COUNT;
    ELSE
        -- Fallback: restore all suspended profiles in this workspace
        UPDATE public.profiles
        SET status = 'Active',
            updated_at = v_now
        WHERE workspace_id = p_workspace_id AND status = 'Suspended';
        GET DIAGNOSTICS v_restored_profiles = ROW_COUNT;
    END IF;

    -- 12. Selective Restoration of Memberships
    IF v_suspension.id IS NOT NULL AND array_length(v_suspension.suspended_membership_user_ids, 1) > 0 THEN
        UPDATE public.workspace_memberships
        SET status = 'active'
        WHERE workspace_id = p_workspace_id 
          AND user_id = ANY(v_suspension.suspended_membership_user_ids);
        GET DIAGNOSTICS v_restored_members = ROW_COUNT;
    ELSE
        UPDATE public.workspace_memberships
        SET status = 'active'
        WHERE workspace_id = p_workspace_id AND LOWER(status) = 'suspended';
        GET DIAGNOSTICS v_restored_members = ROW_COUNT;
    END IF;

    -- 13. Deactivate Suspension Record
    IF v_suspension.id IS NOT NULL THEN
        UPDATE public.platform_workspace_suspensions
        SET is_active_suspension = FALSE
        WHERE id = v_suspension.id;
    END IF;

    -- 14. Append to Immutable Audit Trail
    INSERT INTO public.platform_audit_logs (
        admin_id,
        admin_email,
        admin_role,
        action,
        target_workspace_id,
        details
    ) VALUES (
        p_admin_id,
        v_admin_email,
        v_admin_role,
        'WORKSPACE_REACTIVATED',
        p_workspace_id,
        jsonb_build_object(
            'workspace_name', v_ws_name,
            'reason', p_reason,
            'restored_profiles_count', v_restored_profiles,
            'restored_memberships_count', v_restored_members,
            'session_aal', p_session_aal
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'workspace_id', p_workspace_id,
        'workspace_name', v_ws_name,
        'status', 'Active',
        'reactivated_at', v_now,
        'restored_profiles_count', v_restored_profiles
    );
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_reactivate_workspace(UUID, TEXT, UUID, TEXT, TIMESTAMPTZ, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.super_admin_reactivate_workspace(UUID, TEXT, UUID, TEXT, TIMESTAMPTZ, UUID, TEXT) TO service_role;

COMMIT;

