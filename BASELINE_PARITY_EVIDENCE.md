# VISTAAR Super Admin — Baseline Schema Parity & Provenance Evidence
**Document Version:** 3.3.0 (Phase 4.2 V9 Hardened Administrative Control Plane)  
**Date:** 2026-11-03  
**Status:** Cryptographically Verified & Meticulously Classified  
**Target Database:** `vistaar-super-admin-staging` (`vlbhxcajphyjkeueubud`)  
**Companion Production Repository:** `d:\Project\vistaar-main\vistaar-main` (100% Untouched / Main Branch Clean)

---

## 1. Executive Summary & Verification Methodology

To ensure that the Super Admin infrastructure (Migration 077) and Coupon Promotion Engine (Migration 078) run against an authoritative, production-accurate database schema, a consolidated baseline snapshot ([`migrations/000_baseline_schema_snapshot.sql`](file:///d:/Project/vistaar-main/super_admin/migrations/000_baseline_schema_snapshot.sql)) was constructed.

This document provides a factual, line-by-line comparison between `migrations/000_baseline_schema_snapshot.sql` and the five canonical production migrations extracted directly from `d:\Project\vistaar-main\vistaar-main\supabase\migrations/`.

Every structural element is explicitly classified into one of four categories:
1. **[Exact Parity]**: Tables, columns, constraints, data types, defaults, and seeds that are functionally and structurally identical to production migrations.
2. **[Intentional Staging Simplification]**: Deliberate staging-specific architectural optimizations designed for isolated control-plane execution (e.g. string sizing, password reset flags, or service-role ACLs).
3. **[Omitted Production Object]**: Production objects (e.g. retail POS inventory, counter sale lines, barcode mappings) that are omitted because Super Admin operates exclusively on tenant control and subscription billing.
4. **[Additive Super Admin Change]**: Extensions introduced in Migrations 077 and 078 to support Super Admin platform governance and promotion management.

> [!IMPORTANT]
> **Safety & Environment Invariants:**
> - The companion production repository (`d:\Project\vistaar-main\vistaar-main`) was inspected strictly in read-only mode and remains 100% clean on branch `main`.
> - Zero SQL or DDL commands have been executed against hosted staging (`vlbhxcajphyjkeueubud`) or production (`kluxsykimnjivkqxelba`).
> - All verifications were executed locally using isolated WASM PostgreSQL simulations (PGlite).

---

## 2. Canonical Migration Provenance & Cryptographic Hashes

Five canonical migration files were archived locally in [`references/production_migrations/`](file:///d:/Project/vistaar-main/super_admin/references/production_migrations/). Their SHA-256 checksums match the production repository byte-for-byte:

| Canonical Migration File | Source Size | SHA-256 Checksum | Functional Scope in VISTAAR |
| :--- | :--- | :--- | :--- |
| `001_initial_schema.sql` | 37,823 bytes | `29ba4dff5fa3d32fb233a8854a1f8a2d4e70fd190ed7aa52b36a9e0b1f5efbd5` | Core tenant tables (`workspaces`, `profiles`, `invoices`), enums (`user_role`, `employee_status`, `invoice_status`), and POS tables. |
| `051_authoritative_employee_account_root_fix.sql` | 27,552 bytes | `bb2db48ce93c4403e89a8b2c1fa63d916bf9a13b7264c939a0f2a609018668e7` | Employee account root fixes, profile department/designation attributes, and `(workspace_id, employee_id)` uniqueness. |
| `058_organization_branch_architecture.sql` | 28,674 bytes | `a9a135d0a46dbefcb0318660d0ef542a7fd18a1a4d99b71c05f4d7e013eeb589` | Multi-branch architecture, `organizations`, `workspace_memberships`, and branch attributes on `workspaces`. |
| `061_fix_invoice_finalization_schema_and_atomic_rpc.sql` | 34,873 bytes | `0efb91deab81fb460df1291d765fbca1b01ea353b410e72b31b078542f99f4fb` | Invoice finalization state machine, branch inventory linkages, and sequential invoice numbering RPCs. |
| `070_subscription_plans_and_entitlements.sql` | 11,160 bytes | `e020c7a861e9b64982793cea745ec8f13c5976f0a1e3fdb122e3c062c51143f2` | Canonical subscription plans (`subscription_plans`), workspace subscriptions (`workspace_subscriptions`), add-ons (`subscription_addons`), and payment audit logs (`payment_transactions`). |

---

## 3. Entity-by-Entity Detailed Parity Analysis

### 3.1 Custom Types & Enums
- `public.user_role`: ENUM (`'owner', 'admin', 'manager', 'employee', 'staff'`) — **[Exact Parity]** with `001_initial_schema.sql`.
- `public.employee_status`: ENUM (`'Pending', 'Active', 'Inactive', 'Suspended'`) — **[Exact Parity]** with `001_initial_schema.sql`.
- `public.invoice_status`: ENUM (`'Draft', 'Issued', 'Partially Paid', 'Paid', 'Cancelled'`) — **[Exact Parity]** with `001_initial_schema.sql`.
- *Omitted Enums:* `customer_type`, `stock_movement_type`, `quotation_status`, `counter_sale_status`, `udhari_status`, `payment_method`, `expense_category`, `followup_status`, `followup_priority`, `followup_action_type` — **[Omitted Production Object]** (specific to store-level POS retail operations).

---

### 3.2 `public.organizations`
- **Source Migration:** `058_organization_branch_architecture.sql`
- **Columns:**
  - `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid()): **[Exact Parity]**
  - `name` (VARCHAR(255) NOT NULL in baseline vs TEXT NOT NULL in 058): **[Intentional Staging Simplification]** (constrained length)
  - `owner_user_id` (UUID REFERENCES auth.users(id) ON DELETE SET NULL): **[Exact Parity]**
  - `created_at` / `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()): **[Exact Parity]**
- **Constraints & Indexes:** `idx_organizations_owner ON public.organizations(owner_user_id)` — **[Exact Parity]**
- **Correction of V2 Report:** In report V2, `organizations` was incorrectly stated to contain `slug`, `billing_email`, and `is_active`. Factual inspection of `058_organization_branch_architecture.sql` confirms those columns never existed in production Migration 058. Baseline 000 accurately mirrors Migration 058.

---

### 3.3 `public.workspaces`
- **Source Migrations:** `001_initial_schema.sql`, `058_organization_branch_architecture.sql`, `077_super_admin_infrastructure.sql`
- **Columns:**
  - `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid()): **[Exact Parity]**
  - `organization_id` (UUID REFERENCES public.organizations(id) ON DELETE CASCADE): **[Exact Parity]** (from 058)
  - `company_name` (VARCHAR(255) NOT NULL): **[Exact Parity]**
  - `owner_name` / `owner_email` / `owner_phone`: **[Exact Parity]** (`owner_email UNIQUE`)
  - `branch_name` / `branch_code`: **[Exact Parity]** (from 058)
  - `is_main_branch` (BOOLEAN NOT NULL DEFAULT FALSE): **[Exact Parity]** (from 058)
  - `is_active` (BOOLEAN NOT NULL DEFAULT TRUE): **[Exact Parity]**
  - `branch_password_hash` (TEXT DEFAULT NULL): **[Exact Parity]** (from 058)
  - `created_at` / `updated_at` / `deleted_at`: **[Exact Parity]**
  - *Additive in Migration 077:* `suspension_reason TEXT`, `suspended_at TIMESTAMPTZ`, `suspended_by UUID REFERENCES public.platform_admins(id)` — **[Additive Super Admin Change]**
- **Omitted Columns from 001:** `address`, `city`, `state`, `pincode`, `gstin`, `pan` — **[Omitted Production Object]** (retail physical store billing addresses).

---

### 3.4 `public.profiles`
- **Source Migrations:** `001_initial_schema.sql`, `051_authoritative_employee_account_root_fix.sql`, `058_organization_branch_architecture.sql`
- **Columns:**
  - `id` (UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE): **[Exact Parity]**
  - `workspace_id` (UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE): **[Exact Parity]**
  - `employee_id` (VARCHAR(50) NOT NULL): **[Exact Parity]**
  - `name`, `email`, `phone` (NOT NULL): **[Exact Parity]**
  - `department`, `designation`: **[Exact Parity]** (from 051)
  - `role` (public.user_role NOT NULL DEFAULT 'employee'): **[Exact Parity]**
  - `status` (public.employee_status NOT NULL DEFAULT 'Active'): **[Exact Parity]**
  - `avatar_url` (TEXT): **[Exact Parity]**
  - `must_change_password` (BOOLEAN NOT NULL DEFAULT FALSE in 000 vs DEFAULT TRUE in 051): **[Intentional Staging Simplification]** (prevents test runner lockouts)
  - `is_archived` (BOOLEAN NOT NULL DEFAULT FALSE), `archived_at`, `deleted_at`: **[Exact Parity]** (from 051)
  - `created_at`, `updated_at`: **[Exact Parity]**
- **Constraints:**
  - Constraint `unique_workspace_employee_id UNIQUE (workspace_id, employee_id)`: **[Exact Parity]** (implements the identical uniqueness logic as `profiles_workspace_employee_id_key` from 051).

---

### 3.5 `public.workspace_memberships`
- **Source Migration:** `058_organization_branch_architecture.sql`
- **Columns:**
  - `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid()): **[Exact Parity]**
  - `workspace_id` (UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE): **[Exact Parity]**
  - `user_id` (UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE): **[Exact Parity]**
  - `role` (VARCHAR(50) NOT NULL DEFAULT 'employee'): **[Exact Parity]**
  - `status` (VARCHAR(50) NOT NULL DEFAULT 'Active'): **[Exact Parity]**
  - `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()): **[Exact Parity]**
  - Constraint: `uq_user_workspace UNIQUE (user_id, workspace_id)` — **[Exact Parity]**
  - Indexes: `idx_workspace_memberships_user`, `idx_workspace_memberships_ws` — **[Exact Parity]**

---

### 3.6 `public.subscription_plans`
- **Source Migration:** `070_subscription_plans_and_entitlements.sql`
- **Columns:**
  - `id` (TEXT PRIMARY KEY): **[Exact Parity]**
  - `name` (TEXT NOT NULL): **[Exact Parity]**
  - `tagline` (TEXT): **[Exact Parity]**
  - `price_annual_inr` (NUMERIC(10, 2) NOT NULL DEFAULT 0.00): **[Exact Parity]**
  - `price_monthly_inr` (NUMERIC(10, 2) NOT NULL DEFAULT 0.00): **[Exact Parity]**
  - `allowed_platforms` (TEXT[] NOT NULL DEFAULT ARRAY['web']): **[Exact Parity]**
  - `max_users` (INTEGER NOT NULL DEFAULT 1): **[Exact Parity]**
  - `max_branches` (INTEGER NOT NULL DEFAULT 1): **[Exact Parity]**
  - `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()): **[Exact Parity]**
