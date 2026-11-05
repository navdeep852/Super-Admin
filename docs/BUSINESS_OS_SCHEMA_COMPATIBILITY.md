# VISTAAR Super Admin — Business OS Schema Compatibility & Invariant Mapping

**Document Reference:** `docs/BUSINESS_OS_SCHEMA_COMPATIBILITY.md`  
**Execution Date:** November 5, 2026  
**Status:** Authoritative — Verified Against Supabase Staging (`vlbhxcajphyjkeueubud`) & Business OS Core (`kluxsykimnjivkqxelba` schema)  
**Security Mandate:** Strict Production Air-Gap Active (Production DB Untouched)  

---

## 1. Executive Summary

This document establishes the verified schema compatibility mapping between **VISTAAR Business OS** (`navdeep852/vistaar`) and **VISTAAR Super Admin** (`navdeep852/Super-Admin`).

The Super Admin control plane monitors genuine platform tenants, businesses, staff, subscriptions, payments, and invoices without relying on synthetic mock data or corrupting multi-tenant isolation.

---

## 2. Definitive Table & Entity Relationships

The table below delineates the canonical relationship mapping across the platform:

| Business OS Domain | Database Table | Primary Key | Foreign Keys / Relationships | Super Admin Consumer |
| :--- | :--- | :--- | :--- | :--- |
| **Auth & Identity** | `auth.users` | `id` (UUID) | Root authentication table | GoTrue Auth Client |
| **Platform Admins** | `public.platform_admins` | `id` (UUID) | FK -> `auth.users.id` (1:1) | Super Admin Auth (`/api/v1/auth/login`) |
| **Tenancy / Workspaces** | `public.workspaces` | `id` (UUID) | FK -> `auth.users.id` (`owner_id`) | Business Directory (`/api/v1/workspaces`) |
| **Business Profiles** | `public.business_settings` | `id` (UUID) | FK -> `workspaces.id` (`workspace_id`) | Organization Legal Profile & GSTIN |
| **Staff & Users** | `public.profiles` | `id` (UUID) | FK -> `auth.users.id`, `workspaces.id` | User Management (`/api/v1/users`) |
| **Memberships** | `public.workspace_memberships` | `id` (UUID) | FK -> `workspaces.id`, `auth.users.id` | Multi-Workspace Membership Matrix |
| **Branch Architecture** | `public.branches` | `id` (UUID) | FK -> `workspaces.id` (`workspace_id`) | Multi-Branch Topology & Inventory |
| **SaaS Catalog** | `public.subscription_plans` | `id` (VARCHAR) | Plan key (`starter`, `business`, etc.) | Plan Management (`/api/v1/plans`) |
| **Tenant Subscriptions** | `public.workspace_subscriptions` | `id` (UUID) | FK -> `workspaces.id`, `subscription_plans.id` | Subscriptions (`/api/v1/subscriptions`) |
| **SaaS Revenue** | `public.payment_transactions` | `id` (UUID) | FK -> `workspaces.id`, `plan_id` | Payments & Revenue (`/api/v1/payments`) |
| **Merchant Sales (GMV)** | `public.invoices` | `id` (UUID) | FK -> `workspaces.id`, `customers.id` | Platform GMV Throughput (`/api/v1/platform/overview`) |
| **POS Counter Sales** | `public.counter_sales` | `id` (UUID) | FK -> `workspaces.id`, `branches.id` | Retail GMV Throughput |
| **Customer Receivables** | `public.udhari_records` | `id` (UUID) | FK -> `workspaces.id`, `customers.id` | Tenant Receivables Metric |
| **Platform Audit** | `public.platform_audit_logs` | `id` (UUID) | FK -> `platform_admins.id` | Security Logs (`/api/v1/security/audit-logs`) |

---

## 3. Discovered Architectural Invariants

### 3.1 Staff and Employee Representation
- **No Separate `employees` Table:** The Business OS platform consolidates all business users (owners, managers, accountants, cashiers, and staff) into `public.profiles`.
- **Role Differentiation:**
  - Owner: `profiles.role = 'owner'`
  - Staff Employees: `profiles.role IN ('manager', 'cashier', 'staff', 'employee')`
- **Super Admin Handling:** User Management maps staff counts by querying `profiles` where `workspace_id = ws.id` and `role != 'owner'`.

### 3.2 Platform SaaS Collections vs. Merchant Sales GMV
A critical accounting distinction enforced under **Phase 2.6 Mandate**:
1. **Platform SaaS Collected Revenue (`payment_transactions`):**
   - Represents software subscription fees paid by business tenants to VISTAAR platform.
   - Categorized as **HSN 998313** (Information Technology Software Services).
   - Subject to 18% GST (Calculated as `amount_inr - (amount_inr / 1.18)`).
   - Filtered exclusively by `status IN ('verified_success', 'successful')`.
2. **Merchant Sales GMV (`invoices` & `counter_sales`):**
   - Represents gross merchandise value of retail goods sold by merchants to end consumers.
   - Strictly isolated from VISTAAR revenue ledgers.
   - Aggregated under `tenantSalesGmvInr` via `invoices.grand_total`.

### 3.3 Customer Receivables & Udhari
- Customer credit balances are stored in `public.udhari_records` and `public.invoices.balance_amount`.
- Outstanding tenant receivables displayed in the Super Admin KPI Command Center aggregate `invoices.balance_amount` across active workspaces.

---

## 4. Synthetic vs Genuine Data Separation Mechanism

To prevent synthetic staging fixtures from appearing as genuine subscribers, the database enforces the `is_test` invariant:

```sql
-- Workspaces schema
ALTER TABLE public.workspaces 
ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;

-- Workspace subscriptions schema
ALTER TABLE public.workspace_subscriptions 
ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT FALSE;
```

### Classification Rules:
1. Every workspace whose `owner_email LIKE '%@staging.vistaar.internal'` has `is_test = TRUE`.
2. Every genuine business registered via live onboarding has `is_test = FALSE`.
3. The Gateway BFF provides an explicit `scope` query parameter (`genuine`, `test`, `all`).
4. When `scope = 'genuine'`, the gateway returns only authentic business records.
5. In staging, where all 11 current records are test fixtures, the UI displays `STAGING DATA — NOT PRODUCTION CUSTOMERS` and marks all test rows with `STAGING TEST FIXTURE`.

---

## 5. Security & Verification Summary

| Invariant Checked | Verification Status | Enforcement Point |
| :--- | :--- | :--- |
| Production Air-Gap | **PASSED (GO)** | Gateway BFF aborts startup if URL matches `kluxsykimnjivkqxelba` |
| RLS Isolation | **PASSED (GO)** | Tables enforce tenant boundaries via `workspace_id` |
| Administrative Auth | **PASSED (GO)** | Gateway verifies JWT with Supabase GoTrue; requires active row in `platform_admins` |
| GCAP Assertion | **PASSED (GO)** | Privileged operations require HMAC-SHA256 signature with nonces |
| Zero Mock Fallback | **PASSED (GO)** | Gateway and UI return error states with Retry buttons; zero fake arrays |
