# VISTAAR Super Admin — Phase 2.4 Final Security & Subscription Integrity Changelog

**Document Version:** 2.4.0  
**Effective Date:** 2026-11-01  
**Project:** VISTAAR Super Admin Control Plane (`navdeep852/Super-Admin`)  
**Target Domain:** `admin.vistaarone.com`  
**Target Backend:** Existing Production Supabase Infrastructure (`https://kluxsykimnjivkqxelba.supabase.co`)  
**Sibling Business Application:** VISTAAR Business OS (`Vistaar/`)  
**Status:** Architecture Blueprint Corrections Complete — Awaiting Human Review & Formal Sign-Off  

---

## 1. Executive Summary

During the Phase 2.4 technical review of the VISTAAR Super Admin database specifications, four critical vulnerabilities and operational flaws were identified and remediated:

1. **Service-Role Workspace Authorization Bypass:** In `validate_and_reserve_coupon` and `activate_zero_payable_subscription`, possession of `service_role` credentials previously bypassed customer workspace authorization. We established strictly separated customer and trusted backend execution contracts, ensuring that backend calls must supply verified customer identity (`p_customer_id`) and that the database strictly verifies customer ownership/admin authority in all execution contexts.
2. **Race Conditions in GCAP Nonce Replay Defense:** The previous pre-insert check against `platform_audit_logs` was susceptible to concurrent replay attacks. We designed a dedicated, database-enforced atomic nonce registry table (`public.platform_gcap_nonces`) governed by a primary key unique constraint.
3. **Destructive Subscription Period Overwrites:** Both `activate_zero_payable_subscription` and `settle_coupon_payment` previously overwrote subscription dates on renewal, destroying unexpired paid time. We implemented mathematical period preservation that tacks remaining days onto renewal and upgrade cycles.
4. **Weak Payment Evidence & Tolerance Gaps:** We strengthened `settle_coupon_payment` with explicit provider validation (`youpi_pg`), captured payment status confirmation, future-dating tolerance limits ($\le +5\text{m}$), and legitimate late payment transit windows ($\le 24\text{h}$).

---

## 2. Itemized Vulnerability Analysis & Exact SQL Remediations

### Vulnerability 1: Service-Role Authorization Bypass in Coupon Procedures
* **Defect Analysis:** In Phase 2.3, `validate_and_reserve_coupon` and `activate_zero_payable_subscription` included:
  `IF v_is_service_role THEN v_is_authorized := TRUE;`
  This created a dangerous privilege bypass: any backend process, compromised service-role key, or gateway bug could invoke the procedure to reserve or activate coupons against workspaces where the actual customer had no rights.
