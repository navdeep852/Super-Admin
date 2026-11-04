-- ==============================================================================
-- VISTAAR Super Admin — Staging Migration 080
-- Subscription Plans, Promotional Pricing, Workspace Overrides & Pricing Engine
-- Target Database: Staging (vlbhxcajphyjkeueubud)
-- ==============================================================================

-- 1. Enhance subscription_plans with enterprise governance columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscription_plans' AND column_name = 'is_active') THEN
    ALTER TABLE public.subscription_plans ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscription_plans' AND column_name = 'is_archived') THEN
    ALTER TABLE public.subscription_plans ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscription_plans' AND column_name = 'trial_days') THEN
    ALTER TABLE public.subscription_plans ADD COLUMN trial_days INTEGER NOT NULL DEFAULT 14;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscription_plans' AND column_name = 'features') THEN
    ALTER TABLE public.subscription_plans ADD COLUMN features JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscription_plans' AND column_name = 'usage_limits') THEN
    ALTER TABLE public.subscription_plans ADD COLUMN usage_limits JSONB NOT NULL DEFAULT '{"invoices_monthly": 1000, "storage_gb": 5, "devices_max": 2}'::jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscription_plans' AND column_name = 'sort_order') THEN
    ALTER TABLE public.subscription_plans ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscription_plans' AND column_name = 'updated_at') THEN
    ALTER TABLE public.subscription_plans ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;

-- Populate feature arrays for standard plans
UPDATE public.subscription_plans
SET 
  features = '["Cloud Web Dashboard", "Single Terminal Billing", "Quotations & Invoicing", "Basic Stock Ledger", "Email Receipts"]'::jsonb,
  usage_limits = '{"invoices_monthly": 500, "storage_gb": 2, "devices_max": 1, "staff_max": 1}'::jsonb,
  sort_order = 1
WHERE id = 'starter';

UPDATE public.subscription_plans
SET 
  features = '["Cloud Web Counter", "Native Android POS APK", "Floor Staff Barcode Scanner", "Thermal Bluetooth Printing", "Customer WhatsApp Invoicing"]'::jsonb,
  usage_limits = '{"invoices_monthly": 2000, "storage_gb": 5, "devices_max": 3, "staff_max": 2}'::jsonb,
  sort_order = 2
WHERE id = 'starter_mobile';

UPDATE public.subscription_plans
SET 
  features = '["High-Throughput Windows POS", "Multi-Branch Inventory Sync", "Inter-Branch Stock Transfers", "E-Way Bill Generation", "Multi-Counter Cashbooks"]'::jsonb,
  usage_limits = '{"invoices_monthly": 10000, "storage_gb": 15, "devices_max": 8, "staff_max": 5}'::jsonb,
  sort_order = 3
WHERE id = 'business';

UPDATE public.subscription_plans
SET 
  features = '["Enterprise Omnichannel OS", "All Platforms (Web, Windows, Android)", "Unlimited Branch Routing", "Automated GST Recon", "Custom ERP Export API", "24/7 Priority SLA"]'::jsonb,
  usage_limits = '{"invoices_monthly": -1, "storage_gb": 100, "devices_max": -1, "staff_max": -1}'::jsonb,
  sort_order = 4
WHERE id = 'growth';

UPDATE public.subscription_plans
SET 
  features = '["All Growth Tier Features", "14-Day Evaluation Access", "No Credit Card Required", "Dedicated Onboarding Session"]'::jsonb,
  usage_limits = '{"invoices_monthly": 200, "storage_gb": 2, "devices_max": 2, "staff_max": 2}'::jsonb,
  sort_order = 0
WHERE id = 'free_trial';

-- 2. Enhance workspace_subscriptions with negotiated price override columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspace_subscriptions' AND column_name = 'custom_price_inr') THEN
    ALTER TABLE public.workspace_subscriptions ADD COLUMN custom_price_inr NUMERIC(10,2) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspace_subscriptions' AND column_name = 'override_reason') THEN
    ALTER TABLE public.workspace_subscriptions ADD COLUMN override_reason TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspace_subscriptions' AND column_name = 'override_admin_id') THEN
    ALTER TABLE public.workspace_subscriptions ADD COLUMN override_admin_id UUID DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspace_subscriptions' AND column_name = 'override_expires_at') THEN
    ALTER TABLE public.workspace_subscriptions ADD COLUMN override_expires_at TIMESTAMPTZ DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspace_subscriptions' AND column_name = 'original_plan_price_inr') THEN
    ALTER TABLE public.workspace_subscriptions ADD COLUMN original_plan_price_inr NUMERIC(10,2) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspace_subscriptions' AND column_name = 'effective_price_inr') THEN
    ALTER TABLE public.workspace_subscriptions ADD COLUMN effective_price_inr NUMERIC(10,2) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'workspace_subscriptions' AND column_name = 'pricing_model') THEN
    ALTER TABLE public.workspace_subscriptions ADD COLUMN pricing_model VARCHAR(50) NOT NULL DEFAULT 'standard';
  END IF;
