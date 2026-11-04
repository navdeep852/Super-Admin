# VISTAAR Super Admin — Phase 2.2 Final Security Consistency Changelog

**Document Version:** 2.2.0  
**Effective Date:** 2026-11-01  
**Project:** VISTAAR Super Admin Control Plane (`navdeep852/Super-Admin`)  
**Target Domain:** `admin.vistaarone.com`  
**Target Backend:** Existing Production Supabase Infrastructure (`https://kluxsykimnjivkqxelba.supabase.co`)  
**Sibling Business Application:** VISTAAR Business OS (`Vistaar/`)  
**Status:** Architecture Blueprint Corrections Complete — Awaiting Human Review & Formal Sign-Off  

---

## 1. Executive Summary

Following Phase 2.1, a second comprehensive technical audit of the VISTAAR Super Admin architecture and database specifications was conducted. This audit focused on deep SQL consistency, authorization boundaries in tenant-facing procedures, multi-branch organizational behavior, database-enforced audit immutability, and schema-reference integrity.

All remaining technical gaps have been resolved across the specification suite in `super_admin/`. 

This document records the exact findings, remediations, function authorization matrix, and schema-reference consistency checklist established in **Phase 2.2**.

---

## 2. Itemized Gap Analysis & Remediations

### Gap 1: Coupon Workspace Authorization in `validate_and_reserve_coupon` (IDOR / Cross-Tenant Reservation)
* **Vulnerability Analysis:** In Phase 2.1, `validate_and_reserve_coupon` accepted `p_workspace_id` and `p_user_id` as input arguments without verifying whether the authenticated caller had the right to act on behalf of that workspace. A malicious authenticated user from Tenant $A$ could pass Tenant $B$'s `p_workspace_id`, reserving a coupon against Tenant $B$, consuming their single-use quota, or altering their subscription quoting flow. Furthermore, it did not check whether the workspace was active or suspended.
* **Technical Remediation:**
  - Removed `p_user_id` from the parameter list.
  - Derived caller identity strictly from PostgreSQL `auth.uid()`.
  - Added an active workspace check (`workspaces.is_active = TRUE`). If suspended or inactive, checkout quoting aborts immediately.
  - Added a multi-branch aware workspace authorization guard verifying that `auth.uid()` is:
    1. The direct workspace owner (`workspaces.owner_id = auth.uid()`), OR
    2. An active `owner` or `admin` in `public.profiles` for that workspace, OR
    3. An active `owner` or `admin` in `public.workspace_memberships` for that workspace, OR
    4. The owner of the parent organization (`organizations.owner_user_id = auth.uid()`).
  - Added bypass for trusted administrative / gateway service callers (`auth.role() = 'service_role'`).
  - Cross-tenant reservations are rejected with `FORBIDDEN: You do not have authorization to manage subscriptions for this workspace.`
* **Documents & Sections Modified:**
  - `SUPER_ADMIN_DATABASE_DESIGN.md`: Section 6.4 (Full SQL implementation).
  - `SUPER_ADMIN_SECURITY_DESIGN.md`: Section 1 (Threat Matrix), Section 6 (Function Matrix).
  - `SUPER_ADMIN_COUPON_DESIGN.md`: Section 2.2 (Privacy & Authorization Model).
  - `SUPER_ADMIN_IMPLEMENTATION_BLUEPRINT.md`: Section 1 (Core Mandates), Section 4.2.

---

