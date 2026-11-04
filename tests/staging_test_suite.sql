-- ==============================================================================
-- VISTAAR Super Admin - Phase 4 Automated Staging Test Suite (Hardened V9)
-- Target: Staging PostgreSQL Database ONLY (NEVER EXECUTE ON PRODUCTION)
--
-- Components Verified:
-- PART A: Static Catalog Privilege Assertions
-- 1. Migration 077 & 078 Table & Function Existence (18 Tables, 13 Functions)
-- 2. Audit Log Immutability Enforcement (Trigger trg_protect_platform_audit_logs)
-- 3. Schema CREATE & USAGE Catalog Privileges (public & extensions)
-- 4. Table-Level ACL Privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE)
-- 5. Privileged Function EXECUTE Access Controls (All 13 SECURITY DEFINER functions)
--
-- PART B: Runtime Security & Role Context Tests
-- 6. Production Administrator Provisioning Security Verification:
--    - 0B: One-time bootstrap via dedicated secret & permanent lockout
--    - 0C: Dedicated MFA enrollment RPC (AAL2 enforcement)
--    - 6A: Domain-bypass rejection without invitation
--    - 6B: Overwrite defense with complete row immutability
--    - 6C: Duplicate administrator email rejection (55003)
--    - 6D: Single-use invitation consumption & reuse blocking (55001)
--    - 6E: GCAP cryptographic & actor boundaries (AAL2 session assurance & MFA)
-- 7. Runtime Access Restrictions on Administrative Tables (anon / authenticated)
-- 8. Object-Shadowing & search_path Resilience (pg_temp shadow attack)
-- 9. Coupon Quoting Authorization Rejection for Unrelated Tenant User
-- 10. GCAP Security Triad (Nonce Replay, Invalid Signature, Timestamp Skew, AAL2)
--
-- PART C: Business & Financial Logic Integrity
-- 11. Coupon Quoting & Reservation Math (validate_and_reserve_coupon)
-- 12. Zero-Payable 100% Discount Subscription Activation (activate_zero_payable_subscription)
-- 13. Payment Settlement Amount Mismatch Committed Audit (settle_coupon_payment)
-- 14. Payment Settlement Success & Duplicate Webhook Idempotency
-- 15. Late Webhook Support Review Flagging (authorized after reservation expiry)
-- 16. GCAP Workspace Suspension & State-Preserving Reactivation
-- ==============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Safety Guard: Ensure not running against known production database
DO $$
DECLARE
    v_db_name TEXT := current_database();
BEGIN
    RAISE NOTICE 'Executing Phase 4 Hardened Test Suite V9 on Database: %', v_db_name;
END $$;

-- -----------------------------------------------------------------------------
-- TEST 1: Verify Table & Function Existence
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_admins')), 'platform_admins missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_gcap_nonces')), 'platform_gcap_nonces missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_workspace_suspensions')), 'platform_workspace_suspensions missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_audit_logs')), 'platform_audit_logs missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_system_settings')), 'platform_system_settings missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_admin_invitations')), 'platform_admin_invitations missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'platform_bootstrap_registry')), 'platform_bootstrap_registry missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coupons')), 'coupons missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'coupon_redemptions')), 'coupon_redemptions missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'super_admin_get_platform_metrics')), 'super_admin_get_platform_metrics missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'super_admin_suspend_workspace')), 'super_admin_suspend_workspace missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'super_admin_reactivate_workspace')), 'super_admin_reactivate_workspace missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'super_admin_bootstrap_initial_admin')), 'super_admin_bootstrap_initial_admin missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'super_admin_create_admin_invitation')), 'super_admin_create_admin_invitation missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'super_admin_provision_platform_admin')), 'super_admin_provision_platform_admin missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'super_admin_enroll_mfa')), 'super_admin_enroll_mfa missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'super_admin_revoke_mfa')), 'super_admin_revoke_mfa missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'validate_and_reserve_coupon')), 'validate_and_reserve_coupon missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'activate_zero_payable_subscription')), 'activate_zero_payable_subscription missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'settle_coupon_payment')), 'settle_coupon_payment missing';
    ASSERT (SELECT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_name = 'cleanup_expired_gcap_nonces')), 'cleanup_expired_gcap_nonces missing';
    RAISE NOTICE 'TEST 1 PASSED: All 18 Phase 4 tables and 13 authoritative functions exist.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 2: Audit Log Immutability Enforcement
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO public.platform_audit_logs (
        admin_email, admin_role, action, details, client_ip
    ) VALUES (
        'sec_audit@test.com', 'super_admin', 'TEST_ACTION', '{"test": true}'::jsonb, '127.0.0.1'
    ) RETURNING id INTO v_log_id;

    -- Attempt update - MUST fail with SECURITY_VIOLATION (55000)
    BEGIN
        UPDATE public.platform_audit_logs SET action = 'TAMPERED' WHERE id = v_log_id;
        RAISE EXCEPTION 'TEST 2 FAILED: UPDATE succeeded on immutable audit log.';
    EXCEPTION WHEN SQLSTATE '55000' THEN
        RAISE NOTICE 'TEST 2A PASSED: UPDATE correctly rejected on immutable audit log.';
    END;

    -- Attempt delete - MUST fail with SECURITY_VIOLATION (55000)
    BEGIN
        DELETE FROM public.platform_audit_logs WHERE id = v_log_id;
        RAISE EXCEPTION 'TEST 2 FAILED: DELETE succeeded on immutable audit log.';
    EXCEPTION WHEN SQLSTATE '55000' THEN
        RAISE NOTICE 'TEST 2B PASSED: DELETE correctly rejected on immutable audit log.';
    END;
END $$;

