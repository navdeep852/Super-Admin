# VISTAAR Super Admin — Administrator Invitation & Pre-Authorization System Design
**Document Version:** 2.0.0 (Phase 4.2 V9 Hardened Administrative Control Plane)  
**Date:** 2026-11-03  
**Status:** Authoritative Security Design & Specification  
**Target Environment:** `vistaar-super-admin-staging` (`vlbhxcajphyjkeueubud`, AWS `eu-west-1`)  
**Security Standard:** Strict Least Privilege (POLP), Explicit Pre-Authorization, Defense-in-Depth, GCAP Triad, Genuine MFA Assurance (AAL2)

---

## 1. Threat Model & Architectural Motivation

In prior design iterations (V1 through V7), administrator provisioning allowed users matching specific corporate email domains (`%admin@staging.vistaar.internal`, `%@vistaar.in`, `%@vistaar.internal`) to receive platform administrative privileges upon request. 

### Critical Vulnerabilities Identified in Domain-Based Provisioning:
1. **Implicit Privilege Escalation:** Merely possessing an email address within an internal domain is not proof of administrative entitlement. Any compromised, test, or non-administrative account under the domain could be granted elevated privileges.
2. **Lack of Individual Accountability:** Domain checks do not capture *who* authorized the administrator, when they were authorized, or what specific role was granted.
3. **No Revocation Mechanism:** If a user account is provisioned erroneously or an invitation is rescinded prior to activation, domain-based matching provides no revocation state.
4. **Unauthenticated Gateway Surface:** An unauthenticated or loosely authenticated API endpoint could invoke database service-role procedures directly.

### The V9 Pre-Authorization Standard:
Under Version 9, **domain-based authorization is completely abolished**. No user can receive administrator privileges unless they possess an explicit, unexpired, single-use pre-authorization record created by an active `super_admin` who has enrolled Multi-Factor Authentication (MFA) and satisfies Authenticator Assurance Level 2 (AAL2), verified cryptographically via the Gateway Control Assertion Protocol (GCAP).

---

## 2. Dedicated Bootstrap Registry & Out-of-Band CLI

To prevent circular dependency during initial deployment (a super administrator cannot invite the first administrator when zero administrators exist):
1. **Dedicated Bootstrap Secret:** Separated completely from `GATEWAY_ASSERTION_SECRET`. Controlled via `PLATFORM_BOOTSTRAP_SECRET` / `app.settings.platform_bootstrap_secret`.
2. **Dedicated Bootstrap Registry (`public.platform_bootstrap_registry`):** Enforces a strict one-time invariant row (`id = 1, is_bootstrapped BOOLEAN`).
3. **Transaction-Level Advisory Lock:** Serializes concurrent bootstrap attempts via `pg_advisory_xact_lock(hashtext('platform_bootstrap_lock'))`.
4. **Out-of-Band CLI Script:** The bootstrap procedure is strictly removed from the HTTP Gateway BFF. It is executed out-of-band via `scripts/bootstrap_super_admin.mjs`:
   ```bash
   node scripts/bootstrap_super_admin.mjs --admin-id <UUID> --email <EMAIL> --name <FULL_NAME>
   ```
5. **Initial Admin MFA Invariant:** Newly bootstrapped or provisioned administrators start with `mfa_enrolled = FALSE`. They must independently challenge and enroll their second factor before performing privileged administrative actions.

---

## 3. Genuine Multi-Factor Authentication (MFA) Lifecycle & Session Assurance

Rather than auto-enabling MFA flags upon creation, V9 implements a genuine MFA lifecycle:
1. **Database Schema:** `public.platform_admins` defines:
   - `mfa_enrolled BOOLEAN NOT NULL DEFAULT FALSE`
   - `mfa_enrolled_at TIMESTAMPTZ`
   - `mfa_last_verified_at TIMESTAMPTZ`