- **Canonical Seed Plan Values Comparison:**
  | Plan ID | Canonical Name | Tagline | Annual (INR) | Monthly (INR) | Platforms | Users | Branches | Classification |
  | :--- | :--- | :--- | :---: | :---: | :--- | :---: | :---: | :---: |
  | `free_trial` | 14-Day Free Trial | Full access to Web, Windows Desktop, Android | 0.00 | 0.00 | `{web,desktop,android}` | 2 | 1 | **[Exact Parity]** |
  | `starter` | Starter | Cloud Web business management for single-terminal | 2,499.00 | 299.00 | `{web}` | 1 | 1 | **[Exact Parity]** |
  | `starter_mobile`| Starter + Mobile Add-on | Web counter plus native Android APK | 4,498.00 | 498.00 | `{web,android}` | 2 | 1 | **[Exact Parity]** |
  | `business` | Business | High-throughput Windows Desktop & multi-branch | 5,999.00 | 699.00 | `{web,desktop}` | 5 | 3 | **[Exact Parity]** |
  | `growth` | Growth | Enterprise all-platform operating system | 9,999.00 | 1,199.00 | `{web,desktop,android}` | 0 | 0 | **[Exact Parity]** |
- **Correction of V2 Report:** In report V2, plan IDs were erroneously described as `free`, `starter`, `growth`, and `business` with prices ₹999/₹1999. The factual inspection above proves that `000_baseline_schema_snapshot.sql` and `070_subscription_plans_and_entitlements.sql` share **100% exact parity** on all 5 canonical plan IDs (`free_trial`, `starter`, `starter_mobile`, `business`, `growth`) and price points.

