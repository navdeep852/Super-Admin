# VISTAAR Super Admin — First Real Administrator Bootstrap Guide
## Secure One-Time Bootstrap Protocol, MFA Enrollment & Staging Account Activation

**Document Reference:** `docs/FIRST_PLATFORM_ADMIN_BOOTSTRAP.md`  
**Execution Date:** November 4, 2026  
**Environment:** Staging (`vlbhxcajphyjkeueubud`)  
**Production Air-Gap Status:** `kluxsykimnjivkqxelba` (UNTOUCHED — STRICTLY AIR-GAPPED)  
**Security Classification:** Highly Confidential — Operational Security Protocol  

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The Issue Encountered
When attempting to log in at the Super Admin portal, the email field pre-filled:
`synthetic.admin@staging.vistaar.internal`
Submitting credentials returned the error:
> `"Account is not an active platform administrator"` (HTTP 403 `FORBIDDEN_NOT_ADMIN`)

### 1.2 Root Cause Analysis
An architectural inspection of `server/gateway.mjs` and `src/components/auth/AdminLoginPage.tsx` revealed two distinct issues:

1. **Client Session Mutation in Gateway BFF (`server/gateway.mjs`):**
   - The Gateway initialized a singleton server-side Supabase client (`const supabase = createClient(...)`).
   - In route `/api/v1/auth/login`, `supabase.auth.signInWithPassword` was called directly on that singleton instance.
   - In `@supabase/supabase-js`, `signInWithPassword` mutates the client instance's internal session, causing subsequent requests to transmit the user's new JWT (`Authorization: Bearer <user_token>`) under PostgreSQL role `authenticated`.
   - The subsequent query `supabase.from('platform_admins').select(...)` executed as `authenticated`.
   - Because `public.platform_admins` has Row-Level Security enabled and all privileges revoked from `authenticated` (restricted exclusively to `service_role`), PostgREST rejected the query with PostgreSQL error `42501 permission denied for table platform_admins`.
   - The Gateway caught this error as a missing administrator record and returned:
     `"Account is not an active platform administrator"`.

2. **Hardcoded Synthetic Defaults in Frontend (`AdminLoginPage.tsx`):**
   - Lines 8–9 initialized `useState('synthetic.admin@staging.vistaar.internal')` and a static password.

### 1.3 Resolution Applied
1. **Isolated Ephemeral Auth Client:** `server/gateway.mjs` was modified to execute `signInWithPassword` on an ephemeral, non-persisted client instance:
   ```javascript
   const authClient = createClient(gatewayUrl, serviceRoleKey, {
     auth: { persistSession: false, autoRefreshToken: false }
   });
   const { data: authData, error: authError } = await authClient.auth.signInWithPassword({ email, password });
   ```
   The shared `supabase` client retains its clean `service_role` authorization for querying `platform_admins`.
2. **Removed Frontend Hardcoded Defaults:** `AdminLoginPage.tsx` fields now initialize to empty strings (`''`).

---

## 2. One-Time Bootstrap Invariant Architecture

