# Phase 4.2 Remediation Changelog (V7 to V8)
**Date:** 2026-11-03  
**Package:** `PHASE_4_2_FINAL_APPROVAL_PACKAGE_V8.zip`  
**Previous Packages:** `PHASE_4_2_FINAL_APPROVAL_PACKAGE_V7.zip`, `PHASE_4_2_FINAL_APPROVAL_PACKAGE_V6.zip`, `PHASE_4_2_FINAL_APPROVAL_PACKAGE_V5.zip`, `PHASE_4_2_FINAL_APPROVAL_PACKAGE_V4.zip`  
**Status:** All V8 Critical Administrator Provisioning Security Remediations Implemented & Verified Locally

---

## Summary of Changes in V8

This changelog records the comprehensive technical security corrections implemented in Version 8 in response to the V7 independent review findings.

---

### 1. Securing Gateway BFF Provisioning Endpoint (`server/gateway.mjs`)

- **Root Cause of Finding in V7:** The `/api/v1/admins/provision` endpoint previously accepted unauthenticated POST requests and relied on client-supplied actor identities (`actor_admin_id`).
- **Remediation in V8:**
  - **Mandatory Authentication:** Every administrative request must present a valid Supabase Auth Bearer token (`Authorization: Bearer <token>`). Missing or invalid tokens return `401 Unauthorized` (`UNAUTHORIZED` or `INVALID_TOKEN`).
  - **Cryptographic GCAP Assertion:** Requires signed GCAP assertion headers (`X-GCAP-Signature`, `X-GCAP-Timestamp`, `X-GCAP-Nonce`). Missing headers return `401 Unauthorized` (`GCAP_ASSERTION_MISSING`). Invalid HMAC signatures return `401 Unauthorized` (`INVALID_GCAP_SIGNATURE`).
  - **Timestamp Freshness:** Verifies `Math.abs(Date.now() - timestampMs) <= 30000`. Skewed timestamps return `401 Unauthorized` (`ASSERTION_TIMESTAMP_EXPIRED`).
  - **Principal Identity Binding:** Derives `actor_id` strictly from the verified JWT. Client-supplied `actor_admin_id` in request body that differs from the authenticated principal is rejected with `403 Forbidden` (`FORGED_ACTOR_IDENTITY`).
  - **Database Actor Verification:** Queries `public.platform_admins` before RPC execution. Verifies actor exists, `is_active = TRUE`, `role = 'super_admin'`, and `mfa_enabled = TRUE`. Rejects violations with `403 Forbidden` (`ACTOR_INACTIVE_OR_NOT_FOUND`, `FORBIDDEN_INSUFFICIENT_PRIVILEGES`, or `MFA_AUTHENTICATION_REQUIRED`).
  - **Bounded Request Body Size:** Enforces strict 16 KB maximum payload limit (`MAX_BODY_SIZE = 16384`). Excess payloads are aborted with `413 Payload Too Large`.
  - **Explicit CORS Allowlist:** Replaced wildcard `Access-Control-Allow-Origin: *` with an explicit origin check against `ADMIN_ALLOWED_ORIGINS`. Disallowed origins receive no CORS authorization headers.
  - **Sliding-Window Rate Limiting:** Enforces maximum 10 privileged requests per minute per actor and per IP (`429 Too Many Requests`).
  - **Sanitized Error Handling:** Maps database and validation errors to clean HTTP responses (400, 401, 403, 409, 413, 429, 500) without exposing stack traces, credentials, or internal SQL structures.

---

### 2. Abolishment of Domain-Based Authorization & Explicit Invitation Registry (`migrations/077_super_admin_infrastructure.sql`)

