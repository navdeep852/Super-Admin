# VISTAAR SUPER ADMIN — MULTI-PLATFORM ARCHITECTURE AUDIT

**Target Environment:** Staging Supabase (`vlbhxcajphyjkeueubud`, AWS `eu-west-1`)  
**Production Air-Gap Verification:** Production (`kluxsykimnjivkqxelba`) **Untouched & Strictly Air-Gapped**  
**Audit Timestamp:** 2026-11-05T08:20:00+05:30  
**Status:** **AUDIT COMPLETE — READY FOR IMPLEMENTATION**

---

## 1. Executive Summary

This architecture audit evaluates the transformation of VISTAAR Super Admin from a single-target React+Vite web application into a unified multi-platform administrative control plane supporting:
1. **Windows Desktop Application** (via Tauri 2)
2. **Android Mobile Application** (via Capacitor 6/7)
3. **iOS Mobile Application** (via Capacitor 6/7)
4. **Existing Web Browser Application** (via Vite)

All four platforms will share a **single React + Vite + TypeScript codebase**, communicate with the **same Gateway BFF (Port 3002)**, use the **same Supabase Auth identity and `platform_admins` governance model**, and maintain a **strict air-gap from production `kluxsykimnjivkqxelba`**.

---

## 2. Existing Repository Architecture Review

### 2.1 Technology Stack
- **Framework:** React 19.2.8 + TypeScript 5.7.2 + Vite 8.2.0
- **Styling:** Tailwind CSS 4.3.3 + PostCSS
- **Component Primitives:** Lucide React icons, Recharts
- **Database / Auth:** Supabase JS 2.118.0 (PostgreSQL, Auth, Storage)
- **Local Control Plane:** Custom Node.js Gateway BFF (`server/gateway.mjs`) running on port 3002
- **Direct Database Client:** Node `pg` client (staging direct pooler)

### 2.2 Navigation & Routing Architecture
- **Router Pattern:** Hash-based URL routing (`#/${module}`) in `src/App.tsx`.
- **Modules Available (12 core modules):**
  1. `overview` — Platform KPI command center
  2. `businesses` — Workspace directory & multi-branch isolation
  3. `users` — Tenant users & platform administrators
  4. `subscriptions` — Authoritative PostgreSQL subscription ledger
  5. `plans` — Plan catalog, platform matrices & tiered pricing
  6. `payments` — Verified transactions & 18% GST ledger
  7. `coupons` — Promotional campaigns, coupons & discount engine
  8. `analytics` — Business intelligence & cohort charts
  9. `support` — Support ticket management & inquiry triage
  10. `security` — GCAP assertion stream & audit logs
  11. `system` — System telemetry & infrastructure health probes
  12. `settings` — Platform settings & configuration
- **Compatibility Advantage:** The existing hash-based navigation (`#/${module}`) is natively compatible with Tauri (`tauri://localhost` or `https://tauri.localhost`) and Capacitor (`capacitor://localhost` or `http://localhost`) without requiring fallback server routing rules.

---

## 3. Inventory of Components: Reusability & Modifications

| Component / Layer | File Path | Reusability Status | Required Modifications for Desktop & Mobile |
|---|---|---|---|
| **API Client** | `src/services/adminGatewayClient.ts` | **100% Reusable** | Needs dynamic gateway base URL resolution for mobile emulators (`http://10.0.2.2:3002` or LAN IP) and pluggable secure token storage. |
| **Auth Context** | `src/context/AdminAuthContext.tsx` | **95% Reusable** | Wire into pluggable secure storage adapter (OS Keychain / Keystore / Tauri store) and add AAL2 elevation prompt. |
| **Theme Context** | `src/context/ThemeContext.tsx` | **100% Reusable** | Supports system preference detection on native platforms. |
| **Navigation Shell** | `src/App.tsx` | **Needs Adaptation** | Add responsive shell: Desktop Sidebar on wide screens, Bottom Navigation + Drawer on mobile/tablet. |
| **Header** | `src/components/layout/AdminHeader.tsx` | **Reusable with Enhancements** | Mobile hamburger trigger, native safe-area top inset padding. |
| **Sidebar** | `src/components/layout/AdminSidebar.tsx` | **Reusable for Desktop/Tablet** | Hidden on small mobile screens; replaced by mobile navigation drawer. |
| **Data Tables** | `src/components/common/DataTable.tsx` | **Needs Mobile Cards View** | Add responsive card view or horizontal touch scroll for tables on mobile phones (< 640px). |
| **Profile Studio** | `src/components/profile/AdminProfileModal.tsx` | **100% Reusable** | Touch gestures for canvas cropper, native camera file picker integration. |
| **Password Modal** | `src/components/auth/ChangePasswordModal.tsx` | **100% Reusable** | Fully touch-accessible. |
| **Gateway BFF** | `server/gateway.mjs` | **Needs CORS update** | Allow `tauri://localhost`, `https://tauri.localhost`, and `capacitor://localhost` in `isOriginAllowed()`. |

