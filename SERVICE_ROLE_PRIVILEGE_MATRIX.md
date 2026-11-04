# VISTAAR Super Admin — Per-Table Service Role Privilege Matrix & Justification
**Document Version:** 2.0.0 (Phase 4.2 V9 Definitive Least-Privilege Specification)  
**Date:** 2026-11-03  
**Target Environment:** `vistaar-super-admin-staging` (`vlbhxcajphyjkeueubud`, AWS `eu-west-1`)  
**Security Standard:** Strict Least Privilege (POLP), Defense-in-Depth, Statutory Audit Compliance, GCAP Triad, Genuine MFA Assurance (AAL2)

---

## 1. Executive Architecture Overview

In the VISTAAR multi-tenant platform architecture, the PostgreSQL database operates with strict role segregation:
- **`PUBLIC`, `anon`, `authenticated`:** Untrusted client roles. Completely denied all schema creation (`CREATE` revoked on `public` and `extensions`) and completely locked out of all 17 private application tables via SQL table ACLs (`REVOKE ALL`). The only public baseline grant is read-only `SELECT` on `public.subscription_plans`.
- **`service_role`:** The trusted backend application identity used exclusively by the **Super Admin Gateway BFF (`server/gateway.mjs`)** and authorized Supabase Edge Functions. It never interacts with client browser applications directly.
- **`postgres`:** The superuser migration owner responsible exclusively for executing DDL schema migrations (Migrations `000`, `077`, `078`).

This document provides the per-table privilege justification for every `SELECT`, `INSERT`, `UPDATE`, and `DELETE` privilege granted to `service_role` across all 18 tables in the database.

---

## 2. Table-by-Table Privilege Justification Matrix

### 2.1 Baseline Multi-Tenant Core Tables (Migration 000)

#### 1. `public.organizations` (Enterprise Multi-Branch Parent)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Revoked Privileges:** `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/organizations` and `GET /api/v1/organizations/:id` to display enterprise hierarchy and tenant rollups in the Super Admin dashboard.
  - `INSERT`: Required by Gateway BFF `POST /api/v1/organizations` when platform administrators onboard enterprise retail chains with multi-branch structures.
  - `UPDATE`: Required by Gateway BFF `PATCH /api/v1/organizations/:id` to modify enterprise legal names, tax identifiers, or corporate ownership.
  - `DELETE`: Required by Gateway BFF `DELETE /api/v1/organizations/:id` to purge staging test organizations or decommissioned enterprise records.
- **Narrower Alternative Evaluation:** Cannot be replaced with an RPC because enterprise CRUD operations require dynamic multi-field filtering and pagination handled directly by the Gateway query builder.

#### 2. `public.workspaces` (Operating Tenant Branches)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Revoked Privileges:** `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/workspaces` and `GET /api/v1/workspaces/:id` for tenant search, health metrics, and branch listing.
  - `INSERT`: Required by Gateway BFF `POST /api/v1/workspaces` to provision staging branches and test retail fixtures.
  - `UPDATE`: Required by Gateway BFF `PATCH /api/v1/workspaces/:id` and by RPCs `super_admin_suspend_workspace` and `super_admin_reactivate_workspace` to toggle `is_active` and update suspension audit columns (`suspension_reason`, `suspended_at`, `suspended_by`).
  - `DELETE`: Required during staging test teardown to purge synthetic workspaces.
- **Narrower Alternative Evaluation:** Direct table access is required for administrative tenant search and detail enrichment. State transitions (`suspend` / `reactivate`) are wrapped in cryptographic GCAP RPCs.

#### 3. `public.profiles` (User and Employee Identities)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Revoked Privileges:** `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/users` and `GET /api/v1/workspaces/:id/members` to list cross-workspace users, view employee rosters, and audit user roles.
  - `INSERT`: Required by Gateway BFF `POST /api/v1/users` and staging test setup to provision synthetic employee and owner profiles.
  - `UPDATE`: Required by Gateway BFF `PATCH /api/v1/users/:id` to update user status (`Active`, `Suspended`), reassign roles, or set password change flags.
  - `DELETE`: Required to remove de-provisioned test identities or purged user profiles.
- **Narrower Alternative Evaluation:** User profiles require multi-field search and pagination by email, name, role, and branch, requiring standard table DML.

