-- ==============================================================================
-- Migration 000: VISTAAR Core Multi-Tenant Baseline Schema Snapshot
-- Target: Staging Database (vlbhxcajphyjkeueubud)
--
-- Provisions core prerequisite baseline entities required by Super Admin migrations:
-- 1. Custom Types: employee_status, user_role, invoice_status
-- 2. Organizations & Multi-Branch Workspaces (001, 058)
-- 3. Profiles & Workspace Memberships (001, 051, 058)
-- 4. Invoices (001)
-- 5. Canonical Subscription Plans & Workspace Subscriptions (070)
-- 6. Subscription Addons & Payment Transactions (070)
-- ==============================================================================

BEGIN;

-- 1. Schema Privilege Hardening (Explicit Least Privilege on public and extensions)
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE CREATE ON SCHEMA public FROM anon;
        GRANT USAGE ON SCHEMA public TO anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE CREATE ON SCHEMA public FROM authenticated;
        GRANT USAGE ON SCHEMA public TO authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        REVOKE CREATE ON SCHEMA public FROM service_role;
        GRANT USAGE ON SCHEMA public TO service_role;
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
        REVOKE CREATE ON SCHEMA extensions FROM PUBLIC;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            REVOKE CREATE ON SCHEMA extensions FROM anon;
            GRANT USAGE ON SCHEMA extensions TO anon;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
            REVOKE CREATE ON SCHEMA extensions FROM authenticated;
            GRANT USAGE ON SCHEMA extensions TO authenticated;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            REVOKE CREATE ON SCHEMA extensions FROM service_role;
            GRANT USAGE ON SCHEMA extensions TO service_role;
        END IF;
    END IF;
END $$;

-- 2. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 3. Custom Types & Enums
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_status') THEN
        CREATE TYPE public.employee_status AS ENUM ('Pending', 'Active', 'Inactive', 'Suspended');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('owner', 'admin', 'manager', 'employee', 'staff');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
        CREATE TYPE public.invoice_status AS ENUM ('Draft', 'Issued', 'Partially Paid', 'Paid', 'Cancelled');
    END IF;
END $$;

-- 3. Organizations Entity (Migration 058)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations(owner_user_id);