---

## 4. Security Gap Analysis & Remediation Strategy

### 4.1 Token Storage on Native Devices
- **Current State:** `adminGatewayClient.ts` uses `window.localStorage.getItem('vistaar_admin_jwt')`.
- **Risk:** Plaintext localStorage is vulnerable to extraction on rooted/jailbroken devices or malicious local inspection.
- **Remediation:** Implement a unified `ISecureStorage` interface:
  - **Desktop (Tauri):** OS credential vault or encrypted key-value store.
  - **Mobile (Capacitor):** Android Keystore and iOS Keychain via `@capacitor/preferences` or secure storage plugin.
  - **Web:** Preserved standard browser storage.

### 4.2 Gateway Network Reachability from Mobile
- **Current State:** Gateway listens on `127.0.0.1:3002`.
- **Risk:** Android emulators communicate with the host via `10.0.2.2`, physical devices via Wi-Fi LAN IP (e.g. `10.25.215.164`), while web and desktop use `localhost:3002`.
- **Remediation:** Enhance `adminGatewayClient.ts` with auto-detected platform host resolution:
  - Web/Desktop: `http://localhost:3002`
  - Android Emulator: `http://10.0.2.2:3002`
  - Mobile Device: Configurable `VITE_GATEWAY_URL` or LAN IP fallback.

### 4.3 AAL2 Enforcement for High-Risk Mutations
- **Current State:** Gateway BFF strictly checks `sessionAal === 'aal2'` for workspace suspension, reactivations, and plan overrides. If an administrator is AAL1, the backend rejects with 403.
- **Remediation:** Provide an in-app MFA Challenge Elevation prompt when attempting sensitive operations so administrators can elevate session assurance directly on mobile and desktop without logging out.

---

## 5. Proposed Multi-Platform Directory Structure

```text
super_admin/
├── src-tauri/                   # Tauri 2 Desktop Configuration & Rust Core
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── icons/                   # Windows application icons (.ico, .png)
│   └── src/
│       ├── main.rs
│       └── lib.rs
├── android/                     # Capacitor Android Native Project
│   ├── app/
│   ├── build.gradle
│   └── AndroidManifest.xml
├── ios/                         # Capacitor iOS Native Project Structure
├── capacitor.config.ts          # Capacitor App Configuration
├── src/
│   ├── platform/                # Platform Abstraction Layer
│   │   ├── index.ts             # Detects Web, Desktop (Tauri), Mobile (Capacitor)
│   │   ├── storage/             # Unified Secure Storage Adapter
│   │   ├── notifications/       # Unified Push & Native Notifications Adapter
│   │   ├── filesystem/          # Native File Export (CSV, PDF, JSON) Adapter
│   │   └── camera/              # Camera & Photo Library Adapter
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AdminHeader.tsx  # Adaptive Header with safe-area support
│   │   │   ├── AdminSidebar.tsx # Desktop & Tablet Navigation
│   │   │   └── MobileNav.tsx    # Mobile Bottom Navigation Bar & Drawer
│   │   └── ...
│   └── ...
```

---

## 6. Implementation Dependencies

### 6.1 Desktop (Tauri 2)
- `@tauri-apps/api`: ^2.0.0
- `@tauri-apps/cli`: ^2.0.0
- `@tauri-apps/plugin-notification`: ^2.0.0
- `@tauri-apps/plugin-fs`: ^2.0.0
- `@tauri-apps/plugin-dialog`: ^2.0.0

### 6.2 Mobile (Capacitor)
- `@capacitor/core`: ^7.0.0
- `@capacitor/cli`: ^7.0.0
- `@capacitor/android`: ^7.0.0
- `@capacitor/ios`: ^7.0.0
- `@capacitor/preferences`: ^7.0.0
- `@capacitor/device`: ^7.0.0
- `@capacitor/network`: ^7.0.0
- `@capacitor/status-bar`: ^7.0.0

---

## 7. Audit Conclusion & Next Steps
The existing Super Admin architecture is modular, hash-routed, and clean. It can be wrapped into Tauri 2 and Capacitor without altering underlying business logic or breaking the existing web application.

Proceeding to **Phase 2: Platform Abstraction Layer & Responsive Mobile Navigation**.