#### 4. `public.workspace_memberships` (Multi-Branch User Routing)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Revoked Privileges:** `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/workspaces/:id/memberships` to verify branch routing assignments.
  - `INSERT`: Required by Gateway BFF `POST /api/v1/workspaces/:id/memberships` to link employees to secondary retail branches.
  - `UPDATE`: Required by Gateway BFF `PATCH /api/v1/workspaces/:id/memberships/:id` to change branch roles (`manager`, `cashier`, `staff`).
  - `DELETE`: Required by Gateway BFF `DELETE /api/v1/workspaces/:id/memberships/:id` to unassign an employee from a branch.
- **Narrower Alternative Evaluation:** Pure relational junction table; standard relational DML is the architectural standard.

#### 5. `public.invoices` (Tenant Billing & Financial Invoicing)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`
- **Revoked Privileges:** `DELETE` *(Hardened V6)*, `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/finance/invoices` to compute aggregate platform revenue, track outstanding balances, and render customer invoices.
  - `INSERT`: Required by Gateway BFF `POST /api/v1/finance/invoices` when platform billing invoices are generated for custom enterprise plans.
  - `UPDATE`: Required by Gateway BFF `PATCH /api/v1/finance/invoices/:id` to transition invoice statuses (`Issued` -> `Paid` or `Cancelled`) upon reconciliation.
  - **`DELETE` Removal Rationale:** Statutory accounting and GST compliance strictly forbid physical deletion of issued invoices. Cancellations are handled by updating status to `Cancelled`. Physical deletion is permanently revoked.

#### 6. `public.subscription_plans` (Sensitive Configuration Catalog)
- **Granted Privileges:** `SELECT` ONLY *(Hardened V6)*
- **Revoked Privileges:** `INSERT`, `UPDATE`, `DELETE` *(Hardened V6)*, `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/subscriptions/plans` and RPCs `validate_and_reserve_coupon` and `get_workspace_entitlements` to read canonical pricing, platform limits, and allowed platforms.
  - **Mutation Privileges Removal Rationale:** `subscription_plans` is the authoritative pricing catalog (`free_trial`, `starter`, `starter_mobile`, `business`, `growth`). Neither the Gateway BFF nor any client application ever creates, modifies, or deletes plans at runtime. Modifying plans is an administrative DDL/migration event performed strictly by migration scripts. All mutations (`INSERT`, `UPDATE`, `DELETE`) are permanently revoked from `service_role`.

#### 7. `public.workspace_subscriptions` (Authoritative Tenant Subscriptions)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`
- **Revoked Privileges:** `DELETE` *(Hardened V6)*, `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/subscriptions` to display current subscriptions, expiration dates, and trial periods.
  - `INSERT`: Required by Gateway BFF `POST /api/v1/subscriptions` to provision new subscriptions upon merchant checkout.
  - `UPDATE`: Required by Gateway BFF `PATCH /api/v1/subscriptions/:id` and RPCs `activate_zero_payable_subscription` and `settle_coupon_payment` to mutate status (`trialing`, `active`, `past_due`, `cancelled`, `expired`), extend trial periods, and apply coupon links.
  - **`DELETE` Removal Rationale:** Subscriptions maintain historical entitlement records. Subscription termination is executed by updating `status = 'cancelled'`. Physical deletion destroys tenant billing history and is permanently revoked.

#### 8. `public.subscription_addons` (Tenant Entitlement Add-ons)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Revoked Privileges:** `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/subscriptions/:id/addons` to inspect purchased extra terminal licenses or users.
  - `INSERT`: Required by Gateway BFF `POST /api/v1/subscriptions/:id/addons` to grant add-on entitlements.
  - `UPDATE`: Required by Gateway BFF `PATCH /api/v1/subscriptions/:id/addons/:id` to adjust quantity or status.
  - `DELETE`: Required by Gateway BFF `DELETE /api/v1/subscriptions/:id/addons/:id` to purge expired or de-allocated add-on allocations.

#### 9. `public.payment_transactions` (Financial Audit Ledger)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`
- **Revoked Privileges:** `DELETE` *(Hardened V6)*, `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/finance/transactions` to render financial reconciliation dashboards and transaction histories.
  - `INSERT`: Required by Gateway BFF webhook handler and RPC `settle_coupon_payment` to record captured payment transactions, underpayment failures, or webhook receipts.
  - `UPDATE`: Required by Gateway BFF to update reconciliation status and store gateway webhook payloads.
  - **`DELETE` Removal Rationale:** Banking and payment regulations (RBI / PCI-DSS) strictly prohibit deleting transaction records. Failed or reversed transactions remain permanent records in the database. `DELETE` is permanently revoked.

---

### 2.2 Platform Administration Infrastructure Tables (Migration 077)