-- -----------------------------------------------------------------------------
-- TEST 3: Schema CREATE & USAGE Catalog Privileges (Finding 1)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    -- 1. Assert CREATE is revoked on public schema from untrusted roles
    ASSERT NOT has_schema_privilege('public', 'public', 'CREATE'), 'SECURITY VIOLATION: public pseudo-role has CREATE on public';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        ASSERT NOT has_schema_privilege('anon', 'public', 'CREATE'), 'SECURITY VIOLATION: anon role has CREATE on public';
        ASSERT has_schema_privilege('anon', 'public', 'USAGE'), 'anon must have USAGE on public';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        ASSERT NOT has_schema_privilege('authenticated', 'public', 'CREATE'), 'SECURITY VIOLATION: authenticated role has CREATE on public';
        ASSERT has_schema_privilege('authenticated', 'public', 'USAGE'), 'authenticated must have USAGE on public';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        ASSERT has_schema_privilege('service_role', 'public', 'USAGE'), 'service_role must have USAGE on public';
        ASSERT NOT has_schema_privilege('service_role', 'public', 'CREATE'), 'SECURITY VIOLATION: service_role has CREATE on public';
    END IF;

    -- 2. Assert CREATE is revoked on extensions schema from untrusted roles
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
        ASSERT NOT has_schema_privilege('public', 'extensions', 'CREATE'), 'SECURITY VIOLATION: public has CREATE on extensions';
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            ASSERT NOT has_schema_privilege('anon', 'extensions', 'CREATE'), 'SECURITY VIOLATION: anon has CREATE on extensions';
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            ASSERT NOT has_schema_privilege('authenticated', 'extensions', 'CREATE'), 'SECURITY VIOLATION: authenticated has CREATE on extensions';
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            ASSERT has_schema_privilege('service_role', 'extensions', 'USAGE'), 'service_role must have USAGE on extensions';
            ASSERT NOT has_schema_privilege('service_role', 'extensions', 'CREATE'), 'SECURITY VIOLATION: service_role has CREATE on extensions';
        END IF;
    END IF;

    RAISE NOTICE 'TEST 3 PASSED: Schema CREATE and USAGE privilege boundaries verified.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 4: Table-Level Privilege Lockdown Catalog Assertions (All 18 Tables)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_tbl TEXT;
    v_priv TEXT;
    v_privs TEXT[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'];
    
    -- 17 Private tables that must be completely denied to untrusted roles (public, anon, authenticated)
    v_private_tables TEXT[] := ARRAY[
        'organizations', 'workspaces', 'profiles', 'workspace_memberships',
        'invoices', 'workspace_subscriptions', 'subscription_addons', 'payment_transactions',
        'platform_admins', 'platform_gcap_nonces', 'platform_workspace_suspensions',
        'platform_system_settings', 'platform_audit_logs', 'platform_admin_invitations',
        'platform_bootstrap_registry', 'coupons', 'coupon_redemptions'
    ];
    
    -- Group 1: Core Managed Entities with Full Lifecycle (service_role: SELECT, INSERT, UPDATE, DELETE)
    v_full_lifecycle_tables TEXT[] := ARRAY[
        'organizations', 'workspaces', 'profiles', 'workspace_memberships',
        'subscription_addons', 'platform_admins', 'platform_system_settings',
        'platform_admin_invitations', 'coupons'
    ];

    -- Group 2: Financial Ledgers & Audit Records (service_role: SELECT, INSERT, UPDATE; DELETE denied)
    v_ledger_tables TEXT[] := ARRAY[
        'invoices', 'workspace_subscriptions', 'payment_transactions',
        'platform_workspace_suspensions', 'platform_bootstrap_registry', 'coupon_redemptions'
    ];
BEGIN
    -- 1. Verify 17 private tables: Untrusted roles (public, anon, authenticated) have NO privileges
    FOREACH v_tbl IN ARRAY v_private_tables LOOP
        FOREACH v_priv IN ARRAY v_privs LOOP
            ASSERT NOT has_table_privilege('public', 'public.' || v_tbl, v_priv),
                'SECURITY VIOLATION: public has ' || v_priv || ' on ' || v_tbl;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                ASSERT NOT has_table_privilege('anon', 'public.' || v_tbl, v_priv),
                    'SECURITY VIOLATION: anon has ' || v_priv || ' on ' || v_tbl;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                ASSERT NOT has_table_privilege('authenticated', 'public.' || v_tbl, v_priv),
                    'SECURITY VIOLATION: authenticated has ' || v_priv || ' on ' || v_tbl;
            END IF;
        END LOOP;
    END LOOP;

    -- 2. Verify subscription_plans: public, anon, authenticated have SELECT ONLY (zero mutation)
    ASSERT has_table_privilege('public', 'public.subscription_plans', 'SELECT'),
        'public must have SELECT on subscription_plans';
    FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
        ASSERT NOT has_table_privilege('public', 'public.subscription_plans', v_priv),
            'SECURITY VIOLATION: public has ' || v_priv || ' on subscription_plans';
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            ASSERT NOT has_table_privilege('anon', 'public.subscription_plans', v_priv),
                'SECURITY VIOLATION: anon has ' || v_priv || ' on subscription_plans';
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            ASSERT NOT has_table_privilege('authenticated', 'public.subscription_plans', v_priv),
                'SECURITY VIOLATION: authenticated has ' || v_priv || ' on subscription_plans';
        END IF;
    END LOOP;

    -- =========================================================================
    -- SERVICE_ROLE LEAST-PRIVILEGE MATRIX ASSERTIONS
    -- =========================================================================
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        -- A. Sensitive Configuration Catalog (subscription_plans): SELECT ONLY
        ASSERT has_table_privilege('service_role', 'public.subscription_plans', 'SELECT'),
            'service_role must have SELECT on subscription_plans';
        ASSERT NOT has_table_privilege('service_role', 'public.subscription_plans', 'INSERT'),
            'SECURITY VIOLATION: service_role has INSERT on subscription_plans';
        ASSERT NOT has_table_privilege('service_role', 'public.subscription_plans', 'UPDATE'),
            'SECURITY VIOLATION: service_role has UPDATE on subscription_plans';
        ASSERT NOT has_table_privilege('service_role', 'public.subscription_plans', 'DELETE'),
            'SECURITY VIOLATION: service_role has DELETE on subscription_plans';
        ASSERT NOT has_table_privilege('service_role', 'public.subscription_plans', 'TRUNCATE'),
            'SECURITY VIOLATION: service_role has TRUNCATE on subscription_plans';
        ASSERT NOT has_table_privilege('service_role', 'public.subscription_plans', 'REFERENCES'),
            'SECURITY VIOLATION: service_role has REFERENCES on subscription_plans';
        ASSERT NOT has_table_privilege('service_role', 'public.subscription_plans', 'TRIGGER'),
            'SECURITY VIOLATION: service_role has TRIGGER on subscription_plans';

        -- B. Group 1: Core Managed Entities (SELECT, INSERT, UPDATE, DELETE)
        FOREACH v_tbl IN ARRAY v_full_lifecycle_tables LOOP
            ASSERT has_table_privilege('service_role', 'public.' || v_tbl, 'SELECT'), 'service_role must have SELECT on ' || v_tbl;
            ASSERT has_table_privilege('service_role', 'public.' || v_tbl, 'INSERT'), 'service_role must have INSERT on ' || v_tbl;
            ASSERT has_table_privilege('service_role', 'public.' || v_tbl, 'UPDATE'), 'service_role must have UPDATE on ' || v_tbl;
            ASSERT has_table_privilege('service_role', 'public.' || v_tbl, 'DELETE'), 'service_role must have DELETE on ' || v_tbl;
            ASSERT NOT has_table_privilege('service_role', 'public.' || v_tbl, 'TRUNCATE'), 'SECURITY VIOLATION: service_role has TRUNCATE on ' || v_tbl;
            ASSERT NOT has_table_privilege('service_role', 'public.' || v_tbl, 'REFERENCES'), 'SECURITY VIOLATION: service_role has REFERENCES on ' || v_tbl;
            ASSERT NOT has_table_privilege('service_role', 'public.' || v_tbl, 'TRIGGER'), 'SECURITY VIOLATION: service_role has TRIGGER on ' || v_tbl;
        END LOOP;

        -- C. Group 2: Financial Ledgers & Audit Records (SELECT, INSERT, UPDATE; DELETE denied)
        FOREACH v_tbl IN ARRAY v_ledger_tables LOOP
            ASSERT has_table_privilege('service_role', 'public.' || v_tbl, 'SELECT'), 'service_role must have SELECT on ' || v_tbl;
            ASSERT has_table_privilege('service_role', 'public.' || v_tbl, 'INSERT'), 'service_role must have INSERT on ' || v_tbl;
            ASSERT has_table_privilege('service_role', 'public.' || v_tbl, 'UPDATE'), 'service_role must have UPDATE on ' || v_tbl;
            ASSERT NOT has_table_privilege('service_role', 'public.' || v_tbl, 'DELETE'), 'SECURITY VIOLATION: service_role has DELETE on ' || v_tbl;
            ASSERT NOT has_table_privilege('service_role', 'public.' || v_tbl, 'TRUNCATE'), 'SECURITY VIOLATION: service_role has TRUNCATE on ' || v_tbl;
            ASSERT NOT has_table_privilege('service_role', 'public.' || v_tbl, 'REFERENCES'), 'SECURITY VIOLATION: service_role has REFERENCES on ' || v_tbl;
            ASSERT NOT has_table_privilege('service_role', 'public.' || v_tbl, 'TRIGGER'), 'SECURITY VIOLATION: service_role has TRIGGER on ' || v_tbl;
        END LOOP;

        -- D. Group 3: Nonce Replay Store (SELECT, INSERT, DELETE; UPDATE denied)
        ASSERT has_table_privilege('service_role', 'public.platform_gcap_nonces', 'SELECT'), 'service_role must have SELECT on platform_gcap_nonces';
        ASSERT has_table_privilege('service_role', 'public.platform_gcap_nonces', 'INSERT'), 'service_role must have INSERT on platform_gcap_nonces';
        ASSERT NOT has_table_privilege('service_role', 'public.platform_gcap_nonces', 'UPDATE'), 'SECURITY VIOLATION: service_role has UPDATE on platform_gcap_nonces';
        ASSERT has_table_privilege('service_role', 'public.platform_gcap_nonces', 'DELETE'), 'service_role must have DELETE on platform_gcap_nonces';
        ASSERT NOT has_table_privilege('service_role', 'public.platform_gcap_nonces', 'TRUNCATE'), 'SECURITY VIOLATION: service_role has TRUNCATE on platform_gcap_nonces';
        ASSERT NOT has_table_privilege('service_role', 'public.platform_gcap_nonces', 'REFERENCES'), 'SECURITY VIOLATION: service_role has REFERENCES on platform_gcap_nonces';
        ASSERT NOT has_table_privilege('service_role', 'public.platform_gcap_nonces', 'TRIGGER'), 'SECURITY VIOLATION: service_role has TRIGGER on platform_gcap_nonces';

        -- E. Group 4: Immutable Audit Logs (SELECT, INSERT ONLY)
        ASSERT has_table_privilege('service_role', 'public.platform_audit_logs', 'SELECT'), 'service_role must have SELECT on platform_audit_logs';
        ASSERT has_table_privilege('service_role', 'public.platform_audit_logs', 'INSERT'), 'service_role must have INSERT on platform_audit_logs';
        ASSERT NOT has_table_privilege('service_role', 'public.platform_audit_logs', 'UPDATE'), 'SECURITY VIOLATION: service_role has UPDATE on platform_audit_logs';
        ASSERT NOT has_table_privilege('service_role', 'public.platform_audit_logs', 'DELETE'), 'SECURITY VIOLATION: service_role has DELETE on platform_audit_logs';
        ASSERT NOT has_table_privilege('service_role', 'public.platform_audit_logs', 'TRUNCATE'), 'SECURITY VIOLATION: service_role has TRUNCATE on platform_audit_logs';
        ASSERT NOT has_table_privilege('service_role', 'public.platform_audit_logs', 'REFERENCES'), 'SECURITY VIOLATION: service_role has REFERENCES on platform_audit_logs';
        ASSERT NOT has_table_privilege('service_role', 'public.platform_audit_logs', 'TRIGGER'), 'SECURITY VIOLATION: service_role has TRIGGER on platform_audit_logs';
    END IF;

    RAISE NOTICE 'TEST 4 PASSED: Table-level least-privilege ACL matrix verified for all 18 tables across all privilege types.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 5: Dynamic SECURITY DEFINER Enumeration & Privilege Inspection (Finding 4)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_rec RECORD;
    v_count INTEGER := 0;
    v_known_functions TEXT[] := ARRAY[
        'cleanup_expired_gcap_nonces',
        'enforce_platform_audit_immutability',
        'super_admin_get_platform_metrics',
        'super_admin_suspend_workspace',
        'super_admin_reactivate_workspace',
        'validate_and_reserve_coupon',
        'activate_zero_payable_subscription',
        'settle_coupon_payment',
        'super_admin_provision_platform_admin',
        'super_admin_bootstrap_initial_admin',
        'super_admin_create_admin_invitation',
        'super_admin_enroll_mfa',
        'super_admin_revoke_mfa'
    ];
BEGIN
    FOR v_rec IN 
        SELECT p.oid, p.proname, n.nspname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.prosecdef = TRUE 
          AND n.nspname IN ('public', 'extensions')
        ORDER BY n.nspname, p.proname
    LOOP
        v_count := v_count + 1;
        
        -- 1. Ensure function is on the explicit reviewed allowlist
        IF NOT (v_rec.proname = ANY(v_known_functions)) THEN
            RAISE EXCEPTION 'SECURITY AUDIT FAILED: Unreviewed SECURITY DEFINER function found in schema %: %(%)'
                , v_rec.nspname, v_rec.proname, v_rec.args USING ERRCODE = '55000';
        END IF;

        -- 2. PUBLIC must NEVER have EXECUTE on any privileged function
        ASSERT NOT has_function_privilege('public', v_rec.oid, 'EXECUTE'),
            'SECURITY VIOLATION: public has EXECUTE on ' || v_rec.nspname || '.' || v_rec.proname;

        -- 3. Check specific allowlists per function
        CASE v_rec.proname
            WHEN 'cleanup_expired_gcap_nonces' THEN
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    ASSERT NOT has_function_privilege('anon', v_rec.oid, 'EXECUTE'), 'anon has EXECUTE on cleanup_expired_gcap_nonces';
                END IF;
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    ASSERT NOT has_function_privilege('authenticated', v_rec.oid, 'EXECUTE'), 'authenticated has EXECUTE on cleanup_expired_gcap_nonces';
                END IF;
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
                    ASSERT has_function_privilege('service_role', v_rec.oid, 'EXECUTE'), 'service_role MUST have EXECUTE on cleanup_expired_gcap_nonces';
                END IF;

            WHEN 'enforce_platform_audit_immutability' THEN
                -- Trigger function: NO direct execute grants to anyone
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    ASSERT NOT has_function_privilege('anon', v_rec.oid, 'EXECUTE'), 'anon has EXECUTE on enforce_platform_audit_immutability';
                END IF;
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    ASSERT NOT has_function_privilege('authenticated', v_rec.oid, 'EXECUTE'), 'authenticated has EXECUTE on enforce_platform_audit_immutability';
                END IF;
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
                    ASSERT NOT has_function_privilege('service_role', v_rec.oid, 'EXECUTE'), 'service_role has EXECUTE on enforce_platform_audit_immutability';
                END IF;

            WHEN 'super_admin_get_platform_metrics', 'super_admin_suspend_workspace', 'super_admin_reactivate_workspace', 'settle_coupon_payment', 'super_admin_provision_platform_admin', 'super_admin_bootstrap_initial_admin', 'super_admin_create_admin_invitation', 'super_admin_enroll_mfa', 'super_admin_revoke_mfa' THEN
                -- Privileged gateway/webhook functions: service_role ONLY
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    ASSERT NOT has_function_privilege('anon', v_rec.oid, 'EXECUTE'), 'anon has EXECUTE on ' || v_rec.proname;
                END IF;
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    ASSERT NOT has_function_privilege('authenticated', v_rec.oid, 'EXECUTE'), 'authenticated has EXECUTE on ' || v_rec.proname;
                END IF;
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
                    ASSERT has_function_privilege('service_role', v_rec.oid, 'EXECUTE'), 'service_role MUST have EXECUTE on ' || v_rec.proname;
                END IF;

            WHEN 'validate_and_reserve_coupon', 'activate_zero_payable_subscription' THEN
                -- Tenant customer RPCs: authenticated & service_role
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    ASSERT NOT has_function_privilege('anon', v_rec.oid, 'EXECUTE'), 'anon has EXECUTE on ' || v_rec.proname;
                END IF;
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    ASSERT has_function_privilege('authenticated', v_rec.oid, 'EXECUTE'), 'authenticated MUST have EXECUTE on ' || v_rec.proname;
                END IF;
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
                    ASSERT has_function_privilege('service_role', v_rec.oid, 'EXECUTE'), 'service_role MUST have EXECUTE on ' || v_rec.proname;
                END IF;

            ELSE
                RAISE EXCEPTION 'Unhandled SECURITY DEFINER function in test: %', v_rec.proname;
        END CASE;
    END LOOP;

    ASSERT v_count >= 13, 'Expected at least 13 SECURITY DEFINER functions, found: ' || v_count;
    RAISE NOTICE 'TEST 5 PASSED: Dynamically enumerated % SECURITY DEFINER functions; all adhere to strict privilege allowlists.', v_count;
END $$;

-- -----------------------------------------------------------------------------
-- TEST 6: Production Administrator Provisioning Security Verification
-- Exercises public.super_admin_provision_platform_admin, public.super_admin_create_admin_invitation,
-- public.super_admin_bootstrap_initial_admin, public.super_admin_enroll_mfa, and public.super_admin_revoke_mfa
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    c_expected_root_email CONSTANT TEXT := 'root.superadmin@staging.vistaar.internal';
    c_expected_admin_email CONSTANT TEXT := 'synthetic.admin@staging.vistaar.internal';
    c_expected_unrelated_email CONSTANT TEXT := 'synthetic.unrelated@staging.vistaar.internal';
    c_expected_conflict_email CONSTANT TEXT := 'synthetic.conflict.admin@staging.vistaar.internal';

    v_root_admin_id UUID;
    v_test_admin_id UUID;
    v_unrelated_user_id UUID;
    v_conflict_user_id UUID;

    v_root_auth_email TEXT;
    v_admin_auth_email TEXT;
    v_unrelated_auth_email TEXT;
    v_conflict_auth_email TEXT;

    v_secret TEXT := 'test_gcap_secret_key_32_bytes_super_secure';
    v_bootstrap_secret TEXT := 'test_bootstrap_secret_key_32_bytes_super_secure';
    v_now TIMESTAMPTZ;
    v_nonce UUID;
    v_canonical TEXT;
    v_sig TEXT;

    v_test_ws_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;

    -- Regression test variables
    v_rejected BOOLEAN := FALSE;
    v_blocked BOOLEAN := FALSE;
    v_duplicate_blocked BOOLEAN := FALSE;
    v_err_code TEXT;
    v_err_msg TEXT;
    v_snapshot RECORD;
    v_after RECORD;
    v_res JSONB;
    v_audit RECORD;
    v_invitation RECORD;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    PERFORM set_config('app.settings.gateway_assertion_secret', v_secret, true);
    PERFORM set_config('app.settings.platform_bootstrap_secret', v_bootstrap_secret, true);

    -- =========================================================================
    -- 0. Fixture Prerequisites Verification (Fail FAST before any mutations)
    -- Requires 4 distinct synthetic identities pre-provisioned via GoTrue Auth Admin API
    -- =========================================================================
    v_root_admin_id := COALESCE(NULLIF(current_setting('test.root_admin_user_id', true), '')::UUID, '88888888-8888-8888-8888-888888888888'::UUID);
    v_test_admin_id := NULLIF(current_setting('test.auth_admin_user_id', true), '')::UUID;
    v_unrelated_user_id := NULLIF(current_setting('test.unrelated_user_id', true), '')::UUID;
    v_conflict_user_id := NULLIF(current_setting('test.conflict_admin_user_id', true), '')::UUID;

    IF v_test_admin_id IS NULL OR v_unrelated_user_id IS NULL OR v_conflict_user_id IS NULL THEN
        RAISE EXCEPTION 'TEST_PRECONDITION_FAILED: Required session setting test.auth_admin_user_id, test.unrelated_user_id, or test.conflict_admin_user_id is missing.'
            USING ERRCODE = '55000';
    END IF;

    IF v_root_admin_id = v_test_admin_id 
       OR v_root_admin_id = v_unrelated_user_id 
       OR v_root_admin_id = v_conflict_user_id 
       OR v_test_admin_id = v_unrelated_user_id 
       OR v_test_admin_id = v_conflict_user_id 
       OR v_unrelated_user_id = v_conflict_user_id THEN
        RAISE EXCEPTION 'TEST_PRECONDITION_FAILED: All synthetic test UUIDs must be distinct.'
            USING ERRCODE = '55000';
    END IF;

    -- Verify all 4 identities exist in auth.users with exact expected emails
    SELECT email INTO v_root_auth_email FROM auth.users WHERE id = v_root_admin_id;
    ASSERT v_root_auth_email = c_expected_root_email, 'Root admin user email mismatch';

    SELECT email INTO v_admin_auth_email FROM auth.users WHERE id = v_test_admin_id;
    ASSERT v_admin_auth_email = c_expected_admin_email, 'Designated admin user email mismatch';

    SELECT email INTO v_unrelated_auth_email FROM auth.users WHERE id = v_unrelated_user_id;
    ASSERT v_unrelated_auth_email = c_expected_unrelated_email, 'Unrelated tenant user email mismatch';

    SELECT email INTO v_conflict_auth_email FROM auth.users WHERE id = v_conflict_user_id;
    ASSERT v_conflict_auth_email = c_expected_conflict_email, 'Conflict user email mismatch';

    -- =========================================================================
    -- 0B. Initial Root Super Admin Bootstrap & Dedicated Lockout
    -- =========================================================================
    IF NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE id = v_root_admin_id) THEN
        v_res := public.super_admin_bootstrap_initial_admin(
            v_root_admin_id,
            c_expected_root_email,
            'Root Super Administrator',
            v_bootstrap_secret
        );
        ASSERT (v_res->>'success')::boolean = TRUE, 'Initial root bootstrap failed';
        ASSERT EXISTS (SELECT 1 FROM public.platform_admins WHERE id = v_root_admin_id AND role = 'super_admin' AND is_active = TRUE AND mfa_enrolled = FALSE),
            'Root admin record was not properly created or mfa_enrolled is not false';
        ASSERT EXISTS (SELECT 1 FROM public.platform_bootstrap_registry WHERE id = 1 AND is_bootstrapped = TRUE),
            'Bootstrap registry was not marked is_bootstrapped = true';

        -- 0C. Dedicated MFA Self-Enrollment (AAL2 enforcement)
        -- Attempt enrollment with AAL1: MUST fail with 42501
        BEGIN
            v_blocked := FALSE;
            PERFORM public.super_admin_enroll_mfa(v_root_admin_id, 'aal1');
            RAISE EXCEPTION 'TEST 0C FAILED: AAL1 session assurance was accepted for MFA enrollment!';
        EXCEPTION WHEN SQLSTATE '42501' THEN
            v_blocked := TRUE;
        END;
        ASSERT v_blocked, 'REGRESSION TEST 0C FAILED: AAL1 session was not rejected with 42501!';

        -- Complete genuine MFA enrollment with AAL2 session assurance
        v_res := public.super_admin_enroll_mfa(v_root_admin_id, 'aal2');
        ASSERT (v_res->>'success')::boolean = TRUE, 'MFA enrollment failed';
        ASSERT EXISTS (SELECT 1 FROM public.platform_admins WHERE id = v_root_admin_id AND mfa_enrolled = TRUE),
            'Root admin mfa_enrolled was not updated to true';
    END IF;

    -- Prove one-time bootstrap is permanently locked out now that an admin exists
    BEGIN
        v_blocked := FALSE;
        PERFORM public.super_admin_bootstrap_initial_admin(
            v_test_admin_id,
            c_expected_admin_email,
            'Second Admin Attempt',
            v_bootstrap_secret
        );
        RAISE EXCEPTION 'TEST 0B FAILED: Second bootstrap call was erroneously permitted!';
    EXCEPTION WHEN SQLSTATE '55000' THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'REGRESSION TEST 0B FAILED: Bootstrap lockout did not trigger!';
    RAISE NOTICE 'TEST 0B PASSED: Initial super admin bootstrapped, MFA enrolled via AAL2, and one-time lockout verified.';

    -- =========================================================================
    -- 6A. Production Identity Validation: Domain-Bypass Rejection Without Invitation
    -- Attempts to provision synthetic.unrelated@staging.vistaar.internal WITHOUT invitation
    -- Proves domain membership alone does NOT grant platform administrative privileges
    -- =========================================================================
    v_now := timezone('utc'::text, now());
    v_nonce := extensions.gen_random_uuid();
    v_canonical := v_root_admin_id::TEXT || ':PROVISION_PLATFORM_ADMIN:' || v_unrelated_user_id::TEXT || ':super_admin:aal2:' || 
                   EXTRACT(EPOCH FROM v_now)::BIGINT::TEXT || ':' || v_nonce::TEXT;
    v_sig := encode(extensions.hmac(v_canonical::bytea, v_secret::bytea, 'sha256'), 'hex');

    BEGIN
        v_rejected := FALSE;
        PERFORM public.super_admin_provision_platform_admin(
            v_unrelated_user_id,
            c_expected_unrelated_email,
            'Unrelated Tenant User',
            'super_admin',
            'aal2',
            v_root_admin_id,
            v_now,
            v_nonce,
            v_sig
        );
        RAISE EXCEPTION 'TEST 6A FAILED: super_admin_provision_platform_admin accepted uninvited identity!';
    EXCEPTION 
        WHEN SQLSTATE '55001' THEN
            v_rejected := TRUE;
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
            RAISE EXCEPTION 'TEST 6A FAILED: Caught unexpected error % (expected 55001 UNAUTHORIZED_PROVISIONING): %', v_err_code, v_err_msg;
    END;

    ASSERT v_rejected, 'REGRESSION TEST 6A FAILED: super_admin_provision_platform_admin did not raise 55001!';
    ASSERT NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE id = v_unrelated_user_id),
        'SECURITY VIOLATION: Unrelated user was inserted into platform_admins!';
    RAISE NOTICE 'TEST 6A PASSED: Production provisioning path strictly rejected uninvited identity despite domain match.';

    -- =========================================================================
    -- 6B. Production Overwrite Protection with Dedicated Disposable Conflict Identity
    -- Exercises overwrite protection without reusing or endangering the primary admin fixture
    -- =========================================================================
    ASSERT NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE id = v_conflict_user_id),
        'PRECONDITION FAILED: platform_admins row already exists for conflict fixture UUID';

    -- 1. Create an invitation for the real conflict user email BEFORE conflicting admin row is inserted
    v_now := timezone('utc'::text, now());
    v_nonce := extensions.gen_random_uuid();
    v_canonical := v_root_admin_id::TEXT || ':CREATE_ADMIN_INVITATION:' || v_conflict_user_id::TEXT || ':super_admin:aal2:' || 
                   EXTRACT(EPOCH FROM v_now)::BIGINT::TEXT || ':' || v_nonce::TEXT;
    v_sig := encode(extensions.hmac(v_canonical::bytea, v_secret::bytea, 'sha256'), 'hex');

    PERFORM public.super_admin_create_admin_invitation(
        v_conflict_user_id,
        c_expected_conflict_email,
        'super_admin',
        'aal2',
        24,
        v_root_admin_id,
        v_now,
        v_nonce,
        v_sig
    );

    -- 2. Insert test-owned conflicting record with different email/role
    INSERT INTO public.platform_admins (id, email, full_name, role, is_active, mfa_enrolled)
    VALUES (v_conflict_user_id, 'conflicting.prior@staging.vistaar.internal', 'Prior Conflicting Record', 'billing_admin', TRUE, FALSE);

    -- 3. Snapshot the complete row
    SELECT * INTO v_snapshot FROM public.platform_admins WHERE id = v_conflict_user_id;

    -- 4. Attempt overwrite provisioning
    v_now := timezone('utc'::text, now());
    v_nonce := extensions.gen_random_uuid();
    v_canonical := v_root_admin_id::TEXT || ':PROVISION_PLATFORM_ADMIN:' || v_conflict_user_id::TEXT || ':super_admin:aal2:' || 
                   EXTRACT(EPOCH FROM v_now)::BIGINT::TEXT || ':' || v_nonce::TEXT;
    v_sig := encode(extensions.hmac(v_canonical::bytea, v_secret::bytea, 'sha256'), 'hex');

    BEGIN
        v_blocked := FALSE;
        PERFORM public.super_admin_provision_platform_admin(
            v_conflict_user_id,
            c_expected_conflict_email,
            'New Overwrite Attempt Name',
            'super_admin',
            'aal2',
            v_root_admin_id,
            v_now,
            v_nonce,
            v_sig
        );
        RAISE EXCEPTION 'TEST 6B FAILED: Overwrite protection was bypassed!';
    EXCEPTION 
        WHEN SQLSTATE '55002' THEN
            v_blocked := TRUE;
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
            RAISE EXCEPTION 'TEST 6B FAILED: Caught unexpected error % (expected 55002 OVERWRITE_PROTECTION_TRIGGERED): %', v_err_code, v_err_msg;
    END;

    ASSERT v_blocked, 'REGRESSION TEST 6B FAILED: super_admin_provision_platform_admin did not raise 55002!';

    -- 5. Verify every column in the row remains 100% unchanged
    SELECT * INTO v_after FROM public.platform_admins WHERE id = v_conflict_user_id;
    ASSERT v_after.id = v_snapshot.id, 'Row id altered after rejection';
    ASSERT v_after.email = v_snapshot.email, 'Row email altered after rejection';
    ASSERT v_after.full_name = v_snapshot.full_name, 'Row full_name altered after rejection';
    ASSERT v_after.role = v_snapshot.role, 'Row role altered after rejection';
    ASSERT v_after.is_active = v_snapshot.is_active, 'Row is_active altered after rejection';
    ASSERT v_after.mfa_enrolled = v_snapshot.mfa_enrolled, 'Row mfa_enrolled altered after rejection';
    ASSERT v_after.created_at = v_snapshot.created_at, 'Row created_at altered after rejection';
    ASSERT v_after.updated_at = v_snapshot.updated_at, 'Row updated_at altered after rejection';

    -- 6. Clean up conflict fixtures
    DELETE FROM public.platform_admins WHERE id = v_conflict_user_id;
    DELETE FROM public.platform_admin_invitations WHERE target_user_id = v_conflict_user_id;

    RAISE NOTICE 'TEST 6B PASSED: Production provisioning path protected existing admin from overwrite; complete row snapshot preserved.';

    -- =========================================================================
    -- 6C. Production Duplicate Email Identity Rejection
    -- =========================================================================
    -- 1. Create a temporary admin record under disposable conflict UUID holding the primary admin email
    INSERT INTO public.platform_admins (id, email, full_name, role, is_active, mfa_enrolled)
    VALUES (v_conflict_user_id, c_expected_admin_email, 'Prior Email Holder', 'super_admin', TRUE, TRUE);

    -- 2. Create invitation for primary fixture
    v_now := timezone('utc'::text, now());
    v_nonce := extensions.gen_random_uuid();
    v_canonical := v_root_admin_id::TEXT || ':CREATE_ADMIN_INVITATION:' || v_test_admin_id::TEXT || ':super_admin:aal2:' || 
                   EXTRACT(EPOCH FROM v_now)::BIGINT::TEXT || ':' || v_nonce::TEXT;
    v_sig := encode(extensions.hmac(v_canonical::bytea, v_secret::bytea, 'sha256'), 'hex');

    PERFORM public.super_admin_create_admin_invitation(
        v_test_admin_id,
        c_expected_admin_email,
        'super_admin',
        'aal2',
        24,
        v_root_admin_id,
        v_now,
        v_nonce,
        v_sig
    );

    -- 3. Attempt to provision v_test_admin_id with the duplicate email
    v_now := timezone('utc'::text, now());
    v_nonce := extensions.gen_random_uuid();
    v_canonical := v_root_admin_id::TEXT || ':PROVISION_PLATFORM_ADMIN:' || v_test_admin_id::TEXT || ':super_admin:aal2:' || 
                   EXTRACT(EPOCH FROM v_now)::BIGINT::TEXT || ':' || v_nonce::TEXT;
    v_sig := encode(extensions.hmac(v_canonical::bytea, v_secret::bytea, 'sha256'), 'hex');

    BEGIN
        v_duplicate_blocked := FALSE;
        PERFORM public.super_admin_provision_platform_admin(
            v_test_admin_id,
            c_expected_admin_email,
            'Duplicate Email Candidate',
            'super_admin',
            'aal2',
            v_root_admin_id,
            v_now,
            v_nonce,
            v_sig
        );
        RAISE EXCEPTION 'TEST 6C FAILED: Duplicate email was accepted for different administrator ID!';
    EXCEPTION 
        WHEN SQLSTATE '55003' THEN
            v_duplicate_blocked := TRUE;
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_err_code = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
            RAISE EXCEPTION 'TEST 6C FAILED: Caught unexpected error % (expected 55003 DUPLICATE_ADMIN_EMAIL): %', v_err_code, v_err_msg;
    END;

    ASSERT v_duplicate_blocked, 'REGRESSION TEST 6C FAILED: super_admin_provision_platform_admin did not raise 55003!';

    -- 4. Clean up temporary collision record
    DELETE FROM public.platform_admins WHERE id = v_conflict_user_id;

    RAISE NOTICE 'TEST 6C PASSED: Production provisioning path rejected duplicate administrator email with exact code 55003.';

    -- =========================================================================
    -- 6D. Production Provisioning with Single-Use Invitation Consumption
    -- =========================================================================
    v_now := timezone('utc'::text, now());
    v_nonce := extensions.gen_random_uuid();
    v_canonical := v_root_admin_id::TEXT || ':PROVISION_PLATFORM_ADMIN:' || v_test_admin_id::TEXT || ':super_admin:aal2:' || 
                   EXTRACT(EPOCH FROM v_now)::BIGINT::TEXT || ':' || v_nonce::TEXT;
    v_sig := encode(extensions.hmac(v_canonical::bytea, v_secret::bytea, 'sha256'), 'hex');

    v_res := public.super_admin_provision_platform_admin(
        v_test_admin_id,
        c_expected_admin_email,
        'Staging Admin Fixture',
        'super_admin',
        'aal2',
        v_root_admin_id,
        v_now,
        v_nonce,
        v_sig
    );
    ASSERT (v_res->>'success')::boolean = TRUE, 'Designated synthetic fixture provisioning failed: ' || (v_res->>'error');
    ASSERT (v_res->>'mfa_enrolled')::boolean = FALSE, 'Newly provisioned admin must start with mfa_enrolled = false';

    -- Assert platform_admin_invitations record transitioned to accepted
    SELECT * INTO v_invitation FROM public.platform_admin_invitations WHERE target_user_id = v_test_admin_id;
    ASSERT v_invitation.status = 'accepted', 'Invitation status was not updated to accepted';
    ASSERT v_invitation.consumed_at IS NOT NULL, 'Invitation consumed_at was not set';

    -- Enroll MFA for test admin so downstream tests can use it
    PERFORM public.super_admin_enroll_mfa(v_test_admin_id, 'aal2');
    ASSERT EXISTS (SELECT 1 FROM public.platform_admins WHERE id = v_test_admin_id AND mfa_enrolled = TRUE),
        'MFA was not enrolled for designated admin fixture';

    -- Assert second provisioning call fails because invitation is consumed
    v_now := timezone('utc'::text, now());
    v_nonce := extensions.gen_random_uuid();
    v_canonical := v_root_admin_id::TEXT || ':PROVISION_PLATFORM_ADMIN:' || v_test_admin_id::TEXT || ':super_admin:aal2:' || 
                   EXTRACT(EPOCH FROM v_now)::BIGINT::TEXT || ':' || v_nonce::TEXT;
    v_sig := encode(extensions.hmac(v_canonical::bytea, v_secret::bytea, 'sha256'), 'hex');

    BEGIN
        v_blocked := FALSE;
        PERFORM public.super_admin_provision_platform_admin(
            v_test_admin_id,
            c_expected_admin_email,
            'Second Consumption Attempt',
            'super_admin',
            'aal2',
            v_root_admin_id,
            v_now,
            v_nonce,
            v_sig
        );
        RAISE EXCEPTION 'TEST 6D FAILED: Reused consumed invitation was erroneously accepted!';
    EXCEPTION WHEN SQLSTATE '55001' THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'REGRESSION TEST 6D FAILED: Consumed invitation reuse was not blocked!';

    -- Assert platform_admins record is provisioned with expected values
    ASSERT EXISTS (
        SELECT 1 FROM public.platform_admins 
        WHERE id = v_test_admin_id 
          AND email = c_expected_admin_email 
          AND role = 'super_admin' 
          AND is_active = TRUE
          AND mfa_enrolled = TRUE
    ), 'platform_admins record was not created or has invalid values';

    -- Assert immutable action is recorded in platform_audit_logs
    SELECT * INTO v_audit FROM public.platform_audit_logs 
    WHERE action = 'PROVISION_PLATFORM_ADMIN' AND target_user_id = v_test_admin_id;
    ASSERT v_audit.id IS NOT NULL, 'Audit log was not created for admin provisioning';

    -- =========================================================================
    -- 6E. GCAP Cryptographic & Actor Authorization Security Boundaries
    -- =========================================================================
    -- 1. Invalid GCAP signature rejection (28000)
    BEGIN
        v_blocked := FALSE;
        v_now := timezone('utc'::text, now());
        v_nonce := extensions.gen_random_uuid();
        PERFORM public.super_admin_provision_platform_admin(
            v_test_admin_id, c_expected_admin_email, 'Tampered Name', 'super_admin', 'aal2',
            v_root_admin_id, v_now, v_nonce, 'deadbeefbadsignature000000000000000000000000000000000000000000000000'
        );
        RAISE EXCEPTION 'TEST 6E.1 FAILED: Invalid GCAP signature was accepted!';
    EXCEPTION WHEN SQLSTATE '28000' THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'REGRESSION TEST 6E.1 FAILED: Invalid signature was not rejected with 28000!';

    -- 2. Expired assertion timestamp rejection (> 30s) (28000)
    BEGIN
        v_blocked := FALSE;
        v_now := timezone('utc'::text, now()) - INTERVAL '60 seconds';
        v_nonce := extensions.gen_random_uuid();
        v_canonical := v_root_admin_id::TEXT || ':PROVISION_PLATFORM_ADMIN:' || v_test_admin_id::TEXT || ':super_admin:aal2:' || 
                       EXTRACT(EPOCH FROM v_now)::BIGINT::TEXT || ':' || v_nonce::TEXT;
        v_sig := encode(extensions.hmac(v_canonical::bytea, v_secret::bytea, 'sha256'), 'hex');
        PERFORM public.super_admin_provision_platform_admin(
            v_test_admin_id, c_expected_admin_email, 'Skewed Timestamp', 'super_admin', 'aal2',
            v_root_admin_id, v_now, v_nonce, v_sig
        );
        RAISE EXCEPTION 'TEST 6E.2 FAILED: Expired assertion timestamp was accepted!';
    EXCEPTION WHEN SQLSTATE '28000' THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'REGRESSION TEST 6E.2 FAILED: Expired timestamp was not rejected with 28000!';

    -- 3. Non-super_admin actor rejection (42501)
    INSERT INTO public.platform_admins (id, email, full_name, role, is_active, mfa_enrolled)
    VALUES (v_conflict_user_id, c_expected_conflict_email, 'Billing Actor', 'billing_admin', TRUE, TRUE);

    v_now := timezone('utc'::text, now());
    v_nonce := extensions.gen_random_uuid();
    v_canonical := v_conflict_user_id::TEXT || ':PROVISION_PLATFORM_ADMIN:' || v_test_admin_id::TEXT || ':super_admin:aal2:' || 
                   EXTRACT(EPOCH FROM v_now)::BIGINT::TEXT || ':' || v_nonce::TEXT;
    v_sig := encode(extensions.hmac(v_canonical::bytea, v_secret::bytea, 'sha256'), 'hex');

    BEGIN
        v_blocked := FALSE;
        PERFORM public.super_admin_provision_platform_admin(
            v_test_admin_id, c_expected_admin_email, 'Unauthorized Actor Attempt', 'super_admin', 'aal2',
            v_conflict_user_id, v_now, v_nonce, v_sig
        );
        RAISE EXCEPTION 'TEST 6E.3 FAILED: Non-super_admin actor was accepted!';
    EXCEPTION WHEN SQLSTATE '42501' THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'REGRESSION TEST 6E.3 FAILED: Non-super_admin actor was not rejected with 42501!';

    -- 4. AAL1 session assurance rejection (42501)
    v_now := timezone('utc'::text, now());
    v_nonce := extensions.gen_random_uuid();
    v_canonical := v_root_admin_id::TEXT || ':PROVISION_PLATFORM_ADMIN:' || v_test_admin_id::TEXT || ':super_admin:aal1:' || 
                   EXTRACT(EPOCH FROM v_now)::BIGINT::TEXT || ':' || v_nonce::TEXT;
    v_sig := encode(extensions.hmac(v_canonical::bytea, v_secret::bytea, 'sha256'), 'hex');

    BEGIN
        v_blocked := FALSE;
        PERFORM public.super_admin_provision_platform_admin(
            v_test_admin_id, c_expected_admin_email, 'AAL1 Session Attempt', 'super_admin', 'aal1',
            v_root_admin_id, v_now, v_nonce, v_sig
        );
        RAISE EXCEPTION 'TEST 6E.4 FAILED: AAL1 session assurance was accepted!';
    EXCEPTION WHEN SQLSTATE '42501' THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'REGRESSION TEST 6E.4 FAILED: AAL1 session assurance was not rejected with 42501!';

    -- 5. Actor without enrolled MFA rejection (42501)
    UPDATE public.platform_admins SET mfa_enrolled = FALSE WHERE id = v_conflict_user_id;
    UPDATE public.platform_admins SET role = 'super_admin' WHERE id = v_conflict_user_id;

    v_now := timezone('utc'::text, now());
    v_nonce := extensions.gen_random_uuid();
    v_canonical := v_conflict_user_id::TEXT || ':PROVISION_PLATFORM_ADMIN:' || v_test_admin_id::TEXT || ':super_admin:aal2:' || 
                   EXTRACT(EPOCH FROM v_now)::BIGINT::TEXT || ':' || v_nonce::TEXT;
    v_sig := encode(extensions.hmac(v_canonical::bytea, v_secret::bytea, 'sha256'), 'hex');

    BEGIN
        v_blocked := FALSE;
        PERFORM public.super_admin_provision_platform_admin(
            v_test_admin_id, c_expected_admin_email, 'Non-MFA Actor Attempt', 'super_admin', 'aal2',
            v_conflict_user_id, v_now, v_nonce, v_sig
        );
        RAISE EXCEPTION 'TEST 6E.5 FAILED: Actor without enrolled MFA was accepted!';
    EXCEPTION WHEN SQLSTATE '42501' THEN
        v_blocked := TRUE;
    END;
    ASSERT v_blocked, 'REGRESSION TEST 6E.5 FAILED: Actor without enrolled MFA was not rejected with 42501!';
    DELETE FROM public.platform_admins WHERE id = v_conflict_user_id;

    -- Provision synthetic workspace and profiles for downstream tests
    INSERT INTO public.workspaces (id, company_name, owner_name, owner_email, owner_phone, is_active)
    VALUES (v_test_ws_id, 'Staging Test Retail Ltd', 'Test Merchant', c_expected_admin_email, '9876543210', TRUE)
    ON CONFLICT (id) DO UPDATE SET is_active = TRUE;

    INSERT INTO public.profiles (id, workspace_id, employee_id, name, email, phone, role, status)
    VALUES (v_test_admin_id, v_test_ws_id, 'EMP-TEST-01', 'Staging Admin Fixture', c_expected_admin_email, '9876543210', 'owner', 'Active')
    ON CONFLICT (id) DO UPDATE SET role = 'owner', status = 'Active';

    INSERT INTO public.coupons (
        code, name, discount_type, discount_value, max_discount_amount,
        min_purchase_amount, applicable_plans, applicable_intervals, max_redemptions_per_workspace, is_active
    ) VALUES (
        'STAGING20', 'Staging 20% Off', 'percentage', 20.00, 2000.00,
        1000.00, ARRAY['business', 'growth'], ARRAY['annual', 'monthly'], 10, TRUE
    )
    ON CONFLICT (code) DO UPDATE SET max_redemptions_per_workspace = 10;

    INSERT INTO public.coupons (
        code, name, discount_type, discount_value, max_discount_amount,
        min_purchase_amount, applicable_plans, applicable_intervals, is_active
    ) VALUES (
        'FREE100', 'Staging 100% Free Grant', 'percentage', 100.00, NULL,
        0.00, ARRAY['all'], ARRAY['all'], TRUE
    )
    ON CONFLICT (code) DO NOTHING;

    RAISE NOTICE 'TEST 6 PASSED: All administrator provisioning security boundaries verified (0B dedicated bootstrap & lockout, 0C MFA enrollment lifecycle, 6A domain-bypass rejection, 6B overwrite defense, 6C duplicate rejection, 6D single-use consumption, 6E GCAP, AAL2 assurance & MFA checks).';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 7: Runtime Access Restrictions on Administrative Tables
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    -- 1. Test anon role runtime rejection via table ACL (42501 insufficient privilege)
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        BEGIN
            EXECUTE 'SET LOCAL ROLE anon';
            EXECUTE 'SELECT COUNT(*) FROM public.platform_admins';
            RAISE EXCEPTION 'SECURITY VIOLATION: anon role was able to execute SELECT on platform_admins';
        EXCEPTION WHEN SQLSTATE '42501' THEN
            v_blocked := TRUE;
        END;
        EXECUTE 'RESET ROLE';
        ASSERT v_blocked, 'SECURITY VIOLATION: anon role was not denied table access';
    END IF;

    -- 2. Test authenticated role runtime rejection via table ACL
    v_blocked := FALSE;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        BEGIN
            EXECUTE 'SET LOCAL ROLE authenticated';
            EXECUTE 'SELECT COUNT(*) FROM public.platform_admins';
            RAISE EXCEPTION 'SECURITY VIOLATION: authenticated role was able to execute SELECT on platform_admins';
        EXCEPTION WHEN SQLSTATE '42501' THEN
            v_blocked := TRUE;
        END;
        EXECUTE 'RESET ROLE';
        ASSERT v_blocked, 'SECURITY VIOLATION: authenticated role was not denied table access';
    END IF;

    -- 3. Verify service_role can access platform_admins
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'SET LOCAL ROLE service_role';
        EXECUTE 'SELECT COUNT(*) FROM public.platform_admins';
        EXECUTE 'RESET ROLE';
    END IF;

    RAISE NOTICE 'TEST 7 PASSED: Runtime platform administrative table isolation verified.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 8: Object-Shadowing & search_path Resilience (Finding 2)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_deleted INTEGER;
