-- =============================================================================
-- VISTAAR BUSINESS OS — MIGRATION 058
-- File: 058_organization_branch_architecture.sql
-- Description: Multi-Branch & Multi-Tenant Organization Architecture Fix
--              1. Organizations Entity (public.organizations)
--              2. Extend Workspaces as Branch Tenants (organization_id, branch_name, branch_code, is_main_branch, is_active)
--              3. Secure Branch Membership (public.workspace_memberships)
--              4. Row-Level Security & Helper Functions (current_user_organization_id, user_has_workspace_access)
--              5. Secure Organization Analytics RPC (get_organization_analytics)
--              6. Safe, Idempotent Historical Migration of Existing Workspaces & Branches
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. ORGANIZATIONS ENTITY (public.organizations)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    owner_user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations(owner_user_id);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. EXTEND WORKSPACES AS BRANCH TENANTS
-- -----------------------------------------------------------------------------
ALTER TABLE public.workspaces
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS branch_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS branch_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS is_main_branch BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS branch_password_hash TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_workspaces_organization_id ON public.workspaces(organization_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_org_active ON public.workspaces(organization_id, is_active);

-- -----------------------------------------------------------------------------
-- 3. SECURE WORKSPACE / BRANCH MEMBERSHIPS (public.workspace_memberships)
-- -----------------------------------------------------------------------------
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

ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 4. SAFE HISTORICAL MIGRATION OF EXISTING WORKSPACES
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    r_ws RECORD;
    v_org_id UUID;
    v_owner_id UUID;
    r_prof RECORD;
    r_br RECORD;
    v_new_branch_ws_id UUID;
BEGIN
    -- 4A. For each workspace without organization_id, provision its organization
    FOR r_ws IN SELECT * FROM public.workspaces WHERE organization_id IS NULL LOOP
        -- Resolve owner from profiles
        SELECT id INTO v_owner_id
        FROM public.profiles
        WHERE workspace_id = r_ws.id AND LOWER(TRIM(role::text)) = 'owner'
        LIMIT 1;

        IF v_owner_id IS NULL THEN
            SELECT id INTO v_owner_id FROM public.profiles WHERE workspace_id = r_ws.id LIMIT 1;
        END IF;

        -- Create organization for existing workspace
        INSERT INTO public.organizations (name, owner_user_id, created_at, updated_at)
        VALUES (
            COALESCE(NULLIF(TRIM(r_ws.company_name), ''), 'My Organization'),
            v_owner_id,
            COALESCE(r_ws.created_at, NOW()),
            NOW()
        )
        RETURNING id INTO v_org_id;

        -- Update existing workspace to be the Main Branch
        UPDATE public.workspaces
        SET organization_id = v_org_id,
            branch_name = COALESCE(NULLIF(TRIM(r_ws.company_name), ''), 'Main Branch'),
            branch_code = 'MAIN',
            is_main_branch = TRUE,
            is_active = TRUE
        WHERE id = r_ws.id;
    END LOOP;

    -- 4B. Migrate all profile users into workspace_memberships
    FOR r_prof IN SELECT id, workspace_id, role, status FROM public.profiles WHERE workspace_id IS NOT NULL LOOP
        INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status, created_at)
        VALUES (
            r_prof.workspace_id,
            r_prof.id,
            COALESCE(LOWER(TRIM(r_prof.role::text)), 'employee'),
            COALESCE(r_prof.status::text, 'Active'),
            NOW()
        )
        ON CONFLICT (user_id, workspace_id) DO NOTHING;
    END LOOP;

    -- 4C. If public.branches table exists with secondary branches, ensure corresponding branch workspaces exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'branches') THEN
        FOR r_br IN
            SELECT b.*, w.organization_id AS org_id
            FROM public.branches b
            JOIN public.workspaces w ON b.workspace_id = w.id
            WHERE b.is_main_branch = FALSE
        LOOP
            -- Check if a workspace for this secondary branch already exists
            IF NOT EXISTS (
                SELECT 1 FROM public.workspaces
                WHERE organization_id = r_br.org_id
                  AND (UPPER(TRIM(branch_code)) = UPPER(TRIM(r_br.branch_code)) OR id = r_br.id)
            ) THEN
                INSERT INTO public.workspaces (
                    id,
                    organization_id,
                    company_name,
                    branch_name,
                    branch_code,
                    owner_name,
                    owner_email,
                    owner_phone,
                    is_main_branch,
                    is_active,
                    branch_password_hash,
                    created_at,
                    updated_at
                ) VALUES (
                    r_br.id,
                    r_br.org_id,
                    r_br.branch_name,
                    r_br.branch_name,
                    r_br.branch_code,
                    COALESCE(r_br.branch_name, 'Branch Manager'),
                    COALESCE(r_br.email, 'branch_' || LOWER(r_br.branch_code) || '@vistaar.in'),
                    COALESCE(r_br.phone, '9999999999'),
                    FALSE,
                    (r_br.status = 'Active'),
                    r_br.branch_password_hash,
                    r_br.created_at,
                    r_br.updated_at
                )
                ON CONFLICT (id) DO UPDATE
                SET organization_id = EXCLUDED.organization_id,
                    branch_name = EXCLUDED.branch_name,
                    branch_code = EXCLUDED.branch_code,
                    is_main_branch = FALSE,
                    is_active = EXCLUDED.is_active,
                    branch_password_hash = COALESCE(workspaces.branch_password_hash, EXCLUDED.branch_password_hash);
            END IF;
        END LOOP;

        -- Migrate user_branch_access into workspace_memberships
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_branch_access') THEN
            INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status, created_at)
            SELECT uba.branch_id, uba.user_id, 'employee', 'Active', uba.created_at
            FROM public.user_branch_access uba
            JOIN public.workspaces w ON uba.branch_id = w.id
            ON CONFLICT (user_id, workspace_id) DO NOTHING;
        END IF;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. SECURE RLS HELPER FUNCTIONS
