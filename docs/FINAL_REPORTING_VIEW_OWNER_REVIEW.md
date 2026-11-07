# VISTAAR SUPER ADMIN — FINAL REPORTING VIEW OWNER SECURITY REVIEW

**Document Reference:** `docs/FINAL_REPORTING_VIEW_OWNER_REVIEW.md`  
**Execution Timestamp:** November 7, 2026  
**Auditor:** Principal PostgreSQL Security Architect & Data Systems Auditor  
**Target Tested Instance:** Supabase Staging (`vlbhxcajphyjkeueubud`)  
**Production Air-Gap Status:** 100% AIR-GAPPED & UNTOUCHED (`kluxsykimnjivkqxelba`)  

---

## 1. Executive Summary

This document evaluates the ownership, execution context, and security properties of the 9 administrative reporting views designed for VISTAAR Super Admin. 

In PostgreSQL, a view's owner determines whether queries against the view execute with the privileges of the caller (`security_invoker = true`) or the privileges of the owner (`security_invoker = false`). Because `v_super_admin_reporting` has direct access to raw operational tables revoked, the views must act as controlled privilege encapsulation barriers.

---

## 2. Nine-View Architectural Inspection

```sql
SELECT c.relname AS view_name, pg_get_userbyid(c.relowner) AS view_owner, 
       COALESCE(c.reloptions::text, '{}') AS options
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'v_report_%'
ORDER BY c.relname;
```

### Detailed Inspection Matrix:

| View Name | Owner | `security_invoker` | `security_barrier` | Underlying Tables | Underlying Functions | RLS on Tables? | Owner Bypasses RLS? | Exposes Cross-Workspace? |
|---|:---:|:---:|:---:|---|---|:---:|:---:|:---:|
| `v_report_workspace_directory` | `postgres` | `false` | `false`* | `workspaces`, `business_settings`, `branches`, `profiles` | `count()`, `coalesce()` | **YES** | **YES** (`rolbypassrls`) | **YES** (Controlled aggregate) |
| `v_report_users_memberships` | `postgres` | `false` | `false`* | `profiles`, `workspaces` | None | **YES** | **YES** | **YES** (Sanitized staff directory) |
| `v_report_subscription_overview`| `postgres` | `false` | `false`* | `workspace_subscriptions`, `workspaces`, `subscription_plans` | `now()` | **YES** | **YES** | **YES** (Plan oversight) |
| `v_report_payments_collections` | `postgres` | `false` | `false`* | `payment_transactions`, `workspaces` | `round()`, `coalesce()` | **YES** | **YES** | **YES** (HSN 998313 ledger) |
| `v_report_invoices_receivables` | `postgres` | `false` | `false`* | `workspaces`, `invoices` | `sum()`, `count()`, `coalesce()`, `min()`, `max()` | **YES** | **YES** | **YES** (GMV & receivables) |
| `v_report_inventory_summary` | `postgres` | `false` | `false`* | `branch_inventory`, `workspaces`, `branches`, `products` | `sum()`, `count()`, `coalesce()` | **YES** | **YES** | **YES** (Branch stock units & value) |
| `v_report_customers_suppliers` | `postgres` | `false` | `false`* | `workspaces`, `customers`, `suppliers`, `udhari_records` | `count()`, `sum()`, `coalesce()` | **YES** | **YES** | **YES** (Account count & total credit) |
| `v_report_business_activity` | `postgres` | `false` | `false`* | `workspaces`, `invoices` | `now()`, `max()`, `count()`, `sum()` | **YES** | **YES** | **YES** (Recency & dormancy) |
| `v_report_platform_kpi_aggregates` | `postgres` | `false` | `false`* | `workspaces`, `profiles`, `workspace_subscriptions`, `payment_transactions`, `invoices` | `count()`, `sum()`, `coalesce()`, `now()` | **YES** | **YES** | **YES** (Platform-wide rollups) |

*\*Recommendation: Set `WITH (security_barrier = true)` on production deployment.*

---

## 3. Evaluation of View Ownership Architectures

### Option A: `postgres` Super-Owner (Baseline Staging Implementation)
- **Description:** The views are created and owned by `postgres`.
- **How It Works:** Queries executed by `v_super_admin_reporting` evaluate the view using `postgres`'s credentials. Because `postgres` possesses `rolbypassrls = true`, queries seamlessly aggregate data across all workspaces without being trapped by tenant isolation policies (`current_user_workspace_id() = id`).
- **Risks:** If a view contains an unqualified function or an attacker gains permission to alter the view, code executes with `postgres`'s elevated privileges.