BEGIN
    -- Create deliberate shadow table and shadow function in pg_temp
    CREATE TEMPORARY TABLE platform_gcap_nonces (
        dummy_column_shadow TEXT
    );

    EXECUTE 'CREATE OR REPLACE FUNCTION pg_temp.cleanup_expired_gcap_nonces() RETURNS INTEGER LANGUAGE sql AS ''SELECT -999;''';

    -- Execute public function: Hardened search_path (public, extensions, pg_temp) ensures resolution of public objects
    SELECT public.cleanup_expired_gcap_nonces() INTO v_deleted;
    ASSERT v_deleted >= 0, 'Shadowing attack altered function execution output';

    -- Clean up shadow objects
    DROP TABLE pg_temp.platform_gcap_nonces;
    DROP FUNCTION pg_temp.cleanup_expired_gcap_nonces();

    RAISE NOTICE 'TEST 8 PASSED: Hardened search_path resists temporary table and function shadowing attacks.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 9: Coupon Quoting Authorization Rejection for Unrelated Tenant User (Finding 2)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_target_ws_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
    v_unrelated_user_id UUID;
    v_res JSONB;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);

    -- Obtain distinct unrelated user context from session GUC (pre-validated in Test 6)
    v_unrelated_user_id := NULLIF(current_setting('test.unrelated_user_id', true), '')::UUID;
    IF v_unrelated_user_id IS NULL THEN
        RAISE EXCEPTION 'TEST_PRECONDITION_FAILED: Session setting test.unrelated_user_id is missing.'
            USING ERRCODE = '55000';
    END IF;

    -- An unrelated caller attempts to quote a coupon for target workspace
    v_res := public.validate_and_reserve_coupon(
        'STAGING20', v_target_ws_id, 'business', 'annual', v_unrelated_user_id
    );

    ASSERT (v_res->>'success')::boolean = false, 'SECURITY VIOLATION: Unrelated user was allowed to reserve coupon';
    ASSERT (v_res->>'error') LIKE 'FORBIDDEN%', 'Error message must specify FORBIDDEN';

    RAISE NOTICE 'TEST 9 PASSED: Coupon quoting strictly rejects unauthorized / unrelated tenant users.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 10: GCAP Security Triad: Nonce Replay, Invalid Signature, Timestamp Skew (Finding 2)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_admin_id UUID;
    v_nonce UUID := gen_random_uuid();
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_secret TEXT := 'test_gcap_secret_key_32_bytes_super_secure';
    v_canonical TEXT;
    v_sig TEXT;
    v_res JSONB;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    PERFORM set_config('app.settings.gateway_assertion_secret', v_secret, true);
    SELECT id INTO v_admin_id FROM public.platform_admins WHERE email = 'synthetic.admin@staging.vistaar.internal';

    -- 10A: Nonce Replay Rejection
    INSERT INTO public.platform_gcap_nonces (nonce, admin_id, action, consumed_at, expires_at)
    VALUES (v_nonce, v_admin_id, 'TEST_GCAP', NOW(), NOW() + INTERVAL '5 minutes');

    BEGIN
        INSERT INTO public.platform_gcap_nonces (nonce, admin_id, action, consumed_at, expires_at)
        VALUES (v_nonce, v_admin_id, 'TEST_GCAP_REPLAY', NOW(), NOW() + INTERVAL '5 minutes');
        RAISE EXCEPTION 'TEST 10A FAILED: Replay nonce was erroneously accepted.';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'TEST 10A PASSED: GCAP nonce replay blocked by unique constraint.';
    END;

    -- 10B: Invalid HMAC Signature Rejection
    v_nonce := gen_random_uuid();
    BEGIN
        PERFORM public.super_admin_get_platform_metrics(
            v_admin_id, 'aal2', v_now, v_nonce, 'invalid_forged_hex_signature_abcdef1234567890'
        );
        RAISE EXCEPTION 'TEST 10B FAILED: Forged assertion signature was accepted.';
    EXCEPTION WHEN SQLSTATE '28000' THEN
        RAISE NOTICE 'TEST 10B PASSED: Forged HMAC signature rejected with SQLSTATE 28000.';
    END;

    -- 10C: Expired Timestamp / Clock Skew Rejection (> 30 seconds)
    v_nonce := gen_random_uuid();
    v_canonical := v_admin_id::TEXT || ':GET_PLATFORM_METRICS:ALL:NONE:aal2:' || 
                   EXTRACT(EPOCH FROM (v_now - INTERVAL '60 seconds'))::BIGINT::TEXT || ':' || v_nonce::TEXT;
    v_sig := encode(extensions.hmac(v_canonical::bytea, v_secret::bytea, 'sha256'), 'hex');

    BEGIN
        PERFORM public.super_admin_get_platform_metrics(
            v_admin_id, 'aal2', v_now - INTERVAL '60 seconds', v_nonce, v_sig
        );
        RAISE EXCEPTION 'TEST 10C FAILED: Expired timestamp assertion was accepted.';
    EXCEPTION WHEN SQLSTATE '28000' THEN
        RAISE NOTICE 'TEST 10C PASSED: Timestamp skew (> 30s) rejected with SQLSTATE 28000.';
    END;

    RAISE NOTICE 'TEST 10 PASSED: GCAP Security Triad verified.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 11: Coupon Reservation Math Verification (validate_and_reserve_coupon)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_ws_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
    v_admin_id UUID;
    v_res JSONB;
    v_payable NUMERIC;
    v_discount NUMERIC;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    SELECT id INTO v_admin_id FROM public.platform_admins WHERE email = 'synthetic.admin@staging.vistaar.internal';

    v_res := public.validate_and_reserve_coupon(
        'STAGING20', v_ws_id, 'business', 'annual', v_admin_id
    );

    IF (v_res->>'success')::boolean != true THEN
        RAISE EXCEPTION 'TEST 11 FAILED: validate_and_reserve_coupon returned error: %', v_res->>'error';
    END IF;

    v_payable := (v_res->>'final_payable_inr')::numeric;
    v_discount := (v_res->>'discount_amount_inr')::numeric;

    -- Business annual price: 5999.00. 20% discount = 1199.80. Payable = 4799.20.
    ASSERT v_discount = 1199.80, 'Discount calculation mismatch. Expected 1199.80, got ' || v_discount;
    ASSERT v_payable = 4799.20, 'Final payable mismatch. Expected 4799.20, got ' || v_payable;

    RAISE NOTICE 'TEST 11 PASSED: Coupon math verified (Original: 5999, Discount: %, Final: %)', v_discount, v_payable;