* **Exact SQL Remediation ([SUPER_ADMIN_DATABASE_DESIGN.md Section 6.4 & 6.5](file:///d:/Project/vistaar-main/super_admin/SUPER_ADMIN_DATABASE_DESIGN.md#L528-L755)):**
  1. Separated execution contracts:
     - When `auth.role() = 'authenticated'`, caller identity is derived strictly from `auth.uid()`.
     - When `auth.role() = 'service_role'`, verified customer identity must be explicitly provided via `p_customer_id`. If `p_customer_id IS NULL`, execution aborts with `MISSING_CUSTOMER_CONTEXT`.
  2. In BOTH contracts, the procedure verifies that `v_caller_id` holds active ownership or administrative authority over `p_workspace_id`.
  3. Possession of `service_role` **never** grants a bypass of workspace authorization.

---

### Vulnerability 2: GCAP Nonce Concurrency Race Condition (TOCTOU)
* **Defect Analysis:** In Phase 2.3, replay prevention relied on `IF EXISTS (SELECT 1 FROM public.platform_audit_logs WHERE details->>'assertion_nonce' = p_nonce::TEXT)`. In concurrent execution, two simultaneous requests carrying the identical nonce could execute the `SELECT` query at the exact same instant before either committed their row. Both queries would return false, allowing duplicate execution.
* **Exact SQL Remediation ([SUPER_ADMIN_DATABASE_DESIGN.md Section 4.2 & 6.1–6.3](file:///d:/Project/vistaar-main/super_admin/SUPER_ADMIN_DATABASE_DESIGN.md#L99-L525)):**
  1. Created dedicated table `public.platform_gcap_nonces (nonce UUID PRIMARY KEY, admin_id UUID, action TEXT, consumed_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)`.
  2. Implemented atomic insertion inside the privileged transaction:
     ```sql
     BEGIN
         INSERT INTO public.platform_gcap_nonces (nonce, admin_id, action, consumed_at, expires_at)
         VALUES (p_nonce, p_admin_id, '<ACTION_NAME>', NOW(), NOW() + INTERVAL '5 minutes');
     EXCEPTION WHEN unique_violation THEN
         RAISE EXCEPTION 'REPLAY_DETECTED: Assertion nonce % has already been consumed or is concurrently executing.', p_nonce
             USING ERRCODE = '23505';
     END;
     ```
  3. PostgreSQL's primary key B-Tree index guarantees strict serialization: exactly one concurrent transaction succeeds; duplicates immediately fail with `unique_violation (23505)`.
  4. If the transaction rolls back, locks and nonce insertions are cleaned up atomically.

---

### Vulnerability 3: Erasing Remaining Paid Subscription Days on Renewal / Upgrade
* **Defect Analysis:** In earlier revisions, `activate_zero_payable_subscription` and `settle_coupon_payment` set:
  `current_period_start = NOW()`, `current_period_end = NOW() + INTERVAL '1 month'` unconditionally.
  If a business paid for an annual plan and renewed 10 days early, or applied a promo code mid-cycle, the remaining 10 days of paid service were silently erased.
* **Exact SQL Remediation ([SUPER_ADMIN_DATABASE_DESIGN.md Section 6.5 & 6.6](file:///d:/Project/vistaar-main/super_admin/SUPER_ADMIN_DATABASE_DESIGN.md#L670-L835)):**
  Implemented the Subscription Period Preservation State Machine:
  ```sql
  IF v_existing_sub.id IS NULL THEN
      -- Scenario A: Brand New Subscription
      v_new_period_start := v_now;
      v_new_period_end := v_now + v_period_interval;
  ELSIF v_existing_sub.status = 'trialing' THEN
      -- Scenario B: Converting 14-Day Free Trial to Paid Active Plan
      v_new_period_start := v_now;
      v_new_period_end := v_now + v_period_interval;
  ELSIF v_existing_sub.status = 'active' AND v_existing_sub.current_period_end >= v_now THEN
      -- Scenario C: Active Paid Subscription Renewal or Plan Upgrade Before Expiry
      IF v_existing_sub.plan_id = v_redemption.plan_id THEN
          -- Same plan renewal: extend existing expiry date without losing remaining paid time
          v_new_period_start := v_existing_sub.current_period_start;
          v_new_period_end := v_existing_sub.current_period_end + v_period_interval;
      ELSE
          -- Plan Upgrade / Switch: Upgraded tier takes effect immediately; remaining unexpired time tacked on
          v_new_period_start := v_now;
          v_new_period_end := v_now + v_period_interval + (v_existing_sub.current_period_end - v_now);
      END IF;
  ELSE
      -- Scenario D: Renewal After Expiry (status is past_due, expired, cancelled, or period_end < now)
      v_new_period_start := v_now;
      v_new_period_end := v_now + v_period_interval;
  END IF;
  ```

---

### Vulnerability 4: Insufficient Payment Evidence Verification
* **Defect Analysis:** `settle_coupon_payment` previously accepted arbitrary payment providers, did not verify whether the provider status was captured, had no clock skew tolerance checks, and lacked a defined policy for legitimately authorized payments that experienced delayed webhook delivery.
* **Exact SQL Remediation ([SUPER_ADMIN_DATABASE_DESIGN.md Section 6.6](file:///d:/Project/vistaar-main/super_admin/SUPER_ADMIN_DATABASE_DESIGN.md#L758-L835)):**
  1. **Allowed Provider Check:** Asserts `LOWER(TRIM(p_gateway_provider)) IN ('youpi_pg')`.
  2. **Captured Status Check:** Asserts `p_provider_status IN ('captured', 'verified_success', 'payment.authorized')`.
  3. **Future-Dating Tolerance:** Asserts `p_payment_authorized_at <= NOW() + INTERVAL '5 minutes'`.
  4. **Late Webhook Transit Policy:**
     - Must be authorized at gateway before reservation expiry: `p_payment_authorized_at <= v_redemption.reserved_until`.
     - Webhook transit arrival must be within 24 hours of gateway authorization: `NOW() - p_payment_authorized_at <= INTERVAL '24 hours'`.
     - If authorized after reservation expiry, marked `failed` with `RESERVATION_EXPIRED`.

---

## 3. Comprehensive Function Authorization Matrix

| Function Name | Security Type | Owner / `search_path` | Identity Derivation | Required Role | MFA Required | Workspace Auth | Execution Grants | Direct Client Invocation? |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- | :--- | :---: |
| `super_admin_get_platform_metrics(admin_id, ts, nonce, sig)` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | Gateway Cryptographic Assertion (GCAP) | `platform_admins` (`super_admin` or `billing_admin`) | **Yes (Verified by Gateway before GCAP)** | N/A (Platform Scope) | `service_role` | **NO** (Gateway Only) |
| `super_admin_suspend_workspace(ws_id, reason, admin_id, ts, nonce, sig)` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | Gateway Cryptographic Assertion (GCAP) | `platform_admins` (`super_admin`) | **Yes (Verified by Gateway before GCAP)** | Target workspace existence | `service_role` | **NO** (Gateway Only) |
| `super_admin_reactivate_workspace(ws_id, reason, admin_id, ts, nonce, sig)` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | Gateway Cryptographic Assertion (GCAP) | `platform_admins` (`super_admin`) | **Yes (Verified by Gateway before GCAP)** | Target workspace existence | `service_role` | **NO** (Gateway Only) |
| `validate_and_reserve_coupon(code, ws_id, plan, interval, customer_id)` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | Client `auth.uid()` or Gateway `p_customer_id` | Workspace Owner, Org Owner, or Profile with Owner/Admin role | No (AAL1 standard customer) | Active workspace + caller ownership check (NO service_role bypass) | `authenticated`, `service_role` | **YES** (Tenant Checkout) |
| `activate_zero_payable_subscription(redemption_id, customer_id)` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | Client `auth.uid()` or Gateway `p_customer_id` | Workspace Owner, Org Owner, or Profile with Owner/Admin role | No (AAL1 standard customer) | Valid reservation + caller ownership check (NO service_role bypass) | `authenticated`, `service_role` | **YES** (Tenant Checkout) |
| `settle_coupon_payment(redemption_id, ref, provider, amt, curr, payload, auth_time, status)` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | Webhook Controller Context | `service_role` only | N/A (Server-to-Server HMAC) | Reservation vs transaction match | `service_role` | **NO** (Webhook Handler Only) |
| `enforce_platform_audit_immutability()` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | Internal Trigger | Internal Database Engine | N/A | N/A | Trigger on `platform_audit_logs` | **NO** (Trigger Only) |
| `cleanup_expired_gcap_nonces()` | `SECURITY DEFINER` | `postgres` / `public, pg_temp` | Background Maintenance | `service_role` only | N/A | N/A | `service_role` | **NO** (Cron Worker Only) |

---

## 4. Formal Test Cases Specification

### 4.1 Nonce Concurrency Test Cases

```sql
-- TEST CASE NCC-01: Concurrent Replay of Identical Nonce
-- Setup: Two concurrent database sessions invoke super_admin_suspend_workspace with identical p_nonce = 'd3b07384d113edec49eaa6238ad5ff00'
-- Execution:
--   Session 1: INSERT INTO platform_gcap_nonces ... (acquires index lock, commits)
--   Session 2: INSERT INTO platform_gcap_nonces ... (blocks, then encounters unique_violation)
-- Expected Result:
--   Session 1: Succeeds (HTTP 200 OK)
--   Session 2: Aborts with SQLSTATE 23505 (REPLAY_DETECTED: Assertion nonce has already been consumed)
--   Database State: Workspace suspended exactly once; exactly one audit log entry recorded.
```

### 4.2 Subscription-Period Calculation Examples

#### Example 1: Early Annual Renewal on Same Plan
- Existing Subscription: `plan_id = 'business'`, `current_period_start = 2026-01-01`, `current_period_end = 2027-01-01`.
- Renewal Date: `2026-12-20` (12 days before expiry).
- Applied Coupon: `ANNUAL1000` (₹1,000 off).
- Result:
  - `new_period_start = 2026-01-01` (Unchanged).
  - `new_period_end = 2028-01-01` ($2027\text{-}01\text{-}01 + 1\text{ year}$).
  - All 12 remaining days are completely preserved.

#### Example 2: Plan Upgrade During Active Subscription
- Existing Subscription: `plan_id = 'starter'`, `current_period_start = 2026-11-01`, `current_period_end = 2026-12-01`.
- Upgrade Date: `2026-11-15` (16 days remaining).
- New Plan: `growth` (Annual billing).
- Result:
  - `new_period_start = 2026-11-15` (Upgraded features active immediately).
  - `new_period_end = 2027-11-15 + 16 days = 2027-12-01`.
  - Remaining 16 paid days from the previous subscription are added to the end of the new cycle.

### 4.3 Payment Evidence Verification Test Cases

```sql
-- TEST CASE PEV-01: Unauthorized Payment Provider
-- Setup: Webhook attempts settlement with p_gateway_provider = 'stripe_unsupported'
-- Expected Result: Fails with SQLSTATE 22023 (UNSUPPORTED_PROVIDER: Payment provider stripe_unsupported is not permitted); zero state modified.

-- TEST CASE PEV-02: Future-Dated Payment Authorization
-- Setup: Webhook arrives with p_payment_authorized_at = NOW() + INTERVAL '10 minutes'
-- Expected Result: Fails with SQLSTATE 22008 (FUTURE_DATED_PAYMENT: Authorization timestamp exceeds allowed clock skew); transaction aborted.

-- TEST CASE PEV-03: Legitimate Late Payment Transit
-- Setup: Reservation reserved_until = 12:15:00. Gateway authorizes payment at 12:14:30 (before expiry).
--        Webhook delivery delayed by gateway network retry, arrives at 14:00:00 (within 24h).
-- Expected Result: Settlement succeeds; status transitions to 'applied'; subscription activated.
```

---

## 5. Critical Approval Blockers Awaiting Human Authorization

```
+----------------------------------------------------------------------------------------------------+
|                                    CRITICAL APPROVAL BLOCKERS                                      |
+---+------------------------------------+-----------------------------------------------------------+
| # | Blocker Item                       | Impact / Description                                      |
+---+------------------------------------+-----------------------------------------------------------+
| 1 | Gateway Assertion Secret (GCAP)    | Requirement: Provisioning of high-entropy shared secret   |
|   | Configuration                      | (`GATEWAY_ASSERTION_SECRET`) configured in Gateway env    |
|   |                                    | and database engine (`app.settings.gateway_assertion_     |
|   |                                    | secret`). Administrative RPCs cannot execute without it.  |
+---+------------------------------------+-----------------------------------------------------------+
| 2 | Payment Gateway Webhook Secret     | Requirement: Secure configuration of the webhook HMAC     |
|   | Configuration                      | secret for the payment gateway integration (`youpi_pg`).  |
|   |                                    | Gateway settlement cannot proceed without verification.   |
+---+------------------------------------+-----------------------------------------------------------+
| 3 | Initial Platform Super Admin       | Requirement: Explicit approval of the root Super Admin     |
|   | Identity Approval                  | email address (`admin@vistaarone.com`) and the authorized  |
|   |                                    | platform operator who will conduct the offline CLI        |
|   |                                    | provisioning ceremony.                                    |
+---+------------------------------------+-----------------------------------------------------------+
| 4 | Non-Production Staging Sandbox     | Requirement: Formal provision of a non-production         |
|   | Environment Authorization          | Supabase branch or staging database instance to execute   |
|   |                                    | Phase 2 migration and RPC unit tests. No DDL will run     |
|   |                                    | against live production (`kluxsykimnjivkqxelba`).         |
+---+------------------------------------+-----------------------------------------------------------+
| 5 | Phase 1 (v1.0) Coupon Scope        | Requirement: Explicit commercial sign-off that Phase 1    |
|   | Confirmation                       | supports one-time checkout discounts only, deferring      |
|   |                                    | multi-cycle recurring subscription discounts to Phase 2.  |
+---+------------------------------------+-----------------------------------------------------------+
```

---

## 6. Production Codebase & Database Safety Verification

Prior to completing Phase 2.4 documentation, safety audits confirmed:
1. **Production Repository (`Vistaar/` at `d:\Project\vistaar-main\vistaar-main`):**
   - Git status check: `On branch main, working tree clean`.
   - **Zero** production application files modified, created, or deleted.
2. **Production Supabase Database (`kluxsykimnjivkqxelba`):**
   - **Zero** migrations executed.
   - **Zero** live tables, schemas, roles, or policies altered.
   - All proposed SQL scripts reside exclusively as documentation artifacts inside `super_admin/`.

---

*End of Changelog — Phase 2.4 Final Security & Subscription Integrity Corrections.*