-- 4. Workspaces Entity (Migrations 001 & 058)
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    owner_email VARCHAR(255) NOT NULL UNIQUE,
    owner_phone VARCHAR(50) NOT NULL,
    branch_name VARCHAR(255),
    branch_code VARCHAR(50),
    is_main_branch BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    branch_password_hash TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workspaces_organization ON public.workspaces(organization_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_active ON public.workspaces(is_active);

-- 5. Profiles Entity (Migrations 001 & 051)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    employee_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    department VARCHAR(100),
    designation VARCHAR(100),
    role public.user_role NOT NULL DEFAULT 'employee',
    status public.employee_status NOT NULL DEFAULT 'Active',
    avatar_url TEXT,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT unique_workspace_employee_id UNIQUE (workspace_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_profiles_workspace ON public.profiles(workspace_id, status);

-- 6. Workspace Memberships Entity (Migration 058)
CREATE TABLE IF NOT EXISTS public.workspace_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'employee',
    status VARCHAR(50) NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_workspace UNIQUE (user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user ON public.workspace_memberships(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_ws ON public.workspace_memberships(workspace_id, status);

-- 7. Invoices Entity (Migration 001)
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) DEFAULT '',
    status public.invoice_status NOT NULL DEFAULT 'Issued',
    grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    balance_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_invoice_number UNIQUE (workspace_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_workspace ON public.invoices(workspace_id, status);

-- 8. Canonical Subscription Plans (Migration 070)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tagline TEXT,
    price_annual_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    price_monthly_inr NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    allowed_platforms TEXT[] NOT NULL DEFAULT ARRAY['web'],
    max_users INTEGER NOT NULL DEFAULT 1,
    max_branches INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Canonical Plan Definitions
INSERT INTO public.subscription_plans (id, name, tagline, price_annual_inr, price_monthly_inr, allowed_platforms, max_users, max_branches)
VALUES 
    ('free_trial', '14-Day Free Trial', 'Full access to Web, Windows Desktop, and Android', 0.00, 0.00, ARRAY['web', 'desktop', 'android'], 2, 1),
    ('starter', 'Starter', 'Cloud Web business management for single-terminal retail', 2499.00, 299.00, ARRAY['web'], 1, 1),
    ('starter_mobile', 'Starter + Mobile Add-on', 'Web counter plus native Android APK for floor staff', 4498.00, 498.00, ARRAY['web', 'android'], 2, 1),
    ('business', 'Business', 'High-throughput Windows Desktop software & multi-branch control', 5999.00, 699.00, ARRAY['web', 'desktop'], 5, 3),
    ('growth', 'Growth', 'Enterprise all-platform operating system for retail chains', 9999.00, 1199.00, ARRAY['web', 'desktop', 'android'], 0, 0)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    tagline = EXCLUDED.tagline,
    price_annual_inr = EXCLUDED.price_annual_inr,
    price_monthly_inr = EXCLUDED.price_monthly_inr,
    allowed_platforms = EXCLUDED.allowed_platforms,
    max_users = EXCLUDED.max_users,
    max_branches = EXCLUDED.max_branches;

-- 9. Workspace Subscriptions Entity (Migration 070)
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

-- 10. Subscription Add-ons Entity (Migration 070)
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

-- 11. Payment Transactions Entity (Migration 070)
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

-- -----------------------------------------------------------------------------
-- 12. Row-Level Security (RLS) Parity (Migrations 001, 058, 070)
-- -----------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- Plans are publicly readable by everyone (Migration 070)
DROP POLICY IF EXISTS "Public plans viewable by everyone" ON public.subscription_plans;
CREATE POLICY "Public plans viewable by everyone" ON public.subscription_plans
    FOR SELECT USING (true);

-- -----------------------------------------------------------------------------
-- 13. Explicit Table-Level Privilege Lockdown (Finding 1)
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE 
    public.organizations,
    public.workspaces,
    public.profiles,
    public.workspace_memberships,
    public.invoices,
    public.subscription_plans,
    public.workspace_subscriptions,
    public.subscription_addons,
    public.payment_transactions
FROM PUBLIC;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE 
            public.organizations,
            public.workspaces,
            public.profiles,
            public.workspace_memberships,
            public.invoices,
            public.subscription_plans,
            public.workspace_subscriptions,
            public.subscription_addons,
            public.payment_transactions
        FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE 
            public.organizations,
            public.workspaces,
            public.profiles,
            public.workspace_memberships,
            public.invoices,
            public.subscription_plans,
            public.workspace_subscriptions,
            public.subscription_addons,
            public.payment_transactions
        FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        -- 1. Sensitive Configuration Catalog: SELECT ONLY (all mutations denied)
        GRANT SELECT ON TABLE public.subscription_plans TO service_role;
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.subscription_plans FROM service_role;

        -- 2. Core Tenant Lifecycle Entities: SELECT, INSERT, UPDATE, DELETE
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
            public.organizations,
            public.workspaces,
            public.profiles,
            public.workspace_memberships,
            public.subscription_addons
        TO service_role;
        REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE 
            public.organizations,
            public.workspaces,
            public.profiles,
            public.workspace_memberships,
            public.subscription_addons
        FROM service_role;

        -- 3. Financial & Subscription Ledgers: SELECT, INSERT, UPDATE (DELETE strictly denied)
        GRANT SELECT, INSERT, UPDATE ON TABLE 
            public.invoices,
            public.workspace_subscriptions,
            public.payment_transactions
        TO service_role;
        REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE 
            public.invoices,
            public.workspace_subscriptions,
            public.payment_transactions
        FROM service_role;

        -- Sequence privileges for any identity/sequence-backed columns
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
    END IF;
END $$;

-- Preserve only explicitly intended public access: SELECT on subscription_plans
GRANT SELECT ON TABLE public.subscription_plans TO PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        GRANT SELECT ON TABLE public.subscription_plans TO anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON TABLE public.subscription_plans TO authenticated;
    END IF;
END $$;

COMMIT;