### Gap 2: Inconsistent Primary Key Reference on `public.platform_admins` (`admin_id` vs `id`)
* **Defect Analysis:** In `public.platform_admins`, the primary key column is defined as `id UUID PRIMARY KEY REFERENCES auth.users(id)`. However, several draft RLS policies and narrative queries in the Phase 2.1 documents referenced non-existent column `platform_admins.admin_id` (e.g., `WHERE admin_id = auth.uid()`).
* **Technical Remediation:**
  - Reconciled every query, policy, and DDL statement across all specification documents to refer consistently to `public.platform_admins.id`.
  - Confirmed foreign key references on related tables:
    - `platform_audit_logs.admin_id` &rarr; `REFERENCES public.platform_admins(id)` (Correct FK column name on child table).
    - `coupons.created_by` &rarr; `REFERENCES public.platform_admins(id)`.
    - `platform_system_settings.updated_by` &rarr; `REFERENCES public.platform_admins(id)`.
    - `workspaces.suspended_by` &rarr; `REFERENCES public.platform_admins(id)`.
  - Validated that `platform_admins` contains exactly: `id`, `email`, `full_name`, `role`, `is_active`, `mfa_enabled`, `phone_number`, `created_at`, `updated_at`.
* **Documents & Sections Modified:**
  - `SUPER_ADMIN_DATABASE_DESIGN.md`: Section 4.1, Section 4.2, Section 4.3, Section 4.5, Section 6.1, Section 6.2, Section 6.3.
  - `SUPER_ADMIN_SECURITY_DESIGN.md`: Section 2 (Authentication flow), Section 2.2, Section 6.1.
  - `SUPER_ADMIN_IMPLEMENTATION_BLUEPRINT.md`: Section 4.1, Section 5.
  - `SUPER_ADMIN_COUPON_DESIGN.md`: Section 6.

---

### Gap 3: Broad Function Execution Grants on Privileged Administrative Procedures
* **Vulnerability Analysis:** In the initial revision, privileged administrative functions (`super_admin_get_platform_metrics`, `super_admin_suspend_workspace`) granted `EXECUTE` to `authenticated` users, relying solely on internal runtime checks. If an authorization check had a logical flaw, standard tenant users could attempt to execute administrative operations.
* **Technical Remediation:**
  - Enforced strict Discretionary Access Control (DAC):
    - `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;`
    - `GRANT EXECUTE ON FUNCTION ... TO service_role;`
  - Privileged administrative procedures are callable **only** by the trusted Backend API Gateway using `service_role` after the gateway verifies the administrator's JWT, active status in `platform_admins`, and AAL2 TOTP challenge. Direct client PostgREST execution is completely blocked.
  - Created a comprehensive Function Authorization Inventory covering all 7 database functions.
* **Documents & Sections Modified:**
  - `SUPER_ADMIN_DATABASE_DESIGN.md`: Section 6.1, 6.2, 6.3, 6.7.
  - `SUPER_ADMIN_SECURITY_DESIGN.md`: Section 1, Section 6.1.

---

### Gap 4: Superficial Audit Log Immutability Claims
* **Defect Analysis:** The previous blueprint labeled audit logs as "append-only" without defining database-enforced mechanisms to prevent `UPDATE`, `DELETE`, or `TRUNCATE` operations, and without addressing the physical limits of PostgreSQL immutability regarding superusers.
* **Technical Remediation:**
  - Implemented a database-enforced trigger function `enforce_platform_audit_immutability()` executed `BEFORE UPDATE OR DELETE ON public.platform_audit_logs` that raises a `55000 (object_not_modifiable)` exception.
  - Explicitly revoked `UPDATE`, `DELETE`, and `TRUNCATE` from `PUBLIC`, `anon`, and `authenticated`.
  - Revoked `TRUNCATE` from `service_role`.
  - Added cryptographic SHA-256 hash chaining columns (`record_hash`, `previous_record_hash`) linking each record to the previous entry for tamper-detection.
  - Defined the 90-day hot storage to WORM-compliant object storage cold-archival lifecycle.
  - Clearly documented the boundary: PostgreSQL engine protects against application and service roles; regulatory WORM guarantees against infrastructure superusers require object storage archival.
* **Documents & Sections Modified:**
  - `SUPER_ADMIN_DATABASE_DESIGN.md`: Section 4.2.
  - `SUPER_ADMIN_SECURITY_DESIGN.md`: Section 3.1, Section 3.2.
  - `SUPER_ADMIN_IMPLEMENTATION_BLUEPRINT.md`: Section 1 (Mandate 4).

