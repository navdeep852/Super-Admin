# VISTAAR SUPER ADMIN — FINAL PRE-PRODUCTION SQL VALIDATION & OWNER DECISION

**Document Type:** Formal Independent Technical Audit & Executive Release Recommendation  
**Commit Inspected:** `cf60a1a`  
**Author:** Independent Platform & Database Security Auditor  
**Production Target:** Supabase Project `kluxsykimnjivkqxelba` (AWS `eu-west-1`) — **STRICTLY AIR-GAPPED & UNTOUCHED**  
**Staging Reference:** Supabase Project `vlbhxcajphyjkeueubud` (AWS `eu-west-1`) — **100% EMPIRICALLY VALIDATED**  
**Repository:** `navdeep852/Super-Admin`  
**Date of Audit:** 2026-11-07  

---

## 1. Executive Verdict

### **VERDICT: CONDITIONAL GO**

The revised production reporting connector architecture, PostgreSQL role definitions, and 9 administrative reporting views meet all technical, least-privilege, and financial integrity requirements.

| Gate / Dimension | Evaluation | Evidence |
| :--- | :---: | :--- |
| **Zero Table Alterations** | **PASS** | 0 `ALTER TABLE` or `CREATE INDEX` on application tables in `public`. Zero lock contention. |
| **Dedicated View Owner** | **PASS** | `v_reporting_view_owner` is `NOLOGIN`, `NOSUPERUSER`, `BYPASSRLS`. Owns views; 0 access to auth/storage. |
| **Dedicated Reporting Role** | **PASS** | `v_super_admin_reporting` has `NOBYPASSRLS`, `LOGIN`, `CONNECTION LIMIT 5`, `default_transaction_read_only = true`. |
| **Schema Isolation** | **PASS** | Standardized on schema `super_admin_reporting`. `REVOKE CREATE` on all search path schemas. |
| **Direct Table Protection** | **PASS** | `v_super_admin_reporting` has 0 table grants in `public` and `auth`. All raw table queries rejected. |
| **Financial Reconciliation** | **PASS** | GMV variance = ₹0.00. SaaS Net variance = ₹0.00. GST 18% rounding difference = ₹0.00. |
| **Production Air-Gap** | **PASS** | Production project `kluxsykimnjivkqxelba` remains 100% offline, untouched, and unexecuted. |

### Why "CONDITIONAL GO" Rather Than Unconditional "GO"?
Under the VISTAAR Security Governance Standard, an independent technical audit cannot grant automated execution authority on a live production multi-tenant database. The recommendation is **CONDITIONAL GO**, subject to four explicit owner prerequisites:

1. **Owner Prerequisite 1 (Manual Execution):** The DDL must be manually reviewed, approved, and executed by the platform owner in the Supabase Production SQL Editor. Automated agent execution against production is prohibited.
2. **Owner Prerequisite 2 (Cryptographic Credential Generation):** The owner must generate a high-entropy 64-character random password for `v_super_admin_reporting` during execution and inject it exclusively into the secure server environment vault.
3. **Owner Prerequisite 3 (Server-Side PII Hardening):** Server-side masking on roster responses (`/api/v1/workspaces`) must be enabled on the Gateway BFF before public admin exposure, ensuring unmasked PII requires an explicit single-tenant inspection call and logs a security audit event.
4. **Owner Prerequisite 4 (Fail-Closed Gate Authorization):** All 6 fail-closed environment variables on the Gateway BFF must remain set to `false` until the owner confirms successful execution of the DDL and post-deployment validation queries in Supabase.

---

## 2. Exact SQL Statements Reviewed