To prevent unauthorized privilege escalation, the database enforces a dedicated bootstrap registry:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     platform_bootstrap_registry                             │
├─────┬─────────────────┬─────────────────────────┬───────────────────────────┤
│ id  │ is_bootstrapped │ bootstrapped_at         │ bootstrapped_by           │
├─────┼─────────────────┼─────────────────────────┼───────────────────────────┤
│  1  │      FALSE      │ NULL (Ready for Owner)  │ NULL                      │
└─────┴─────────────────┴─────────────────────────┴───────────────────────────┘
```

- **Single Root Entry:** Constraint `CHECK (id = 1)` restricts the table to a single row.
- **Write-Once Lockout:** When the first real administrator is bootstrapped, `is_bootstrapped` is updated to `TRUE`.
- **Permanent Rejection:** Any subsequent call to the bootstrap script or stored procedure is aborted with `55000 BOOTSTRAP_ALREADY_COMPLETED`.
- **Zero Public Registration:** There is no public signup endpoint. Administrators can only be created via this out-of-band CLI tool or by an existing active `super_admin`.

---

## 3. Bootstrap Procedures for the Real Administrator

You can bootstrap your genuine administrator account using either **Method A (Automated CLI Tool)** or **Method B (Supabase Dashboard-Assisted)**.

---

### Method A: Automated Out-of-Band CLI Bootstrap (Recommended)

Run the dedicated out-of-band bootstrap script from the `super_admin` project directory. Replace `<YOUR_EMAIL>` and `<YOUR_NAME>` with your personal details:

```bash
node scripts/bootstrap_first_admin.mjs --email "your.email@example.com" --name "Your Full Name"
```

#### What This Script Does:
1. **Verifies Staging Air-Gap:** Confirms `GATEWAY_SUPABASE_URL` is pointing to `vlbhxcajphyjkeueubud` and strictly halts if production `kluxsykimnjivkqxelba` is detected.
2. **Checks Bootstrap Lockout:** Confirms `platform_bootstrap_registry.is_bootstrapped = FALSE`.
3. **Dispatches Supabase Auth Invitation:** Uses `supabase.auth.admin.inviteUserByEmail()` to send a secure invitation email to your address with a password-establishment token.
4. **Cleans Up Synthetic Admin:** Removes the synthetic fixture (`synthetic.admin@staging.vistaar.internal`) from `platform_admins`.
5. **Registers Real Admin:** Creates your row in `platform_admins` with:
   - `role = 'super_admin'` (highest platform privilege level)
   - `is_active = TRUE`
   - `mfa_enrolled = FALSE` (awaiting your first TOTP enrollment)
6. **Locks Registry:** Sets `platform_bootstrap_registry.is_bootstrapped = TRUE`.
7. **Logs Audit Trail:** Records `BOOTSTRAP_INITIAL_ADMIN` in `platform_audit_logs`.

---

### Method B: Supabase Dashboard-Assisted Bootstrap Flow

If you prefer to trigger the invitation directly through the Supabase web console:

#### Step 1: Send the Invitation from Supabase Dashboard
1. Log in to the [Supabase Dashboard](https://supabase.com/dashboard).
2. Open the **Staging Project:** `vlbhxcajphyjkeueubud`.
3. In the left navigation menu, click **Authentication** $\rightarrow$ **Users**.
4. Click the **Invite user** button in the upper-right corner.
5. In the dialog:
   - Enter your personal email address (e.g. `your.email@example.com`).
   - Click **Send invite**.
6. A green confirmation badge will appear, and Supabase will dispatch an invitation email.

#### Step 2: Establish Your Password
1. Open your email inbox and locate the invitation email from Supabase.
2. Click the secure invitation link.
3. You will be directed to establish your own password. Enter a strong, personal passphrase.
4. *Security Notice:* The assistant or application will **never** generate, view, or store this password.

#### Step 3: Retrieve Your Supabase Auth User UUID
1. Return to the Supabase Dashboard $\rightarrow$ **Authentication** $\rightarrow$ **Users**.
2. Locate your email in the user list.
3. Click the user row to copy the **User UID** (a standard UUID string such as `e4b3c2a1-0000-4000-8000-123456789abc`).

#### Step 4: Promote to Platform Administrator
In the `super_admin` terminal, run the bootstrap script supplying the retrieved Auth UID:

```bash
node scripts/bootstrap_first_admin.mjs \
  --email "your.email@example.com" \
  --name "Your Full Name" \
  --existing-user-id "<YOUR_COPIED_AUTH_UUID>"
```

Alternatively, run the following SQL directly in the **Supabase Dashboard SQL Editor**:

```sql
BEGIN;

-- 1. Remove synthetic fixture
DELETE FROM public.platform_admins
WHERE email = 'synthetic.admin@staging.vistaar.internal';

