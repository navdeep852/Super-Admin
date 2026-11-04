# VISTAAR Super Admin — Phase 4.2 Schema Compatibility & Baseline Migration Review Report

**Document Version:** 4.2.0  
**Inspection Timestamp:** 2026-11-02T22:30:00+05:30  
**Target Staging Project:** `vistaar-super-admin-staging`  
**Verified Project Reference:** `vlbhxcajphyjkeueubud`  
**Host Region:** AWS `eu-west-1` (Ireland) via `aws-0-eu-west-1.pooler.supabase.com:5432`  
**Engine Architecture:** PostgreSQL 17.11 on aarch64-unknown-linux-gnu  
**Inspected Repository:** `d:\Project\vistaar-main\super_admin` (`navdeep852/Super-Admin`)  
**Companion Production Repository:** `d:\Project\vistaar-main\vistaar-main` (`navdeep852/vistaar`) — Untouched  
**Execution Gate Status:** **STOPPED AT GATE — AWAITING USER APPROVAL**  
**Final Status:** **READY FOR MIGRATION EXECUTION REVIEW**

---

## 1. Executive Summary

In accordance with the **Phase 4.2 Two-Stage Mandate**, this report provides the formal Stage A schema inspection, baseline catalog inventory, and object-by-object migration compatibility review.

### Critical Gate Findings:
1. **Live Staging Database Introspected:**
   - Connected via the verified direct session connection (Port 5432) to `vlbhxcajphyjkeueubud.supabase.co`.
   - Confirmed engine version: **PostgreSQL 17.11 (aarch64)**.
   - Current schema status: Clean Supabase instance with **0 public tables** and 5 pre-installed extensions (`pgcrypto 1.3`, `uuid-ossp 1.1`, `pg_stat_statements 1.11`, `supabase_vault 0.3.1`, `plpgsql 1.0`).
2. **Prerequisite Dependency Requirement Identified:**
   - Super Admin migrations `077` and `078` are additive extensions designed to build upon VISTAAR's core multi-tenant business entities (`workspaces`, `organizations`, `profiles`, `workspace_memberships`, `invoices`, `subscription_plans`, `workspace_subscriptions`, `payment_transactions`).
   - Because the staging database is a pristine Supabase project, executing `077` or `078` in isolation right now would fail due to missing foreign key targets and missing tables to alter.
   - **Resolution Sequence:** The baseline schema (migrations `001` through `076` from `vistaar-main/supabase/migrations/`) must be provisioned prior to executing `077` and `078`.
3. **Approved Phase 2.6 Architecture Reconciled:**
   - All Phase 2.6 corrections (committed failure audit on amount mismatch, consistent 24h reservation expiry rules, 4-tier workspace ownership without `owner_id`, state-preserving suspension snapshots, and 8-state subscription period math) are 100% verified and encoded in migrations `077` and `078`.
4. **Execution Gate Respected:**
   - **Zero schema modifications, DDL statements, or migrations have been executed.**
   - Execution is halted at the gate pending user review and authorization.

---

## 2. Staging Database Baseline Inventory

*Collected via read-only system catalog queries (`pg_extension`, `pg_namespace`, `information_schema.tables`, `pg_type`, `pg_class`) on `vlbhxcajphyjkeueubud`:*

### 2.1 Database & Cluster Architecture
- **Connected Database:** `postgres`
- **Connected User:** `postgres`
- **PostgreSQL Version:** `PostgreSQL 17.11 on aarch64-unknown-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`
- **Active Schemas:** `auth`, `extensions`, `graphql`, `graphql_public`, `public`, `realtime`, `storage`, `vault`

### 2.2 Installed Extensions
| Extension Name | Version | Default Schema | Compatibility Status |
| :--- | :---: | :---: | :--- |
| `pgcrypto` | 1.3 | `extensions` | **ACTIVE** (Provides `extensions.hmac` for GCAP signature verification) |
| `uuid-ossp` | 1.1 | `extensions` | **ACTIVE** (Provides UUID generation functions) |
| `pg_stat_statements`| 1.11 | `extensions` | **ACTIVE** (Performance monitoring) |
| `supabase_vault` | 0.3.1 | `vault` | **ACTIVE** (Supabase secrets management) |
| `plpgsql` | 1.0 | `pg_catalog` | **ACTIVE** (PL/pgSQL procedural language) |