---

### Gap 5: Multi-Branch Suspension Collateral Damage & Incomplete Reactivation
* **Vulnerability Analysis:** Suspending a business workspace by modifying `profiles.status = 'Suspended'` without considering multi-branch organizations would unfairly terminate a user's access to all branches of an organization, even if only one branch was suspended. Furthermore, no formal reactivation procedure existed.
* **Technical Remediation:**
  - Updated `super_admin_suspend_workspace` with multi-branch logic:
    - Atomically updates `workspaces.is_active = FALSE`.
    - Updates `workspace_memberships.status = 'Suspended'` specifically for the target workspace.
    - Inspects `profiles` where primary `workspace_id = p_workspace_id`. If the user has other active branches in `workspace_memberships`, their global profile status remains `'Active'`, allowing continued access to unsuspended branches. If they have no other active branches, their profile is set to `'Suspended'`.
  - Created dedicated procedure `super_admin_reactivate_workspace`:
    - Atomically sets `workspaces.is_active = TRUE`.
    - Restores `workspace_memberships.status = 'Active'`.
    - Restores `profiles.status = 'Active'`.
    - Emits `REACTIVATE_WORKSPACE` in `platform_audit_logs`.
  - Defined failure recovery: if session revocation (`auth.admin.signOut`) encounters network transient failures, the database and gateway middleware continue to block requests, while a background worker retries revocation.
* **Documents & Sections Modified:**
  - `SUPER_ADMIN_DATABASE_DESIGN.md`: Section 6.2, Section 6.3.
  - `SUPER_ADMIN_SECURITY_DESIGN.md`: Section 4.2, Section 4.3.
  - `SUPER_ADMIN_IMPLEMENTATION_BLUEPRINT.md`: Section 1, Section 4.2.

---

### Gap 6: Unprotected Zero-Payable Coupons & Refund Quota Leakage
* **Vulnerability Analysis:**
  1. A coupon providing a 100% discount produces `final_payable_inr = 0.00`. Because no payment gateway transaction is generated for ₹0, the standard webhook settlement path cannot fire, leaving zero-cost promotions unredeemable or vulnerable to unauthenticated activation hacks.
  2. The refund flow previously restored consumed coupon quotas, allowing tenants to exploit a "purchase &rarr; claim discount &rarr; refund &rarr; reuse promo" churn loop.
* **Technical Remediation:**
  - Created a dedicated, secure server-side activation procedure: `activate_zero_payable_subscription(p_redemption_id UUID)`:
    - Verifies reservation exists, has `status = 'reserved'`, and `final_payable_inr = 0.00`.
    - Verifies reservation TTL has not expired.
    - Verifies target workspace is active and caller is authorized.
    - Atomically marks redemption as `applied`, creates an audit transaction in `payment_transactions` (`provider = 'promotional_grant'`, `amount_inr = 0.00`, `status = 'verified_success'`), and activates `workspace_subscriptions`.
  - Clarified refund policy: refunded transactions update `coupon_redemptions.status = 'refunded'`, but **do not restore consumed quotas**, preventing churn-and-refund abuse.
* **Documents & Sections Modified:**
  - `SUPER_ADMIN_DATABASE_DESIGN.md`: Section 6.5, Section 6.6.
  - `SUPER_ADMIN_SECURITY_DESIGN.md`: Section 5.1.
  - `SUPER_ADMIN_COUPON_DESIGN.md`: Section 4.2, Section 4.3.

---

## 3. Comprehensive Function Authorization Matrix

Every database function across the Super Admin architecture has been formally audited and documented:

| Function Name | Security Type | Owner / `search_path` | Identity Derivation | Required Role | MFA Required | Workspace Auth | Execution Grants | Direct Client Invocation? |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- | :--- | :---: |
| `super_admin_get_platform_metrics()` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | `auth.uid()` | `platform_admins` (`super_admin` or `billing_admin`) | **Yes (AAL2)** | N/A (Platform Scope) | `service_role` | **NO** (Gateway Only) |
| `super_admin_suspend_workspace(p_workspace_id, p_reason)` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | `auth.uid()` | `platform_admins` (`super_admin`) | **Yes (AAL2)** | Target workspace existence | `service_role` | **NO** (Gateway Only) |
| `super_admin_reactivate_workspace(p_workspace_id, p_reason)` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | `auth.uid()` | `platform_admins` (`super_admin`) | **Yes (AAL2)** | Target workspace existence | `service_role` | **NO** (Gateway Only) |
| `validate_and_reserve_coupon(p_code, p_workspace_id, p_plan_id, p_interval)` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | `auth.uid()` (or `service_role`) | Workspace Owner, Org Owner, or Active Profile with Owner/Admin role | No (AAL1 standard customer) | Active workspace + caller ownership check | `authenticated`, `service_role` | **YES** (Tenant Checkout) |
| `activate_zero_payable_subscription(p_redemption_id)` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | `auth.uid()` (or `service_role`) | Workspace Owner, Org Owner, or Active Profile with Owner/Admin role | No (AAL1 standard customer) | Valid reservation + active workspace check | `authenticated`, `service_role` | **YES** (Tenant Checkout) |
| `settle_coupon_payment(p_redemption_id, p_ref, p_amount, p_payload)` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | Webhook Context | `service_role` only | N/A (Server-to-Server HMAC) | Reservation vs transaction match | `service_role` | **NO** (Webhook Handler Only) |
| `enforce_platform_audit_immutability()` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | Internal Trigger | Internal Database Engine | N/A | N/A | Trigger on `platform_audit_logs` | **NO** (Trigger Only) |

---

## 4. Schema-Reference Consistency Checklist

A complete audit of all SQL DDL, stored procedures, RLS policies, and code examples was conducted against the proposed database schema:

| Table Name | Documented Primary Key | Validated Foreign Keys & Referencing Columns | All Referenced Columns Verified? | Status |
| :--- | :--- | :--- | :---: | :---: |
| `public.platform_admins` | `id UUID PRIMARY KEY REFERENCES auth.users(id)` | Referenced by `platform_audit_logs.admin_id`, `coupons.created_by`, `platform_system_settings.updated_by`, `workspaces.suspended_by`. Zero references to `admin_id` on this table. | :white_check_mark: | **CONSISTENT** |
| `public.platform_audit_logs` | `id UUID PRIMARY KEY` | `admin_id` &rarr; `platform_admins(id)`, `target_workspace_id` &rarr; `workspaces(id)`. Columns `record_hash` and `previous_record_hash` verified. | :white_check_mark: | **CONSISTENT** |
| `public.coupons` | `id UUID PRIMARY KEY` | `created_by` &rarr; `platform_admins(id)`. `code` (Unique uppercase). `discount_duration = 'once'` constraint verified. | :white_check_mark: | **CONSISTENT** |
| `public.coupon_redemptions` | `id UUID PRIMARY KEY` | `coupon_id` &rarr; `coupons(id)` (`RESTRICT`), `workspace_id` &rarr; `workspaces(id)` (`RESTRICT`), `user_id` &rarr; `auth.users(id)` (`RESTRICT`), `payment_transaction_id` &rarr; `payment_transactions(id)` (`RESTRICT`). Snapshots verified. | :white_check_mark: | **CONSISTENT** |
| `public.platform_system_settings` | `key VARCHAR(100) PRIMARY KEY` | `updated_by` &rarr; `platform_admins(id)`. | :white_check_mark: | **CONSISTENT** |
| `public.workspaces` (Additive) | `id UUID PRIMARY KEY` | Additive columns: `suspension_reason TEXT`, `suspended_at TIMESTAMPTZ`, `suspended_by UUID REFERENCES platform_admins(id)`. | :white_check_mark: | **CONSISTENT** |
| `public.workspace_subscriptions` (Additive) | `id UUID PRIMARY KEY` | Additive columns: `applied_coupon_id UUID REFERENCES coupons(id)`, `discount_amount_inr NUMERIC(10, 2)`. | :white_check_mark: | **CONSISTENT** |
| `public.payment_transactions` (Additive) | `id UUID PRIMARY KEY` | Additive column: `coupon_redemption_id UUID REFERENCES coupon_redemptions(id)`. | :white_check_mark: | **CONSISTENT** |