2. **MFA Enrollment RPC (`public.super_admin_enroll_mfa`):**
   - Requires caller to provide verified session assurance `p_session_aal = 'aal2'`.
   - Transitions `mfa_enrolled = TRUE` and records timestamp in `public.platform_audit_logs`.
3. **MFA Revocation RPC (`public.super_admin_revoke_mfa`):**
   - Protected by GCAP HMAC assertion, requiring an active Super Admin with `mfa_enrolled = TRUE` and `session_aal = 'aal2'`.
   - Resets target's `mfa_enrolled = FALSE` and logs audit entry `ADMIN_MFA_REVOKED`.
4. **Privileged Operation Guard:**
   - Every administrative RPC (`super_admin_create_admin_invitation`, `super_admin_provision_platform_admin`, `super_admin_suspend_workspace`, `super_admin_reactivate_workspace`, `super_admin_get_platform_metrics`, `super_admin_revoke_mfa`) requires:
     1. Actor `mfa_enrolled = TRUE` in `public.platform_admins`.
     2. Authenticated session assurance `p_session_aal = 'aal2'`.

---

## 4. Invitation Data Schema (`public.platform_admin_invitations`)

The relational database enforces the invitation state machine via `public.platform_admin_invitations`:

```sql
CREATE TABLE IF NOT EXISTS public.platform_admin_invitations (
    id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'super_admin' CHECK (role IN ('super_admin', 'billing_admin', 'support_agent')),
    invited_by UUID NOT NULL REFERENCES public.platform_admins(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_invitations_lookup 
    ON public.platform_admin_invitations (target_user_id, status);

CREATE INDEX IF NOT EXISTS idx_platform_admin_invitations_email 
    ON public.platform_admin_invitations (lower(target_email), status);

ALTER TABLE public.platform_admin_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Strict platform admin invitations isolation" ON public.platform_admin_invitations
    FOR ALL USING (FALSE);
```

### Column Specifications:
- `id`: Unique invitation identifier (UUID v4).
- `target_user_id`: Exact Supabase Auth UUID (`auth.users.id`). The account must already exist in GoTrue via the Supabase Auth Admin API before invitation creation.
- `target_email`: Exact email of the invitee; must match `auth.users.email` identically.
- `role`: Specific platform role authorized: `'super_admin'`, `'billing_admin'`, or `'support_agent'`.
- `invited_by`: FK to `public.platform_admins(id)`. Identifies the requesting super administrator.
- `status`: Lifecycle state: `'pending'`, `'accepted'`, `'revoked'`, or `'expired'`.
- `expires_at`: UTC timestamp after which the invitation is invalid (default: 24 hours).
- `consumed_at`: UTC timestamp recorded when the invitation is accepted during provisioning.

---

## 5. Invitation Lifecycle & State Machine

```
              [Create Invitation]
                     │
                     ▼
                 ┌─────────┐
                 │ PENDING │
                 └────┬────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
  (Provision)    (Timeout)      (Re-invite)
        │             │             │
        ▼             ▼             ▼
  ┌──────────┐  ┌───────────┐ ┌───────────┐
  │ ACCEPTED │  │  EXPIRED  │ │  REVOKED  │
  └──────────┘  └───────────┘ └───────────┘
```

1. **Creation:** An active Super Admin with enrolled MFA and AAL2 session assurance issues an invitation via `POST /api/v1/admins/invite` or RPC `super_admin_create_admin_invitation`.
   - Any prior `pending` invitation for the `target_user_id` is automatically marked `revoked`.
   - Status is set to `pending`.
2. **Consumption:** When the invitee completes onboarding, `POST /api/v1/admins/provision` or RPC `super_admin_provision_platform_admin` is called:
   - Row is locked with `FOR UPDATE` to serialize concurrent consumption attempts.
   - Evaluates invitation state cleanly:
     - If `status = 'accepted'`: throws `INVITATION_ALREADY_CONSUMED` (`55001`).
     - If `status = 'revoked'`: throws `INVITATION_REVOKED` (`55001`).
     - If `status = 'expired' OR expires_at < now()`: throws `INVITATION_EXPIRED` (`55001`).
     - If `status = 'pending'`: transitions `status = 'accepted'` and sets `consumed_at = now()`.
   - Provisions `public.platform_admins` record with `mfa_enrolled = FALSE`.
