-- ==============================================================================
-- Migration 070: Canonical Subscription Plans, Entitlements & Multi-Platform Matrix
-- 
-- Implements:
-- 1. Canonical subscription plans table with official device permissions
-- 2. Workspace subscriptions table with strict 14-day trial and period management
-- 3. Subscription add-ons table (e.g. Starter Mobile Add-on)
-- 4. Payment transactions audit table
-- 5. Authoritative entitlement resolution RPC: get_workspace_entitlements()
-- 6. RLS security policies preventing client-side plan elevation
-- ==============================================================================

-- 1. Canonical Subscription Plans Table
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tagline TEXT,
    price_annual_inr NUMERIC(10, 2) NOT NULL DEFAULT 0,
    price_monthly_inr NUMERIC(10, 2) NOT NULL DEFAULT 0,
    allowed_platforms TEXT[] NOT NULL DEFAULT ARRAY['web'],
    max_users INTEGER NOT NULL DEFAULT 1,
    max_branches INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed canonical plans
INSERT INTO public.subscription_plans (id, name, tagline, price_annual_inr, price_monthly_inr, allowed_platforms, max_users, max_branches)
VALUES 
    ('free_trial', '14-Day Free Trial', 'Full access to Web, Windows Desktop, and Android', 0, 0, ARRAY['web', 'desktop', 'android'], 2, 1),
    ('starter', 'Starter', 'Cloud Web business management for single-terminal retail', 2499, 299, ARRAY['web'], 1, 1),
    ('starter_mobile', 'Starter + Mobile Add-on', 'Web counter plus native Android APK for floor staff', 4498, 498, ARRAY['web', 'android'], 2, 1),
    ('business', 'Business', 'High-throughput Windows Desktop software & multi-branch control', 5999, 699, ARRAY['web', 'desktop'], 5, 3),
    ('growth', 'Growth', 'Enterprise all-platform operating system for retail chains', 9999, 1199, ARRAY['web', 'desktop', 'android'], 0, 0)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    tagline = EXCLUDED.tagline,
    price_annual_inr = EXCLUDED.price_annual_inr,
    price_monthly_inr = EXCLUDED.price_monthly_inr,
    allowed_platforms = EXCLUDED.allowed_platforms,
    max_users = EXCLUDED.max_users,
    max_branches = EXCLUDED.max_branches;

-- 2. Workspace Subscriptions Table
CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES public.subscription_plans(id) DEFAULT 'free_trial',
    status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'payment_pending', 'past_due', 'cancelled', 'expired')),
    trial_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trial_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
    billing_interval TEXT NOT NULL DEFAULT 'annual' CHECK (billing_interval IN ('annual', 'monthly', 'trial')),
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workspace_subscription UNIQUE (workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_ws ON public.workspace_subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_status ON public.workspace_subscriptions(status);

-- 3. Subscription Add-ons Table
CREATE TABLE IF NOT EXISTS public.subscription_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    addon_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
    valid_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workspace_addon UNIQUE (workspace_id, addon_key)
);

CREATE INDEX IF NOT EXISTS idx_subscription_addons_ws ON public.subscription_addons(workspace_id);

-- 4. Payment Transactions Table
CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    transaction_reference TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'youpi_pg',
    amount_inr NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    plan_id TEXT REFERENCES public.subscription_plans(id),
    addon_key TEXT,
    status TEXT NOT NULL CHECK (status IN ('initiated', 'pending', 'verified_success', 'failed', 'refunded')),
    provider_payload JSONB,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payment_transaction_ref UNIQUE (transaction_reference)
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_ws ON public.payment_transactions(workspace_id);

-- 5. Row-Level Security (RLS)
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Plans are publicly readable
DROP POLICY IF EXISTS "Public plans viewable by everyone" ON public.subscription_plans;
CREATE POLICY "Public plans viewable by everyone" ON public.subscription_plans
    FOR SELECT USING (true);

-- Subscriptions viewable by workspace members
DROP POLICY IF EXISTS "Workspace members can view subscription" ON public.workspace_subscriptions;
CREATE POLICY "Workspace members can view subscription" ON public.workspace_subscriptions
    FOR SELECT USING (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
            UNION
            SELECT company_id FROM public.employees WHERE auth_user_id = auth.uid()
        )
    );

-- Subscriptions cannot be mutated directly by client RPC or REST
-- Updates and inserts are restricted to server-side functions / service_role
DROP POLICY IF EXISTS "Prevent client direct subscription modification" ON public.workspace_subscriptions;
CREATE POLICY "Prevent client direct subscription modification" ON public.workspace_subscriptions
    FOR ALL USING (false);