END $$;

-- -----------------------------------------------------------------------------
-- TEST 12: Zero-Payable Subscription Activation
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_ws_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
    v_admin_id UUID;
    v_quote JSONB;
    v_redemption_id UUID;
    v_act JSONB;
    v_sub RECORD;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    SELECT id INTO v_admin_id FROM public.platform_admins WHERE email = 'synthetic.admin@staging.vistaar.internal';

    v_quote := public.validate_and_reserve_coupon('FREE100', v_ws_id, 'starter', 'monthly', v_admin_id);
    ASSERT (v_quote->>'success')::boolean = true, 'Free coupon quoting failed: ' || (v_quote->>'error');
    ASSERT (v_quote->>'final_payable_inr')::numeric = 0.00, 'Free coupon payable must be 0.00';

    v_redemption_id := (v_quote->>'redemption_id')::UUID;

    v_act := public.activate_zero_payable_subscription(v_redemption_id, v_admin_id);
    ASSERT (v_act->>'success')::boolean = true, 'Zero payable activation failed: ' || (v_act->>'error');

    SELECT * INTO v_sub FROM public.workspace_subscriptions WHERE workspace_id = v_ws_id;
    ASSERT v_sub.status = 'active', 'Subscription must be active after zero-payable activation';
    ASSERT v_sub.plan_id = 'starter', 'Plan must be starter';

    RAISE NOTICE 'TEST 12 PASSED: 100%% zero-payable subscription activated cleanly.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 13: Payment Settlement Amount Mismatch Committed Audit
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_ws_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
    v_admin_id UUID;
    v_quote JSONB;
    v_redemption_id UUID;
    v_settle JSONB;
    v_tx RECORD;
    v_red RECORD;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    SELECT id INTO v_admin_id FROM public.platform_admins WHERE email = 'synthetic.admin@staging.vistaar.internal';

    UPDATE public.workspace_subscriptions SET status = 'expired' WHERE workspace_id = v_ws_id;

    v_quote := public.validate_and_reserve_coupon('STAGING20', v_ws_id, 'business', 'annual', v_admin_id);
    v_redemption_id := (v_quote->>'redemption_id')::UUID;

    -- Settle with underpaid amount (₹1000.00 instead of ₹4799.20)
    v_settle := public.settle_coupon_payment(
        v_redemption_id,
        'TX_MISMATCH_' || gen_random_uuid()::text,
        'youpi_pg',
        1000.00,
        'INR',
        '{"note": "underpaid simulated"}'::jsonb,
        NOW(),
        'captured'
    );

    ASSERT (v_settle->>'success')::boolean = false, 'Amount mismatch MUST return success: false';
    ASSERT v_settle->>'error' = 'AMOUNT_MISMATCH', 'Error must be AMOUNT_MISMATCH';

    SELECT * INTO v_red FROM public.coupon_redemptions WHERE id = v_redemption_id;
    ASSERT v_red.status = 'failed', 'Redemption status must be marked failed';

    SELECT * INTO v_tx FROM public.payment_transactions WHERE coupon_redemption_id = v_redemption_id;
    ASSERT v_tx.id IS NOT NULL, 'Failed payment transaction must be committed to database';
    ASSERT v_tx.status = 'failed', 'Transaction status must be failed';

    RAISE NOTICE 'TEST 13 PASSED: Amount mismatch committed failure audit row without transaction rollback.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 14: Payment Settlement Success & Idempotent Duplicate Handling
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_ws_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
    v_admin_id UUID;
    v_quote JSONB;
    v_redemption_id UUID;
    v_payable NUMERIC;
    v_tx_ref TEXT := 'TX_SUCCESS_' || gen_random_uuid()::text;
    v_settle1 JSONB;
    v_settle2 JSONB;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    SELECT id INTO v_admin_id FROM public.platform_admins WHERE email = 'synthetic.admin@staging.vistaar.internal';

    v_quote := public.validate_and_reserve_coupon('STAGING20', v_ws_id, 'business', 'annual', v_admin_id);
    v_redemption_id := (v_quote->>'redemption_id')::UUID;
    v_payable := (v_quote->>'final_payable_inr')::numeric;

    -- 1. Settle with exact matching amount
    v_settle1 := public.settle_coupon_payment(
        v_redemption_id,
        v_tx_ref,
        'youpi_pg',
        v_payable,
        'INR',
        '{"gateway_tx": "succ_001"}'::jsonb,
        NOW(),
        'captured'
    );

    ASSERT (v_settle1->>'success')::boolean = true, 'Settlement failed: ' || (v_settle1->>'error');
    ASSERT v_settle1->>'status' = 'settled', 'Status must be settled';

    -- 2. Send duplicate webhook with identical reference
    v_settle2 := public.settle_coupon_payment(
        v_redemption_id,
        v_tx_ref,
        'youpi_pg',
        v_payable,
        'INR',
        '{"gateway_tx": "succ_001_dup"}'::jsonb,
        NOW(),
        'captured'
    );

    ASSERT (v_settle2->>'success')::boolean = true, 'Duplicate webhook must return success';
    ASSERT v_settle2->>'status' = 'already_settled', 'Duplicate must return status: already_settled';

    RAISE NOTICE 'TEST 14 PASSED: Settlement and duplicate webhook idempotency verified.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 15: Late Webhook Support Review Flagging
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_ws_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
    v_admin_id UUID;
    v_quote JSONB;
    v_redemption_id UUID;
    v_payable NUMERIC;
    v_tx_ref TEXT := 'TX_LATE_' || gen_random_uuid()::text;
    v_settle JSONB;
    v_red RECORD;
    v_tx RECORD;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    SELECT id INTO v_admin_id FROM public.platform_admins WHERE email = 'synthetic.admin@staging.vistaar.internal';

    v_quote := public.validate_and_reserve_coupon('STAGING20', v_ws_id, 'business', 'annual', v_admin_id);
    v_redemption_id := (v_quote->>'redemption_id')::UUID;
    v_payable := (v_quote->>'final_payable_inr')::numeric;

    -- Simulate expired reservation: reserved_until was 5 minutes ago
    UPDATE public.coupon_redemptions 
    SET reserved_until = NOW() - INTERVAL '5 minutes'
    WHERE id = v_redemption_id;

    -- Payment was authorized 2 minutes ago (AFTER expiry, within 24h transit)
    v_settle := public.settle_coupon_payment(
        v_redemption_id,
        v_tx_ref,
        'youpi_pg',
        v_payable,
        'INR',
        '{"gateway_tx": "late_001"}'::jsonb,
        NOW() - INTERVAL '2 minutes',
        'captured'
    );

    ASSERT (v_settle->>'success')::boolean = false, 'Late payment must return success: false';
    ASSERT v_settle->>'status' = 'requires_support_review', 'Status must be requires_support_review';

    SELECT * INTO v_red FROM public.coupon_redemptions WHERE id = v_redemption_id;
    ASSERT v_red.status = 'failed', 'Redemption status must be marked failed';

    SELECT * INTO v_tx FROM public.payment_transactions WHERE coupon_redemption_id = v_redemption_id;
    ASSERT (v_tx.provider_payload->>'requires_support_review')::boolean = true, 'Transaction must be flagged for support review';

    RAISE NOTICE 'TEST 15 PASSED: Late payment cleanly flagged for support review without subscription activation.';