#### 10. `public.platform_admins` (Super Admin Credentials & MFA)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Revoked Privileges:** `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway Auth Middleware on every request to verify administrator existence, check `is_active = TRUE`, and assert genuine MFA enrollment (`mfa_enrolled = TRUE`).
  - `INSERT` / `UPDATE`: Required by the authoritative database RPC `super_admin_provision_platform_admin` and Gateway BFF route `POST /api/v1/admins/provision` when provisioning platform administrators. The RPC enforces strict pre-conditions:
    - Caller must be `service_role`.
    - User UUID must exist in `auth.users`.
    - Email must match `auth.users.email` identically.
    - Requires active unexpired invitation in `public.platform_admin_invitations`.
    - Overwrite protection rejects attempts to overwrite existing administrators with conflicting emails (`SQLSTATE 55002`).
    - Duplicate email check rejects registering the same email under different UUIDs (`SQLSTATE 55003`).
    - Newly created admins start with `mfa_enrolled = FALSE`.
    - Every successful provisioning or update automatically emits an immutable audit event in `public.platform_audit_logs`.
  - `UPDATE` (Direct/RPC): Required by `super_admin_enroll_mfa` and `super_admin_revoke_mfa` to manage MFA lifecycle, and by Gateway BFF `PATCH /api/v1/admins/:id` to update roles (`super_admin`, `billing_admin`, `support_agent`) and toggle active status.
  - `DELETE`: Required by Gateway BFF `DELETE /api/v1/admins/:id` to remove decommissioned administrators, and by Test 6B to clean up test-owned conflicting rows.

#### 11. `public.platform_gcap_nonces` (GCAP Replay Defense Store)
- **Granted Privileges:** `SELECT`, `INSERT`, `DELETE`
- **Revoked Privileges:** `UPDATE` *(Hardened V6)*, `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by GCAP assertion verification logic to check for nonce existence.
  - `INSERT`: Required by RPCs `super_admin_get_platform_metrics`, `super_admin_suspend_workspace`, `super_admin_reactivate_workspace`, `super_admin_create_admin_invitation`, `super_admin_provision_platform_admin`, and `super_admin_revoke_mfa` to consume single-use nonces.
  - `DELETE`: Required by the background maintenance function `cleanup_expired_gcap_nonces()` to delete consumed nonces older than `expires_at`.
  - **`UPDATE` Removal Rationale:** Nonces are write-once tokens; they are consumed upon creation and deleted when expired. Mutating nonces is an invalid security concept. `UPDATE` is permanently revoked.

#### 12. `public.platform_workspace_suspensions` (Security Action Audit)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`
- **Revoked Privileges:** `DELETE` *(Hardened V6)*, `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/workspaces/:id/suspension-history` to view past enforcement actions.
  - `INSERT`: Required by RPC `super_admin_suspend_workspace` to log suspension reasons, admin IDs, and snapshotted membership/profile IDs.
  - `UPDATE`: Required by RPC `super_admin_reactivate_workspace` to record `reactivated_at`, `reactivated_by`, and `reactivation_reason`.
  - **`DELETE` Removal Rationale:** Suspension and reactivation events represent platform compliance audit records. They must never be deleted. `DELETE` is permanently revoked.

#### 13. `public.platform_system_settings` (Dynamic Configuration)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Revoked Privileges:** `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/settings` to read platform-wide maintenance mode flags, rate limits, and feature toggles.
  - `INSERT`: Required by Gateway BFF `POST /api/v1/settings` to define new platform setting keys.
  - `UPDATE`: Required by Gateway BFF `PATCH /api/v1/settings/:key` to modify configuration values.
  - `DELETE`: Required by Gateway BFF `DELETE /api/v1/settings/:key` to deprecate custom setting entries.

#### 14. `public.platform_audit_logs` (Immutable Control Plane Audit Log)
- **Granted Privileges:** `SELECT`, `INSERT` ONLY
- **Revoked Privileges:** `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/security/audit-logs` to query and filter platform audit logs.
  - `INSERT`: Required by Gateway BFF Audit Middleware and authoritative RPCs to record every administrative mutation.
  - **`UPDATE` and `DELETE` Removal Rationale:** Immutability is the core security invariant. In addition to SQL privilege revocation, trigger `trg_protect_platform_audit_logs` invokes `enforce_platform_audit_immutability()` to reject any mutation attempt with `SQLSTATE 55000`.