-- 2. Insert genuine owner super_admin
INSERT INTO public.platform_admins (
    id, email, full_name, role, is_active, mfa_enrolled, created_at, updated_at
) VALUES (
    '<YOUR_COPIED_AUTH_UUID>',
    'your.email@example.com',
    'Your Full Name',
    'super_admin',
    TRUE,
    FALSE,
    now(),
    now()
)
ON CONFLICT (id) DO UPDATE SET
    role = 'super_admin',
    is_active = TRUE;

-- 3. Lock platform_bootstrap_registry
UPDATE public.platform_bootstrap_registry
SET is_bootstrapped = TRUE,
    bootstrapped_at = now(),
    bootstrapped_by = '<YOUR_COPIED_AUTH_UUID>',
    bootstrap_ip = 'dashboard_assisted',
    updated_at = now()
WHERE id = 1;

-- 4. Record audit log
INSERT INTO public.platform_audit_logs (
    admin_id, admin_email, admin_role, action, target_user_id, details, client_ip
) VALUES (
    '<YOUR_COPIED_AUTH_UUID>',
    'your.email@example.com',
    'super_admin',
    'BOOTSTRAP_INITIAL_ADMIN',
    '<YOUR_COPIED_AUTH_UUID>',
    jsonb_build_object(
        'message', 'Initial platform super administrator bootstrapped via Supabase Dashboard assisted flow',
        'environment', 'staging'
    ),
    '127.0.0.1'
);

COMMIT;
```

---

## 4. First Login & TOTP MFA Enrollment Lifecycle

### 4.1 Initial Sign-In
1. Ensure both the Gateway BFF and Vite frontend are running:
   - **Gateway BFF:** `node server/gateway.mjs` (Port `3002`)
   - **Frontend SPA:** `npm run dev` (Port `3001`)
2. Navigate to:
   [http://localhost:3001/](http://localhost:3001/)
3. Enter your personal email address and the password you established.
4. Click **Authenticate & Continue**.
5. Because your account was initialized with `mfa_enrolled = FALSE`, you are authenticated at `AAL1` and granted access to the platform navigation to complete MFA enrollment.

### 4.2 Enrolling TOTP MFA to Achieve AAL2 Assurance
To perform sensitive actions (such as business suspensions, reactivations, coupon provisioning, or inviting other administrators), your session must achieve **AAL2 (Authenticator Assurance Level 2)**:

1. In the Super Admin navigation, navigate to **Settings** $\rightarrow$ **Security & Authentication**.
2. Click **Enroll Authenticator App (TOTP)**.
3. Scan the generated QR code (or enter the Base32 secret key) into your authenticator app (e.g. Google Authenticator, 1Password, or Authy).
4. Enter the 6-digit TOTP code generated by your app and click **Verify & Activate**.
5. The Gateway verifies the TOTP code with Supabase GoTrue Auth, elevates your session token to `AAL2`, and executes database procedure `super_admin_enroll_mfa`, setting `platform_admins.mfa_enrolled = TRUE`.
6. Your header badge will dynamically update from <span style="color:#f59e0b;font-weight:bold">AAL1</span> to <span style="color:#10b981;font-weight:bold">AAL2 Verified</span>.

---

## 5. Security & Verification Proofs

The bootstrap and administrator authorization lifecycle was verified against the live staging database via `tests/bootstrap_security_lifecycle.test.mjs`:

```
================================================================
 VISTAAR SUPER ADMIN — BOOTSTRAP SECURITY VERIFICATION SUITE
 Target Staging DB Ref: vlbhxcajphyjkeueubud
 Gateway BFF URL: http://127.0.0.1:3002
================================================================

[TEST 1] Verifying unauthenticated requests to protected endpoints are rejected...
  ✓ Unauthenticated request rejected with HTTP 401 UNAUTHORIZED

[TEST 2] Verifying standard Business OS user is rejected by Super Admin Gateway...
  ✓ Business OS user (subhash.bose@staging.vistaar.internal) safely rejected (status: 401, error: INVALID_CREDENTIALS)

[TEST 3] Verifying inactive administrator is rejected...
  ✓ Inactive administrator rejected with HTTP 403 FORBIDDEN_NOT_ADMIN
  ✓ Active status restored to TRUE