-- -----------------------------------------------------------------------------

-- 5A. CURRENT USER ORGANIZATION ID
CREATE OR REPLACE FUNCTION public.current_user_organization_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id UUID;
    v_ws_id UUID;
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- 1. Check if user owns an organization directly
    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE owner_user_id = v_user_id
    LIMIT 1;

    IF v_org_id IS NOT NULL THEN
        RETURN v_org_id;
    END IF;

    -- 2. Lookup via user's current profile workspace
    SELECT w.organization_id INTO v_org_id
    FROM public.profiles p
    JOIN public.workspaces w ON p.workspace_id = w.id
    WHERE p.id = v_user_id
    LIMIT 1;

    IF v_org_id IS NOT NULL THEN
        RETURN v_org_id;
    END IF;

    -- 3. Lookup via workspace_memberships
    SELECT w.organization_id INTO v_org_id
    FROM public.workspace_memberships wm
    JOIN public.workspaces w ON wm.workspace_id = w.id
    WHERE wm.user_id = v_user_id AND wm.status = 'Active'
    LIMIT 1;

    RETURN v_org_id;
END;
$$;

-- 5B. USER HAS WORKSPACE ACCESS
CREATE OR REPLACE FUNCTION public.user_has_workspace_access(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_org_id UUID;
    v_user_role TEXT;
BEGIN
    IF v_user_id IS NULL OR p_workspace_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 1. Check if user is in profiles with this workspace
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND workspace_id = p_workspace_id) THEN
        RETURN TRUE;
    END IF;

    -- 2. Check active membership in workspace_memberships
    IF EXISTS (SELECT 1 FROM public.workspace_memberships WHERE user_id = v_user_id AND workspace_id = p_workspace_id AND status = 'Active') THEN
        RETURN TRUE;
    END IF;

    -- 3. Check if user is Organization Owner/Admin
    SELECT organization_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id;
    IF v_org_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org_id AND owner_user_id = v_user_id) THEN
            RETURN TRUE;
        END IF;

        -- Check if user has Owner/Admin role in any workspace of this organization
        SELECT role INTO v_user_role
        FROM public.profiles
        WHERE id = v_user_id;

        IF LOWER(TRIM(COALESCE(v_user_role, ''))) IN ('owner', 'admin') THEN
            IF EXISTS (
                SELECT 1 FROM public.profiles p
                JOIN public.workspaces w ON p.workspace_id = w.id
                WHERE p.id = v_user_id AND w.organization_id = v_org_id
            ) THEN
                RETURN TRUE;
            END IF;
        END IF;
    END IF;

    -- 4. Check user_branch_access table if exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_branch_access') THEN
        IF EXISTS (SELECT 1 FROM public.user_branch_access WHERE user_id = v_user_id AND branch_id = p_workspace_id) THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RLS POLICIES FOR ORGANIZATIONS & WORKSPACE MEMBERSHIPS
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS organizations_select_policy ON public.organizations;
CREATE POLICY organizations_select_policy ON public.organizations
    FOR SELECT USING (
        owner_user_id = auth.uid() OR
        id = public.current_user_organization_id() OR
        EXISTS (
            SELECT 1 FROM public.workspaces w
            JOIN public.workspace_memberships wm ON w.id = wm.workspace_id
            WHERE w.organization_id = public.organizations.id AND wm.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS organizations_all_owner_policy ON public.organizations;
CREATE POLICY organizations_all_owner_policy ON public.organizations
    FOR ALL USING (
        owner_user_id = auth.uid()
    );

DROP POLICY IF EXISTS workspace_memberships_select_policy ON public.workspace_memberships;
CREATE POLICY workspace_memberships_select_policy ON public.workspace_memberships
    FOR SELECT USING (
        user_id = auth.uid() OR
        public.user_has_workspace_access(workspace_id)
    );

DROP POLICY IF EXISTS workspace_memberships_admin_policy ON public.workspace_memberships;
CREATE POLICY workspace_memberships_admin_policy ON public.workspace_memberships
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.workspaces w
            JOIN public.organizations o ON w.organization_id = o.id
            WHERE w.id = public.workspace_memberships.workspace_id
              AND o.owner_user_id = auth.uid()
        )
    );

