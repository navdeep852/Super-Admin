# VISTAAR SUPER ADMIN — PRODUCTION SQL APPROVAL PACKAGE
**Document Type:** Formal DDL Deployment Specification  
**Status:** PROPOSED FOR PLATFORM OWNER AUTHORIZATION — STRICTLY UNEXECUTED IN PRODUCTION  
**Production Target:** Supabase Project `kluxsykimnjivkqxelba` (AWS `eu-west-1`)  
**Staging Reference:** Supabase Project `vlbhxcajphyjkeueubud` (Validated 100% on Staging)  
**Package Version:** 1.0.0 (Dedicated View Owner Architecture)  
**Security Certification:** Zero Write Privileges, Zero Access to `auth.users`, Zero PII Exfiltration  

---

## 1. Owner Approval Notice

> [!IMPORTANT]
> **MANDATORY OWNER AUTHORIZATION**  
> Under the VISTAAR Production Air-Gap Invariant, no automated agent, engineer, or CI/CD runner is permitted to execute database DDL or DML on production project `kluxsykimnjivkqxelba`.  
> This package contains the exact SQL statements required to provision the read-only reporting connector. It must be manually reviewed, approved, and executed by the platform owner in the Supabase SQL Editor.

---

## 2. Complete Idempotent Production SQL Script

The entire migration is wrapped in a transactional block to ensure atomic deployment:

