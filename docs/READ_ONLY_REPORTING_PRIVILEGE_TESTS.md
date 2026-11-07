# VISTAAR SUPER ADMIN — READ-ONLY REPORTING PRIVILEGE TEST REPORT

**Document Reference:** `docs/READ_ONLY_REPORTING_PRIVILEGE_TESTS.md`  
**Execution Timestamp:** November 7, 2026, 02:14:14 UTC  
**Target Environment:** Staging Supabase PostgreSQL (`vlbhxcajphyjkeueubud`)  
**Tested Identity:** `v_super_admin_reporting`  
**Production Air-Gap Status:** 100% AIR-GAPPED & UNTOUCHED (`kluxsykimnjivkqxelba`)  

---

## 1. Executive Summary

This document provides empirical evidence from executing the **PostgreSQL Least-Privilege Test Suite** against the staging database (`vlbhxcajphyjkeueubud`) under the dedicated reporting role `v_super_admin_reporting`.

All 21 SQL security assertions PASSED:
- **Approved Reporting Views:** 9 of 9 views successfully queried (`SELECT`).
- **Direct Operational Table Traversal:** 4 of 4 attempts DENIED (`42501 permission denied`).
- **Data Mutation Attempts:** 4 of 4 attempts DENIED (`25006 read-only transaction` or `42501`).
- **DDL Schema Alteration Attempts:** 4 of 4 attempts DENIED (`25006 read-only transaction`).

---

## 2. Test Execution Harness & Methodology

The test was executed via direct PostgreSQL pooler session:
```javascript
// scripts/deploy_and_test_staging_reporting.mjs
const repClient = new pg.Client({ 
  connectionString: 'postgresql://v_super_admin_reporting.vlbhxcajphyjkeueubud:***@aws-0-eu-west-1.pooler.supabase.com:6543/postgres' 
});
await repClient.connect();
```

---

## 3. Detailed SQL Assertion Matrix (21 Tests)

| # | Operation Tested | Target SQL Statement | Expected Outcome | Actual Database Response | Status |
|---|---|---|---|---|:---:|
| **1** | View Query | `SELECT * FROM public.v_report_workspace_directory LIMIT 5;` | SUCCESS | Returned 5 rows | **PASS** |
| **2** | View Query | `SELECT * FROM public.v_report_users_memberships LIMIT 5;` | SUCCESS | Returned 5 rows | **PASS** |
| **3** | View Query | `SELECT * FROM public.v_report_subscription_overview LIMIT 5;` | SUCCESS | Returned 5 rows | **PASS** |
| **4** | View Query | `SELECT * FROM public.v_report_payments_collections LIMIT 5;` | SUCCESS | Returned 5 rows | **PASS** |
| **5** | View Query | `SELECT * FROM public.v_report_invoices_receivables LIMIT 5;` | SUCCESS | Returned 5 rows | **PASS** |
| **6** | View Query | `SELECT * FROM public.v_report_inventory_summary LIMIT 5;` | SUCCESS | Returned 0 rows (valid empty) | **PASS** |
| **7** | View Query | `SELECT * FROM public.v_report_customers_suppliers LIMIT 5;` | SUCCESS | Returned 5 rows | **PASS** |
| **8** | View Query | `SELECT * FROM public.v_report_business_activity LIMIT 5;` | SUCCESS | Returned 5 rows | **PASS** |
| **9** | View Query | `SELECT * FROM public.v_report_platform_kpi_aggregates;` | SUCCESS | Returned 1 row aggregate | **PASS** |
| **10** | Direct Table Access | `SELECT * FROM public.workspaces LIMIT 1;` | **DENIED** | `error: permission denied for function current_user_workspace_id (Code: 42501)` | **PASS** |
| **11** | Direct Table Access | `SELECT * FROM public.invoices LIMIT 1;` | **DENIED** | `error: permission denied for function current_user_workspace_id (Code: 42501)` | **PASS** |
| **12** | Direct Table Access | `SELECT * FROM public.profiles LIMIT 1;` | **DENIED** | `error: permission denied for function current_user_workspace_id (Code: 42501)` | **PASS** |
| **13** | Sensitive Auth Access | `SELECT * FROM auth.users LIMIT 1;` | **DENIED** | `error: permission denied for schema auth (Code: 42501)` | **PASS** |
| **14** | Data Injection | `INSERT INTO public.workspaces (company_name) VALUES ('HACK');` | **DENIED** | `error: cannot execute INSERT in a read-only transaction (Code: 25006)` | **PASS** |
| **15** | Data Mutation | `UPDATE public.workspaces SET company_name = 'HACK' WHERE id = '...';` | **DENIED** | `error: permission denied for function current_user_workspace_id (Code: 42501)` | **PASS** |
| **16** | Data Deletion | `DELETE FROM public.workspaces WHERE id = '...';` | **DENIED** | `error: cannot execute DELETE in a read-only transaction (Code: 25006)` | **PASS** |
| **17** | Table Wiping | `TRUNCATE public.workspaces;` | **DENIED** | `error: cannot execute TRUNCATE TABLE in a read-only transaction (Code: 25006)` | **PASS** |
| **18** | Schema Mutation | `CREATE TABLE public.hack_tbl (id int);` | **DENIED** | `error: cannot execute CREATE TABLE in a read-only transaction (Code: 25006)` | **PASS** |
| **19** | Schema Mutation | `ALTER TABLE public.workspaces ADD COLUMN hack_col text;` | **DENIED** | `error: cannot execute ALTER TABLE in a read-only transaction (Code: 25006)` | **PASS** |
| **20** | Object Destruction | `DROP TABLE public.workspaces;` | **DENIED** | `error: cannot execute DROP TABLE in a read-only transaction (Code: 25006)` | **PASS** |
| **21** | Function Creation | `CREATE FUNCTION public.hack_fn() RETURNS void AS $$ ... $$;` | **DENIED** | `error: cannot execute CREATE FUNCTION in a read-only transaction (Code: 25006)` | **PASS** |

---

## 4. Architectural Analysis of Denial Mechanisms

1. **Dual-Layer RLS & Routine Revocation:**  
   When the role attempted `SELECT * FROM public.workspaces`, the RLS policy evaluated `current_user_workspace_id()`. Because `REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM v_super_admin_reporting` was applied, PostgreSQL denied execution immediately at the function boundary, rendering direct table access impossible.
2. **PostgreSQL Read-Only Transaction Guard (`25006`):**  
   `ALTER ROLE v_super_admin_reporting SET default_transaction_read_only = TRUE` forces the storage manager to reject all transaction states containing mutation WAL records.
3. **Schema Wall:**  
   `REVOKE ALL ON SCHEMA auth` cleanly blocks access to user credentials, email confirmation tokens, and encrypted passwords.