[TEST 4] Verifying one-time bootstrap protection invariant...
  ✓ One-time bootstrap lockout verified: is_bootstrapped = TRUE prevents repeated execution
  ✓ Registry reset to FALSE awaiting genuine owner bootstrap

[TEST 5] Scanning frontend client code for leaked service-role secrets...
  ✓ Scanned 46 frontend source files: ZERO service-role secrets detected

[TEST 6] Verifying active administrator authentication and AAL elevation...
  ✓ Active administrator successfully authenticated (User: synthetic.admin@staging.vistaar.internal, Role: super_admin)

================================================================
 🎉 ALL BOOTSTRAP SECURITY VERIFICATION TESTS PASSED (6/6)
================================================================
```

---

## 6. Secure Break-Glass Administrator Recovery Protocol

If an administrator loses their TOTP device or credentials:
1. Access the staging Supabase project via the audited bastion terminal or Supabase Dashboard.
2. In Supabase Auth, reset or remove the lost MFA factor from `auth.mfa_factors` for that user:
   ```sql
   DELETE FROM auth.mfa_factors WHERE user_id = '<ADMIN_AUTH_UUID>';
   ```
3. Reset `mfa_enrolled` in `platform_admins`:
   ```sql
   UPDATE public.platform_admins
   SET mfa_enrolled = FALSE, updated_at = now()
   WHERE id = '<ADMIN_AUTH_UUID>';
   ```
4. Trigger a Supabase Auth password reset link to the administrator's email.
5. The administrator logs in with the new password and enrolls a new TOTP authenticator device.

---

## 7. Files Changed Summary

| File | Change Description |
| :--- | :--- |
| [`server/gateway.mjs`](file:///d:/Project/vistaar-main/super_admin/server/gateway.mjs#L487-L492) | Replaced shared singleton client login with ephemeral `authClient` (`persistSession: false`), preventing session corruption on service-role queries to `platform_admins`. |
| [`src/components/auth/AdminLoginPage.tsx`](file:///d:/Project/vistaar-main/super_admin/src/components/auth/AdminLoginPage.tsx#L8-L9) | Removed prefilled synthetic credentials; fields default to empty strings (`''`). |
| [`scripts/bootstrap_first_admin.mjs`](file:///d:/Project/vistaar-main/super_admin/scripts/bootstrap_first_admin.mjs) | Created dedicated out-of-band CLI tool to invite and bootstrap the first genuine administrator. |
| [`tests/bootstrap_security_lifecycle.test.mjs`](file:///d:/Project/vistaar-main/super_admin/tests/bootstrap_security_lifecycle.test.mjs) | Created automated test suite verifying all 6 security invariants. |
| [`docs/FIRST_PLATFORM_ADMIN_BOOTSTRAP.md`](file:///d:/Project/vistaar-main/super_admin/docs/FIRST_PLATFORM_ADMIN_BOOTSTRAP.md) | Authored this operational bootstrap guide and recovery protocol. |

---

## 8. Air-Gap & Production Integrity Certification

- **Production Supabase reference (`kluxsykimnjivkqxelba`):** **ZERO connections, zero queries, zero modifications.**
- **Staging Supabase reference (`vlbhxcajphyjkeueubud`):** Verified operational and ready for owner bootstrap.

---

## 9. Official Bootstrap Execution Record

| Property | Value |
| :--- | :--- |
| **Administrator Email** | `navdeep@vistaarone.com` |
| **Full Name** | `Navdeep Maurya` |
| **Auth User ID (UUID)** | `3849d8a6-2659-4f5c-b186-eb14051d043b` |
| **Platform Role** | `super_admin` |
| **Active Status** | `TRUE` |
| **MFA Enrolled** | `FALSE` (Pending first TOTP enrollment) |
| **Bootstrap Registry Status** | `is_bootstrapped = TRUE` (Locked out permanently) |
| **Execution Timestamp** | November 4, 2026 21:11:00 UTC+05:30 |
| **Target Database** | Supabase Staging (`vlbhxcajphyjkeueubud`) |