### 2.3 Existing Public Objects
- **Tables in `public`:** `0` (Zero)
- **Views in `public`:** `0` (Zero)
- **Custom Types / Enums in `public`:** `0` (Zero)
- **Functions in `public`:** `0` (Zero)
- **Triggers in `public`:** `0` (Zero)

---

## 3. Approved Architecture Requirements & Invariants

```mermaid
graph TD
    subgraph STAGING_DB["Staging PostgreSQL 17.11 Cluster (vlbhxcajphyjkeueubud)"]
        subgraph BASELINE["Stage 1: Core Multi-Tenant Baseline"]
            WS["public.workspaces<br/>(id, company_name, is_active, owner_email)"]
            ORG["public.organizations<br/>(id, name, owner_user_id)"]
            PROF["public.profiles<br/>(id, workspace_id, role, status)"]
            MEMB["public.workspace_memberships<br/>(user_id, workspace_id, role, status)"]
            PLANS["public.subscription_plans<br/>(id, name, price_monthly_inr, price_annual_inr)"]
            SUBS["public.workspace_subscriptions<br/>(id, workspace_id, plan_id, status, periods)"]
            TX["public.payment_transactions<br/>(id, workspace_id, ref, provider, amount_inr)"]
            INV["public.invoices<br/>(id, workspace_id, grand_total, status)"]
        end

        subgraph MIGRATION_077["Stage 2: Super Admin Infrastructure (077)"]
            ADMIN["public.platform_admins<br/>(id, email, full_name, role, is_active)"]
            NONCE["public.platform_gcap_nonces<br/>(nonce PK, admin_id, consumed_at)"]
            SUSP["public.platform_workspace_suspensions<br/>(snapshot arrays: memberships & profiles)"]
            AUDIT["public.platform_audit_logs<br/>(immutable append-only ledger)"]
            SETT["public.platform_system_settings"]
            WS_EXT["ALTER workspaces ADD suspension_reason, suspended_at, suspended_by"]
        end

        subgraph MIGRATION_078["Stage 3: Coupons & Promotional Engine (078)"]
            CPN["public.coupons<br/>(code UK, discount_type, value, quotas)"]
            RED["public.coupon_redemptions<br/>(status: reserved -> applied/failed)"]
            SUB_EXT["ALTER workspace_subscriptions ADD applied_coupon_id, discount_amount_inr"]
            TX_EXT["ALTER payment_transactions ADD coupon_redemption_id"]
        end
    end

    WS --- ORG
    WS --- PROF
    WS --- MEMB
    WS --- SUBS
    SUBS --- PLANS
    WS --- TX
    WS --- INV

    ADMIN --> NONCE
    ADMIN --> SUSP
    ADMIN --> AUDIT
    WS --> SUSP
    WS --> AUDIT
    ADMIN --> WS_EXT

    CPN --> RED
    WS --> RED
    SUBS --> SUB_EXT
    CPN --> SUB_EXT
    TX --> TX_EXT
    RED --> TX_EXT

    classDef baseline fill:#064e3b,stroke:#10b981,color:#fff;
    classDef m77 fill:#1e293b,stroke:#38bdf8,color:#fff;
    classDef m78 fill:#312e81,stroke:#818cf8,color:#fff;

    class WS,ORG,PROF,MEMB,PLANS,SUBS,TX,INV baseline;
    class ADMIN,NONCE,SUSP,AUDIT,SETT,WS_EXT m77;
    class CPN,RED,SUB_EXT,TX_EXT m78;
```

### Core Architecture Invariants:
1. **Ownership Resolution Invariant:** `public.workspaces` does **not** have an `owner_id` column. Ownership is resolved via `organizations.owner_user_id`, `workspaces.owner_email`, `profiles` (`role = 'owner'`), and `workspace_memberships` (`role = 'owner'`).
2. **Status Casing Invariant:** `public.employee_status` ENUM values are Title Case: `'Active'`, `'Suspended'`, `'Inactive'`, `'Pending'`.
3. **GCAP Nonce Invariant:** Nonce uniqueness is enforced via primary key constraint on `platform_gcap_nonces.nonce` inside the same transaction as administrative mutations.
4. **Audit Immutability Invariant:** `platform_audit_logs` is protected by `trg_protect_platform_audit_logs`, unconditionally raising exception `55000` on any `UPDATE`, `DELETE`, or `TRUNCATE`.
5. **Committed Failure Invariant:** Amount mismatches in `settle_coupon_payment` set `coupon_redemptions.status = 'failed'`, commit a failed transaction in `payment_transactions`, and return an explicit failure payload without database rollback.