- **Root Cause of Finding in V7:** In V7, `super_admin_provision_platform_admin` permitted provisioning if an email matched approved domain patterns (`%admin@staging.vistaar.internal`, `%@vistaar.in`, `%@vistaar.internal`). This allowed potential privilege escalation without individual authorization.
- **Remediation in V8:**
  - **Domain-Based Bypass Completely Abolished:** Removed all email-domain wildcard checks. Domain membership alone conveys zero administrative entitlement.
  - **Pre-Authorization Table (`public.platform_admin_invitations`):** Created dedicated registry with:
    - `id UUID PRIMARY KEY`
    - `target_user_id UUID NOT NULL REFERENCES auth.users(id)`
    - `target_email TEXT NOT NULL`
    - `role TEXT NOT NULL CHECK (role IN ('super_admin', 'billing_admin', 'support_agent'))`
    - `invited_by UUID NOT NULL REFERENCES public.platform_admins(id)`
    - `status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'))`
    - `expires_at TIMESTAMPTZ NOT NULL`
    - `consumed_at TIMESTAMPTZ`
    - RLS enabled; table ACL granted exclusively to `service_role`.
  - **Authoritative Invitation RPC (`public.super_admin_create_admin_invitation`):** Allows an active Super Admin with MFA to issue cryptographically signed GCAP invitations for specific Auth UUIDs and roles.
  - **Single-Use Consumption:** Provisioning atomically transitions invitation status from `pending` to `accepted` and sets `consumed_at`. Subsequent provisioning attempts with the same identity fail with `SQLSTATE 55001`.

---

### 3. Database-Enforced Actor Authorization & One-Time Root Bootstrap

- **Root Cause of Finding in V7:** `super_admin_provision_platform_admin` accepted `p_actor_admin_id` without verifying assertion signatures, and defaulted to `SYSTEM_BOOTSTRAP` or `UNKNOWN_ADMIN`.
- **Remediation in V8:**
  - **Strict GCAP Verification in Database:** `super_admin_provision_platform_admin` now accepts full GCAP parameters (`p_actor_admin_id`, `p_request_timestamp`, `p_nonce`, `p_signature`), verifies HMAC-SHA256 signature against `app.settings.gateway_assertion_secret`, enforces 30-second timestamp freshness, and consumes nonces atomically in `public.platform_gcap_nonces`.
  - **Actor Database Validation:** Queries `public.platform_admins` for `p_actor_admin_id`. Asserts active status, `role = 'super_admin'`, and `mfa_enabled = TRUE`. Rejects unauthorized actors with `SQLSTATE 42501`.
  - **One-Time Initial Root Bootstrap (`public.super_admin_bootstrap_initial_admin`):**
    - Created dedicated bootstrap function requiring `p_bootstrap_token` matching the gateway secret.
    - Strict invariant: only allowed if `SELECT COUNT(*) FROM public.platform_admins = 0`.
    - Permanently locks out once the root administrator is created (`SQLSTATE 55000`).
    - Eliminates all hardcoded bootstrap fallbacks from normal provisioning procedures.

---

### 4. Test Suite Enhancements & Integration Testing

- **Database Test Suite (`tests/staging_test_suite.sql`):**
  - Updated Test 1: Asserts all 17 tables and 10 authoritative functions exist.
  - Updated Test 4: Asserts table privilege lockdown across all 17 tables (including `platform_admin_invitations`).
  - Updated Test 5: Asserts dynamic catalog enumeration of all 11 `SECURITY DEFINER` functions against allowlist.
  - Test 0B: Exercises initial root bootstrap and asserts one-time lockout (`SQLSTATE 55000`).
  - Test 6A: Proves ordinary user with `@staging.vistaar.internal` email is rejected without an invitation (`SQLSTATE 55001`).
  - Test 6B: Proves existing administrator cannot be overwritten (`SQLSTATE 55002`) with disposable identity and 8-column snapshot verification.
  - Test 6C: Proves duplicate administrator email registration across different UUIDs is rejected (`SQLSTATE 55003`).
  - Test 6D: Proves valid invitation is consumed and cannot be reused (`SQLSTATE 55001`).
  - Test 6E: Exercises GCAP signature tampering (`28000`), timestamp skew (`28000`), and non-super-admin actor rejection (`42501`).
- **Gateway HTTP Integration Test Suite (`tests/gateway_provisioning.test.mjs`):**
  - Created automated Node.js test suite exercising all 17 HTTP security boundaries against `server/gateway.mjs`.
  - 100% of HTTP tests passed.

---

### 5. Version 9 Remediation (MFA Assurance, Bootstrap Isolation, Bypass Removal)