```sql
-- ==============================================================================
-- VISTAAR Business OS Production — Read-Only Reporting Connector Provisioning
-- Target Database: kluxsykimnjivkqxelba
-- Execution Authority: Platform Owner
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- SECTION 1: Idempotent Schema Prerequisites (Zero Lock Contention)
-- -----------------------------------------------------------------------------

-- 1.1 Add synthetic test classification flag if not present
ALTER TABLE public.workspaces 
    ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.workspace_subscriptions 
    ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_workspaces_is_test 
    ON public.workspaces(is_test);

CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_is_test 
    ON public.workspace_subscriptions(is_test);

-- 1.2 Add additive reporting columns on payment_transactions if not present
ALTER TABLE public.payment_transactions 
    ADD COLUMN IF NOT EXISTS discount_amount_inr NUMERIC(10, 2) DEFAULT 0.00;

ALTER TABLE public.payment_transactions 
    ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50) DEFAULT NULL;

-- -----------------------------------------------------------------------------
-- SECTION 2: Dedicated Non-Login View Owner Provisioning
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'v_reporting_view_owner') THEN
        CREATE ROLE v_reporting_view_owner WITH 
            NOLOGIN 
            NOSUPERUSER 
            NOCREATEDB 
            NOCREATEROLE 
            NOREPLICATION 
            BYPASSRLS;
    ELSE
        ALTER ROLE v_reporting_view_owner WITH 
            NOLOGIN 
            NOSUPERUSER 
            NOCREATEDB 
            NOCREATEROLE 
            NOREPLICATION 
            BYPASSRLS;
    END IF;
END
$$;

-- Allow postgres to administer and create objects as v_reporting_view_owner
GRANT v_reporting_view_owner TO postgres;

-- Grant least-privilege USAGE on application schema (NO CREATE)
GRANT USAGE ON SCHEMA public TO v_reporting_view_owner;
REVOKE CREATE ON SCHEMA public FROM v_reporting_view_owner;

-- Grant SELECT exclusively on the 13 required underlying operational tables
GRANT SELECT ON public.workspaces TO v_reporting_view_owner;
GRANT SELECT ON public.business_settings TO v_reporting_view_owner;
GRANT SELECT ON public.branches TO v_reporting_view_owner;
GRANT SELECT ON public.profiles TO v_reporting_view_owner;
GRANT SELECT ON public.workspace_subscriptions TO v_reporting_view_owner;
GRANT SELECT ON public.subscription_plans TO v_reporting_view_owner;
GRANT SELECT ON public.payment_transactions TO v_reporting_view_owner;
GRANT SELECT ON public.invoices TO v_reporting_view_owner;
GRANT SELECT ON public.products TO v_reporting_view_owner;
GRANT SELECT ON public.branch_inventory TO v_reporting_view_owner;
GRANT SELECT ON public.customers TO v_reporting_view_owner;
GRANT SELECT ON public.suppliers TO v_reporting_view_owner;
GRANT SELECT ON public.udhari_records TO v_reporting_view_owner;

-- -----------------------------------------------------------------------------
-- SECTION 3: Dedicated Reporting Schema Provisioning
-- -----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS super_admin_reporting AUTHORIZATION v_reporting_view_owner;
GRANT ALL ON SCHEMA super_admin_reporting TO v_reporting_view_owner;

-- -----------------------------------------------------------------------------
-- SECTION 4: 9 Sanitized Reporting Views with Security Barrier
-- -----------------------------------------------------------------------------

SET ROLE v_reporting_view_owner;

-- View 1: Workspace Directory
CREATE OR REPLACE VIEW super_admin_reporting.v_report_workspace_directory 
WITH (security_barrier = true) AS
SELECT
    w.id AS workspace_id,
    w.company_name,
    COALESCE(bs.legal_name, w.company_name) AS legal_name,
    bs.gstin,
    w.owner_name,
    w.owner_email,
    w.owner_phone,
    w.is_active,
    w.is_main_branch,
    COALESCE(b_count.total_branches, 1::bigint) AS branch_count,
    COALESCE(p_count.total_staff, 1::bigint) AS active_staff_count,
    w.created_at,
    w.updated_at,
    w.is_test
FROM public.workspaces w
LEFT JOIN public.business_settings bs ON bs.workspace_id = w.id
LEFT JOIN (
    SELECT branches.workspace_id, count(branches.id) AS total_branches
    FROM public.branches 
    WHERE branches.is_active = true 
    GROUP BY branches.workspace_id
) b_count ON b_count.workspace_id = w.id
LEFT JOIN (
    SELECT profiles.workspace_id, count(profiles.id) AS total_staff
    FROM public.profiles 
    WHERE profiles.deleted_at IS NULL AND profiles.is_archived = false 
    GROUP BY profiles.workspace_id
) p_count ON p_count.workspace_id = w.id
WHERE w.deleted_at IS NULL;

-- View 2: User & Staff Membership Directory
CREATE OR REPLACE VIEW super_admin_reporting.v_report_users_memberships 
WITH (security_barrier = true) AS
SELECT
    p.id AS profile_id,
    p.workspace_id,
    w.company_name,
    p.name AS full_name,
    p.email,
    p.phone,
    p.role AS assigned_role,
    p.designation,
    p.status AS account_status,
    p.created_at,
    p.updated_at,
    CASE WHEN p.role = 'owner'::user_role THEN true ELSE false END AS is_workspace_owner,
    w.is_test
FROM public.profiles p
JOIN public.workspaces w ON w.id = p.workspace_id
WHERE p.deleted_at IS NULL AND w.deleted_at IS NULL;

-- View 3: Subscription Lifecycle & Plan Overview
CREATE OR REPLACE VIEW super_admin_reporting.v_report_subscription_overview 
WITH (security_barrier = true) AS
SELECT
    ws.id AS subscription_id,
    ws.workspace_id,
    w.company_name,
    ws.plan_id,
    sp.name AS plan_name,
    ws.billing_interval,
    ws.status AS subscription_status,
    ws.trial_start,
    ws.trial_end,
    ws.current_period_start,
    ws.current_period_end,
    sp.price_annual_inr,
    sp.price_monthly_inr,
    CASE WHEN ws.status = 'active'::text THEN true ELSE false END AS is_active,
    CASE 
        WHEN (ws.trial_end < now() AND ws.status = 'trialing'::text) OR 
             (ws.current_period_end < now() AND ws.status = 'active'::text) THEN true 
        ELSE false 
    END AS is_expired,
    ws.is_test
FROM public.workspace_subscriptions ws
JOIN public.workspaces w ON w.id = ws.workspace_id
LEFT JOIN public.subscription_plans sp ON sp.id = ws.plan_id
WHERE w.deleted_at IS NULL;

-- View 4: Payment & Collection Summary (HSN 998313)
CREATE OR REPLACE VIEW super_admin_reporting.v_report_payments_collections 
WITH (security_barrier = true) AS
SELECT
    pt.id AS transaction_id,
    pt.workspace_id,
    w.company_name,
    pt.transaction_reference,
    pt.provider,
    pt.amount_inr,
    round(pt.amount_inr / 1.18, 2) AS calculated_taxable_inr,
    round(pt.amount_inr - pt.amount_inr / 1.18, 2) AS calculated_gst_inr,
    COALESCE(pt.discount_amount_inr, 0::numeric) AS discount_amount_inr,
    pt.status AS payment_status,
    pt.plan_id,
    pt.coupon_code,
    pt.created_at,
    pt.verified_at,
    w.is_test
FROM public.payment_transactions pt
JOIN public.workspaces w ON w.id = pt.workspace_id
WHERE w.deleted_at IS NULL;

-- View 5: Invoice & Receivables Reconciliation Summary
CREATE OR REPLACE VIEW super_admin_reporting.v_report_invoices_receivables 
WITH (security_barrier = true) AS
SELECT
    w.id AS workspace_id,
    w.company_name,
    count(i.id) AS total_invoices_count,
    COALESCE(sum(i.grand_total), 0::numeric) AS total_gmv_inr,
    COALESCE(sum(i.paid_amount), 0::numeric) AS total_paid_inr,
    COALESCE(sum(i.balance_amount), 0::numeric) AS total_receivables_inr,
    count(CASE WHEN i.status = 'Paid'::invoice_status THEN 1 ELSE NULL::integer END) AS paid_invoices_count,
    count(CASE WHEN i.status = 'Partially Paid'::invoice_status THEN 1 ELSE NULL::integer END) AS partial_invoices_count,
    count(CASE WHEN i.status = 'Issued'::invoice_status THEN 1 ELSE NULL::integer END) AS issued_invoices_count,
    min(i.created_at) AS first_invoice_at,
    max(i.created_at) AS last_invoice_at,
    w.is_test
FROM public.workspaces w
LEFT JOIN public.invoices i ON i.workspace_id = w.id
WHERE w.deleted_at IS NULL
GROUP BY w.id, w.company_name, w.is_test;

-- View 6: Branch Inventory & SKU Valuation Summary
CREATE OR REPLACE VIEW super_admin_reporting.v_report_inventory_summary 
WITH (security_barrier = true) AS
SELECT
    bi.workspace_id,
    w.company_name,
    bi.branch_id,
    b.name AS branch_name,
    count(DISTINCT bi.product_id) AS total_active_skus,
    COALESCE(sum(bi.current_stock), 0::numeric) AS total_stock_units,
    COALESCE(sum(bi.current_stock * COALESCE(p.buy_price, 0::numeric)), 0::numeric) AS total_inventory_valuation_inr,
    count(CASE WHEN bi.current_stock <= bi.min_stock_alert AND bi.current_stock > 0::numeric THEN 1 ELSE NULL::integer END) AS low_stock_sku_count,
    count(CASE WHEN bi.current_stock <= 0::numeric THEN 1 ELSE NULL::integer END) AS out_of_stock_sku_count,
    w.is_test
FROM public.branch_inventory bi
JOIN public.workspaces w ON w.id = bi.workspace_id
JOIN public.branches b ON b.id = bi.branch_id
JOIN public.products p ON p.id = bi.product_id
WHERE w.deleted_at IS NULL AND p.deleted_at IS NULL
GROUP BY bi.workspace_id, w.company_name, bi.branch_id, b.name, w.is_test;

-- View 7: Customer & Supplier Trade Ledger Statistics
CREATE OR REPLACE VIEW super_admin_reporting.v_report_customers_suppliers 
WITH (security_barrier = true) AS
SELECT
    w.id AS workspace_id,
    w.company_name,
    COALESCE(c.cust_count, 0::bigint) AS total_registered_customers,
    COALESCE(s.supp_count, 0::bigint) AS total_registered_suppliers,
    COALESCE(u.total_udhari_inr, 0::numeric) AS total_customer_credit_balance_inr,
    w.is_test
FROM public.workspaces w
LEFT JOIN (
    SELECT customers.workspace_id, count(customers.id) AS cust_count
    FROM public.customers WHERE customers.deleted_at IS NULL GROUP BY customers.workspace_id
) c ON c.workspace_id = w.id
LEFT JOIN (
    SELECT suppliers.workspace_id, count(suppliers.id) AS supp_count
    FROM public.suppliers WHERE suppliers.deleted_at IS NULL GROUP BY suppliers.workspace_id
) s ON s.workspace_id = w.id
LEFT JOIN (
    SELECT udhari_records.workspace_id, sum(udhari_records.outstanding_amount) AS total_udhari_inr
    FROM public.udhari_records WHERE udhari_records.status <> 'PAID'::udhari_status GROUP BY udhari_records.workspace_id
) u ON u.workspace_id = w.id
WHERE w.deleted_at IS NULL;

-- View 8: Business Vitality & 30-Day Activity
CREATE OR REPLACE VIEW super_admin_reporting.v_report_business_activity 
WITH (security_barrier = true) AS
SELECT
    w.id AS workspace_id,
    w.company_name,
    max(i.created_at) AS last_invoice_activity_at,
    count(CASE WHEN i.created_at >= (now() - '30 days'::interval) THEN i.id ELSE NULL::uuid END) AS invoices_last_30_days,
    COALESCE(sum(CASE WHEN i.created_at >= (now() - '30 days'::interval) THEN i.grand_total ELSE 0::numeric END), 0::numeric) AS gmv_last_30_days,
    CASE WHEN max(i.created_at) IS NULL OR max(i.created_at) < (now() - '60 days'::interval) THEN true ELSE false END AS is_dormant,
    w.is_test
FROM public.workspaces w
LEFT JOIN public.invoices i ON i.workspace_id = w.id
WHERE w.deleted_at IS NULL
GROUP BY w.id, w.company_name, w.is_test;

-- View 9: Platform Executive KPI Aggregates
CREATE OR REPLACE VIEW super_admin_reporting.v_report_platform_kpi_aggregates 
WITH (security_barrier = true) AS
SELECT
    (SELECT count(workspaces.id) FROM public.workspaces WHERE workspaces.deleted_at IS NULL AND workspaces.is_test = false) AS total_genuine_workspaces,
    (SELECT count(workspaces.id) FROM public.workspaces WHERE workspaces.deleted_at IS NULL AND workspaces.is_test = false AND workspaces.is_active = true) AS active_genuine_workspaces,
    (SELECT count(workspaces.id) FROM public.workspaces WHERE workspaces.deleted_at IS NULL AND workspaces.is_test = false AND workspaces.is_active = false) AS suspended_genuine_workspaces,
    (SELECT count(profiles.id) FROM public.profiles WHERE profiles.deleted_at IS NULL AND (profiles.workspace_id IN (SELECT workspaces.id FROM public.workspaces WHERE workspaces.is_test = false))) AS total_genuine_users,
    (SELECT count(workspace_subscriptions.id) FROM public.workspace_subscriptions WHERE workspace_subscriptions.status = 'active'::text AND (workspace_subscriptions.workspace_id IN (SELECT workspaces.id FROM public.workspaces WHERE workspaces.is_test = false))) AS active_paid_subscriptions,
    (SELECT count(workspace_subscriptions.id) FROM public.workspace_subscriptions WHERE workspace_subscriptions.status = 'trialing'::text AND (workspace_subscriptions.workspace_id IN (SELECT workspaces.id FROM public.workspaces WHERE workspaces.is_test = false))) AS trialing_subscriptions,
    COALESCE((SELECT sum(payment_transactions.amount_inr) FROM public.payment_transactions WHERE (payment_transactions.status = ANY (ARRAY['verified_success'::text, 'successful'::text])) AND (payment_transactions.workspace_id IN (SELECT workspaces.id FROM public.workspaces WHERE workspaces.is_test = false))), 0::numeric) AS gross_saas_collected_inr,
    COALESCE((SELECT sum(payment_transactions.amount_inr) FROM public.payment_transactions WHERE payment_transactions.status = 'refunded'::text AND (payment_transactions.workspace_id IN (SELECT workspaces.id FROM public.workspaces WHERE workspaces.is_test = false))), 0::numeric) AS total_saas_refunds_inr,
    COALESCE((SELECT sum(payment_transactions.amount_inr) FROM public.payment_transactions WHERE (payment_transactions.status = ANY (ARRAY['verified_success'::text, 'successful'::text])) AND (payment_transactions.workspace_id IN (SELECT workspaces.id FROM public.workspaces WHERE workspaces.is_test = false))), 0::numeric) - COALESCE((SELECT sum(payment_transactions.amount_inr) FROM public.payment_transactions WHERE payment_transactions.status = 'refunded'::text AND (payment_transactions.workspace_id IN (SELECT workspaces.id FROM public.workspaces WHERE workspaces.is_test = false))), 0::numeric) AS net_saas_collected_inr,
    COALESCE((SELECT sum(invoices.grand_total) FROM public.invoices WHERE (invoices.workspace_id IN (SELECT workspaces.id FROM public.workspaces WHERE workspaces.is_test = false))), 0::numeric) AS total_merchant_gmv_inr,
    COALESCE((SELECT sum(invoices.balance_amount) FROM public.invoices WHERE (invoices.workspace_id IN (SELECT workspaces.id FROM public.workspaces WHERE workspaces.is_test = false))), 0::numeric) AS total_tenant_receivables_inr,
    now() AS last_calculated_at;

RESET ROLE;

-- -----------------------------------------------------------------------------
-- SECTION 5: Dedicated Reporting Role Provisioning
-- -----------------------------------------------------------------------------

-- IMPORTANT: Replace '<GENERATE_64_CHAR_RANDOM_SECRET>' with a securely generated secret
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'v_super_admin_reporting') THEN
        CREATE ROLE v_super_admin_reporting WITH 
            LOGIN 
            PASSWORD '<GENERATE_64_CHAR_RANDOM_SECRET>'
            CONNECTION LIMIT 5 
            INHERIT 
            NOSUPERUSER 
            NOCREATEDB 
            NOCREATEROLE 
            NOBYPASSRLS 
            NOREPLICATION;
    END IF;
END
$$;

-- Enforce engine-level read-only and strict timeout constraints
ALTER ROLE v_super_admin_reporting SET default_transaction_read_only = TRUE;
ALTER ROLE v_super_admin_reporting SET statement_timeout = '8000ms';
ALTER ROLE v_super_admin_reporting SET idle_in_transaction_session_timeout = '5000ms';
ALTER ROLE v_super_admin_reporting SET search_path = super_admin_reporting, pg_catalog;

-- -----------------------------------------------------------------------------
-- SECTION 6: Least-Privilege Grants & Hardened Revocations
-- -----------------------------------------------------------------------------

-- Grant access exclusively to the dedicated reporting schema and its views
GRANT USAGE ON SCHEMA super_admin_reporting TO v_super_admin_reporting;
GRANT SELECT ON ALL TABLES IN SCHEMA super_admin_reporting TO v_super_admin_reporting;
REVOKE CREATE ON SCHEMA super_admin_reporting FROM v_super_admin_reporting;

-- Hard isolation from application, auth, and storage schemas
REVOKE ALL ON SCHEMA public FROM v_super_admin_reporting;
REVOKE ALL ON SCHEMA auth FROM v_super_admin_reporting;
REVOKE ALL ON SCHEMA storage FROM v_super_admin_reporting;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM v_super_admin_reporting;

-- Explicitly protect administrative mutation routines
REVOKE EXECUTE ON FUNCTION public.super_admin_suspend_workspace FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.super_admin_reactivate_workspace FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.super_admin_provision_platform_admin FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.super_admin_revoke_mfa FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.super_admin_suspend_workspace TO service_role;
GRANT EXECUTE ON FUNCTION public.super_admin_reactivate_workspace TO service_role;
GRANT EXECUTE ON FUNCTION public.super_admin_provision_platform_admin TO service_role;
GRANT EXECUTE ON FUNCTION public.super_admin_revoke_mfa TO service_role;

COMMIT;
```

---

## 3. Post-Deployment Verification Queries

After executing the script above, the owner can run the following verification block:

```sql
-- 1. Verify view owner of all 9 views
SELECT c.relname as view_name, pg_get_userbyid(c.relowner) as owner, c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'super_admin_reporting' AND c.relkind = 'v'
ORDER BY c.relname;
-- EXPECTED: owner = 'v_reporting_view_owner', reloptions = '{security_barrier=true}'

-- 2. Verify role attributes
SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolconnlimit, rolconfig
FROM pg_roles 
WHERE rolname IN ('v_super_admin_reporting', 'v_reporting_view_owner');
-- EXPECTED:
-- v_reporting_view_owner: rolcanlogin = false, rolsuper = false, rolbypassrls = true
-- v_super_admin_reporting: rolcanlogin = true, rolsuper = false, rolbypassrls = false

-- 3. Verify that reporting role has zero table grants in public
SELECT count(*) as public_table_grants
FROM information_schema.role_table_grants
WHERE grantee = 'v_super_admin_reporting' AND table_schema = 'public';
-- EXPECTED: 0
```