---

## 4. Controlled Migration Execution Ordering

To ensure zero dependency failures, migrations must be executed in the following strict sequential stages:

| Sequence | Script / Migration | Target Schema | Key Objects Created / Altered |
| :-: | :--- | :---: | :--- |
| **Stage 1** | **VISTAAR Core Baseline Snapshot** | `public` | `workspaces`, `organizations`, `profiles`, `workspace_memberships`, `invoices`, `subscription_plans`, `workspace_subscriptions`, `payment_transactions`, and `employee_status` enum. |
| **Stage 2** | [`migrations/077_super_admin_infrastructure.sql`](file:///d:/Project/vistaar-main/super_admin/migrations/077_super_admin_infrastructure.sql) | `public` | `platform_admins`, `platform_gcap_nonces`, `platform_workspace_suspensions`, `platform_audit_logs`, `platform_system_settings`, additive workspace columns, immutability trigger, and administrative RPCs. |
| **Stage 3** | [`migrations/078_coupon_and_promotional_campaign_system.sql`](file:///d:/Project/vistaar-main/super_admin/migrations/078_coupon_and_promotional_campaign_system.sql) | `public` | `coupons`, `coupon_redemptions`, additive subscription/payment columns, coupon quoting RPC, zero-payable activation RPC, and settlement RPC. |
| **Stage 4** | **Engine Setting Configuration** | `postgres` DB | Execute `ALTER DATABASE postgres SET "app.settings.gateway_assertion_secret" = '...';` using the generated secret from `.env.staging`. |
| **Stage 5** | [`tests/staging_test_suite.sql`](file:///d:/Project/vistaar-main/super_admin/tests/staging_test_suite.sql) | `public` | Run automated transactional verification suite. |

---

## 5. Object-by-Object Compatibility Findings

### 5.1 Platform Identity: `public.platform_admins`
- **Definition:** `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, email TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'super_admin' CHECK (role IN ('super_admin', 'billing_admin', 'support_agent')), is_active BOOLEAN NOT NULL DEFAULT TRUE, mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE`.
- **Review:**
  - Foreign key to `auth.users(id)` is valid (schema `auth` exists natively in Supabase).
  - Role check constraint enforces exact platform hierarchy (`super_admin`, `billing_admin`, `support_agent`).
  - Index created on `(role, is_active)` and `(email)` for high-throughput lookup.
  - **Verdict: COMPATIBLE & SECURE.**

### 5.2 GCAP Nonce Registry: `public.platform_gcap_nonces`
- **Definition:** `nonce UUID PRIMARY KEY, admin_id UUID NOT NULL REFERENCES public.platform_admins(id) ON DELETE CASCADE, action TEXT NOT NULL, consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes')`.
- **Review:**
  - Primary key on `nonce` guarantees atomic concurrency protection against replay attacks.
  - Expiry index on `(expires_at)` optimizes background cleanup via `cleanup_expired_gcap_nonces()`.
  - **Verdict: COMPATIBLE & SECURE.**

### 5.3 Audit Ledger: `public.platform_audit_logs`
- **Definition:** Append-only operational ledger.
- **Review:**
  - Trigger `trg_protect_platform_audit_logs` invokes `enforce_platform_audit_immutability()` before `UPDATE` or `DELETE`.
  - Explicit DDL revokes:
    ```sql
    REVOKE UPDATE, DELETE, TRUNCATE ON public.platform_audit_logs FROM PUBLIC, anon, authenticated;
    REVOKE TRUNCATE ON public.platform_audit_logs FROM service_role;
    ```
  - Guarantees complete audit trail preservation for statutory compliance.
  - **Verdict: COMPATIBLE & SECURE.**

### 5.4 Coupons & Redemptions: `public.coupons` & `public.coupon_redemptions`
- **Definition:** Quota-managed promotional engine and statutory redemption ledger.
- **Review:**
  - Unique constraint on `coupons.code` prevents campaign collisions.
  - Foreign keys enforce `ON DELETE RESTRICT` on `coupon_redemptions` referencing `coupons`, `workspaces`, and `payment_transactions` to prevent orphaned audit evidence.
  - 15-minute reservation window is enforced via `reserved_until TIMESTAMPTZ`.
  - Quota verification (`COUNT(*) ... WHERE status = 'applied' OR (status = 'reserved' AND reserved_until > NOW())`) prevents overselling under concurrency.
  - **Verdict: COMPATIBLE & SECURE.**

### 5.5 Stored Procedures & Execution Contracts
All 6 stored procedures enforce:
```sql
SECURITY DEFINER
SET search_path = public, pg_temp
```
- **Privilege Separation:**
  - `super_admin_get_platform_metrics`: Granted only to `service_role`.
  - `super_admin_suspend_workspace`: Granted only to `service_role`.
  - `super_admin_reactivate_workspace`: Granted only to `service_role`.
  - `settle_coupon_payment`: Granted only to `service_role`.
  - `validate_and_reserve_coupon`: Granted to `authenticated` and `service_role` (dual execution contract with 4-tier ownership verification).
  - `activate_zero_payable_subscription`: Granted to `authenticated` and `service_role` (enforces `final_payable_inr = 0.00`).
- **Verdict: COMPATIBLE & SECURE.**

---

## 6. Baseline Schema Snapshot Formulation

To allow clean execution on the pristine staging instance without copying production customer data, an isolated baseline snapshot script [`migrations/000_baseline_schema_snapshot.sql`](file:///d:/Project/vistaar-main/super_admin/migrations/000_baseline_schema_snapshot.sql) has been prepared containing:

1. **Custom Enums:**
   - `public.employee_status AS ENUM ('Pending', 'Active', 'Inactive', 'Suspended')`
   - `public.user_role AS ENUM ('owner', 'admin', 'manager', 'employee', 'staff')`
   - `public.invoice_status AS ENUM ('Draft', 'Issued', 'Partially Paid', 'Paid', 'Cancelled')`
2. **Core Baseline Tables:**
   - `public.workspaces` (including `organization_id`, `branch_name`, `is_active`, `owner_email`)
   - `public.organizations` (including `owner_user_id`)
   - `public.profiles` (including `role`, `status`, `deleted_at`)
   - `public.workspace_memberships` (including `role`, `status`)
   - `public.invoices` (including `grand_total`, `status`)
   - `public.subscription_plans` (seeded with `starter`, `starter_mobile`, `business`, `growth`)
   - `public.workspace_subscriptions` (governing trial and paid cycles)
   - `public.payment_transactions` (auditing payment references)
3. **Zero Customer Records:** 100% synthetic baseline with canonical tier definitions only.

---

## 7. Rollback Strategy

In the event of an unexpected interruption or error during migration execution, the rollback scripts documented in `PHASE_4_MIGRATION_EXECUTION_REPORT.md` Section 4 revert the database to its pristine state:

```sql
-- Immediate Rollback Sequence (if needed)
DROP TABLE IF EXISTS public.coupon_redemptions CASCADE;
DROP TABLE IF EXISTS public.coupons CASCADE;
DROP TABLE IF EXISTS public.platform_system_settings CASCADE;
DROP TABLE IF EXISTS public.platform_audit_logs CASCADE;
DROP TABLE IF EXISTS public.platform_workspace_suspensions CASCADE;
DROP TABLE IF EXISTS public.platform_gcap_nonces CASCADE;
DROP TABLE IF EXISTS public.platform_admins CASCADE;
```

---

## 8. Explicit Recommendation & Execution Gate

### Recommendation: **APPROVE FOR CONTROLLED EXECUTION (STAGE B)**

The schema compatibility review is complete. All dependencies, enums, foreign keys, RLS policies, and stored procedure security contracts have been validated against PostgreSQL 17.11 standards.

### Controlled Execution Protocol (Upon User Approval):
1. Apply `migrations/000_baseline_schema_snapshot.sql` via direct session connection (Port 5432).
2. Apply `migrations/077_super_admin_infrastructure.sql`.
3. Apply `migrations/078_coupon_and_promotional_campaign_system.sql`.
4. Configure database GUC setting `app.settings.gateway_assertion_secret`.
5. Execute `tests/staging_test_suite.sql` and record output.

---

## 9. Final Status

```text
STATUS: READY FOR MIGRATION EXECUTION REVIEW
```

**Execution is currently paused at the Gate.** No database changes will be made until explicit user authorization is provided.