---

## 5. Unresolved Technical Dependencies

The following infrastructure dependencies remain outside the code repository and must be configured prior to Phase 2/3 execution:
1. **Gateway Hosting Runtime Selection:** Final decision on whether the Backend API Gateway will run as **Supabase Edge Functions (Deno)** or an **Express Node.js BFF** deployed alongside the SPA at `admin.vistaarone.com`.
2. **Cold Storage Archival Bucket:** Provisioning of a WORM-compliant object storage bucket (AWS S3 with Object Lock or Supabase Storage) for streaming audit records older than 90 days.
3. **Admin Alert Dispatch Channel:** Configuration of a dedicated transactional email or SMS provider (Resend, AWS SES) for critical administrative security events (e.g. tenant suspension notifications, root admin MFA resets).

---

## 6. Critical Human Approval Blockers

The following governance items are explicit **BLOCKERS**. Implementation cannot proceed until authorized personnel review and formally approve:

```
+----------------------------------------------------------------------------------------------------+
|                                    CRITICAL APPROVAL BLOCKERS                                      |
+---+------------------------------------+-----------------------------------------------------------+
| # | Blocker Item                       | Impact / Description                                      |
+---+------------------------------------+-----------------------------------------------------------+
| 1 | Payment Gateway Webhook Secret     | Requirement: Secure configuration of the webhook HMAC     |
|   | Configuration                      | secret for the payment gateway integration (`youpi_pg`).  |
|   |                                    | Gateway settlement cannot proceed without verification.   |
+---+------------------------------------+-----------------------------------------------------------+
| 2 | Initial Platform Super Admin       | Requirement: Explicit approval of the root Super Admin     |
|   | Identity Approval                  | email address (`admin@vistaarone.com`) and the authorized  |
|   |                                    | platform operator who will conduct the offline CLI        |
|   |                                    | provisioning ceremony.                                    |
+---+------------------------------------+-----------------------------------------------------------+
| 3 | Non-Production Staging Sandbox     | Requirement: Formal provision of a non-production         |
|   | Environment Authorization          | Supabase branch or staging database instance to execute   |
|   |                                    | Phase 2 migration and RPC unit tests. No DDL will run     |
|   |                                    | against live production (`kluxsykimnjivkqxelba`).         |
+---+------------------------------------+-----------------------------------------------------------+
| 4 | Phase 1 (v1.0) Coupon Scope        | Requirement: Explicit commercial sign-off that Phase 1    |
|   | Confirmation                       | supports one-time checkout discounts only, deferring      |
|   |                                    | multi-cycle recurring subscription discounts to Phase 2.  |
+---+------------------------------------+-----------------------------------------------------------+
```

---

## 7. Production Codebase & Database Safety Verification

Prior to the completion of Phase 2.2 documentation, safety audits confirmed:
1. **Production Repository (`Vistaar/` at `d:\Project\vistaar-main\vistaar-main`):**
   - Git status check: `On branch main, working tree clean`.
   - **Zero** production application files modified, created, or deleted.
2. **Production Supabase Database (`kluxsykimnjivkqxelba`):**
   - **Zero** migrations executed.
   - **Zero** live tables, schemas, roles, or policies altered.
   - All proposed SQL scripts reside exclusively as documentation artifacts inside `super_admin/`.

---

*End of Changelog — Phase 2.2 Final Security Consistency Review.*

