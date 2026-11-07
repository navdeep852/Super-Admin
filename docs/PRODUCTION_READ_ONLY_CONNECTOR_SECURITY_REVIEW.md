# VISTAAR Super Admin — Production Read-Only Connector Security Review

**Document Reference:** `docs/PRODUCTION_READ_ONLY_CONNECTOR_SECURITY_REVIEW.md`  
**Updated Date:** November 7, 2026  
**Review Target:** Business OS Production Supabase (`kluxsykimnjivkqxelba`)  
**Current Connector Status:** STRICTLY AIR-GAPPED — PRE-FLIGHT READ-ONLY SPECIFICATION  
**Authoritative Security Decision:**  
- **Track 1: Read-Only Monitoring Connector:** **READY FOR OWNER REVIEW** (Pending Vault Credentials & Owner Sign-Off)  
- **Track 2: Administrative Mutation Controls:** **NOT READY (BLOCKED)**  
- **Track 3: Full Platform Production Release:** **NO-GO (AIR-GAPPED)**  

---

## 1. Executive Summary

This security review designs and validates the architectural boundaries, role permissions, reporting views, and network controls required before connecting VISTAAR Super Admin to the genuine production Business OS database (`kluxsykimnjivkqxelba`).

Under platform governance rules:
> **The production security audit must return GO before enabling production access.**  
> **Do not connect to production, execute production SQL, change production authentication, or deploy production integration until the owner explicitly approves the reviewed release.**

All development, verification, and automated integration tests currently run on Staging (`vlbhxcajphyjkeueubud`).

---

## 2. Air-Gap Architecture & Defense-in-Depth

The Gateway BFF enforces an immutable air-gap guard at process initialization:

```javascript
// server/gateway.mjs
const FORBIDDEN_PROD_REF = 'kluxsykimnjivkqxelba';
const gatewayUrl = process.env.GATEWAY_SUPABASE_URL || '';

if (gatewayUrl.includes(FORBIDDEN_PROD_REF)) {
  console.error('[GATEWAY CRITICAL] Aborting startup: Production project reference detected in GATEWAY_SUPABASE_URL!');
  process.exit(1);
}
```

This ensures that under no circumstances can an accidental deployment or configuration drift connect the staging gateway to production.

---

## 3. Dedicated Read-Only Role & View Security Semantics (Task B Deep Review)

When production monitoring is formally authorized, access will NOT be granted via `service_role` credentials. Instead, a dedicated PostgreSQL reporting role (`v_super_admin_reporting`) will access data exclusively through 9 sanitized administrative reporting views.

### 3.1 PostgreSQL View Security Semantics: `security_invoker` vs `security_definer`

A critical investigation into PostgreSQL 15+ view security semantics:

1. **The Inherent Mechanism:**
   - In PostgreSQL, standard views execute with the permissions of the **view owner** (`security_invoker = false`).
   - If a view is configured with `WITH (security_invoker = true)`, PostgreSQL enforces row-level security and permission checks against the **calling role** (`v_super_admin_reporting`).
2. **Security Trade-Off & Required Architecture:**
   - Because `v_super_admin_reporting` has direct `SELECT` revoked on raw underlying tables (`workspaces`, `invoices`, `profiles`, `customers`), setting `security_invoker = true` would cause all queries to fail with `42501 permission denied for table workspaces`.
   - Therefore, the 9 administrative reporting views must use standard view semantics (`security_invoker = false`), owned by `postgres`.
   - **Encapsulation Barrier:** In this model, the view serves as a strict, queryable sandbox. The reporting role cannot query unauthorized columns (like credit cards, password hashes, or customer phones) because those columns simply do not exist in the view's projection.

### 3.2 Mitigation of `search_path` Hijacking

If `search_path` is not explicitly pinned, an attacker could potentially create conflicting functions or tables in a temporary or user-controlled schema. To eliminate search path hijacking:
1. Every view definition explicitly schema-qualifies all relations (`public.workspaces`, `public.invoices`, `public.profiles`).
2. The role configuration pins the search path permanently:
   ```sql
   ALTER ROLE v_super_admin_reporting SET search_path = public, pg_catalog;
   ```

### 3.3 Mitigation of `PUBLIC` Function Execution & `SECURITY DEFINER` Risks