3. **Re-use Prevention:** Subsequent attempts to provision with this identity fail with `SQLSTATE 55001` because no `pending` invitation exists.

---

## 6. Cryptographic GCAP Assertion Protocol (V9 Standard)

Every privileged action requires the Gateway Control Assertion Protocol (GCAP) with timing-safe HMAC validation, strict 64-char hex format checks, 30-second skew window, atomic nonce consumption, and standardized 7-part canonical string:

```
canonical_string = `${actor_admin_id}:${ACTION}:${target_id}:${role}:${session_aal}:${timestampEpoch}:${nonce}`
```

### GCAP Parameter Matrix:
| Parameter | Description | Validation Rule |
| :--- | :--- | :--- |
| `actor_admin_id` | Authenticated principal UUID | Must match authenticated JWT `sub` and exist as active `super_admin` with `mfa_enrolled = true` in DB |
| `ACTION` | Privileged operation verb | `CREATE_ADMIN_INVITATION`, `PROVISION_PLATFORM_ADMIN`, `SUSPEND_WORKSPACE`, `REACTIVATE_WORKSPACE`, `GET_PLATFORM_METRICS`, `REVOKE_MFA` |
| `target_id` | Operation target identifier | Target user UUID, workspace UUID, or `ALL` |
| `role` | Authorized role | Target role or `NONE` |
| `session_aal` | Session assurance level | Must be `aal2` for all privileged operations |
| `timestampEpoch` | UTC timestamp in integer seconds | `|now - timestamp| <= 30` seconds |
| `nonce` | Single-use UUID | Strictly 128-bit UUID v4 format; consumed atomically in `public.platform_gcap_nonces` |

### Constant-Time Verification:
```javascript
const sigBuf = Buffer.from(cleanSig, 'hex');
const expectedBuf = Buffer.from(expectedSignatureHex, 'hex');
if (sigBuf.length !== 32 || expectedBuf.length !== 32 || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
  throw new Error('Invalid GCAP cryptographic assertion signature');
}
```

---

## 7. Security Invariant Matrix

| Check | Failure Code | Error Condition |
| :--- | :--- | :--- |
| **Authentication** | `401 / UNAUTHORIZED` | Missing or invalid Supabase Auth Bearer token |
| **Bypass Removal** | `401 / INVALID_TOKEN` | Any fabricated `test-token-*` header is rejected |
| **Actor Match** | `403 / FORGED_ACTOR_IDENTITY` | `payload.actor_admin_id !== authUser.id` |
| **GCAP Signature** | `401 / 28000` | Signature format invalid, skewed >30s, or HMAC mismatch |
| **GCAP Replay** | `409 / 23505` | Nonce already consumed in `platform_gcap_nonces` |
| **MFA Assurance** | `403 / 42501` | Session assurance is not `aal2` or actor has not enrolled MFA |
| **Actor Role** | `403 / 42501` | Requesting actor role is not `super_admin` |
| **Target Identity** | `400 / 55000` | Target user does not exist in `auth.users` |
| **Email Consistency** | `400 / 55001` | Target email does not match `auth.users.email` |
| **Pre-Authorization** | `403 / 55001` | No pending unexpired invitation exists in `platform_admin_invitations` |
| **Overwrite Guard** | `409 / 55002` | Admin UUID already exists under a different email identity |
| **Duplicate Email** | `409 / 55003` | Admin email already registered under a different UUID |
| **Rate Limiting** | `429 / RATE_LIMIT_EXCEEDED` | Exceeds requests/min per IP or actor |
| **Payload Size** | `413 / PAYLOAD_TOO_LARGE` | Request body exceeds 16KB boundary |
