-- ==============================================================================
-- Migration 081: Workspace Test Classification & Real Subscriber Data Integrity
-- 
-- Objectives:
-- 1. Add authoritative `is_test` classification column to workspaces and workspace_subscriptions
-- 2. Mark historical synthetic seed fixtures (@staging.vistaar.internal and admin test workspaces) as test data
-- 3. Enhance subscription views/queries to separate genuine customer accounts from synthetic fixtures
-- 4. Ensure foreign key integrity between workspaces, subscriptions, plans, and profiles
-- ==============================================================================

-- 1. Add is_test column to workspaces if not exists
ALTER TABLE public.workspaces 
ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add is_test column to workspace_subscriptions if not exists
ALTER TABLE public.workspace_subscriptions 
ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Create index on is_test for fast filtering
CREATE INDEX IF NOT EXISTS idx_workspaces_is_test ON public.workspaces(is_test);
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_is_test ON public.workspace_subscriptions(is_test);

-- 4. Classify synthetic test records in staging
-- Any workspace owned by @staging.vistaar.internal or containing synthetic naming patterns
UPDATE public.workspaces
SET is_test = TRUE
WHERE owner_email LIKE '%@staging.vistaar.internal'
   OR company_name ILIKE '%Synthetic%'
   OR company_name ILIKE '%Staging%'
   OR company_name = 'My Business';

-- Propagate is_test flag to workspace_subscriptions
UPDATE public.workspace_subscriptions ws
SET is_test = TRUE
FROM public.workspaces w
WHERE ws.workspace_id = w.id
  AND w.is_test = TRUE;

-- 5. Create authoritative subscriber summary view for real-time reconciliation
CREATE OR REPLACE VIEW public.v_authoritative_subscriptions AS
SELECT 
    ws.id AS subscription_id,
    ws.workspace_id,
    w.company_name AS workspace_name,
    w.owner_name,
    w.owner_email,
    w.owner_phone,
    w.is_test AS workspace_is_test,
    ws.is_test AS subscription_is_test,
    ws.plan_id,
    sp.name AS plan_name,
    sp.allowed_platforms,
    ws.status AS subscription_status,
    ws.billing_interval,
    CASE 
        WHEN ws.billing_interval = 'monthly' THEN sp.price_monthly_inr
        ELSE sp.price_annual_inr
    END AS standard_plan_price_inr,
    COALESCE(ws.custom_price_inr, 
        CASE 
            WHEN ws.status = 'trialing' OR ws.plan_id = 'free_trial' THEN 0
            WHEN ws.billing_interval = 'monthly' THEN sp.price_monthly_inr
            ELSE sp.price_annual_inr
        END
    ) AS effective_price_inr,
    ws.custom_price_inr,
    ws.override_reason,
    ws.discount_amount_inr,
    ws.pricing_model,
    ws.trial_start,
    ws.trial_end,
    ws.current_period_start,
    ws.current_period_end,
    ws.cancel_at_period_end,
    ws.created_at AS subscription_created_at,
    w.created_at AS workspace_created_at
FROM public.workspace_subscriptions ws
JOIN public.workspaces w ON ws.workspace_id = w.id
LEFT JOIN public.subscription_plans sp ON ws.plan_id = sp.id;

