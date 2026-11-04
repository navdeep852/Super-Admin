# Phase 4.2 — Baseline Schema Independent Review & Compatibility Audit Report

**Date:** 2026-11-02  
**Target Staging Project:** `vistaar-super-admin-staging` (`vlbhxcajphyjkeueubud`)  
**Production Companion Repo:** `navdeep852/vistaar` (`d:\Project\vistaar-main\vistaar-main`) — **100% Untouched**  
**Review Status:** **PASSED & APPROVED FOR STAGE B**  
**Hosted Staging State:** **0 Public Tables (Pristine, Untouched)**

---

## 1. Executive Summary & Review Verdict

An independent compatibility audit and local PostgreSQL WASM simulation have been conducted for the three migration files and the transactional test harness comprising **Phase 4.2 Stage A**:

1. [000_baseline_schema_snapshot.sql](file:///d:/Project/vistaar-main/super_admin/migrations/000_baseline_schema_snapshot.sql)
2. [077_super_admin_infrastructure.sql](file:///d:/Project/vistaar-main/super_admin/migrations/077_super_admin_infrastructure.sql)
3. [078_coupon_and_promotional_campaign_system.sql](file:///d:/Project/vistaar-main/super_admin/migrations/078_coupon_and_promotional_campaign_system.sql)
4. [tests/staging_test_suite.sql](file:///d:/Project/vistaar-main/super_admin/tests/staging_test_suite.sql)

### Verdict: **APPROVED FOR STAGE B MIGRATION EXECUTION**

- **Hosted Database Safety:** The target Supabase database (`vlbhxcajphyjkeueubud`) was **not modified** during this audit. Stage A introspection confirmed 0 public tables exist on hosted staging.
- **Companion Production Isolation:** Production repository `vistaar-main` was inspected in read-only mode and confirmed clean on `main` with zero modifications.
- **Local Simulation Verification:** Executed a full end-to-end simulation in a local disposable PostgreSQL engine (`@electric-sql/pglite` WASM with `pgcrypto` and `uuid-ossp`). All 3 migrations executed with zero errors, generating exactly 16 public tables (each with RLS enabled), and all 10 automated test suite assertions passed.

---

## 2. Table-by-Table Baseline Compatibility Matrix

The core VISTAAR database architecture from production migrations `001_initial_schema.sql`, `058_organization_branch_architecture.sql`, and `070_subscription_plans_and_entitlements.sql` was reconciled against [000_baseline_schema_snapshot.sql](file:///d:/Project/vistaar-main/super_admin/migrations/000_baseline_snapshot.sql) and the Super Admin control plane:

| Table Name | Source Migration | Architecture Compatibility Status | Invariants & Schema Verification |
| :--- | :--- | :--- | :--- |
| `public.organizations` | Migration 058 | **Compatible (100%)** | `id UUID PRIMARY KEY`, `name VARCHAR(255)`, `owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL`. Index on `owner_user_id`. |
| `public.workspaces` | Migrations 001, 058, 077 | **Compatible (100%)** | **Invariant Confirmed:** No `owner_id` column. Uses `organization_id`, `company_name`, `owner_name`, `owner_email UNIQUE`, `owner_phone`, `branch_name`, `branch_code`, `is_main_branch`, `is_active`, `branch_password_hash`. Additive columns from 077: `suspension_reason`, `suspended_at`, `suspended_by REFERENCES platform_admins(id)`. |
| `public.profiles` | Migrations 001, 051 | **Compatible (100%)** | `id UUID PRIMARY KEY REFERENCES auth.users(id)`, `workspace_id UUID REFERENCES workspaces(id)`, `employee_id VARCHAR(50)`, `role user_role` (`'owner'`, `'admin'`, `'manager'`, `'employee'`, `'staff'`), `status employee_status` (`'Pending'`, `'Active'`, `'Inactive'`, `'Suspended'`). Composite unique on `(workspace_id, employee_id)`. |
| `public.workspace_memberships` | Migration 058 | **Compatible (100%)** | `id UUID PRIMARY KEY`, `workspace_id UUID REFERENCES workspaces(id)`, `user_id UUID REFERENCES auth.users(id)`, `role VARCHAR(50)`, `status VARCHAR(50)`, `CONSTRAINT uq_user_workspace UNIQUE (user_id, workspace_id)`. |
| `public.invoices` | Migrations 001, 061 | **Compatible (100%)** | Reconciled revenue column `grand_total NUMERIC(12, 2)` (not `total_amount`), Title Case enum `invoice_status` (`'Draft'`, `'Issued'`, `'Partially Paid'`, `'Paid'`, `'Cancelled'`). |
| `public.subscription_plans` | Migration 070 | **Compatible (100%)** | Primary key `id TEXT`. Seeded with 5 canonical plans matching approved design: `free_trial` (₹0), `starter` (₹2,499/₹299), `starter_mobile` (₹4,498/₹498), `business` (₹5,999/₹699), `growth` (₹9,999/₹1,199). |
| `public.workspace_subscriptions` | Migrations 070, 078 | **Compatible (100%)** | `workspace_id UUID UNIQUE REFERENCES workspaces(id)`, `plan_id TEXT REFERENCES subscription_plans(id)`, `status TEXT` (`trialing`, `active`, `payment_pending`, `past_due`, `cancelled`, `expired`), `trial_start`, `trial_end`, `current_period_start`, `current_period_end`, `billing_interval`. Additive from 078: `applied_coupon_id REFERENCES coupons(id)`, `discount_amount_inr NUMERIC(10, 2)`. |
| `public.subscription_addons` | Migration 070 | **Compatible (100%)** | `workspace_id UUID REFERENCES workspaces(id)`, `addon_key TEXT`, `status TEXT`, `valid_until TIMESTAMPTZ`, `CONSTRAINT uq_workspace_addon UNIQUE (workspace_id, addon_key)`. |
| `public.payment_transactions` | Migrations 070, 078 | **Compatible (100%)** | `workspace_id UUID REFERENCES workspaces(id)`, `transaction_reference TEXT UNIQUE`, `provider TEXT DEFAULT 'youpi_pg'`, `amount_inr NUMERIC(10, 2)`, `currency TEXT DEFAULT 'INR'`, `status TEXT` (`initiated`, `pending`, `verified_success`, `failed`, `refunded`). Additive from 078: `coupon_redemption_id REFERENCES coupon_redemptions(id)`. |

---

## 3. Dedicated Super Admin Entities (Migrations 077 & 078)

| Table Name | Purpose | RLS Policy | Immutability / Constraints |
| :--- | :--- | :--- | :--- |
| `public.platform_admins` | Platform RBAC (`super_admin`, `billing_admin`, `support_agent`) | `FOR ALL USING (FALSE)` | `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `email TEXT UNIQUE`. |
| `public.platform_gcap_nonces` | Atomic Single-Use GCAP Nonce Registry | `FOR ALL USING (FALSE)` | `nonce UUID PRIMARY KEY`. Unique violation on replay. Auto-cleaned via `cleanup_expired_gcap_nonces()`. |
| `public.platform_workspace_suspensions` | State-Preserving Suspension Snapshot | `FOR ALL USING (FALSE)` | `workspace_id UUID REFERENCES workspaces(id) ON DELETE RESTRICT`, `suspended_membership_user_ids UUID[]`, `suspended_profile_user_ids UUID[]`. |
| `public.platform_audit_logs` | Immutable Append-Only Ledger | `FOR ALL USING (FALSE)` | Trigger `trg_protect_platform_audit_logs` forbids `UPDATE`, `DELETE`, `TRUNCATE` (SQLSTATE `55000`). |
| `public.platform_system_settings` | Platform Settings & Feature Flags | `FOR ALL USING (FALSE)` | `key VARCHAR(100) PRIMARY KEY`, `value JSONB NOT NULL`. |
| `public.coupons` | Canonical Promotional Master & Quota Engine | `FOR ALL USING (FALSE)` | `code VARCHAR(50) UNIQUE`, `discount_type` (`percentage`, `fixed`), `applicable_plans TEXT[]`, `max_redemptions_per_workspace INT`. |
| `public.coupon_redemptions` | Statutory Two-Phase Redemption Audit Log | `FOR ALL USING (FALSE)` | `status` (`reserved`, `applied`, `failed`, `refunded`), `reserved_until TIMESTAMPTZ`, foreign keys to `coupons`, `workspaces`, `subscription_plans`. |

---

## 4. Critical Architecture & Security Verification Findings

### 4.1 Resolution of the `workspaces.owner_id` Invariant
- **The Issue:** Legacy scripts or assumptions might treat `workspaces` as having an `owner_id` foreign key. In the actual production VISTAAR schema (Migrations 001 and 058), `workspaces` has **no `owner_id` column**.
- **Audit Result:** Migrations `077` and `078` adhere strictly to reality:
  - Authorization resolves via the 4-layer hierarchy:
    1. Organization Owner: `organizations.owner_user_id = auth.uid()`
    2. Active Profile Owner/Admin: `profiles.role IN ('owner', 'admin') AND status = 'Active'`
    3. Workspace Membership: `workspace_memberships.role IN ('owner', 'admin') AND status = 'Active'`
    4. Registered Merchant Email: `workspaces.owner_email = auth.users.email`
  - Zero dependencies on non-existent `workspaces.owner_id`.

### 4.2 Row-Level Security (RLS) Parity
- **Audit Finding:** All 16 public tables in the baseline and extension migrations have RLS enabled (`relrowsecurity = true`).
- **Policy Enforcement:** Administrative tables (`platform_*`) and promotional tables (`coupons`, `coupon_redemptions`) use strict isolation (`FOR ALL USING (FALSE)`), denying direct browser client access while allowing the trusted Backend Gateway (`service_role`, which possesses `BYPASSRLS`) to execute privileged operations.
- `subscription_plans` has a public read policy (`FOR SELECT USING (true)`), allowing anonymous and authenticated clients to inspect available pricing tiers.

### 4.3 GCAP Single-Use Nonce & Clock Skew Guard
- Stored procedures `super_admin_get_platform_metrics`, `super_admin_suspend_workspace`, and `super_admin_reactivate_workspace` enforce:
  1. `auth.role() = 'service_role'` caller restriction.
  2. 30-second timestamp freshness skew window: `ABS(EXTRACT(EPOCH FROM (NOW() - p_request_timestamp))) > 30` &rarr; `ASSERTION_EXPIRED`.
  3. Atomic insertion into `platform_gcap_nonces` with catch on `unique_violation` (23505) &rarr; `REPLAY_DETECTED`.
  4. Cryptographic HMAC-SHA256 signature verification using `app.settings.gateway_assertion_secret`.

### 4.4 Payment Settlement Financial Integrity & Idempotency
- `settle_coupon_payment`:
  1. Only permits provider `'youpi_pg'` and status `'captured'` or `'verified_success'`.
  2. Future-dated payment rejection: Rejects authorizations > 5 minutes in the future (`FUTURE_DATED_PAYMENT`).
  3. Webhook transit timeout: Flags payments received > 24 hours after authorization for manual support review without activating subscriptions.
  4. Amount equality check: Underpaid or overpaid transactions commit an audit row with `status = 'failed'` and `error = 'AMOUNT_MISMATCH'` without rolling back the transaction.
  5. Duplicate delivery idempotency: Re-delivery of an already-settled transaction returns `status: 'already_settled'` without creating duplicate subscriptions or double-counting revenue.

---

## 5. Test Suite Independent Audit & Hardening

During local simulation of [tests/staging_test_suite.sql](file:///d:/Project/vistaar-main/super_admin/tests/staging_test_suite.sql), five structural defects were identified and resolved:

1. **Bare `RAISE NOTICE` Syntax Error:** The original test script ended with `ROLLBACK; RAISE NOTICE '...';` outside of a PL/pgSQL block, which is invalid SQL syntax in PostgreSQL.
   - *Fix:* Enclosed the completion notice in `DO $$ BEGIN RAISE NOTICE '...'; END $$;`.
2. **Foreign Key Violation on `platform_admins`:** Test 3 attempted to insert `v_test_admin_id` into `platform_admins` without first inserting the user into `auth.users(id)`.
   - *Fix:* Inserted `v_test_admin_id` into `auth.users (id, email)` prior to inserting into `platform_admins`.
3. **Missing Workspace Authorization Linkage:** In Test 3, the synthetic workspace had a different email than the synthetic admin, causing Test 5 to receive `FORBIDDEN`.
   - *Fix:* Added a synthetic `profiles` record linking `v_test_admin_id` as `'owner'` of the synthetic test workspace.
4. **Per-Workspace Coupon Quota Exhaustion:** The synthetic coupon `STAGING20` had `max_redemptions_per_workspace = 1`. Successive tests (Tests 5, 7, and 8) tested reservations within the 15-minute active reservation window, causing Tests 7 and 8 to fail with quota exhaustion.
   - *Fix:* Configured `max_redemptions_per_workspace = 10` on the synthetic test fixture coupon.
5. **Missing Tests 9 & 10:** The header listed 10 tests, but the original file ended at Test 8.
   - *Fix:* Implemented Test 9 (Late Webhook Support Review Flagging) and Test 10 (GCAP Workspace Suspension & State-Preserving Reactivation).

---

## 6. Local PostgreSQL WASM Simulation Evidence

A simulation script ([scripts/simulate_local_migrations.mjs](file:///d:/Project/vistaar-main/super_admin/scripts/simulate_local_migrations.mjs)) was executed using the `@electric-sql/pglite` engine (PostgreSQL 16.8/17 WASM) with `pgcrypto` and `uuid-ossp` contrib modules:

```text
=== STARTING LOCAL POSTGRESQL SIMULATION (PGLite WASM) ===
1. Setting up mock Supabase auth schema and functions...

2. Executing 000_baseline_schema_snapshot.sql...
   -> 000_baseline_schema_snapshot.sql executed SUCCESSFULLY.

3. Executing 077_super_admin_infrastructure.sql...
   -> 077_super_admin_infrastructure.sql executed SUCCESSFULLY.

4. Executing 078_coupon_and_promotional_campaign_system.sql...
   -> 078_coupon_and_promotional_campaign_system.sql executed SUCCESSFULLY.

5. Inspecting Created Public Tables & RLS Status...
   Public tables count: 16
   - coupon_redemptions (RLS enabled: true)
   - coupons (RLS enabled: true)
   - invoices (RLS enabled: true)
   - organizations (RLS enabled: true)
   - payment_transactions (RLS enabled: true)
   - platform_admins (RLS enabled: true)
   - platform_audit_logs (RLS enabled: true)
   - platform_gcap_nonces (RLS enabled: true)
   - platform_system_settings (RLS enabled: true)
   - platform_workspace_suspensions (RLS enabled: true)
   - profiles (RLS enabled: true)
   - subscription_addons (RLS enabled: true)
   - subscription_plans (RLS enabled: true)
   - workspace_memberships (RLS enabled: true)
   - workspace_subscriptions (RLS enabled: true)
   - workspaces (RLS enabled: true)

6. Executing tests/staging_test_suite.sql directly from disk...
   -> tests/staging_test_suite.sql executed ALL 10 TESTS SUCCESSFULLY.

=== SIMULATION PASSED: ALL 10 TESTS & 3 MIGRATIONS VERIFIED ===
```

---

## 7. Stage B Execution Plan & Recommendations

With the independent baseline review passed and local simulation verified, **Phase 4.2 Stage B (Controlled Migration Execution)** is ready for authorization.

### Stage B Execution Sequence:
1. Connect via **Direct Session Pooler (Port 5432)** (`aws-0-eu-west-1.pooler.supabase.com:5432`) to support DDL operations.
2. Execute `migrations/000_baseline_schema_snapshot.sql` inside a single transaction (`BEGIN ... COMMIT`).
3. Execute `migrations/077_super_admin_infrastructure.sql` inside a single transaction (`BEGIN ... COMMIT`).
4. Execute `migrations/078_coupon_and_promotional_campaign_system.sql` inside a single transaction (`BEGIN ... COMMIT`).
5. Execute `tests/staging_test_suite.sql` to verify all 10 security assertions on hosted staging (rolled back automatically via `BEGIN ... ROLLBACK`).
6. Re-run `scripts/inspect_staging_schema.mjs` to inventory the resulting 16 public tables and active policies on `vlbhxcajphyjkeueubud`.

### Strict Stopping Rule:
- No changes have been applied to `vlbhxcajphyjkeueubud`.
- Migration authorization is now formally requested from the user.