---

### 3.7 `public.workspace_subscriptions`
- **Source Migration:** `070_subscription_plans_and_entitlements.sql`
- **Columns:**
  - `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid()): **[Exact Parity]**
  - `workspace_id` (UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE): **[Exact Parity]**
  - `plan_id` (TEXT NOT NULL REFERENCES public.subscription_plans(id) DEFAULT 'free_trial'): **[Exact Parity]**
  - `status` (TEXT NOT NULL DEFAULT 'trialing'): **[Exact Parity]**
    - Constraint: `CHECK (status IN ('trialing', 'active', 'payment_pending', 'past_due', 'cancelled', 'expired'))` — **[Exact Parity]**
  - `trial_start` (TIMESTAMPTZ NOT NULL DEFAULT NOW()): **[Exact Parity]**
  - `trial_end` (TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days')): **[Exact Parity]**
  - `current_period_start` (TIMESTAMPTZ NOT NULL DEFAULT NOW()): **[Exact Parity]**
  - `current_period_end` (TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days')): **[Exact Parity]**
  - `billing_interval` (TEXT NOT NULL DEFAULT 'annual'): **[Exact Parity]**
    - Constraint: `CHECK (billing_interval IN ('annual', 'monthly', 'trial'))` — **[Exact Parity]**
  - `cancel_at_period_end` (BOOLEAN NOT NULL DEFAULT FALSE): **[Exact Parity]**
  - `created_at` / `updated_at`: **[Exact Parity]**
  - Constraint: `uq_workspace_subscription UNIQUE (workspace_id)` — **[Exact Parity]**
  - Indexes: `idx_workspace_subscriptions_ws`, `idx_workspace_subscriptions_status` — **[Exact Parity]**
- **Correction of V2 Report:** In report V2, `billing_interval` was incorrectly listed as containing `'lifetime'`, and columns were misnamed `trial_ends_at` and `cancelled_at`. Baseline 000 and Migration 070 share **100% exact parity** on the real column names (`trial_start`, `trial_end`, `cancel_at_period_end`) and intervals (`annual`, `monthly`, `trial`).

---

### 3.8 `public.subscription_addons`
- **Source Migration:** `070_subscription_plans_and_entitlements.sql`
- **Columns:**
  - `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid()): **[Exact Parity]**
  - `workspace_id` (UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE): **[Exact Parity]**
  - `addon_key` (TEXT NOT NULL): **[Exact Parity]**
  - `status` (TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired'))): **[Exact Parity]**
  - `valid_until` (TIMESTAMPTZ NOT NULL): **[Exact Parity]**
  - `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()): **[Exact Parity]**
  - Constraint: `uq_workspace_addon UNIQUE (workspace_id, addon_key)` — **[Exact Parity]**
  - Index: `idx_subscription_addons_ws` — **[Exact Parity]**

---

### 3.9 `public.payment_transactions`
- **Source Migrations:** `070_subscription_plans_and_entitlements.sql`, `078_coupon_and_promotional_campaign_system.sql`
- **Columns:**
  - `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid()): **[Exact Parity]**
  - `workspace_id` (UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE): **[Exact Parity]**
  - `transaction_reference` (TEXT NOT NULL, UNIQUE): **[Exact Parity]**
  - `provider` (TEXT NOT NULL DEFAULT 'youpi_pg'): **[Exact Parity]**
  - `amount_inr` (NUMERIC(10, 2) NOT NULL): **[Exact Parity]**
  - `currency` (TEXT NOT NULL DEFAULT 'INR'): **[Exact Parity]**
  - `plan_id` (TEXT REFERENCES public.subscription_plans(id)): **[Exact Parity]**
  - `addon_key` (TEXT): **[Exact Parity]**
  - `status` (TEXT NOT NULL CHECK (status IN ('initiated', 'pending', 'verified_success', 'failed', 'refunded'))): **[Exact Parity]**
  - `provider_payload` (JSONB): **[Exact Parity]**
  - `verified_at` (TIMESTAMPTZ): **[Exact Parity]**
  - `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()): **[Exact Parity]**
  - *Additive in Migration 078:* `coupon_redemption_id UUID REFERENCES public.coupon_redemptions(id) ON DELETE SET NULL` — **[Additive Super Admin Change]**
  - Constraint: `uq_payment_transaction_ref UNIQUE (transaction_reference)` — **[Exact Parity]**
  - Index: `idx_payment_transactions_ws` — **[Exact Parity]**

---

### 3.10 `public.invoices`
- **Source Migrations:** `001_initial_schema.sql`, `061_fix_invoice_finalization_schema_and_atomic_rpc.sql`
- **Columns in Baseline 000:**
  - `id` (UUID PRIMARY KEY DEFAULT gen_random_uuid()): **[Exact Parity]**
  - `workspace_id` (UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE): **[Exact Parity]**
  - `invoice_number` (VARCHAR(100) NOT NULL): **[Exact Parity]**
  - `customer_name` (VARCHAR(255) NOT NULL): **[Exact Parity]**
  - `customer_phone` (VARCHAR(50) DEFAULT ''): **[Exact Parity]**
  - `status` (public.invoice_status NOT NULL DEFAULT 'Issued'): **[Exact Parity]**
  - `grand_total`, `paid_amount`, `balance_amount` (NUMERIC(12, 2) NOT NULL DEFAULT 0.00): **[Exact Parity]**
  - `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW()): **[Exact Parity]**
  - Constraint: `unique_workspace_invoice_number UNIQUE (workspace_id, invoice_number)` — **[Exact Parity]**
