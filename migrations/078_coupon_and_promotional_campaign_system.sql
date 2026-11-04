-- ==============================================================================
-- Migration 078: VISTAAR Promotional Campaign & Coupon Redemption Engine
-- Version: 2.6.1 (Phase 4 Staging Hardened)
-- Target: Staging / Production Compatible Additive Extension
--
-- Components:
-- 1. Dedicated Promotional Entities:
--    - public.coupons (Promotional Campaign Master & Quota Engine)
--    - public.coupon_redemptions (Statutory Redemption Audit Ledger)
-- 2. Additive Subscription & Payment Extensions:
--    - public.workspace_subscriptions (applied_coupon_id, discount_amount_inr)
--    - public.payment_transactions (coupon_redemption_id)
-- 3. Authoritative Quoting & Settlement RPCs:
--    - validate_and_reserve_coupon() (Two-phase reservation with multi-branch tenant verification)
--    - activate_zero_payable_subscription() (100% discount zero-payable activation)
--    - settle_coupon_payment() (Captured-funds webhook settlement with amount check & period preservation)
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Canonical Coupons Table (public.coupons)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    max_discount_amount NUMERIC(10, 2) DEFAULT NULL,
    min_purchase_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    applicable_plans TEXT[] NOT NULL DEFAULT ARRAY['all'],
    applicable_intervals TEXT[] NOT NULL DEFAULT ARRAY['all'],
    customer_eligibility VARCHAR(30) NOT NULL DEFAULT 'all' CHECK (customer_eligibility IN ('all', 'new_customers_only', 'existing_customers_only')),
    first_subscription_only BOOLEAN NOT NULL DEFAULT FALSE,
    discount_duration VARCHAR(20) NOT NULL DEFAULT 'once' CHECK (discount_duration = 'once'),
    duration_in_months INTEGER DEFAULT NULL,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ DEFAULT NULL,
    max_total_redemptions INTEGER DEFAULT NULL,
    max_redemptions_per_workspace INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES public.platform_admins(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_coupons_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active_dates ON public.coupons(is_active, valid_from, valid_until);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Prevent direct client access to coupons" ON public.coupons;
CREATE POLICY "Prevent direct client access to coupons" ON public.coupons
    FOR ALL USING (FALSE);

-- -----------------------------------------------------------------------------
-- 2. Coupon Redemptions Table (public.coupon_redemptions)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
    coupon_code VARCHAR(50) NOT NULL,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
    workspace_name_snapshot VARCHAR(255) NOT NULL,
    customer_email_snapshot VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
    plan_id TEXT NOT NULL REFERENCES public.subscription_plans(id),
    billing_interval TEXT NOT NULL CHECK (billing_interval IN ('annual', 'monthly')),
    original_amount_inr NUMERIC(10, 2) NOT NULL,
    discount_amount_inr NUMERIC(10, 2) NOT NULL,
    final_payable_inr NUMERIC(10, 2) NOT NULL,
    payment_transaction_id UUID REFERENCES public.payment_transactions(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'applied', 'failed', 'refunded')),
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reserved_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
    redeemed_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_ws ON public.coupon_redemptions(workspace_id, coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_status ON public.coupon_redemptions(status);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_expiry ON public.coupon_redemptions(status, reserved_until);

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Prevent direct client mutation of redemptions" ON public.coupon_redemptions;
CREATE POLICY "Prevent direct client mutation of redemptions" ON public.coupon_redemptions
    FOR ALL USING (FALSE);

-- -----------------------------------------------------------------------------
-- 2B. Explicit Table-Level Privilege Lockdown (Defense-in-Depth)
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.coupons, public.coupon_redemptions FROM PUBLIC;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE public.coupons, public.coupon_redemptions FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE public.coupons, public.coupon_redemptions FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        -- 1. Campaign Definitions: Full lifecycle management (SELECT, INSERT, UPDATE, DELETE)
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coupons TO service_role;
        REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.coupons FROM service_role;

        -- 2. Redemption State Machine: Financial lifecycle (SELECT, INSERT, UPDATE; no DELETE)
        GRANT SELECT, INSERT, UPDATE ON TABLE public.coupon_redemptions TO service_role;
        REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.coupon_redemptions FROM service_role;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Additive Extensions on Existing Subscription & Payment Tables
-- -----------------------------------------------------------------------------
ALTER TABLE public.workspace_subscriptions
    ADD COLUMN IF NOT EXISTS applied_coupon_id UUID REFERENCES public.coupons(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS discount_amount_inr NUMERIC(10, 2) DEFAULT 0.00;

ALTER TABLE public.payment_transactions
    ADD COLUMN IF NOT EXISTS coupon_redemption_id UUID REFERENCES public.coupon_redemptions(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- 4. Authoritative RPC: validate_and_reserve_coupon
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_and_reserve_coupon(
    p_code TEXT,
    p_workspace_id UUID,
    p_plan_id TEXT,
    p_billing_interval TEXT,
    p_customer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := FALSE;
    v_coupon RECORD;
    v_plan RECORD;
    v_ws RECORD;
    v_existing_sub RECORD;
    v_base_price NUMERIC(10, 2);
    v_discount NUMERIC(10, 2) := 0;
    v_final NUMERIC(10, 2);
    v_applied_total_count INTEGER;
    v_applied_ws_count INTEGER;
    v_has_past_payments BOOLEAN;
    v_redemption_id UUID;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Resolve Effective Customer Identity (Separate Contracts)
    IF auth.role() = 'authenticated' THEN
        v_caller_id := auth.uid();
    ELSIF auth.role() = 'service_role' THEN
        IF p_customer_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'MISSING_CUSTOMER_CONTEXT: Trusted backend calls must supply verified customer identity.');
        END IF;
        v_caller_id := p_customer_id;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED: Missing session token.');
    END IF;

    -- 2. Fetch Workspace Details (Verified Schema)
    SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid workspace specified.');
    END IF;

    -- 3. Reject Inactive / Suspended Workspaces
    IF NOT v_ws.is_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'Workspace is suspended or inactive. Subscriptions cannot be purchased.');
    END IF;

    -- 4. Verified Production Workspace Authorization (NO owner_id assumption; NO service_role bypass)
    -- Check 4A: Parent Organization Owner (Migration 058 canonical architecture)
    IF v_ws.organization_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.organizations 
            WHERE id = v_ws.organization_id AND owner_user_id = v_caller_id
        ) INTO v_is_authorized;
    END IF;

    -- Check 4B: Active Profile with Owner or Admin Role
    IF NOT v_is_authorized THEN
        SELECT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = v_caller_id 
              AND workspace_id = p_workspace_id 
              AND LOWER(role::TEXT) IN ('owner', 'admin')
              AND status = 'Active'::public.employee_status
        ) INTO v_is_authorized;
    END IF;

    -- Check 4C: Active Workspace Membership with Owner or Admin Role
    IF NOT v_is_authorized THEN
        SELECT EXISTS (
            SELECT 1 FROM public.workspace_memberships 
            WHERE user_id = v_caller_id 
              AND workspace_id = p_workspace_id 
              AND LOWER(role::TEXT) IN ('owner', 'admin')
              AND status = 'Active'
        ) INTO v_is_authorized;
    END IF;

    -- Check 4D: Direct Owner Email Match
    IF NOT v_is_authorized AND v_ws.owner_email IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = v_caller_id AND LOWER(email) = LOWER(v_ws.owner_email)
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN: You do not have authorization to manage subscriptions for this workspace.');
    END IF;

    -- 5. Commercial Policy Guard: Block Mid-Cycle Plan Changes Pending Business Approval
    SELECT * INTO v_existing_sub
    FROM public.workspace_subscriptions
    WHERE workspace_id = p_workspace_id;

    IF v_existing_sub.id IS NOT NULL AND v_existing_sub.status = 'active' AND v_existing_sub.current_period_end > v_now THEN
        IF v_existing_sub.plan_id <> p_plan_id OR v_existing_sub.billing_interval <> p_billing_interval THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'MID_CYCLE_PLAN_CHANGE_BLOCKED: Mid-cycle plan upgrades, downgrades, and interval switches during an active paid period require manual Super Admin assistance. You may renew your current plan or switch plans upon period expiration.'
            );
        END IF;
    END IF;

    -- 6. Fetch Plan Details
    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid subscription plan specified.');
    END IF;

    IF p_billing_interval = 'monthly' THEN
        v_base_price := v_plan.price_monthly_inr;
    ELSE
        v_base_price := v_plan.price_annual_inr;
    END IF;

    IF v_base_price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Coupons cannot be applied to free tiers.');
    END IF;

    -- 7. Fetch and Lock Coupon Row (Atomic Concurrency Protection)
    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE UPPER(code) = UPPER(TRIM(p_code))
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid coupon code.');
    END IF;

    IF NOT v_coupon.is_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'This coupon is no longer active.');
    END IF;

    IF v_now < v_coupon.valid_from THEN
        RETURN jsonb_build_object('success', false, 'error', 'This promotion has not started yet.');
    END IF;

    IF v_coupon.valid_until IS NOT NULL AND v_now > v_coupon.valid_until THEN
        RETURN jsonb_build_object('success', false, 'error', 'This coupon has expired.');
    END IF;

    -- 8. Plan and Interval Eligibility
    IF NOT ('all' = ANY(v_coupon.applicable_plans) OR p_plan_id = ANY(v_coupon.applicable_plans)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This coupon is not valid for the selected plan.');
    END IF;

    IF NOT ('all' = ANY(v_coupon.applicable_intervals) OR p_billing_interval = ANY(v_coupon.applicable_intervals)) THEN
        RETURN jsonb_build_object('success', false, 'error', 'This coupon is not valid for ' || p_billing_interval || ' billing.');
    END IF;

    -- 9. Minimum Spend Threshold
    IF v_base_price < v_coupon.min_purchase_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Minimum purchase amount of ₹' || v_coupon.min_purchase_amount || ' required.');
    END IF;

    -- 10. Customer Eligibility
    IF v_coupon.customer_eligibility = 'new_customers_only' OR v_coupon.first_subscription_only THEN
        SELECT EXISTS(
            SELECT 1 FROM public.payment_transactions 
            WHERE workspace_id = p_workspace_id AND status = 'verified_success'
        ) INTO v_has_past_payments;

        IF v_has_past_payments THEN
            RETURN jsonb_build_object('success', false, 'error', 'This coupon is strictly reserved for new subscriptions.');
        END IF;
    END IF;

    -- 11. Global Quota Check
    IF v_coupon.max_total_redemptions IS NOT NULL THEN
        SELECT COUNT(*) INTO v_applied_total_count
        FROM public.coupon_redemptions
        WHERE coupon_id = v_coupon.id 
          AND (status = 'applied' OR (status = 'reserved' AND reserved_until > v_now));

        IF v_applied_total_count >= v_coupon.max_total_redemptions THEN
            RETURN jsonb_build_object('success', false, 'error', 'This coupon has reached its maximum redemption limit.');
        END IF;
    END IF;

    -- 12. Per-Workspace Limit Check
    SELECT COUNT(*) INTO v_applied_ws_count
    FROM public.coupon_redemptions
    WHERE coupon_id = v_coupon.id 
      AND workspace_id = p_workspace_id 
      AND (status = 'applied' OR (status = 'reserved' AND reserved_until > v_now));

    IF v_applied_ws_count >= v_coupon.max_redemptions_per_workspace THEN
        RETURN jsonb_build_object('success', false, 'error', 'Your business has already redeemed this coupon.');
    END IF;

    -- 13. Compute Discount Math
    IF v_coupon.discount_type = 'percentage' THEN
        v_discount := ROUND((v_base_price * (v_coupon.discount_value / 100.0)), 2);
        IF v_coupon.max_discount_amount IS NOT NULL AND v_discount > v_coupon.max_discount_amount THEN
            v_discount := v_coupon.max_discount_amount;
        END IF;
    ELSE
        v_discount := LEAST(v_base_price, v_coupon.discount_value);
    END IF;

    v_final := GREATEST(0.00, v_base_price - v_discount);

    -- 14. Insert Phase 1 Reservation with Snapshot Metadata
    INSERT INTO public.coupon_redemptions (
        coupon_id,
        coupon_code,
        workspace_id,
        workspace_name_snapshot,
        customer_email_snapshot,
        user_id,
        plan_id,
        billing_interval,
        original_amount_inr,
        discount_amount_inr,
        final_payable_inr,
        status,
        reserved_at,
        reserved_until
    ) VALUES (
        v_coupon.id,
        v_coupon.code,
        p_workspace_id,
        v_ws.company_name,
        v_ws.owner_email,
        v_caller_id,
        p_plan_id,
        p_billing_interval,
        v_base_price,
        v_discount,
        v_final,
        'reserved',
        v_now,
        v_now + INTERVAL '15 minutes'
    ) RETURNING id INTO v_redemption_id;

    RETURN jsonb_build_object(
        'success', true,
        'redemption_id', v_redemption_id,
        'coupon_code', v_coupon.code,
        'discount_type', v_coupon.discount_type,
        'discount_value', v_coupon.discount_value,
        'original_amount_inr', v_base_price,
        'discount_amount_inr', v_discount,
        'final_payable_inr', v_final,
        'reserved_until', v_now + INTERVAL '15 minutes'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_and_reserve_coupon(TEXT, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_and_reserve_coupon(TEXT, UUID, TEXT, TEXT, UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Authoritative RPC: activate_zero_payable_subscription
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_zero_payable_subscription(
    p_redemption_id UUID,
    p_customer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := FALSE;
    v_redemption RECORD;
    v_ws RECORD;
    v_existing_sub RECORD;
    v_period_interval INTERVAL;
    v_new_period_start TIMESTAMPTZ;
    v_new_period_end TIMESTAMPTZ;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- 1. Resolve Effective Customer Identity (Separate Contracts)
    IF auth.role() = 'authenticated' THEN
        v_caller_id := auth.uid();
    ELSIF auth.role() = 'service_role' THEN
        IF p_customer_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'MISSING_CUSTOMER_CONTEXT: Trusted backend calls must supply verified customer identity.');
        END IF;
        v_caller_id := p_customer_id;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED: Missing session token.');
    END IF;

    -- 2. Fetch and Lock Redemption Record
    SELECT * INTO v_redemption
    FROM public.coupon_redemptions
    WHERE id = p_redemption_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid redemption ID.');
    END IF;

    -- 3. Assert Active Reservation Status & Expiry
    IF v_redemption.status <> 'reserved' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Reservation is not active (current status: ' || v_redemption.status || ').');
    END IF;

    IF v_redemption.reserved_until < v_now THEN
        RETURN jsonb_build_object('success', false, 'error', 'Coupon reservation has expired.');
    END IF;

    -- 4. Assert Exact Zero Cost
    IF v_redemption.final_payable_inr <> 0.00 THEN
        RETURN jsonb_build_object('success', false, 'error', 'This promotion requires payment settlement (payable: ₹' || v_redemption.final_payable_inr || ').');
    END IF;

    -- 5. Fetch Target Workspace & Check Active Status
    SELECT * INTO v_ws FROM public.workspaces WHERE id = v_redemption.workspace_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target workspace does not exist.');
    END IF;

    IF NOT v_ws.is_active THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target workspace is suspended or inactive.');
    END IF;

    -- 6. Strict Workspace Authorization Guard (Verified Schema, NO owner_id assumption)
    IF v_ws.organization_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.organizations 
            WHERE id = v_ws.organization_id AND owner_user_id = v_caller_id
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        SELECT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = v_caller_id 
              AND workspace_id = v_redemption.workspace_id 
              AND LOWER(role::TEXT) IN ('owner', 'admin')
              AND status = 'Active'::public.employee_status
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        SELECT EXISTS (
            SELECT 1 FROM public.workspace_memberships 
            WHERE user_id = v_caller_id 
              AND workspace_id = v_redemption.workspace_id 
              AND LOWER(role::TEXT) IN ('owner', 'admin')
              AND status = 'Active'
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized AND v_ws.owner_email IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = v_caller_id AND LOWER(email) = LOWER(v_ws.owner_email)
        ) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN: You do not have authorization to manage subscriptions for this workspace.');
    END IF;

    -- 7. Commercial Policy Guard: Block Mid-Cycle Plan Changes
    SELECT * INTO v_existing_sub
    FROM public.workspace_subscriptions
    WHERE workspace_id = v_redemption.workspace_id
    FOR UPDATE;

    IF v_existing_sub.id IS NOT NULL AND v_existing_sub.status = 'active' AND v_existing_sub.current_period_end > v_now THEN
        IF v_existing_sub.plan_id <> v_redemption.plan_id OR v_existing_sub.billing_interval <> v_redemption.billing_interval THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'MID_CYCLE_PLAN_CHANGE_BLOCKED: Mid-cycle plan switches require formal commercial approval. You may renew your current plan.'
            );
        END IF;
    END IF;

    -- 8. Subscription Period Preservation Mathematics
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
        -- Scenario D: Renewal After Expiry
        v_new_period_start := v_now;
        v_new_period_end := v_now + v_period_interval;
    END IF;

    -- 9. Atomically Transition Redemption to Applied
    UPDATE public.coupon_redemptions
    SET status = 'applied',
        redeemed_at = v_now
    WHERE id = p_redemption_id;

    -- 10. Insert Zero-Cost Transaction Audit Record
    INSERT INTO public.payment_transactions (
        workspace_id, transaction_reference, provider, amount_inr, currency,
        plan_id, status, provider_payload, verified_at, coupon_redemption_id
    ) VALUES (
        v_redemption.workspace_id,
        'ZERO_PROMO_' || SUBSTRING(p_redemption_id::TEXT, 1, 8) || '_' || EXTRACT(EPOCH FROM v_now)::BIGINT,
        'promotional_grant',
        0.00,
        'INR',
        v_redemption.plan_id,
        'verified_success',
        jsonb_build_object('coupon_code', v_redemption.coupon_code, 'discount_amount', v_redemption.discount_amount_inr),
        v_now,
        p_redemption_id
    );

    -- 11. Activate or Extend Workspace Subscription
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
        'status', 'activated',
        'plan_id', v_redemption.plan_id,
        'period_start', v_new_period_start,
        'period_end', v_new_period_end
    );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_zero_payable_subscription(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_zero_payable_subscription(UUID, UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. Authoritative RPC: settle_coupon_payment
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_coupon_payment(
    p_redemption_id UUID,
    p_transaction_reference TEXT,
    p_gateway_provider TEXT,
    p_amount_paid NUMERIC,
    p_currency TEXT,
    p_provider_payload JSONB,
    p_payment_authorized_at TIMESTAMPTZ,
    p_provider_status TEXT DEFAULT 'captured'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_redemption RECORD;
    v_existing_tx RECORD;
    v_existing_sub RECORD;
    v_tx_id UUID;
    v_period_interval INTERVAL;
    v_new_period_start TIMESTAMPTZ;
    v_new_period_end TIMESTAMPTZ;
    v_now TIMESTAMPTZ := NOW();
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
        RETURN jsonb_build_object('success', false, 'error', 'Invalid redemption ID.');
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
        RETURN jsonb_build_object('success', false, 'error', 'CURRENCY_MISMATCH: Only INR settlements supported.');
    END IF;

    -- 10. Validate Amount Equality (Exact Match Protection)
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
        -- Scenario D: Renewal After Expiry
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

REVOKE ALL ON FUNCTION public.settle_coupon_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, JSONB, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_coupon_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, JSONB, TIMESTAMPTZ, TEXT) TO service_role;

COMMIT;