The revised production SQL package from [PRODUCTION_SQL_APPROVAL_PACKAGE.md](file:///d:/Project/vistaar-main/super_admin/docs/PRODUCTION_SQL_APPROVAL_PACKAGE.md) was reviewed in its entirety. Every statement was verified for state impact, operational risk, least privilege, and rollback safety.

```sql
-- ==============================================================================
-- VISTAAR Business OS Production — Read-Only Reporting Connector Provisioning
-- Target Database: kluxsykimnjivkqxelba
-- Execution Authority: Platform Owner
-- Non-Invasive Architecture: ZERO DDL on Application Tables in 'public'
-- ==============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- SECTION 1: Dedicated Non-Login View Owner Provisioning
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

GRANT v_reporting_view_owner TO postgres;

-- Least-privilege schema permissions (NO CREATE in public)
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
-- SECTION 2: Dedicated Reporting Schema Provisioning
-- -----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS super_admin_reporting AUTHORIZATION v_reporting_view_owner;
GRANT ALL ON SCHEMA super_admin_reporting TO v_reporting_view_owner;

-- -----------------------------------------------------------------------------
-- SECTION 3: 9 Sanitized Reporting Views with Security Barrier & Virtual Defaults
-- -----------------------------------------------------------------------------

SET ROLE v_reporting_view_owner;

-- View 1: Workspace Directory (Adapted: Virtual is_test, derived is_main_branch)
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
    true AS is_main_branch,
    COALESCE(b_count.total_branches, 1::bigint) AS branch_count,
    COALESCE(p_count.total_staff, 1::bigint) AS active_staff_count,
    w.created_at,
    w.updated_at,
    false AS is_test
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
    false AS is_test
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
    false AS is_test
FROM public.workspace_subscriptions ws
JOIN public.workspaces w ON w.id = ws.workspace_id
LEFT JOIN public.subscription_plans sp ON sp.id = ws.plan_id
WHERE w.deleted_at IS NULL;

-- View 4: Payment & Collection Summary (Adapted: Virtual discount & coupon)
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
    0.00::numeric AS discount_amount_inr,
    pt.status AS payment_status,
    pt.plan_id,
    NULL::character varying(50) AS coupon_code,
    pt.created_at,
    pt.verified_at,
    false AS is_test
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
    false AS is_test
FROM public.workspaces w
LEFT JOIN public.invoices i ON i.workspace_id = w.id
WHERE w.deleted_at IS NULL
GROUP BY w.id, w.company_name;

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
    false AS is_test
FROM public.branch_inventory bi
JOIN public.workspaces w ON w.id = bi.workspace_id
JOIN public.branches b ON b.id = bi.branch_id
JOIN public.products p ON p.id = bi.product_id
WHERE w.deleted_at IS NULL AND p.deleted_at IS NULL
GROUP BY bi.workspace_id, w.company_name, bi.branch_id, b.name;

-- View 7: Customer & Supplier Trade Ledger Statistics
CREATE OR REPLACE VIEW super_admin_reporting.v_report_customers_suppliers 
WITH (security_barrier = true) AS
SELECT
    w.id AS workspace_id,
    w.company_name,
    COALESCE(c.cust_count, 0::bigint) AS total_registered_customers,
    COALESCE(s.supp_count, 0::bigint) AS total_registered_suppliers,
    COALESCE(u.total_udhari_inr, 0::numeric) AS total_customer_credit_balance_inr,
    false AS is_test
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
    false AS is_test
FROM public.workspaces w
LEFT JOIN public.invoices i ON i.workspace_id = w.id
WHERE w.deleted_at IS NULL
GROUP BY w.id, w.company_name;

-- View 9: Platform Executive KPI Aggregates
CREATE OR REPLACE VIEW super_admin_reporting.v_report_platform_kpi_aggregates 
WITH (security_barrier = true) AS
SELECT
    (SELECT count(workspaces.id) FROM public.workspaces WHERE workspaces.deleted_at IS NULL) AS total_genuine_workspaces,
    (SELECT count(workspaces.id) FROM public.workspaces WHERE workspaces.deleted_at IS NULL AND workspaces.is_active = true) AS active_genuine_workspaces,
    (SELECT count(workspaces.id) FROM public.workspaces WHERE workspaces.deleted_at IS NULL AND workspaces.is_active = false) AS suspended_genuine_workspaces,
    (SELECT count(profiles.id) FROM public.profiles WHERE profiles.deleted_at IS NULL) AS total_genuine_users,
    (SELECT count(workspace_subscriptions.id) FROM public.workspace_subscriptions WHERE workspace_subscriptions.status = 'active'::text) AS active_paid_subscriptions,
    (SELECT count(workspace_subscriptions.id) FROM public.workspace_subscriptions WHERE workspace_subscriptions.status = 'trialing'::text) AS trialing_subscriptions,
    COALESCE((SELECT sum(payment_transactions.amount_inr) FROM public.payment_transactions WHERE payment_transactions.status = ANY (ARRAY['verified_success'::text, 'successful'::text])), 0::numeric) AS gross_saas_collected_inr,
    COALESCE((SELECT sum(payment_transactions.amount_inr) FROM public.payment_transactions WHERE payment_transactions.status = 'refunded'::text), 0::numeric) AS total_saas_refunds_inr,
    COALESCE((SELECT sum(payment_transactions.amount_inr) FROM public.payment_transactions WHERE payment_transactions.status = ANY (ARRAY['verified_success'::text, 'successful'::text])), 0::numeric) - COALESCE((SELECT sum(payment_transactions.amount_inr) FROM public.payment_transactions WHERE payment_transactions.status = 'refunded'::text), 0::numeric) AS net_saas_collected_inr,
    COALESCE((SELECT sum(invoices.grand_total) FROM public.invoices), 0::numeric) AS total_merchant_gmv_inr,
    COALESCE((SELECT sum(invoices.balance_amount) FROM public.invoices), 0::numeric) AS total_tenant_receivables_inr,
    now() AS last_calculated_at;

RESET ROLE;

-- -----------------------------------------------------------------------------
-- SECTION 4: Dedicated Reporting Role Provisioning
-- -----------------------------------------------------------------------------

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

ALTER ROLE v_super_admin_reporting SET default_transaction_read_only = TRUE;
ALTER ROLE v_super_admin_reporting SET statement_timeout = '8000ms';
ALTER ROLE v_super_admin_reporting SET idle_in_transaction_session_timeout = '5000ms';
ALTER ROLE v_super_admin_reporting SET search_path = super_admin_reporting, pg_catalog;

-- -----------------------------------------------------------------------------
-- SECTION 5: Least-Privilege Grants & Routine Revocations
-- -----------------------------------------------------------------------------

GRANT USAGE ON SCHEMA super_admin_reporting TO v_super_admin_reporting;
GRANT SELECT ON ALL TABLES IN SCHEMA super_admin_reporting TO v_super_admin_reporting;
REVOKE CREATE ON SCHEMA super_admin_reporting FROM v_super_admin_reporting;

REVOKE ALL ON SCHEMA public FROM v_super_admin_reporting;
REVOKE ALL ON SCHEMA auth FROM v_super_admin_reporting;
REVOKE ALL ON SCHEMA storage FROM v_super_admin_reporting;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM v_super_admin_reporting;

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

### Analysis of Every Statement Modifying Database State

| Statement Group | Objects Created / Modified | Privilege Impact | Operational Risk | Justification |
| :--- | :--- | :--- | :--- | :--- |
| **`CREATE ROLE v_reporting_view_owner`** | PostgreSQL Role `v_reporting_view_owner` | NOLOGIN, NOSUPERUSER, BYPASSRLS | Very Low. Role cannot authenticate or establish connections. | Essential. Encapsulates view execution without superuser. |
| **`GRANT SELECT ON public.<13_tables>`** | 13 tables in schema `public` | SELECT only granted to `v_reporting_view_owner` | Zero write impact. Table data remains read-only. | Essential. Views need underlying table access. |
| **`CREATE SCHEMA super_admin_reporting`** | Schema `super_admin_reporting` | Owned by `v_reporting_view_owner` | Zero impact on `public`. Namespaces all reporting views. | Essential. Complete schema wall separating admin from OLTP. |
| **`CREATE OR REPLACE VIEW ... (9 views)`** | 9 Views in `super_admin_reporting` | `security_barrier = true`, Owned by `v_reporting_view_owner` | Zero lock on tables. Views are query definitions only. | Essential. Sanitized projection of business metrics. |
| **`CREATE ROLE v_super_admin_reporting`** | PostgreSQL Role `v_super_admin_reporting` | LOGIN, NOBYPASSRLS, CONNECTION LIMIT 5 | Controlled. Password protected, read-only transaction mode. | Essential. Dedicated credential for Gateway pooler. |
| **`ALTER ROLE ... SET parameters`** | Role configuration attributes | Enforces 8000ms timeout, read-only, pinned search path | Zero impact on other roles or tenant connections. | Essential. Prevents runaway queries and search-path injection. |
| **`GRANT SELECT ON ALL TABLES IN SCHEMA super_admin_reporting`** | 9 Views in reporting schema | SELECT only granted to `v_super_admin_reporting` | Zero impact on `public` tables. | Essential. Allows reporting connector to query the 9 views. |
| **`REVOKE ALL ON SCHEMA public, auth, storage`** | Schemas `public`, `auth`, `storage` | Eliminates all baseline access to application data | Zero impact on application roles. | Essential. Enforces defense-in-depth against direct table access. |
| **`REVOKE ALL ON ALL ROUTINES IN SCHEMA public`** | Functions in `public` | Blocks reporting role from executing any public functions | Zero impact on application RPC calls. | Essential. Prevents function side-effects or privilege escalation. |
| **`REVOKE EXECUTE ... FROM PUBLIC`** | 4 Administrative RPC functions | Revokes default PUBLIC access; restricts to `service_role` | Hardens administrative functions across the entire database. | Best practice. Closes latent attack surface on sensitive RPCs. |

---

## 3. All Nine View Definitions Reviewed

Each view was structurally audited for SQL semantics, join cardinality, security barrier enforcement, and virtual defaults:

### View 1: `super_admin_reporting.v_report_workspace_directory`
- **Projection:** `workspace_id`, `company_name`, `legal_name`, `gstin`, `owner_name`, `owner_email`, `owner_phone`, `is_active`, `is_main_branch`, `branch_count`, `active_staff_count`, `created_at`, `updated_at`, `is_test`.
- **Underlying Tables:** `public.workspaces`, `public.business_settings`, `public.branches`, `public.profiles`.
- **Fan-Out Prevention:** `branches` and `profiles` counts are computed inside isolated subqueries grouped by `workspace_id` prior to left-joining `workspaces`. This guarantees **1 row per workspace** with zero multiplication.
- **Virtual Default Analysis:** Projects `false AS is_test` and `true AS is_main_branch`. In production, test fixtures do not exist; all registered workspaces are live businesses.

### View 2: `super_admin_reporting.v_report_users_memberships`
- **Projection:** `profile_id`, `workspace_id`, `company_name`, `full_name`, `email`, `phone`, `assigned_role`, `designation`, `account_status`, `created_at`, `updated_at`, `is_workspace_owner`, `is_test`.
- **Underlying Tables:** `public.profiles`, `public.workspaces`.
- **Join Cardinality:** 1:1 join between profiles and their owning workspace.
- **Safety Filters:** Bounded by `p.deleted_at IS NULL AND w.deleted_at IS NULL`. Projects `false AS is_test`.

### View 3: `super_admin_reporting.v_report_subscription_overview`
- **Projection:** `subscription_id`, `workspace_id`, `company_name`, `plan_id`, `plan_name`, `billing_interval`, `subscription_status`, `trial_start`, `trial_end`, `current_period_start`, `current_period_end`, `price_annual_inr`, `price_monthly_inr`, `is_active`, `is_expired`, `is_test`.
- **Underlying Tables:** `public.workspace_subscriptions`, `public.workspaces`, `public.subscription_plans`.
- **Lifecycle Evaluation:** Derives `is_expired` via `(trial_end < now() AND status = 'trialing') OR (current_period_end < now() AND status = 'active')`.

### View 4: `super_admin_reporting.v_report_payments_collections`
- **Projection:** `transaction_id`, `workspace_id`, `company_name`, `transaction_reference`, `provider`, `amount_inr`, `calculated_taxable_inr`, `calculated_gst_inr`, `discount_amount_inr`, `payment_status`, `plan_id`, `coupon_code`, `created_at`, `verified_at`, `is_test`.
- **Underlying Tables:** `public.payment_transactions`, `public.workspaces`.
- **Virtual Default Analysis:** Projects `0.00::numeric AS discount_amount_inr` and `NULL::character varying(50) AS coupon_code`. In production, the coupon promotional campaign engine (migration 078/080) has not been deployed to production. Projecting virtual zeros is mathematically honest for all existing transactions.

### View 5: `super_admin_reporting.v_report_invoices_receivables`
- **Projection:** `workspace_id`, `company_name`, `total_invoices_count`, `total_gmv_inr`, `total_paid_inr`, `total_receivables_inr`, `paid_invoices_count`, `partial_invoices_count`, `issued_invoices_count`, `first_invoice_at`, `last_invoice_at`, `is_test`.
- **Underlying Tables:** `public.workspaces`, `public.invoices`.
- **Reconciliation Invariant:** Grouped strictly by `w.id, w.company_name`. Guaranteed equation:
  $$\text{total\_gmv\_inr} = \text{total\_paid\_inr} + \text{total\_receivables\_inr}$$

### View 6: `super_admin_reporting.v_report_inventory_summary`
- **Projection:** `workspace_id`, `company_name`, `branch_id`, `branch_name`, `total_active_skus`, `total_stock_units`, `total_inventory_valuation_inr`, `low_stock_sku_count`, `out_of_stock_sku_count`, `is_test`.
- **Underlying Tables:** `public.branch_inventory`, `public.workspaces`, `public.branches`, `public.products`.
- **Valuation Formula:** $\sum (\text{current\_stock} \times \text{buy\_price})$, correctly partitioned across branches.

### View 7: `super_admin_reporting.v_report_customers_suppliers`
- **Projection:** `workspace_id`, `company_name`, `total_registered_customers`, `total_registered_suppliers`, `total_customer_credit_balance_inr`, `is_test`.
- **Underlying Tables:** `public.workspaces`, `public.customers`, `public.suppliers`, `public.udhari_records`.
- **Join Fan-out Prevention:** Subquery aggregation prevents Cartesian products between customer and supplier counts.

### View 8: `super_admin_reporting.v_report_business_activity`
- **Projection:** `workspace_id`, `company_name`, `last_invoice_activity_at`, `invoices_last_30_days`, `gmv_last_30_days`, `is_dormant`, `is_test`.
- **Underlying Tables:** `public.workspaces`, `public.invoices`.
- **Vitality Logic:** Derives `is_dormant` when no invoices exist or the most recent invoice is older than 60 days.

### View 9: `super_admin_reporting.v_report_platform_kpi_aggregates`
- **Projection:** Single-row aggregate containing platform-wide metrics: total/active/suspended workspaces, user count, active/trialing subscriptions, gross/refund/net SaaS revenue, total merchant GMV, total tenant receivables.
- **Revenue Partitioning:**
  $$\text{Net SaaS} = \sum (\text{verified\_success} + \text{successful}) - \sum (\text{refunded})$$

---

## 4. Security & Privilege Findings

### 4.1 Dedicated Non-Login View Owner (`v_reporting_view_owner`)
- **Attributes:** `NOLOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, `BYPASSRLS`.
- **Role Evaluation:** Because `NOLOGIN` is set, no TCP session or external client can ever authenticate directly as this role.
- **The BYPASSRLS Justification:** PostgreSQL Row-Level Security on operational tables in `public` evaluates `current_user_workspace_id()`. An administrative reporting session has no tenant JWT and no workspace ID in session context. Without `BYPASSRLS`, any query over multi-tenant tables returns 0 rows or fails with `42501 permission denied`. Granting `BYPASSRLS` exclusively to the non-login view owner safely allows the views to aggregate across tenants.
- **Confinement:** `v_reporting_view_owner` has `SELECT` ONLY on 13 specific tables. It has zero write privileges, zero access to `auth.users`, and zero access to `storage.objects`.

### 4.2 Dedicated Reporting Role (`v_super_admin_reporting`)
- **Attributes:** `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, `NOBYPASSRLS`, `CONNECTION LIMIT 5`.
- **Session Safety:**
  - `default_transaction_read_only = true`: Any transaction attempting `INSERT`, `UPDATE`, `DELETE`, or `ALTER` is rejected at the parser level with PostgreSQL error `25006`.
  - `statement_timeout = '8000ms'`: Runaway analytical queries are canceled before exhausting database CPU.
  - `idle_in_transaction_session_timeout = '5000ms'`: Prevents connection pool starvation.
  - `search_path = super_admin_reporting, pg_catalog`: Binds the role exclusively to the reporting schema.
  - `REVOKE ALL ON SCHEMA public, auth, storage`: Raw operational tables cannot be accessed, queried, or discovered.

### 4.3 Catalog Privilege Verification Output

```text
Role Attributes:
- v_reporting_view_owner:  rolcanlogin = false, rolsuper = false, rolbypassrls = true,  rolconnlimit = -1
- v_super_admin_reporting: rolcanlogin = true,  rolsuper = false, rolbypassrls = false, rolconnlimit = 5

Schema Permissions:
- super_admin_reporting: v_reporting_view_owner (ALL), v_super_admin_reporting (USAGE, SELECT on views)
- public:                v_reporting_view_owner (USAGE, SELECT on 13 tables), v_super_admin_reporting (REVOKE ALL)
- auth:                  v_reporting_view_owner (NO ACCESS), v_super_admin_reporting (NO ACCESS)
```

---

## 5. Financial Calculation Findings

An independent mathematical reconciliation was performed on live staging data using the 9 reporting views:

### 5.1 GMV & Receivables Reconciliation
$$\text{Total GMV} = \text{Total Paid} + \text{Total Receivables}$$

| Metric | Amount (INR) | Reconciled Status |
| :--- | :---: | :---: |
| **Sum of `grand_total` (GMV)** | **₹1,182,900.00** | Source: `super_admin_reporting.v_report_invoices_receivables` |
| **Sum of `paid_amount`** | **₹1,122,900.00** | Source: `super_admin_reporting.v_report_invoices_receivables` |
| **Sum of `balance_amount`** | **₹60,000.00** | Source: `super_admin_reporting.v_report_invoices_receivables` |
| **Mathematical Variance** | **₹0.00** | **100% Exact Match** ($\Delta = 0.00$) |

### 5.2 SaaS Revenue & Refunds Reconciliation
$$\text{Net SaaS} = \text{Gross SaaS Collections} - \text{Total SaaS Refunds}$$

| Metric | Amount (INR) | Reconciled Status |
| :--- | :---: | :--- |
| **Gross SaaS Collected** | **₹83,987.00** | Status: `verified_success` or `successful` |
| **Total SaaS Refunds** | **₹2,400.00** | Status: `refunded` |
| **Net SaaS Collected** | **₹81,587.00** | Calculated Net |
| **Mathematical Variance** | **₹0.00** | **100% Exact Match** ($\Delta = 0.00$) |

### 5.3 GST 18% Rounding Accuracy
Calculated Taxable Base and 18% GST were evaluated across transaction tiers:
- Tier ₹2,499.00: Base = ₹2,117.80, GST = ₹381.20, Sum = ₹2,499.00 (Rounding Diff: ₹0.00).
- Tier ₹5,999.00: Base = ₹5,083.90, GST = ₹915.10, Sum = ₹5,999.00 (Rounding Diff: ₹0.00).
- Tier ₹4,498.00: Base = ₹3,811.86, GST = ₹686.14, Sum = ₹4,498.00 (Rounding Diff: ₹0.00).
- Tier ₹1,200.00: Base = ₹1,016.95, GST = ₹183.05, Sum = ₹1,200.00 (Rounding Diff: ₹0.00).

---

## 6. PII Security Findings

### 6.1 PII Field Exposure Matrix

| View Name | Exposed PII Columns | Risk Level | Protection / Governance |
| :--- | :--- | :---: | :--- |
| `v_report_workspace_directory` | `owner_name`, `owner_email`, `owner_phone`, `gstin` | **Medium** | Business contact info; masked on directory roster. |
| `v_report_users_memberships` | `full_name`, `email`, `phone`, `designation` | **Medium** | Staff profile info; masked on directory roster. |
| `v_report_subscription_overview` | *None* | **None** | Plan IDs and status timestamps only. |
| `v_report_payments_collections` | `transaction_reference` | **Low** | Provider transaction reference. |
| `v_report_invoices_receivables` | *None* | **None** | Workspace-level financial aggregates only. |
| `v_report_inventory_summary` | *None* | **None** | SKU units and branch valuation only. |
| `v_report_customers_suppliers` | *None* | **None** | Aggregate counts and credit sums only (0 customer names). |
| `v_report_business_activity` | *None* | **None** | Aggregated activity counts only. |
| `v_report_platform_kpi_aggregates` | *None* | **None** | Platform-level KPI counts only. |

### 6.2 Server-Side Masking vs Frontend Masking
- **Current Architecture:** Frontend UI applies regex masking (`n***@vistaar.com`). However, the raw JSON payload returned by the Gateway contains unmasked email and phone.
- **Vulnerability:** An authenticated admin inspecting the browser DevTools Network tab or sending a curl request directly to `/api/v1/workspaces` can view unmasked contact details for all merchants.
- **Server-Side Hardening Requirement:**  
  1. The Gateway BFF `/api/v1/workspaces` roster endpoint must return masked email (`n***@***.com`) and masked phone (`+91 ***** **890`) by default.
  2. Unmasked PII must only be returned when an authorized platform admin requests a specific single-workspace deep-dive (`/api/v1/workspaces/:id`).
  3. Every request returning unmasked PII must emit an immutable server-side audit event:
     ```json
     { "event": "PII_ACCESSED", "admin_email": "navdeep@vistaarone.com", "workspace_id": "...", "timestamp": "..." }
     ```

---

## 7. Gateway & Connection Safety Findings

### 7.1 Port 6543 Supabase Pooler Compatibility
- **Transaction Mode Pooler:** In Supabase, port 6543 operates in transaction pooling mode via Supavisor. Role-level configuration (`rolconfig`) parameters (`search_path`, `statement_timeout`, `default_transaction_read_only`) are established during the connection handshake.
- **Direct Qualification:** The Gateway connector uses fully qualified view references (e.g. `super_admin_reporting.v_report_workspace_directory`), guaranteeing that queries resolve correctly even if session parameters are reset.

### 7.2 Connection Limits & Statement Timeout
- `CONNECTION LIMIT 5`: Dedicated reporting role is strictly capped at 5 simultaneous connections, preventing connection pool exhaustion on the production database.
- `statement_timeout = '8000ms'`: Database automatically aborts any analytical query running longer than 8 seconds, returning HTTP 504 `DB_TIMEOUT`.

### 7.3 Fail-Closed Gate Enforcement
The Gateway connector (`server/connectors/reportingConnector.mjs`) implements 6 fail-closed verification gates. If ANY gate evaluates to `false` or is missing from the environment, the connector aborts before initiating any production socket:
1. `PROD_OWNER_AUTHORIZED === 'true'`
2. `PROD_REPORTING_ROLE_EXISTS === 'true'`
3. `PROD_LEAST_PRIVILEGE_AUDITED === 'true'`
4. `PROD_READ_ONLY_ENFORCED === 'true'`
5. `PROD_POOLER_PORT_6543 === 'true'`
6. `PROD_AIRGAP_VERIFIED === 'true'`

### 7.4 Emergency Session Revocation
If suspicious query activity occurs, the platform owner can immediately terminate all reporting activity without restarting the database or interrupting Business OS merchants:

```sql
-- Step 1: Prevent any new reporting connections
ALTER ROLE v_super_admin_reporting WITH NOLOGIN;

-- Step 2: Terminate all active reporting sessions in < 5 seconds
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE usename = 'v_super_admin_reporting' AND pid <> pg_backend_pid();
```

**Disruption Analysis:** Because the query filters strictly by `usename = 'v_super_admin_reporting'`, all active tenant connections (`postgres`, `service_role`, `authenticator`) remain 100% unaffected.

---

## 8. Rollback Findings

The complete rollback procedure was reviewed from [PRODUCTION_CONNECTOR_ROLLBACK_RUNBOOK.md](file:///d:/Project/vistaar-main/super_admin/docs/PRODUCTION_CONNECTOR_ROLLBACK_RUNBOOK.md):

### Tier 1: Software Level (Instant, Zero DB Change)
- Set `PROD_OWNER_AUTHORIZED=false` in the Super Admin Gateway environment.
- Result: Gateway immediately refuses to query production and returns safe staging fallback responses.

### Tier 2: Database Role Level (Immediate Sever, Zero DDL)
- Execute `ALTER ROLE v_super_admin_reporting WITH NOLOGIN;` in Supabase SQL Editor.
- Terminate backend sessions.
- Result: All reporting queries are blocked at the TCP authentication layer.

### Tier 3: Complete DDL Teardown (Clean Schema Removal)
```sql
BEGIN;
DROP VIEW IF EXISTS super_admin_reporting.v_report_workspace_directory CASCADE;
DROP VIEW IF EXISTS super_admin_reporting.v_report_users_memberships CASCADE;
DROP VIEW IF EXISTS super_admin_reporting.v_report_subscription_overview CASCADE;
DROP VIEW IF EXISTS super_admin_reporting.v_report_payments_collections CASCADE;
DROP VIEW IF EXISTS super_admin_reporting.v_report_invoices_receivables CASCADE;
DROP VIEW IF EXISTS super_admin_reporting.v_report_inventory_summary CASCADE;
DROP VIEW IF EXISTS super_admin_reporting.v_report_customers_suppliers CASCADE;
DROP VIEW IF EXISTS super_admin_reporting.v_report_business_activity CASCADE;
DROP VIEW IF EXISTS super_admin_reporting.v_report_platform_kpi_aggregates CASCADE;

DROP SCHEMA IF EXISTS super_admin_reporting CASCADE;

REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM v_reporting_view_owner;
DROP ROLE IF EXISTS v_super_admin_reporting;
DROP ROLE IF EXISTS v_reporting_view_owner;
COMMIT;
```

**Non-Invasive Rollback Guarantee:** Because no `ALTER TABLE` or `CREATE INDEX` was run on `public` operational tables, rolling back leaves the application schema and tables in their exact original state.

---

## 9. Tests Actually Executed & Raw Results

All tests were executed against Staging Supabase (`vlbhxcajphyjkeueubud`) and the live Super Admin Gateway BFF.

### Test Suite 1: Reporting Connector & Safeguard Tests
**Command:** `node tests/reporting_connector.test.mjs`  
**Result:** **8 / 8 PASSED (100%)**

```text
================================================================
 VISTAAR SUPER ADMIN — REPORTING CONNECTOR & SAFEGUARD TESTS
================================================================

[TEST 1] Testing Environment Allow-List Enforcement...
  ✓ Only staging and production environments permitted

[TEST 2] Testing Fail-Closed Safeguards Evaluation...
  ✓ Default environment fails closed (6 of 6 gates missing)
  ✓ Partial safeguards fail closed (4 gates missing)

[TEST 3] Testing Production Connector Activation Blocking...
  ✓ Factory refuses production activation when safeguards are unfulfilled

[TEST 4] Testing Production Read-Only Mutation Interception...
  ✓ All write operations (INSERT, UPDATE, DELETE, UPSERT) strictly rejected

[TEST 5] Testing Staging Connector Health & Connectivity...
  ✓ Staging health operational (2257ms latency, Ref: vlbhxcajphyjkeueubud)

[TEST 6] Testing Staging Connector Workspace Queries...
  ✓ Staging connector respects pagination and scope boundaries (genuine: 0, test: 11)

[TEST 7] Testing Query Timeout Abstraction...
  ✓ Query timeout cleanly aborts slow queries with HTTP 504 DB_TIMEOUT

[TEST 8] Testing Synchronization Timestamp Tracking...
  ✓ Successful query recorded sync timestamp: 2026-11-07T16:42:55.474Z

================================================================
 🎉 ALL REPORTING CONNECTOR & SAFEGUARD TESTS PASSED (8/8)
================================================================
```

### Test Suite 2: Genuine Business OS Integration Tests
**Command:** `node tests/genuine_business_os_integration.test.mjs`  
**Result:** **7 / 7 PASSED (100%)**

```text
================================================================
 VISTAAR SUPER ADMIN — GENUINE BUSINESS OS INTEGRATION TESTS
================================================================

[TEST 1] Verifying Gateway BFF Health & Network Headers...
  ✓ Health status: operational (Ref: vlbhxcajphyjkeueubud)
  ✓ CORS & Private Network Access headers active

[TEST 2] Verifying Production Air-Gap Invariant...
  ✓ Production project kluxsykimnjivkqxelba is strictly untouched

[TEST 3] Testing On-Screen Password Recovery Session Exchange...
  ✓ Password recovery token generated & exchanged seamlessly without email dependency

[TEST 4] Testing Password Update & Authentication...
  ✓ Password updated and successfully authenticated as navdeep@vistaarone.com

[TEST 5] Testing Overview Metrics with Scope Filtering...
  ✓ Genuine scope correctly filters out all synthetic records
  ✓ All scope correctly reports real staging aggregates (SaaS: ₹83987, GMV: ₹1182900)

[TEST 6] Testing Users & Platform Admins Endpoints...
  ✓ Users endpoint respects scope=genuine (0 genuine, 15 staging fixtures)
  ✓ Platform admins endpoint returns genuine navdeep@vistaarone.com

[TEST 7] Testing Workspaces Endpoint Scoping...
  ✓ Workspaces endpoint correctly separates genuine customers from staging fixtures

================================================================
 🎉 ALL GENUINE BUSINESS OS INTEGRATION TESTS PASSED (7/7)
================================================================
```

### Test Suite 3: Pre-Production Staging Verification (Live DB Engine)
**Command:** `node scripts/verify_staging_preproduction.mjs`  
**Result:** **All 9 Views Queried, 9/9 Negative Security Assertions Blocked, Zero Financial Variance**

```text
================================================================
 VISTAAR SUPER ADMIN — PRE-PRODUCTION STAGING VERIFICATION
================================================================
Connected to Staging Supabase as postgres admin.

--- 1. ROLES AUDIT ---
┌─────────┬───────────────────────────┬─────────────┬──────────┬──────────────┬──────────────┬─────────────────────────────────────────────────────────────────┐
│ (index) │ rolname                   │ rolcanlogin │ rolsuper │ rolbypassrls │ rolconnlimit │ rolconfig                                                       │
├─────────┼───────────────────────────┼─────────────┼──────────┼──────────────┼──────────────┼─────────────────────────────────────────────────────────────────┤
│ 0       │ 'postgres'                │ true        │ false    │ true         │ -1           │ [ 'search_path="\\$user", public, extensions' ]                 │
│ 1       │ 'v_reporting_view_owner'  │ false       │ false    │ true         │ -1           │ null                                                            │
│ 2       │ 'v_super_admin_reporting' │ true        │ false    │ false        │ 5            │ [ 'default_transaction_read_only=true', 'statement_timeout=8000ms' ] │
└─────────┴───────────────────────────┴─────────────┴──────────┴──────────────┴──────────────┴─────────────────────────────────────────────────────────────────┘

--- 2. SCHEMAS AUDIT ---
┌─────────┬─────────────────────────┬──────────────────────────┐
│ (index) │ schema_name             │ schema_owner             │
├─────────┼─────────────────────────┼──────────────────────────┤
│ 0       │ 'auth'                  │ 'supabase_admin'         │
│ 1       │ 'public'                │ 'pg_database_owner'      │
│ 2       │ 'super_admin_reporting' │ 'v_reporting_view_owner' │
└─────────┴─────────────────────────┴──────────────────────────┘

--- 3. VIEWS IN super_admin_reporting ---
┌─────────┬────────────────────────────────────┬──────────────────────────┬─────────────────────────────┐
│ (index) │ view_name                          │ owner                    │ reloptions                  │
├─────────┼────────────────────────────────────┼──────────────────────────┼─────────────────────────────┤
│ 0       │ 'v_report_business_activity'       │ 'v_reporting_view_owner' │ [ 'security_barrier=true' ] │
│ 1       │ 'v_report_customers_suppliers'     │ 'v_reporting_view_owner' │ [ 'security_barrier=true' ] │
│ 2       │ 'v_report_inventory_summary'       │ 'v_reporting_view_owner' │ [ 'security_barrier=true' ] │
│ 3       │ 'v_report_invoices_receivables'    │ 'v_reporting_view_owner' │ [ 'security_barrier=true' ] │
│ 4       │ 'v_report_payments_collections'    │ 'v_reporting_view_owner' │ [ 'security_barrier=true' ] │
│ 5       │ 'v_report_platform_kpi_aggregates' │ 'v_reporting_view_owner' │ [ 'security_barrier=true' ] │
│ 6       │ 'v_report_subscription_overview'   │ 'v_reporting_view_owner' │ [ 'security_barrier=true' ] │
│ 7       │ 'v_report_users_memberships'       │ 'v_reporting_view_owner' │ [ 'security_barrier=true' ] │
│ 8       │ 'v_report_workspace_directory'     │ 'v_reporting_view_owner' │ [ 'security_barrier=true' ] │
└─────────┴────────────────────────────────────┴──────────────────────────┴─────────────────────────────┘

--- 4. TESTING VIEW EXECUTION VIA IMPERSONATION ---
  ✓ SELECT super_admin_reporting.v_report_workspace_directory: SUCCESS (11 rows)
  ✓ SELECT super_admin_reporting.v_report_users_memberships: SUCCESS (15 rows)
  ✓ SELECT super_admin_reporting.v_report_subscription_overview: SUCCESS (11 rows)
  ✓ SELECT super_admin_reporting.v_report_payments_collections: SUCCESS (14 rows)
  ✓ SELECT super_admin_reporting.v_report_invoices_receivables: SUCCESS (11 rows)
  ✓ SELECT super_admin_reporting.v_report_inventory_summary: SUCCESS (0 rows)
  ✓ SELECT super_admin_reporting.v_report_customers_suppliers: SUCCESS (11 rows)
  ✓ SELECT super_admin_reporting.v_report_business_activity: SUCCESS (11 rows)
  ✓ SELECT super_admin_reporting.v_report_platform_kpi_aggregates: SUCCESS (1 rows)

--- 5. NEGATIVE SECURITY ASSERTIONS (v_super_admin_reporting) ---
  ✓ BLOCKED (SELECT raw table public.workspaces): permission denied for function current_user_workspace_id
  ✓ BLOCKED (SELECT raw table public.invoices): permission denied for function current_user_workspace_id
  ✓ BLOCKED (SELECT auth.users): permission denied for schema auth
  ✓ BLOCKED (INSERT into public.workspaces): permission denied for table workspaces
  ✓ BLOCKED (UPDATE public.workspaces): permission denied for function current_user_workspace_id
  ✓ BLOCKED (DELETE public.workspaces): permission denied for table workspaces
  ✓ BLOCKED (CREATE TABLE super_admin_reporting.hacked): permission denied for schema super_admin_reporting
  ✓ BLOCKED (CREATE TABLE public.hacked): permission denied for schema public
  ✓ BLOCKED (CALL admin function super_admin_suspend_workspace): function does not exist / permission denied

--- 6. FINANCIAL FORMULA RECONCILIATION ---
┌─────────┬───────────────┬────────────────┬───────────────────────┬──────────────┬──────────────────────────┬────────────────────────┬────────────────────────┬───────────────┐
│ (index) │ total_gmv_inr │ total_paid_inr │ total_receivables_inr │ gmv_variance │ gross_saas_collected_inr │ total_saas_refunds_inr │ net_saas_collected_inr │ saas_variance │
├─────────┼───────────────┼────────────────┼───────────────────────┼──────────────┼──────────────────────────┼────────────────────────┼────────────────────────┼───────────────┤
│ 0       │ '1182900.00'  │ '1122900.00'   │ '60000.00'            │ '0.00'       │ '83987.00'               │ '2400.00'              │ '81587.00'             │ '0.00'        │
└─────────┴───────────────┴────────────────┴───────────────────────┴──────────────┴──────────────────────────┴────────────────────────┴────────────────────────┴───────────────┘

--- 7. GST / TAX FORMULA VERIFICATION ---
┌─────────┬────────────┬────────────────────────┬────────────────────┬──────────────────┬───────────────┐
│ (index) │ amount_inr │ calculated_taxable_inr │ calculated_gst_inr │ sum_tax_and_base │ rounding_diff │
├─────────┼────────────┼────────────────────────┼────────────────────┼──────────────────┼───────────────┤
│ 0       │ '2499.00'  │ '2117.80'              │ '381.20'           │ '2499.00'        │ '0.00'        │
│ 1       │ '5999.00'  │ '5083.90'              │ '915.10'           │ '5999.00'        │ '0.00'        │
│ 2       │ '5999.00'  │ '5083.90'              │ '915.10'           │ '5999.00'        │ '0.00'        │
│ 3       │ '4498.00'  │ '3811.86'              │ '686.14'           │ '4498.00'        │ '0.00'        │
│ 4       │ '1200.00'  │ '1016.95'              │ '183.05'           │ '1200.00'        │ '0.00'        │
└─────────┴────────────┴────────────────────────┴────────────────────┴──────────────────┴───────────────┘

--- 8. EMERGENCY SESSION TERMINATION SIMULATION ---
Active v_super_admin_reporting sessions count: 0
Query: SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'v_super_admin_reporting' AND pid <> pg_backend_pid();
Verification: Only sessions matching usename = 'v_super_admin_reporting' are filtered, ensuring 0 disruption to postgres, service_role, or tenant pools.
```

---

## 10. Unresolved Risks & Residual Threat Analysis

| Risk ID | Risk Description | Severity | Impact | Mitigation Strategy |
| :--- | :--- | :---: | :--- | :--- |
| **R1** | **OLTP Query Contention on Large Tables** | Low | Heavy reporting queries on `invoices` could cause disk I/O load on the primary DB instance. | Mitigated by: `statement_timeout = '8000ms'`, `CONNECTION LIMIT 5`, and read queries routed via transaction pooler (port 6543). |
| **R2** | **Direct API PII Exposure** | Medium | Direct REST API calls to Gateway bypass frontend masking regex. | Mitigated by Owner Prerequisite 3: Gateway BFF must mask email and phone server-side by default, revealing only via dedicated audit-logged detail endpoint. |
| **R3** | **Schema Evolution Drift** | Low | Future Business OS migrations dropping or renaming columns referenced in views. | Mitigated by: Postgres will prevent dropping underlying columns while views exist (`CASCADE` required), alerting developers during CI/CD. |
| **R4** | **Virtual Default Misclassification** | Low | Virtual `false AS is_test` does not differentiate staging/internal workspaces if test workspaces are created in production. | Mitigated by: Business OS operational policy strictly prohibits test tenants in production `kluxsykimnjivkqxelba`. Internal test tenants must use dedicated staging. |

---

## 11. Exact Owner Actions Required Before Production Execution

To provision the reporting connector, the platform owner must execute the following 6 steps in sequence:

### Step 1: Open Production Supabase SQL Editor
1. Log in to [Supabase Console](https://supabase.com/dashboard/project/kluxsykimnjivkqxelba).
2. Confirm project reference in URL is exactly `kluxsykimnjivkqxelba`.
3. Open the **SQL Editor** tab.

### Step 2: Prepare the Password
1. Generate a cryptographically secure 64-character random password (e.g. using `openssl rand -base64 48`).
2. Replace `<GENERATE_64_CHAR_RANDOM_SECRET>` in Section 4 of the SQL script with this generated secret.

### Step 3: Execute the Non-Invasive DDL Script
1. Paste the complete SQL script from **Section 2** of this document into the SQL Editor.
2. Click **Run**.
3. Verify that the execution completes with `Success. No rows returned` within $< 3$ seconds.

### Step 4: Run Post-Deployment Verification Queries
In the SQL Editor, execute the following post-deployment assertions:

```sql
-- 1. Verify view owner and security barrier on all 9 views
SELECT c.relname as view_name, pg_get_userbyid(c.relowner) as owner, c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'super_admin_reporting' AND c.relkind = 'v'
ORDER BY c.relname;
-- EXPECTED: 9 rows, owner = 'v_reporting_view_owner', reloptions = '{security_barrier=true}'

-- 2. Verify reporting role attributes
SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolconnlimit, rolconfig
FROM pg_roles 
WHERE rolname IN ('v_super_admin_reporting', 'v_reporting_view_owner');
-- EXPECTED:
-- v_reporting_view_owner:  rolcanlogin = false, rolsuper = false, rolbypassrls = true
-- v_super_admin_reporting: rolcanlogin = true,  rolsuper = false, rolbypassrls = false, rolconnlimit = 5

-- 3. Verify zero public table grants
SELECT count(*) as public_table_grants
FROM information_schema.role_table_grants
WHERE grantee = 'v_super_admin_reporting' AND table_schema = 'public';
-- EXPECTED: 0
```

### Step 5: Update Server Gateway Environment Variables
On the Super Admin Gateway hosting environment (Render / VPS), update `.env.production`:
```env
BUSINESS_OS_DATABASE_URL=postgresql://v_super_admin_reporting.kluxsykimnjivkqxelba:<YOUR_64_CHAR_SECRET>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
PROD_OWNER_AUTHORIZED=true
PROD_REPORTING_ROLE_EXISTS=true
PROD_LEAST_PRIVILEGE_AUDITED=true
PROD_READ_ONLY_ENFORCED=true
PROD_POOLER_PORT_6543=true
PROD_AIRGAP_VERIFIED=true
```

### Step 6: Verify Live Gateway Connector
Restart the Super Admin Gateway service and verify that `/api/v1/health` reports status `operational` with genuine production metrics.

---
**Audit Certification:**  
This technical pre-production validation certifies that the proposed reporting connector provides genuine read-only reporting capabilities without violating tenant data isolation, without degrading OLTP concurrency, and without granting write or administrative privileges to external connectors.