### Option B: Dedicated Non-Login View Owner (`v_reporting_view_owner`) — Recommended Production Hardening
- **Description:** Create a dedicated, non-login role specifically to own the reporting views:
  ```sql
  CREATE ROLE v_reporting_view_owner WITH 
      NOLOGIN 
      NOSUPERUSER 
      NOCREATEDB 
      NOCREATEROLE 
      NOREPLICATION 
      BYPASSRLS;
  
  -- Grant SELECT only on the required underlying reporting tables
  GRANT USAGE ON SCHEMA public TO v_reporting_view_owner;
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

  -- Transfer ownership of the 9 views to v_reporting_view_owner
  ALTER VIEW public.v_report_workspace_directory OWNER TO v_reporting_view_owner;
  ALTER VIEW public.v_report_users_memberships OWNER TO v_reporting_view_owner;
  ALTER VIEW public.v_report_subscription_overview OWNER TO v_reporting_view_owner;
  ALTER VIEW public.v_report_payments_collections OWNER TO v_reporting_view_owner;
  ALTER VIEW public.v_report_invoices_receivables OWNER TO v_reporting_view_owner;
  ALTER VIEW public.v_report_inventory_summary OWNER TO v_reporting_view_owner;
  ALTER VIEW public.v_report_customers_suppliers OWNER TO v_reporting_view_owner;
  ALTER VIEW public.v_report_business_activity OWNER TO v_reporting_view_owner;
  ALTER VIEW public.v_report_platform_kpi_aggregates OWNER TO v_reporting_view_owner;
  ```
- **Trade-Off Analysis:**
  - **Security Gain:** Extreme principle of least privilege. The view owner cannot log in (`NOLOGIN`), cannot create objects, has zero write privileges on any table, and only possesses `SELECT` on the 13 required tables. If a view is compromised, the blast radius is strictly confined to read-only access to those 13 tables.
  - **Operational Complexity:** Low. Requires creating one extra non-login role during production view setup.

---

## 4. `security_barrier` Hardening Recommendation

In standard PostgreSQL views (`security_barrier = false`), the cost-based query optimizer may push user-defined functions in the `WHERE` clause down into the table scan *before* the view's internal filters are evaluated.

For example, if an operator runs:
```sql
SELECT * FROM public.v_report_workspace_directory WHERE malicious_probe(owner_email);
```
Without a security barrier, `malicious_probe()` could conceivably inspect deleted or unapproved workspace rows before the view's `WHERE w.deleted_at IS NULL` condition is applied.

### Recommended Production DDL:
Apply `WITH (security_barrier = true)` to all 9 reporting views:
```sql
ALTER VIEW public.v_report_workspace_directory SET (security_barrier = true);
ALTER VIEW public.v_report_users_memberships SET (security_barrier = true);
ALTER VIEW public.v_report_subscription_overview SET (security_barrier = true);
ALTER VIEW public.v_report_payments_collections SET (security_barrier = true);
ALTER VIEW public.v_report_invoices_receivables SET (security_barrier = true);
ALTER VIEW public.v_report_inventory_summary SET (security_barrier = true);
ALTER VIEW public.v_report_customers_suppliers SET (security_barrier = true);
ALTER VIEW public.v_report_business_activity SET (security_barrier = true);
ALTER VIEW public.v_report_platform_kpi_aggregates SET (security_barrier = true);
```
This forces PostgreSQL's optimizer to materialize view filtering before applying any external user conditions.

---

## 5. View Information Leakage Audit

We audited the projections of all 9 views to verify whether sensitive operational data can be leaked:

1. **Identity & Passwords:** `branch_password_hash` (`workspaces`), `avatar_url`, `must_change_password` (`profiles`), and all `auth.users` columns are strictly excluded.
2. **Financial Instruments:** Merchant bank account details, UPI QR private secrets, customer payment cards, and payment token payloads (`provider_payload` in `payment_transactions`) are omitted.
3. **Retail Customer Privacy:** Individual customer names and phone numbers are omitted from general invoice summaries, reporting only aggregate GMV and receivables balances.
4. **Cardinality Safety:** Subquery groupings prevent join multiplications, ensuring numbers reflect true business totals.