-- Enable RLS on workspaces if not enabled, and add policy
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspaces_access_policy ON public.workspaces;
CREATE POLICY workspaces_access_policy ON public.workspaces
    FOR SELECT USING (
        public.user_has_workspace_access(id) OR
        organization_id = public.current_user_organization_id()
    );

-- -----------------------------------------------------------------------------
-- 7. SECURE ORGANIZATION ANALYTICS RPC (All Branches Analysis)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organization_analytics(
    p_organization_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_authorized BOOLEAN := FALSE;
    v_org_name TEXT;
    v_metrics RECORD;
    v_branch_perf JSONB;
    v_sales_trend JSONB;
    v_sales_by_branch JSONB;
    v_collections_by_branch JSONB;
    v_outstanding_by_branch JSONB;
    v_workspaces UUID[];
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not authenticated.';
    END IF;

    -- Verify caller authorization for this organization
    SELECT name INTO v_org_name
    FROM public.organizations
    WHERE id = p_organization_id;

    IF v_org_name IS NULL THEN
        RAISE EXCEPTION 'Organization not found.';
    END IF;

    -- Authorization check: owner or member of this organization
    IF EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id AND owner_user_id = v_user_id) THEN
        v_is_authorized := TRUE;
    ELSIF EXISTS (
        SELECT 1 FROM public.workspaces w
        JOIN public.workspace_memberships wm ON w.id = wm.workspace_id
        WHERE w.organization_id = p_organization_id AND wm.user_id = v_user_id AND wm.status = 'Active'
    ) THEN
        v_is_authorized := TRUE;
    ELSIF EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.workspaces w ON p.workspace_id = w.id
        WHERE p.id = v_user_id AND w.organization_id = p_organization_id
    ) THEN
        v_is_authorized := TRUE;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Permission denied: Caller does not have access to organization %', p_organization_id;
    END IF;

    -- Collect all active workspaces for this organization
    SELECT ARRAY_AGG(id) INTO v_workspaces
    FROM public.workspaces
    WHERE organization_id = p_organization_id AND is_active = TRUE;

    IF v_workspaces IS NULL OR ARRAY_LENGTH(v_workspaces, 1) = 0 THEN
        RETURN jsonb_build_object(
            'organization_id', p_organization_id,
            'organization_name', v_org_name,
            'start_date', p_start_date,
            'end_date', p_end_date,
            'total_sales', 0,
            'invoice_sales', 0,
            'counter_sales', 0,
            'collections', 0,
            'cash_collections', 0,
            'upi_collections', 0,
            'gross_profit', 0,
            'outstanding_udhari', 0,
            'total_transactions', 0,
            'total_discounts', 0,
            'total_invoices', 0,
            'total_counter_sales', 0,
            'branch_performance', '[]'::jsonb,
            'sales_trend', '[]'::jsonb,
            'sales_by_branch', '[]'::jsonb,
            'collections_by_branch', '[]'::jsonb,
            'outstanding_by_branch', '[]'::jsonb
        );
    END IF;

    -- 1. OVERALL AGGREGATED METRICS
    WITH
    inv_agg AS (
        SELECT
            COALESCE(SUM(grand_total), 0) AS total_inv,
            COALESCE(SUM(paid_amount), 0) AS inv_collections,
            COALESCE(COUNT(*), 0) AS inv_count
        FROM public.invoices
        WHERE workspace_id = ANY(v_workspaces)
          AND status IN ('Issued', 'Partially Paid', 'Paid', 'issued', 'partially paid', 'paid')
          AND date >= p_start_date AND date <= p_end_date
    ),
    cs_agg AS (
        SELECT
            COALESCE(SUM(final_total), 0) AS total_cs,
            COALESCE(SUM(amount_received), 0) AS cs_collections,
            COALESCE(SUM(CASE WHEN LOWER(payment_method) LIKE '%cash%' THEN amount_received ELSE 0 END), 0) AS cs_cash,
            COALESCE(SUM(CASE WHEN LOWER(payment_method) LIKE '%upi%' OR LOWER(payment_method) LIKE '%bank%' OR LOWER(payment_method) LIKE '%card%' THEN amount_received ELSE 0 END), 0) AS cs_upi,
            COALESCE(SUM(discount_amount), 0) AS cs_discount,
            COALESCE(COUNT(*), 0) AS cs_count
        FROM public.counter_sales
        WHERE workspace_id = ANY(v_workspaces)
          AND status = 'COMPLETED'
          AND sale_date >= p_start_date AND sale_date <= p_end_date
    ),
    pay_agg AS (
        SELECT
            COALESCE(SUM(amount), 0) AS total_pay,
            COALESCE(SUM(COALESCE(cash_amount, CASE WHEN LOWER(payment_method) LIKE '%cash%' THEN amount ELSE 0 END)), 0) AS pay_cash,
            COALESCE(SUM(COALESCE(upi_amount, CASE WHEN LOWER(payment_method) NOT LIKE '%cash%' THEN amount ELSE 0 END)), 0) AS pay_upi
        FROM public.payments
        WHERE workspace_id = ANY(v_workspaces)
          AND payment_date >= p_start_date AND payment_date <= p_end_date
          AND counter_sale_id IS NULL -- Exclude counter sale duplicate payments
    ),
    udh_agg AS (
        SELECT
            COALESCE(SUM(balance_amount), 0) AS total_outstanding
        FROM public.invoices
        WHERE workspace_id = ANY(v_workspaces)
          AND status IN ('Issued', 'Partially Paid', 'issued', 'partially paid')
          AND balance_amount > 0
    )
    SELECT
        ROUND((inv.total_inv + cs.total_cs)::numeric, 2) AS total_sales,
        ROUND(inv.total_inv::numeric, 2) AS invoice_sales,
        ROUND(cs.total_cs::numeric, 2) AS counter_sales,
        ROUND((cs.cs_collections + pay.total_pay)::numeric, 2) AS collections,
        ROUND((cs.cs_cash + pay.pay_cash)::numeric, 2) AS cash_collections,
        ROUND((cs.cs_upi + pay.pay_upi)::numeric, 2) AS upi_collections,
        ROUND(((inv.total_inv + cs.total_cs) * 0.28)::numeric, 2) AS gross_profit, -- baseline margin estimate
        ROUND(u.total_outstanding::numeric, 2) AS outstanding_udhari,
        (inv.inv_count + cs.cs_count) AS total_transactions,
        ROUND(cs.cs_discount::numeric, 2) AS total_discounts,
        inv.inv_count AS total_invoices,
        cs.cs_count AS total_counter_sales
    INTO v_metrics
    FROM inv_agg inv, cs_agg cs, pay_agg pay, udh_agg u;

    -- 2. BRANCH PERFORMANCE BREAKDOWN
    SELECT COALESCE(JSONB_AGG(row_to_json(bp)), '[]'::jsonb)
    INTO v_branch_perf
    FROM (
        SELECT
            w.id AS workspace_id,
            COALESCE(w.branch_name, w.company_name, 'Branch') AS branch_name,
            COALESCE(w.branch_code, 'BR') AS branch_code,
            w.is_main_branch,
            ROUND((COALESCE(inv_b.sales, 0) + COALESCE(cs_b.sales, 0))::numeric, 2) AS sales,
            ROUND(COALESCE(inv_b.sales, 0)::numeric, 2) AS invoice_sales,
            ROUND(COALESCE(cs_b.sales, 0)::numeric, 2) AS pos_sales,
            ROUND((COALESCE(cs_b.collected, 0) + COALESCE(pay_b.collected, 0))::numeric, 2) AS collections,
            ROUND(((COALESCE(inv_b.sales, 0) + COALESCE(cs_b.sales, 0)) * 0.28)::numeric, 2) AS gross_profit,
            ROUND(COALESCE(udh_b.outstanding, 0)::numeric, 2) AS outstanding_udhari,
            (COALESCE(inv_b.cnt, 0) + COALESCE(cs_b.cnt, 0)) AS transactions,
            COALESCE(inv_b.cnt, 0) AS invoice_count,
            COALESCE(cs_b.cnt, 0) AS counter_sale_count
        FROM public.workspaces w
        LEFT JOIN (
            SELECT workspace_id, SUM(grand_total) AS sales, COUNT(*) AS cnt
            FROM public.invoices
            WHERE status IN ('Issued', 'Partially Paid', 'Paid', 'issued', 'partially paid', 'paid')
              AND date >= p_start_date AND date <= p_end_date
            GROUP BY workspace_id
        ) inv_b ON w.id = inv_b.workspace_id
        LEFT JOIN (
            SELECT workspace_id, SUM(final_total) AS sales, SUM(amount_received) AS collected, COUNT(*) AS cnt
            FROM public.counter_sales
            WHERE status = 'COMPLETED'
              AND sale_date >= p_start_date AND sale_date <= p_end_date
            GROUP BY workspace_id
        ) cs_b ON w.id = cs_b.workspace_id
        LEFT JOIN (
            SELECT workspace_id, SUM(amount) AS collected
            FROM public.payments
            WHERE payment_date >= p_start_date AND payment_date <= p_end_date
              AND counter_sale_id IS NULL
            GROUP BY workspace_id
        ) pay_b ON w.id = pay_b.workspace_id
        LEFT JOIN (
            SELECT workspace_id, SUM(balance_amount) AS outstanding
            FROM public.invoices
            WHERE status IN ('Issued', 'Partially Paid', 'issued', 'partially paid')
              AND balance_amount > 0
            GROUP BY workspace_id
        ) udh_b ON w.id = udh_b.workspace_id
        WHERE w.organization_id = p_organization_id AND w.is_active = TRUE
        ORDER BY (COALESCE(inv_b.sales, 0) + COALESCE(cs_b.sales, 0)) DESC
    ) bp;

    -- 3. SALES TREND (DAILY)
    SELECT COALESCE(JSONB_AGG(row_to_json(st)), '[]'::jsonb)
    INTO v_sales_trend
    FROM (
        SELECT
            d::date AS date,
            TO_CHAR(d, 'DD Mon') AS label,
            ROUND((COALESCE(i_day.sales, 0) + COALESCE(cs_day.sales, 0))::numeric, 2) AS sales,
            ROUND(COALESCE(i_day.sales, 0)::numeric, 2) AS invoice_sales,
            ROUND(COALESCE(cs_day.sales, 0)::numeric, 2) AS counter_sales,
            (COALESCE(i_day.cnt, 0) + COALESCE(cs_day.cnt, 0)) AS transactions
        FROM GENERATE_SERIES(p_start_date, p_end_date, '1 day'::interval) d
        LEFT JOIN (
            SELECT date AS dt, SUM(grand_total) AS sales, COUNT(*) AS cnt
            FROM public.invoices
            WHERE workspace_id = ANY(v_workspaces)
              AND status IN ('Issued', 'Partially Paid', 'Paid', 'issued', 'partially paid', 'paid')
            GROUP BY date
        ) i_day ON d::date = i_day.dt
        LEFT JOIN (
            SELECT sale_date AS dt, SUM(final_total) AS sales, COUNT(*) AS cnt
            FROM public.counter_sales
            WHERE workspace_id = ANY(v_workspaces)
              AND status = 'COMPLETED'
            GROUP BY sale_date
        ) cs_day ON d::date = cs_day.dt
        ORDER BY d ASC
    ) st;

    -- 4. VISUALIZATION ARRAYS
    SELECT COALESCE(JSONB_AGG(row_to_json(sb)), '[]'::jsonb)
    INTO v_sales_by_branch
    FROM (
        SELECT
            COALESCE(w.branch_name, w.company_name, 'Branch') AS branch_name,
            COALESCE(w.branch_code, 'BR') AS branch_code,
            ROUND((COALESCE(inv_b.sales, 0) + COALESCE(cs_b.sales, 0))::numeric, 2) AS amount
        FROM public.workspaces w
        LEFT JOIN (
            SELECT workspace_id, SUM(grand_total) AS sales
            FROM public.invoices
            WHERE status IN ('Issued', 'Partially Paid', 'Paid', 'issued', 'partially paid', 'paid')
              AND date >= p_start_date AND date <= p_end_date
            GROUP BY workspace_id
        ) inv_b ON w.id = inv_b.workspace_id
        LEFT JOIN (
            SELECT workspace_id, SUM(final_total) AS sales
            FROM public.counter_sales
            WHERE status = 'COMPLETED'
              AND sale_date >= p_start_date AND sale_date <= p_end_date
            GROUP BY workspace_id
        ) cs_b ON w.id = cs_b.workspace_id
        WHERE w.organization_id = p_organization_id AND w.is_active = TRUE
        ORDER BY (COALESCE(inv_b.sales, 0) + COALESCE(cs_b.sales, 0)) DESC
    ) sb;

    SELECT COALESCE(JSONB_AGG(row_to_json(cb)), '[]'::jsonb)
    INTO v_collections_by_branch
    FROM (
        SELECT
            COALESCE(w.branch_name, w.company_name, 'Branch') AS branch_name,
            COALESCE(w.branch_code, 'BR') AS branch_code,
            ROUND((COALESCE(cs_b.collected, 0) + COALESCE(pay_b.collected, 0))::numeric, 2) AS amount
        FROM public.workspaces w
        LEFT JOIN (
            SELECT workspace_id, SUM(amount_received) AS collected
            FROM public.counter_sales
            WHERE status = 'COMPLETED'
              AND sale_date >= p_start_date AND sale_date <= p_end_date
            GROUP BY workspace_id
        ) cs_b ON w.id = cs_b.workspace_id
        LEFT JOIN (
            SELECT workspace_id, SUM(amount) AS collected
            FROM public.payments
            WHERE payment_date >= p_start_date AND payment_date <= p_end_date
              AND counter_sale_id IS NULL
            GROUP BY workspace_id
        ) pay_b ON w.id = pay_b.workspace_id
        WHERE w.organization_id = p_organization_id AND w.is_active = TRUE
        ORDER BY (COALESCE(cs_b.collected, 0) + COALESCE(pay_b.collected, 0)) DESC
    ) cb;

    SELECT COALESCE(JSONB_AGG(row_to_json(ob)), '[]'::jsonb)
    INTO v_outstanding_by_branch
    FROM (
        SELECT
            COALESCE(w.branch_name, w.company_name, 'Branch') AS branch_name,
            COALESCE(w.branch_code, 'BR') AS branch_code,
            ROUND(COALESCE(udh_b.outstanding, 0)::numeric, 2) AS amount
        FROM public.workspaces w
        LEFT JOIN (
            SELECT workspace_id, SUM(balance_amount) AS outstanding
            FROM public.invoices
            WHERE status IN ('Issued', 'Partially Paid', 'issued', 'partially paid')
              AND balance_amount > 0
            GROUP BY workspace_id
        ) udh_b ON w.id = udh_b.workspace_id
        WHERE w.organization_id = p_organization_id AND w.is_active = TRUE
        ORDER BY COALESCE(udh_b.outstanding, 0) DESC
    ) ob;

    RETURN jsonb_build_object(
        'organization_id', p_organization_id,
        'organization_name', v_org_name,
        'start_date', p_start_date,
        'end_date', p_end_date,
        'total_sales', COALESCE(v_metrics.total_sales, 0),
        'invoice_sales', COALESCE(v_metrics.invoice_sales, 0),
        'counter_sales', COALESCE(v_metrics.counter_sales, 0),
        'collections', COALESCE(v_metrics.collections, 0),
        'cash_collections', COALESCE(v_metrics.cash_collections, 0),
        'upi_collections', COALESCE(v_metrics.upi_collections, 0),
        'gross_profit', COALESCE(v_metrics.gross_profit, 0),
        'outstanding_udhari', COALESCE(v_metrics.outstanding_udhari, 0),
        'total_transactions', COALESCE(v_metrics.total_transactions, 0),
        'total_discounts', COALESCE(v_metrics.total_discounts, 0),
        'total_invoices', COALESCE(v_metrics.total_invoices, 0),
        'total_counter_sales', COALESCE(v_metrics.total_counter_sales, 0),
        'branch_performance', v_branch_perf,
        'sales_trend', v_sales_trend,
        'sales_by_branch', v_sales_by_branch,
        'collections_by_branch', v_collections_by_branch,
        'outstanding_by_branch', v_outstanding_by_branch
    );
END;
$$;

COMMIT;