- **Omitted POS Invoicing Columns:** `subtotal`, `tax_total`, `discount_total`, `notes`, `terms`, `branch_id`, and line items (`invoice_items`) — **[Intentional Staging Simplification]** / **[Omitted Production Object]** (Super Admin billing views aggregate high-level transaction volume and balance without requiring POS line items).

---

## 4. Privilege & RLS Policy Parity Comparison

### 4.1 Schema Privileges (`public` and `extensions`)
- **Production Baseline (001):** Inherited PostgreSQL default where `PUBLIC` possessed implicit `CREATE` on `public`.
- **Baseline 000 (Staging Hardened V4):** Explicitly revokes `CREATE` on `public` and `extensions` from `PUBLIC`, `anon`, `authenticated`, and `service_role`. Grants `USAGE` only. Migration execution and schema/table creation capabilities are preserved exclusively for the migration owner (`postgres`). — **[Intentional Staging Simplification]** (least-privilege security hardening).

### 4.2 Row-Level Security & SQL Table Privileges
- **Subscription Plans:**
  - Policy `"Public plans viewable by everyone" ON public.subscription_plans FOR SELECT USING (true)`: **[Exact Parity]** with 070.
  - Table Privilege: Explicit `GRANT SELECT ON TABLE public.subscription_plans TO PUBLIC, anon, authenticated` with all mutations denied: **[Intentional Staging Simplification]** (defense-in-depth).