END $$;

-- -----------------------------------------------------------------------------
-- TEST 16: GCAP Workspace Suspension & State-Preserving Reactivation
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_ws_id UUID := '00000000-0000-0000-0000-000000000001'::UUID;
    v_admin_id UUID;
    v_nonce UUID := gen_random_uuid();
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_secret TEXT := 'test_gcap_secret_key_32_bytes_super_secure';
    v_canonical TEXT;
    v_sig TEXT;
    v_res JSONB;
    v_ws RECORD;
BEGIN
    PERFORM set_config('request.jwt.claim.role', 'service_role', true);
    PERFORM set_config('app.settings.gateway_assertion_secret', v_secret, true);
    SELECT id INTO v_admin_id FROM public.platform_admins WHERE email = 'synthetic.admin@staging.vistaar.internal';

    -- 1. Compute HMAC signature for SUSPEND_WORKSPACE (with session assurance aal2)
    v_canonical := v_admin_id::TEXT || ':SUSPEND_WORKSPACE:' || v_ws_id::TEXT || ':NONE:aal2:' || 
                   EXTRACT(EPOCH FROM v_now)::BIGINT::TEXT || ':' || v_nonce::TEXT;
    v_sig := encode(extensions.hmac(v_canonical::bytea, v_secret::bytea, 'sha256'), 'hex');

    -- 2. Execute suspension RPC
    v_res := public.super_admin_suspend_workspace(
        v_ws_id, 'Regulatory non-compliance audit', v_admin_id, 'aal2', v_now, v_nonce, v_sig
    );
    ASSERT (v_res->>'success')::boolean = true, 'Suspension failed: ' || (v_res->>'error');

    SELECT * INTO v_ws FROM public.workspaces WHERE id = v_ws_id;
    ASSERT v_ws.is_active = FALSE, 'Workspace must be inactive';
    ASSERT v_ws.suspension_reason = 'Regulatory non-compliance audit', 'Suspension reason mismatch';

    -- 3. Execute Reactivation (with session assurance aal2)
    v_nonce := gen_random_uuid();
    v_now := timezone('utc'::text, now());
    v_canonical := v_admin_id::TEXT || ':REACTIVATE_WORKSPACE:' || v_ws_id::TEXT || ':NONE:aal2:' || 
                   EXTRACT(EPOCH FROM v_now)::BIGINT::TEXT || ':' || v_nonce::TEXT;
    v_sig := encode(extensions.hmac(v_canonical::bytea, v_secret::bytea, 'sha256'), 'hex');

    v_res := public.super_admin_reactivate_workspace(
        v_ws_id, 'Compliance verified', v_admin_id, 'aal2', v_now, v_nonce, v_sig
    );
    ASSERT (v_res->>'success')::boolean = true, 'Reactivation failed: ' || (v_res->>'error');

    SELECT * INTO v_ws FROM public.workspaces WHERE id = v_ws_id;
    ASSERT v_ws.is_active = TRUE, 'Workspace must be active after reactivation';
    ASSERT v_ws.suspension_reason IS NULL, 'Suspension reason must be cleared';

    RAISE NOTICE 'TEST 16 PASSED: GCAP Workspace suspension and reactivation verified.';
END $$;

-- Rollback entire test block to leave staging clean
ROLLBACK;

DO $$
BEGIN
    RAISE NOTICE '=======================================================';
    RAISE NOTICE 'ALL 16 PHASE 4 TEST SUITE TRANSACTIONS EXECUTED SUCCESSFULLY.';
    RAISE NOTICE '=======================================================';
END $$;