END $$;

-- 3. Enhance coupons table for promotional and workspace-specific offers
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_discount_type_check;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_discount_type_check 
  CHECK (discount_type IN ('percentage', 'fixed', 'promotional_price'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'coupons' AND column_name = 'promotional_price_inr') THEN
    ALTER TABLE public.coupons ADD COLUMN promotional_price_inr NUMERIC(10,2) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'coupons' AND column_name = 'target_workspace_id') THEN
    ALTER TABLE public.coupons ADD COLUMN target_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'coupons' AND column_name = 'is_public') THEN
    ALTER TABLE public.coupons ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'coupons' AND column_name = 'banner_text') THEN
    ALTER TABLE public.coupons ADD COLUMN banner_text TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'coupons' AND column_name = 'priority') THEN
    ALTER TABLE public.coupons ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 4. Enhance payment_transactions with authoritative financial snapshots
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'original_plan_price_inr') THEN
    ALTER TABLE public.payment_transactions ADD COLUMN original_plan_price_inr NUMERIC(10,2) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'billing_cycle') THEN
    ALTER TABLE public.payment_transactions ADD COLUMN billing_cycle VARCHAR(20) DEFAULT 'monthly';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'offer_id') THEN
    ALTER TABLE public.payment_transactions ADD COLUMN offer_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'coupon_code') THEN
    ALTER TABLE public.payment_transactions ADD COLUMN coupon_code VARCHAR(100) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'discount_amount_inr') THEN
    ALTER TABLE public.payment_transactions ADD COLUMN discount_amount_inr NUMERIC(10,2) DEFAULT 0.00;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'taxable_amount_inr') THEN
    ALTER TABLE public.payment_transactions ADD COLUMN taxable_amount_inr NUMERIC(10,2) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'gst_amount_inr') THEN
    ALTER TABLE public.payment_transactions ADD COLUMN gst_amount_inr NUMERIC(10,2) DEFAULT 0.00;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'final_payable_inr') THEN
    ALTER TABLE public.payment_transactions ADD COLUMN final_payable_inr NUMERIC(10,2) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'price_snapshot') THEN
    ALTER TABLE public.payment_transactions ADD COLUMN price_snapshot JSONB DEFAULT NULL;
  END IF;
END $$;

-- 5. Create immutable workspace_subscription_events audit table
CREATE TABLE IF NOT EXISTS public.workspace_subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  old_plan_id TEXT REFERENCES public.subscription_plans(id),
  new_plan_id TEXT REFERENCES public.subscription_plans(id),
  admin_id UUID,
  reason TEXT,
  previous_price_inr NUMERIC(10,2),
  new_price_inr NUMERIC(10,2),
  effective_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_subscription_events_ws_id 
  ON public.workspace_subscription_events(workspace_id, created_at DESC);

-- Enable RLS and restrict to service_role
ALTER TABLE public.workspace_subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_sub_events_service_role ON public.workspace_subscription_events;
CREATE POLICY workspace_sub_events_service_role ON public.workspace_subscription_events
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- 6. Insert initial promotional offers into coupons if empty
INSERT INTO public.coupons (
  code, name, description, discount_type, discount_value, max_discount_amount,
  min_purchase_amount, applicable_plans, applicable_intervals, is_public, banner_text, priority, valid_until
) VALUES 
(
  'VISTAAR20', 'Diwali Launch 20% Off', '20% discount on all annual and monthly plans for retail onboarding',
  'percentage', 20.00, 2000.00, 500.00, ARRAY['all'], ARRAY['all'], TRUE,
  'Celebrate Diwali with 20% off all VISTAAR retail tiers!', 10, now() + interval '90 days'
),
(
  'GROWTH500', 'Flat ₹500 Off Growth Tier', 'Flat ₹500 off on Growth enterprise multi-branch subscription',
  'fixed', 500.00, 500.00, 2000.00, ARRAY['growth', 'business'], ARRAY['annual'], TRUE,
  'Special enterprise promotion: Save flat ₹500 on annual plans', 8, now() + interval '60 days'
),
(
  'SPECIAL699', 'Promotional Price ₹699 Business Tier', 'Pay special introductory rate of ₹699 for Business monthly tier',
  'promotional_price', 699.00, NULL, 699.00, ARRAY['business'], ARRAY['monthly'], TRUE,
  'Limited promotional window: Business plan at ₹699/month', 5, now() + interval '45 days'
)
ON CONFLICT (code) DO NOTHING;