- **Private Baseline Tables (8 Tables):**
  - RLS enabled on all tables: **[Exact Parity]**.
  - SQL Table Privileges: Explicit `REVOKE ALL ON TABLE ... FROM PUBLIC, anon, authenticated`: **[Intentional Staging Simplification]** (in production, client apps connect via `authenticated` and rely on RLS policies; in Super Admin staging, client operations run through the Gateway BFF as `service_role`, so untrusted roles are strictly locked out at the SQL grant layer).
- **Service Role Privilege Restriction & Per-Table Matrix (V6 Hardening):**
  - **Sensitive Configuration (`subscription_plans`):** Restricted to `SELECT` ONLY. All mutations (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`) strictly revoked from `service_role`.
  - **Financial Ledgers & Audit Records (`invoices`, `workspace_subscriptions`, `payment_transactions`, `platform_workspace_suspensions`, `coupon_redemptions`):** Granted `SELECT, INSERT, UPDATE`. `DELETE` is permanently revoked to preserve statutory financial and audit integrity.
  - **Replay Defense Store (`platform_gcap_nonces`):** Granted `SELECT, INSERT, DELETE`. `UPDATE` is revoked as nonces are write-once.
  - **Immutable Audit Logs (`platform_audit_logs`):** Granted `SELECT, INSERT` ONLY. `UPDATE` and `DELETE` revoked at SQL level and enforced by trigger.
  - **Core Managed Entities (`organizations`, `workspaces`, `profiles`, `workspace_memberships`, `subscription_addons`, `platform_admins`, `platform_system_settings`, `coupons`):** Granted `SELECT, INSERT, UPDATE, DELETE`.
  - **High-Risk DDL Privileges:** Explicitly revoked `TRUNCATE, REFERENCES, TRIGGER` across all 16 tables.
  - **Sequences:** Explicit `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role`.
  - **Comprehensive Documentation:** Full per-table routes, RPC justifications, and architectural analyses are detailed in [`SERVICE_ROLE_PRIVILEGE_MATRIX.md`](file:///d:/Project/vistaar-main/super_admin/SERVICE_ROLE_PRIVILEGE_MATRIX.md). **[Intentional Staging Simplification / Security Hardening]**.

---

## 5. Summary Classification Matrix

| Entity | Production Migrations | Exact Parity | Staging Simplification | Omitted Production Objects | Additive Super Admin Changes |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Enums** | 001 | `user_role`, `employee_status`, `invoice_status` | None | 10 POS operational enums | None |
| **`organizations`** | 058 | `id`, `owner_user_id`, timestamps | `name` length (VARCHAR) | None | None |
| **`workspaces`** | 001, 058, 077 | Core tenant & branch hierarchy | None | Physical retail address fields | `suspension_reason`, `suspended_at`, `suspended_by` (077) |
| **`profiles`** | 001, 051 | Employee root, role, status | `must_change_password` (FALSE) | None | None |
| **`workspace_memberships`**| 058 | Multi-branch routing, constraints | None | None | None |
| **`subscription_plans`** | 070 | All columns & 5 canonical plans | None | None | None |
| **`workspace_subscriptions`** | 070 | All columns, constraints, intervals| None | None | None |
| **`subscription_addons`**| 070 | All columns, status, constraints | None | None | None |
| **`payment_transactions`**| 070, 078 | All financial columns & provider | None | None | `coupon_redemption_id` (078) |
| **`invoices`** | 001, 061 | Header, status, grand total | POS items omitted | `invoice_items`, `branches` | None |
| **Administrative Control**| 077, 078 | None | None | None | 7 Admin tables (incl. platform_bootstrap_registry), 2 Coupon tables, 13 RPCs |

---

## 6. Parity Verification Conclusion

This rigorous audit establishes that:
1. `migrations/000_baseline_schema_snapshot.sql` faithfully represents the schema created by production migrations 001 through 070 for all entities required by the Super Admin control plane.
2. Canonical subscription plan IDs (`free_trial`, `starter`, `starter_mobile`, `business`, `growth`) and prices match production Migration 070 exactly.
3. Workspace subscription columns (`trial_start`, `trial_end`, `cancel_at_period_end`) and status values match production Migration 070 exactly.
4. All differences have been factually identified and classified without claiming false 100% parity.
5. The companion production repository remains completely untouched.