- **Authentication Bypass Elimination:**
  - Completely removed hardcoded `test-token-` authentication shortcuts from `server/gateway.mjs`.
  - All privileged routes enforce genuine Supabase Auth verification via `supabase.auth.getUser(token)`.
  - Moved all test token mocks strictly into isolated test harness `tests/gateway_provisioning.test.mjs`.
- **Genuine MFA Lifecycle & Session Assurance:**
  - Ceased auto-enabling `mfa_enabled = TRUE` upon administrator creation.
  - Replaced column with `mfa_enrolled BOOLEAN NOT NULL DEFAULT FALSE`, `mfa_enrolled_at TIMESTAMPTZ`, and `mfa_last_verified_at TIMESTAMPTZ`.
  - Implemented dedicated MFA self-enrollment RPC `public.super_admin_enroll_mfa` requiring AAL2 authenticated session assurance (`p_session_aal = 'aal2'`).
  - Implemented GCAP-guarded MFA revocation RPC `public.super_admin_revoke_mfa`.
  - All privileged RPCs and Gateway BFF routes enforce `mfa_enrolled = TRUE` and `session_aal = 'aal2'`.
- **Dedicated Bootstrap Authorization & Out-of-Band Script:**
  - Eliminated reuse of `GATEWAY_ASSERTION_SECRET`. Introduced dedicated `PLATFORM_BOOTSTRAP_SECRET` / `app.settings.platform_bootstrap_secret`.
  - Created dedicated registry table `public.platform_bootstrap_registry` (`id = 1, is_bootstrapped BOOLEAN`).
  - Implemented transaction advisory lock `pg_advisory_xact_lock(hashtext('platform_bootstrap_lock'))` to serialize concurrent bootstrap calls.
  - Removed HTTP bootstrap endpoint from gateway; implemented dedicated out-of-band CLI script `scripts/bootstrap_super_admin.mjs`.
- **Cryptographic GCAP Assertion Hardening:**
  - Implemented constant-time HMAC comparison via `crypto.timingSafeEqual` in `gateway.mjs`.
  - Enforced strict 64-character lowercase hex format check (`/^[0-9a-f]{64}$/`).
  - Standardized 7-part canonical string including `session_aal`:
    `${actor_admin_id}:${ACTION}:${target_id}:${role}:${session_aal}:${timestampEpoch}:${nonce}`
- **Test Suite & Catalog Expansion:**
  - Updated catalog assertions to verify all 18 tables and all 13 authoritative SECURITY DEFINER functions.
  - Expanded `tests/staging_test_suite.sql` (all 16 tests passing in single transaction).
  - Expanded `tests/gateway_provisioning.test.mjs` (all 37 HTTP security tests passing).

---

### 6. Prior Remediation Summary (V1 to V8)

- **V8:** Implemented `platform_admin_invitations` table and pre-authorization lifecycle; strict GCAP HMAC verification in database; removed domain wildcards.
- **V7:** Implemented production database RPC and Gateway route; disposable conflict identity in Test 6B.
- **V6:** Authored `SERVICE_ROLE_PRIVILEGE_MATRIX.md`; hardened `subscription_plans` to `SELECT` only; revoked `DELETE` from financial ledgers (`invoices`, `workspace_subscriptions`, `payment_transactions`, `coupon_redemptions`, `platform_workspace_suspensions`); revoked `UPDATE` from `platform_gcap_nonces`.
- **V5:** Replaced tautological exception-catching in Test 6; added distinct error codes (55000, 55001, 55002, 55003).
- **V4:** Eliminated loose email substrings (`%test%`); introduced strict `@staging.vistaar.internal` domain policy. Removed unnecessary `service_role` schema `CREATE`.
- **V3:** Baseline table ACL lockdown across all 9 baseline tables; removed unsafe Auth fallback querying oldest `auth.users`.
- **V2:** Hardened `cleanup_expired_gcap_nonces` privileges (`service_role` only); hardened `search_path` across all `SECURITY DEFINER` functions.
- **V1:** Initial baseline snapshot and Super Admin migration suite extraction.
