# VISTAAR SUPER ADMIN — MULTI-PLATFORM SECURITY REVIEW

**Compliance Authority:** VISTAAR Platform Security Office  
**Audit Scope:** Staging Environment (`vlbhxcajphyjkeueubud`)  
**Strict Air-Gap Mandate:** Production (`kluxsykimnjivkqxelba`) Untouched

---

## 1. Security Architecture & Threat Model

### Principle of Zero Trust Across Platforms
Whether a request originates from Web, Windows Desktop (Tauri), or Mobile (Capacitor), the Gateway BFF (`server/gateway.mjs`) treats all clients with identical rigor:
1. **Server-Side Token Verification:** Supabase Auth JWTs must be validated on every privileged request. Client-supplied role headers or identities are rejected.
2. **Database RBAC Verification:** The authenticated user's ID must exist in `platform_admins` with `is_active = true`.
3. **AAL2 Session Escalation:** Privileged administrative mutations (workspace suspensions, plan price overrides) require AAL2 MFA verification.

---

## 2. Platform-Specific Security Measures

### A. Windows Desktop (Tauri 2)
- **Edge WebView2 Isolation:** Strict CSP preventing external scripts.
- **Explicit Capabilities:** Native file operations scoped exclusively to `$DOWNLOAD` and `$APPCACHE`.
- **Zero Service-Role Exposure:** Service-role secrets remain strictly on the Gateway BFF host.

### B. Mobile (Android & iOS)
- **Token Security:** Hardware-backed preference storage prevents plaintext access.
- **Cleartext Restrictions:** Allowed only during local development/emulator testing.
- **Permission Scoping:** Camera and photo permissions restricted strictly to profile photo management.

### C. Gateway CORS Matrix
The Gateway BFF enforces origin verification against an authoritative allow-list:
- `http://localhost:3001` (Web)
- `https://tauri.localhost` & `tauri://localhost` (Tauri Desktop)
- `capacitor://localhost` (Capacitor Mobile)
- RFC-1918 Private Subnets (Local development testing)
- **Reject All Others:** Unauthorized domains receive HTTP 403 or null CORS reflection.

---

## 3. Production Air-Gap Certification

- Staging Reference: `vlbhxcajphyjkeueubud`
- Production Reference: `kluxsykimnjivkqxelba`
- **Result:** No production credentials, connection strings, or migrations were accessed or executed. The production database remains 100% untouched.