#### 15. `public.platform_admin_invitations` (Pre-Authorization & Invitation Registry)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Revoked Privileges:** `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/admins/invitations` and RPC `super_admin_provision_platform_admin` to inspect pending pre-authorizations and verify active status.
  - `INSERT`: Required by Gateway BFF `POST /api/v1/admins/invite` and RPC `super_admin_create_admin_invitation` when an active Super Admin issues a pre-authorization for a specific Auth user.
  - `UPDATE`: Required by RPC `super_admin_provision_platform_admin` to transition invitation `status = 'accepted'` and set `consumed_at`, and by revocation operations.
  - `DELETE`: Required by Test 6B & 6C teardown to purge test-owned conflict invitations.

#### 16. `public.platform_bootstrap_registry` (Bootstrap Lockout & Invariant Registry)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`
- **Revoked Privileges:** `DELETE` *(Hardened V9)*, `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by `super_admin_bootstrap_initial_admin` to verify whether the initial root super administrator has already been bootstrapped (`is_bootstrapped`).
  - `INSERT`: Used during schema setup to seed row `id = 1` if not present.
  - `UPDATE`: Required by `super_admin_bootstrap_initial_admin` to atomically set `is_bootstrapped = TRUE`, recording the execution timestamp and actor ID.
  - **`DELETE` Removal Rationale:** Deleting the registry row would compromise the permanent bootstrap lockout invariant. `DELETE` is permanently revoked.

---

### 2.3 Coupon & Promotional Campaign Tables (Migration 078)

#### 17. `public.coupons` (Promotional Campaign Catalog)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- **Revoked Privileges:** `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/coupons` and RPC `validate_and_reserve_coupon` to validate codes, discounts, eligible plans, and budgets.
  - `INSERT`: Required by Gateway BFF `POST /api/v1/coupons` (Coupon Studio) to create new promotional campaigns.
  - `UPDATE`: Required by Gateway BFF `PATCH /api/v1/coupons/:id` to adjust max redemptions, change active status, or edit campaign validity.
  - `DELETE`: Required by Gateway BFF `DELETE /api/v1/coupons/:id` to remove un-redeemed draft campaigns or staging fixtures.

#### 18. `public.coupon_redemptions` (Financial Redemption State Machine)
- **Granted Privileges:** `SELECT`, `INSERT`, `UPDATE`
- **Revoked Privileges:** `DELETE` *(Hardened V6)*, `TRUNCATE`, `REFERENCES`, `TRIGGER`
- **Route & RPC Justification:**
  - `SELECT`: Required by Gateway BFF `GET /api/v1/coupons/redemptions` and RPC `validate_and_reserve_coupon` to enforce per-workspace redemption limits.
  - `INSERT`: Required by RPC `validate_and_reserve_coupon` to transition coupons to `reserved` state.
  - `UPDATE`: Required by RPCs `settle_coupon_payment` and `activate_zero_payable_subscription` to settle redemptions or mark them `failed` / `requires_support_review`.
  - **`DELETE` Removal Rationale:** Coupon redemptions link payment transactions to promotional discounts for financial reconciliation. Deleting redemption records causes financial data loss. `DELETE` is permanently revoked.

---

### 2.4 Authoritative SECURITY DEFINER RPC Privileges

All database functions executing with elevated privileges (`SECURITY DEFINER`) enforce strict `SET search_path = public, extensions, pg_temp`, deny access to untrusted roles (`PUBLIC`, `anon`, `authenticated`), and grant execution exclusively to `service_role` (with the exception of client checkout functions requiring `authenticated` session context):

| Function Name | Return Type | `anon` | `authenticated` | `service_role` | `PUBLIC` | Security Purpose |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `super_admin_bootstrap_initial_admin` | `JSONB` | :x: | :x: | :white_check_mark: | :x: | One-time root admin bootstrap with dedicated secret & advisory lock. Strictly locked out once completed. |
| `super_admin_enroll_mfa` | `JSONB` | :x: | :x: | :white_check_mark: | :x: | Dedicated MFA self-enrollment RPC; requires active AAL2 session assurance. |
| `super_admin_revoke_mfa` | `JSONB` | :x: | :x: | :white_check_mark: | :x: | GCAP HMAC-authenticated MFA revocation for compromised administrator identities. |
| `super_admin_create_admin_invitation` | `JSONB` | :x: | :x: | :white_check_mark: | :x: | GCAP HMAC-authenticated pre-authorization creation by active Super Admin with enrolled MFA and AAL2. |
| `super_admin_provision_platform_admin` | `JSONB` | :x: | :x: | :white_check_mark: | :x: | GCAP HMAC-authenticated admin provisioning; enforces single-use invitation consumption, overwrite defense, duplicate email defense. |
| `super_admin_get_platform_metrics` | `JSONB` | :x: | :x: | :white_check_mark: | :x: | GCAP HMAC-authenticated platform-wide analytics and financial metrics; requires AAL2. |
| `super_admin_suspend_workspace` | `JSONB` | :x: | :x: | :white_check_mark: | :x: | GCAP HMAC-authenticated multi-branch workspace suspension and membership freezing; requires AAL2. |
| `super_admin_reactivate_workspace` | `JSONB` | :x: | :x: | :white_check_mark: | :x: | GCAP HMAC-authenticated workspace reactivation and selective membership restoration; requires AAL2. |
| `settle_coupon_payment` | `JSONB` | :x: | :x: | :white_check_mark: | :x: | Gateway webhook payment settlement, underpayment audit handling, and coupon state machine transition. |
| `cleanup_expired_gcap_nonces` | `INTEGER` | :x: | :x: | :white_check_mark: | :x: | Background maintenance job purging consumed GCAP nonces older than `expires_at`. |
| `validate_and_reserve_coupon` | `JSONB` | :x: | :white_check_mark: | :white_check_mark: | :x: | Tenant checkout coupon validation, discount computation, and atomic reservation. |
| `activate_zero_payable_subscription` | `JSONB` | :x: | :white_check_mark: | :white_check_mark: | :x: | Tenant checkout 100% discount activation without payment gateway transaction. |
| `enforce_platform_audit_immutability` | `TRIGGER` | :x: | :x: | :x: | :x: | Trigger function raising `SQLSTATE 55000` on any attempted `UPDATE` or `DELETE` on `platform_audit_logs`. |

---

## 3. Summary Privilege Matrix

| # | Table Name | `SELECT` | `INSERT` | `UPDATE` | `DELETE` | `TRUNCATE` | `REFERENCES` | `TRIGGER` | Classification |
| :-: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **01** | `organizations` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :x: | :x: | Full Lifecycle Management |
| **02** | `workspaces` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :x: | :x: | Full Lifecycle Management |
| **03** | `profiles` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :x: | :x: | Full Lifecycle Management |
| **04** | `workspace_memberships`| :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :x: | :x: | Full Lifecycle Management |
| **05** | `invoices` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: *(Hardened)* | :x: | :x: | :x: | Statutory Financial Ledger |
| **06** | `subscription_plans` | :white_check_mark: | :x: *(Hardened)* | :x: *(Hardened)* | :x: *(Hardened)* | :x: | :x: | :x: | Sensitive Configuration Catalog |
| **07** | `workspace_subscriptions`| :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: *(Hardened)* | :x: | :x: | :x: | Historical Entitlement Ledger |
| **08** | `subscription_addons` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :x: | :x: | Full Lifecycle Management |
| **09** | `payment_transactions` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: *(Hardened)* | :x: | :x: | :x: | Banking & Financial Audit Ledger |
| **10** | `platform_admins` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :x: | :x: | Administrative Credentials & MFA |
| **11** | `platform_gcap_nonces` | :white_check_mark: | :white_check_mark: | :x: *(Hardened)* | :white_check_mark: | :x: | :x: | :x: | Replay Defense Store |
| **12** | `platform_workspace_suspensions`| :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: *(Hardened)* | :x: | :x: | :x: | Security Action Audit |
| **13** | `platform_system_settings`| :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :x: | :x: | Dynamic Platform Config |
| **14** | `platform_audit_logs` | :white_check_mark: | :white_check_mark: | :x: *(Immut)* | :x: *(Immut)* | :x: | :x: | :x: | Append-Only Immutable Audit |
| **15** | `platform_admin_invitations` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :x: | :x: | Pre-Authorization Registry |
| **16** | `platform_bootstrap_registry` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: *(Hardened)* | :x: | :x: | :x: | One-Time Bootstrap Registry |
| **17** | `coupons` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :x: | :x: | Promotional Campaigns |
| **18** | `coupon_redemptions` | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: *(Hardened)* | :x: | :x: | :x: | Financial Redemption State Machine |

---

## 4. Regression Assertion Proof

The above privilege matrix is authoritatively verified by **Test 4** of [`tests/staging_test_suite.sql`](file:///d:/Project/vistaar-main/super_admin/tests/staging_test_suite.sql).  
In the local PostgreSQL simulation, Test 4 passed with 100% assertions satisfied, confirming both positive and negative permissions across all 18 tables.
