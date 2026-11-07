# VISTAAR SUPER ADMIN — PRODUCTION REPORTING ROLE SQL REVIEW

**Document Reference:** `docs/PRODUCTION_REPORTING_ROLE_SQL_REVIEW.md`  
**Review Date:** November 7, 2026  
**Status:** PROPOSED FOR OWNER APPROVAL — NOT EXECUTED  
**Target Database:** VISTAAR Business OS Production (`kluxsykimnjivkqxelba`)  
**Proposed Role Name:** `v_super_admin_reporting`  

> [!CAUTION]
> **GOVERNANCE MANDATE: DO NOT EXECUTE THIS SQL AGAINST PRODUCTION**  
> This SQL specification represents an independently reviewed, least-privilege security proposal. It must NOT be executed on production until the platform owner conducts an authorized review and provides explicit sign-off.

---

## 1. Executive Summary

Connecting Super Admin to genuine production records requires establishing a **dedicated, strictly read-only PostgreSQL role** (`v_super_admin_reporting`). 

Under zero-trust principles:
1. `service_role` credentials (which bypass Row Level Security and possess unrestricted write capabilities) must **never** be used for cross-tenant reporting in production.
2. The reporting role must have **zero write capabilities** (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `ALTER`, `DROP`).
3. Direct access to raw operational application tables (`workspaces`, `invoices`, `profiles`, `customers`, `products`, `payment_transactions`, `auth.users`) is completely revoked.
4. Access is granted exclusively to 9 pre-aggregated, sanitized reporting views (`v_report_*`).

---

## 2. Proposed Role Provisioning SQL (Reviewed Proposal)

```sql
-- =============================================================================
-- VISTAAR PRODUCTION REPORTING ROLE PROVISIONING SCRIPT
-- Status: PROPOSED — PENDING OWNER AUTHORIZATION
-- Target Instance: kluxsykimnjivkqxelba (PostgreSQL 15+ / Supabase)
-- =============================================================================

-- Step 1: Create the dedicated reporting role with strict boundary attributes
-- (Password must be generated via secure vault / Secrets Manager during provisioning)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v_super_admin_reporting') THEN
        CREATE ROLE v_super_admin_reporting WITH
            LOGIN
            PASSWORD 'REPLACE_WITH_SECURE_VAULT_GENERATED_SECRET'
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOREPLICATION
            NOBYPASSRLS
            INHERIT
            CONNECTION LIMIT 5;
    END IF;
END $$;

-- Step 2: Enforce transaction-level read-only invariant and statement timeouts
ALTER ROLE v_super_admin_reporting SET default_transaction_read_only = TRUE;
ALTER ROLE v_super_admin_reporting SET statement_timeout = '8000ms';
ALTER ROLE v_super_admin_reporting SET idle_in_transaction_session_timeout = '5000ms';

-- Step 3: Hardened Schema Permissions
-- Revoke all public schema modifications from the reporting role
REVOKE ALL ON SCHEMA public FROM v_super_admin_reporting;
GRANT USAGE ON SCHEMA public TO v_super_admin_reporting;

-- Explicitly revoke all privileges on existing operational tables, sequences, and functions
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM v_super_admin_reporting;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM v_super_admin_reporting;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM v_super_admin_reporting;

-- Ensure future tables created by migrations do not automatically grant permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM v_super_admin_reporting;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM v_super_admin_reporting;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM v_super_admin_reporting;

-- Step 4: Revoke access to Supabase Internal Schemas
REVOKE ALL ON SCHEMA auth FROM v_super_admin_reporting;
REVOKE ALL ON SCHEMA storage FROM v_super_admin_reporting;
REVOKE ALL ON SCHEMA realtime FROM v_super_admin_reporting;
REVOKE ALL ON SCHEMA supabase_functions FROM v_super_admin_reporting;

-- Step 5: Grant SELECT access EXCLUSIVELY on Approved Sanitized Reporting Views
GRANT SELECT ON public.v_report_workspace_directory TO v_super_admin_reporting;
GRANT SELECT ON public.v_report_users_memberships TO v_super_admin_reporting;
GRANT SELECT ON public.v_report_subscription_overview TO v_super_admin_reporting;
GRANT SELECT ON public.v_report_payments_collections TO v_super_admin_reporting;
GRANT SELECT ON public.v_report_invoices_receivables TO v_super_admin_reporting;
GRANT SELECT ON public.v_report_inventory_summary TO v_super_admin_reporting;
GRANT SELECT ON public.v_report_customers_suppliers TO v_super_admin_reporting;
GRANT SELECT ON public.v_report_business_activity TO v_super_admin_reporting;
GRANT SELECT ON public.v_report_platform_kpi_aggregates TO v_super_admin_reporting;

-- =============================================================================
-- END OF REVIEWED PROPOSAL
-- =============================================================================
```

---

## 3. Privilege Matrix & Security Semantics

| Privilege Type | State | Justification |
|---|:---:|---|
| `LOGIN` | **ENABLED** | Required for Gateway BFF pooler to authenticate over SSL. |
| `SUPERUSER` | **DISABLED** | Zero administrative privilege escalation possible. |
| `CREATEDB` / `CREATEROLE` | **DISABLED** | Role cannot create or mutate database infrastructure or grant access to other identities. |
| `BYPASSRLS` | **DISABLED** | Role cannot bypass PostgreSQL Row Level Security. |
| `INSERT` | **REVOKED** | Impossible to inject records into production. |
| `UPDATE` | **REVOKED** | Impossible to modify production state. |
| `DELETE` | **REVOKED** | Impossible to delete customer data. |
| `TRUNCATE` | **REVOKED** | Impossible to wipe tables. |
| `DDL` (`ALTER`/`DROP`) | **REVOKED** | Impossible to alter schemas. |
| `default_transaction_read_only` | **TRUE** | Server-enforced transaction abort if any write statement is attempted. |
| `statement_timeout` | **8,000 ms** | Prevents analytical queries from hogging CPU or blocking OLTP write transactions. |
| `CONNECTION LIMIT` | **5** | Protects the production connection pool from denial-of-service starvation. |

---

## 4. View Security Semantics & Cross-Tenant Exposure Analysis

1. **Security Invoker vs. Security Definer:**  
   PostgreSQL views default to `security_invoker = false`, executing with the permissions of the view creator (`postgres`). This allows `v_super_admin_reporting` to read aggregated tenant metrics from the views without needing direct read permissions on sensitive underlying tables (`workspaces`, `invoices`, `profiles`, `customers`).
2. **Exclusion of Sensitive Credentials:**  
   The views deliberately omit:
   - All `auth.users` columns (password hashes, confirmation tokens, phone change OTPs).
   - All private payment credentials (merchant bank account numbers, UPI VPAs, customer card tokens).
   - Direct personal identifiers of retail customers (Aadhaar, PAN).
3. **Cross-Tenant Isolation Invariant:**  
   While the Super Admin control plane requires aggregated oversight across workspaces, individual tenant customer records remain shielded behind aggregate metrics (e.g., total customer counts, gross balances, aggregated GMV) rather than leaking individual shopping carts or customer phone directories.

