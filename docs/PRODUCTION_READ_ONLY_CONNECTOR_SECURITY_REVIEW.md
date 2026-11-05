# VISTAAR Super Admin — Production Read-Only Connector Security Review

**Document Reference:** `docs/PRODUCTION_READ_ONLY_CONNECTOR_SECURITY_REVIEW.md`  
**Execution Date:** November 5, 2026  
**Review Target:** Business OS Production Supabase (`kluxsykimnjivkqxelba`)  
**Current Connector Status:** STRICTLY AIR-GAPPED — PRE-FLIGHT READ-ONLY SPECIFICATION  
**Audit Finding:** **NO-GO FOR IMMEDIATE PRODUCTION ACCESS** (Awaiting explicit human owner approval; staging remains active environment)  

---

## 1. Executive Summary

This security review designs the architectural boundaries, role permissions, reporting views, and network controls required before connecting VISTAAR Super Admin to the genuine production Business OS database (`kluxsykimnjivkqxelba`).

Under platform governance rules:
> **The production security audit must return GO before enabling production access.**  
> **Do not connect to production, execute production SQL, change production authentication, or deploy production integration until the owner explicitly approves the reviewed release.**

All development, verification, and automated integration tests currently run on Staging (`vlbhxcajphyjkeueubud`).

---

## 2. Air-Gap Architecture & Defense-in-Depth

The Gateway BFF enforces an air-gap guard at process initialization:

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

## 3. Dedicated Read-Only Connector Specification

When production monitoring is formally authorized, access will NOT be granted via `service_role` credentials. Instead, a dedicated PostgreSQL reporting role will be established.

### 3.1 Role Definition: `v_super_admin_reporting`

```sql
-- Production SQL Specification (To be executed ONLY upon explicit owner approval)
CREATE ROLE v_super_admin_reporting WITH LOGIN PASSWORD '***REDACTED***' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

-- Revoke all direct table modifications
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM v_super_admin_reporting;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM v_super_admin_reporting;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM v_super_admin_reporting;

-- Explicitly prohibit DDL
ALTER ROLE v_super_admin_reporting SET default_transaction_read_only = TRUE;
```

### 3.2 Sanitized Administrative Reporting Views

Direct access to raw customer tables (such as customer credit card tokens or individual personal data) is strictly prohibited. The reporting role is granted `SELECT` access exclusively on sanitized aggregation views:

```sql
-- 1. Sanitized Platform Overview View
CREATE OR REPLACE VIEW public.v_platform_overview_reporting AS
SELECT 
  count(DISTINCT w.id) AS total_workspaces,
  count(DISTINCT CASE WHEN w.is_active THEN w.id END) AS active_workspaces,
  count(DISTINCT p.id) AS total_users,
  count(DISTINCT CASE WHEN p.role != 'owner' THEN p.id END) AS total_staff_employees,
  count(DISTINCT CASE WHEN ws.status = 'active' THEN ws.id END) AS active_subscriptions,
  count(DISTINCT CASE WHEN ws.status = 'trialing' THEN ws.id END) AS trialing_subscriptions
FROM public.workspaces w
LEFT JOIN public.profiles p ON p.workspace_id = w.id
LEFT JOIN public.workspace_subscriptions ws ON ws.workspace_id = w.id
WHERE w.is_test = FALSE AND w.deleted_at IS NULL;

-- 2. Sanitized Financial Aggregation View
CREATE OR REPLACE VIEW public.v_platform_financial_reporting AS
SELECT
  COALESCE(sum(CASE WHEN status IN ('verified_success', 'successful') THEN amount_inr ELSE 0 END), 0) AS gross_saas_collected_inr,
  COALESCE(sum(CASE WHEN status = 'refunded' THEN amount_inr ELSE 0 END), 0) AS total_refunds_inr
FROM public.payment_transactions
WHERE is_test = FALSE;

-- Grant SELECT exclusively to the reporting role
GRANT SELECT ON public.v_platform_overview_reporting TO v_super_admin_reporting;
GRANT SELECT ON public.v_platform_financial_reporting TO v_super_admin_reporting;
```

---

## 4. Threat Model & Control Matrix

| Threat Category | Potential Impact | Mitigating Architectural Control | Verification Status |
| :--- | :--- | :--- | :--- |
| **Accidental Production Mutation** | Data loss, merchant downtime | `default_transaction_read_only = TRUE` on PostgreSQL role; zero `INSERT`/`UPDATE`/`DELETE` grants | Verified in design |
| **Credential Leakage** | Unauthorized production queries | Read-only connection string stored exclusively in AWS Secrets Manager; zero credentials in frontend | Verified in design |
| **Tenant Data Cross-Exposure** | Privacy violation | Aggregated reporting views omit sensitive customer details (PII, bank numbers) | Verified in design |
| **Replay & Impersonation** | Unauthorized admin action | GCAP cryptographic assertions with HMAC-SHA256 nonces and timestamps | Implemented on Gateway |
| **Denial of Service (DoS)** | Production database latency | Connection pool limited to max 5 connections; strict query timeout of 5000ms | Specified in connector |

---

## 5. Security Decision: GO / NO-GO

- **Staging Control Plane Status:** **GO** (Operational on `vlbhxcajphyjkeueubud`).
- **Production Integration Status:** **NO-GO (AIR-GAPPED)**  
  Production access will remain completely disabled until the platform owner conducts a final review of this document and provides explicit activation authorization.