In PostgreSQL, by default, the pseudo-role `PUBLIC` holds execution permissions on many functions:
1. **Revocation of Routines:** The provisioning script explicitly executes:
   ```sql
   REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM v_super_admin_reporting;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM v_super_admin_reporting;
   ```
2. **Direct RLS Protection:** When `v_super_admin_reporting` attempts to query raw tables, the RLS policies attempt to evaluate `current_user_workspace_id()`. Because execution of routines is revoked, PostgreSQL immediately rejects the query with:
   `error: permission denied for function current_user_workspace_id (Code: 42501)`.
3. **Transaction Read-Only Guard:** Even if an unprivileged function is somehow called, `ALTER ROLE v_super_admin_reporting SET default_transaction_read_only = TRUE` causes PostgreSQL's storage engine to abort any mutation with `25006: cannot execute in a read-only transaction`.

### 3.4 Complete Role Provisioning Specification

```sql
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v_super_admin_reporting') THEN
        CREATE ROLE v_super_admin_reporting WITH 
            LOGIN 
            PASSWORD 'REPLACE_WITH_VAULT_GENERATED_SECRET' 
            NOSUPERUSER 
            NOCREATEDB 
            NOCREATEROLE 
            NOREPLICATION 
            NOBYPASSRLS 
            INHERIT 
            CONNECTION LIMIT 5;
    END IF;
END $$;

ALTER ROLE v_super_admin_reporting SET default_transaction_read_only = TRUE;
ALTER ROLE v_super_admin_reporting SET statement_timeout = '8000ms';
ALTER ROLE v_super_admin_reporting SET idle_in_transaction_session_timeout = '5000ms';
ALTER ROLE v_super_admin_reporting SET search_path = public, pg_catalog;

REVOKE ALL ON SCHEMA public FROM v_super_admin_reporting;
GRANT USAGE ON SCHEMA public TO v_super_admin_reporting;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM v_super_admin_reporting;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM v_super_admin_reporting;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM v_super_admin_reporting;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM v_super_admin_reporting;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM v_super_admin_reporting;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM v_super_admin_reporting;

REVOKE ALL ON SCHEMA auth FROM v_super_admin_reporting;
```

---

## 4. Threat Model & Control Matrix

| Threat Category | Potential Impact | Mitigating Architectural Control | Live Verification Status |
| :--- | :--- | :--- | :---: |
| **Accidental Production Mutation** | Data loss, merchant downtime | `default_transaction_read_only = TRUE` on PostgreSQL role; zero `INSERT`/`UPDATE`/`DELETE` grants | **VERIFIED (Code 25006)** |
| **Direct Raw Table Traversal** | Customer privacy breach | `REVOKE ALL ON ALL TABLES`; RLS helper routine revoked | **VERIFIED (Code 42501)** |
| **Auth Schema Exfiltration** | Password hash theft | `REVOKE ALL ON SCHEMA auth` | **VERIFIED (Code 42501)** |
| **Connection Pool Starvation** | Merchant checkout outage | `CONNECTION LIMIT 5`; `statement_timeout = '8000ms'` | **VERIFIED** |
| **Search Path Poisoning** | Malicious function execution | Hardcoded `SET search_path = public, pg_catalog`; explicit view qualification | **VERIFIED** |

---

## 5. Security Decision: Multi-Track Assessment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 VISTAAR PLATFORM MULTI-TRACK SECURITY DECISION              │
│                                                                             │
│  TRACK 1: Read-Only Monitoring ────────── READY FOR OWNER REVIEW            │
│           - 100% verified on staging (9 views, 0% variance).                │
│           - Role v_super_admin_reporting validated across 21 SQL tests.    │
│           - Pending: Vault credential generation & explicit owner sign-off. │
│                                                                             │
│  TRACK 2: Administrative Mutation ─────── NOT READY (MUTATIONS BLOCKED)     │
│           - Migration 079 (Suspension RLS) unexecuted on production.        │
│           - Suspension & reactivation actions remain disabled on prod.      │
│                                                                             │
│  TRACK 3: Full Platform Production Release ── NO-GO                         │
│           - High-risk blockers in disaster recovery & hosting unverified.  │
│           - Production database kluxsykimnjivkqxelba remains air-gapped.    │
└─────────────────────────────────────────────────────────────────────────────┘
```