-- Addons viewable by workspace members
DROP POLICY IF EXISTS "Workspace members can view addons" ON public.subscription_addons;
CREATE POLICY "Workspace members can view addons" ON public.subscription_addons
    FOR SELECT USING (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
            UNION
            SELECT company_id FROM public.employees WHERE auth_user_id = auth.uid()
        )
    );

-- Payment transactions viewable by workspace members
DROP POLICY IF EXISTS "Workspace members can view payment transactions" ON public.payment_transactions;
CREATE POLICY "Workspace members can view payment transactions" ON public.payment_transactions
    FOR SELECT USING (
        workspace_id IN (
            SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
            UNION
            SELECT company_id FROM public.employees WHERE auth_user_id = auth.uid()
        )
    );

-- 6. Authoritative RPC: get_workspace_entitlements
CREATE OR REPLACE FUNCTION public.get_workspace_entitlements(target_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sub RECORD;
    v_plan RECORD;
    v_addons TEXT[];
    v_effective_platforms TEXT[];
    v_is_valid BOOLEAN := FALSE;
    v_now TIMESTAMPTZ := NOW();
    v_trial_remaining_days INTEGER := 0;
    v_result JSONB;
BEGIN
    -- 1. Fetch or create default 14-day trial subscription if missing
    SELECT * INTO v_sub
    FROM public.workspace_subscriptions
    WHERE workspace_id = target_workspace_id;

    IF NOT FOUND THEN
        -- Seed 14-day free trial on first lookup
        INSERT INTO public.workspace_subscriptions (
            workspace_id,
            plan_id,
            status,
            trial_start,
            trial_end,
            current_period_start,
            current_period_end,
            billing_interval
        ) VALUES (
            target_workspace_id,
            'free_trial',
            'trialing',
            v_now,
            v_now + INTERVAL '14 days',
            v_now,
            v_now + INTERVAL '14 days',
            'trial'
        )
        RETURNING * INTO v_sub;
    END IF;

    -- 2. Fetch base plan
    SELECT * INTO v_plan
    FROM public.subscription_plans
    WHERE id = v_sub.plan_id;

    IF NOT FOUND THEN
        -- Fallback to starter definition if unknown
        SELECT * INTO v_plan FROM public.subscription_plans WHERE id = 'starter';
    END IF;

    -- 3. Fetch active addons
    SELECT COALESCE(array_agg(addon_key), ARRAY[]::TEXT[]) INTO v_addons
    FROM public.subscription_addons
    WHERE workspace_id = target_workspace_id
      AND status = 'active'
      AND valid_until > v_now;

    -- 4. Calculate validity & status
    IF v_sub.status = 'trialing' THEN
        IF v_now <= v_sub.trial_end THEN
            v_is_valid := TRUE;
            v_trial_remaining_days := GREATEST(0, EXTRACT(DAY FROM (v_sub.trial_end - v_now))::INTEGER);
        ELSE
            v_is_valid := FALSE;
            v_trial_remaining_days := 0;
        END IF;
    ELSIF v_sub.status = 'active' THEN
        IF v_now <= v_sub.current_period_end THEN
            v_is_valid := TRUE;
        ELSE
            v_is_valid := FALSE;
        END IF;
    ELSE
        v_is_valid := FALSE;
    END IF;

    -- 5. Calculate effective platform matrix
    IF v_is_valid THEN
        v_effective_platforms := v_plan.allowed_platforms;

        -- Layer Mobile Add-on onto Starter
        IF v_sub.plan_id = 'starter' AND 'mobile_pos_addon' = ANY(v_addons) THEN
            IF NOT ('android' = ANY(v_effective_platforms)) THEN
                v_effective_platforms := array_append(v_effective_platforms, 'android');
            END IF;
        END IF;
    ELSE
        -- If expired, only allow restricted web access (or prompt for renewal)
        v_effective_platforms := ARRAY['web']::TEXT[];
    END IF;

    -- 6. Construct JSON response
    v_result := jsonb_build_object(
        'workspace_id', target_workspace_id,
        'plan_id', v_sub.plan_id,
        'plan_name', COALESCE(v_plan.name, 'VISTAAR Subscription'),
        'status', v_sub.status,
        'is_valid', v_is_valid,
        'trial_remaining_days', v_trial_remaining_days,
        'trial_end', v_sub.trial_end,
        'current_period_end', v_sub.current_period_end,
        'billing_interval', v_sub.billing_interval,
        'cancel_at_period_end', v_sub.cancel_at_period_end,
        'allowed_platforms', v_effective_platforms,
        'active_addons', v_addons,
        'max_users', v_plan.max_users,
        'max_branches', v_plan.max_branches
    );

    RETURN v_result;
END;
$$;
