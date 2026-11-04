# VISTAAR Super Admin - Technical Implementation Blueprint (Phase 2.6 Revised)

**Document Version:** 2.6.0  
**Effective Date:** 2026-11-01  
**Target Repository:** `navdeep852/Super-Admin`  
**Deployment Target:** `admin.vistaarone.com`  
**Target Backend:** Existing Production Supabase Project (`https://kluxsykimnjivkqxelba.supabase.co`)  
**Sibling Business Application:** VISTAAR Business OS (`Vistaar/`)  
**Status:** Phase 2.6 Hardened & Reconciled — Architecture Only

---

## 1. Executive Architecture Overview

VISTAAR Super Admin is architected as an independent, standalone React application coexisting with the existing VISTAAR Business OS backend without altering existing production code or schemas.

```mermaid
graph TB
    subgraph Clients [Public Internet / User Agents]
        TenantUser[Tenant Staff / Owners\napp.vistaarone.com]
        AdminUser[Platform Super Admins\nadmin.vistaarone.com]
    end

    subgraph SecurityPerimeter [Perimeter Security & Ingress]
        Cloudflare[Cloudflare Edge / WAF\nSSL/TLS, Rate Limiting, DDoS]
    end

    subgraph Hosting [Application Hosting]
        VistaarApp[VISTAAR Business OS\nReact SPA]
        SuperAdminApp[VISTAAR Super Admin\nReact SPA]
    end

    subgraph BackendGateway [BFF / Edge API Gateway]
        AdminGateway[Super Admin Gateway\nNode.js / Express or Edge Functions\nValidates AAL2, Issues Atomic GCAP Envelopes]
    end

    subgraph SupabasePlatform [VISTAAR Supabase Project]
        AuthService[Supabase Auth (GoTrue)\nUnified User Identity]
        
        subgraph PostgreSQL [Single Database Instance]
            TenantTables[(Existing 35+ Tenant Tables\nWorkspaces, Invoices, Subscriptions\nProtected by Tenant RLS)]
            PlatformAdminTable[(NEW: public.platform_admins\nLocked from Client SELECT)]
            PlatformNonceTable[(NEW: public.platform_gcap_nonces\nAtomic Nonce Registry)]
            PlatformSuspensionTable[(NEW: public.platform_workspace_suspensions\nState-Preserving Snapshots)]
            PlatformAuditTable[(NEW: public.platform_audit_logs\nImmutable Trigger + Hash Chain)]
            CouponsTable[(NEW: public.coupons\nLocked from Client SELECT)]
            RedemptionsTable[(NEW: public.coupon_redemptions\nON DELETE RESTRICT)]
        end
    end

    TenantUser -->|HTTPS| Cloudflare
    AdminUser -->|HTTPS| Cloudflare
    Cloudflare --> VistaarApp
    Cloudflare --> SuperAdminApp
    
    VistaarApp -->|Anon / Auth JWT| AuthService
    VistaarApp -->|Direct RLS Access| TenantTables
    VistaarApp -->|RPC: validate_and_reserve_coupon| PostgreSQL

    SuperAdminApp -->|Admin JWT| AuthService
    SuperAdminApp -->|Bearer Token (AAL2)| AdminGateway
    AdminGateway -->|Service Role + GCAP Envelope| PostgreSQL
```

### Core Architectural Mandates (Phase 2.6 Hardened)

1. **Atomic GCAP Nonce-Consumption:** Privileged administrative RPCs require an HMAC-SHA256 signed envelope (`p_admin_id`, `p_request_timestamp`, `p_nonce`, `p_signature`). Replay prevention is enforced via atomic insertion into `public.platform_gcap_nonces` governed by a primary key unique constraint within the same transaction.
2. **Separation of Customer & Backend Execution Contracts:** Possessing a `service_role` key never bypasses workspace authorization. For direct customer checkout, identity is derived from `auth.uid()`. For trusted backend gateway calls, verified customer identity (`p_customer_id`) must be derived strictly from the verified JWT `sub` and passed to the database; client-supplied IDs in request bodies are ignored. The database verifies customer ownership/admin authority without assuming non-existent columns (e.g., verifying via `organizations.owner_user_id`, `profiles`, `workspace_memberships`, or `owner_email`).
3. **Preservation of Existing Subscription Periods & Mid-Cycle Block:** Manual subscription renewals on the same plan preserve all remaining paid days on active subscriptions, tacking unexpired time onto new period ends. Mid-cycle plan switches (tier upgrades/downgrades or monthly/annual changes during an active paid period) are strictly blocked (`MID_CYCLE_PLAN_CHANGE_BLOCKED`) pending business policy approval on credit/proration rules (Blocker 6).
4. **Collision-Proof Payment Settlement & Committed Failure Audit:** `settle_coupon_payment` requires reservation status to be `reserved` and unexpired. Only strictly captured funds (`'captured'`, `'verified_success'`) from allowed provider `'youpi_pg'` are accepted; `payment.authorized` is strictly rejected. Amount mismatches update redemption to `'failed'`, insert a failed transaction record into `payment_transactions`, and return an explicit failure response (committed, no transaction rollback). Duplicate webhooks are idempotent. Late payments arriving after reservation expiry are flagged for manual support review and never silently activate subscriptions.
5. **Database-Enforced Immutability for Audit Trails & Operator Boundaries:** `public.platform_audit_logs` is protected by database triggers that explicitly reject `UPDATE` and `DELETE` queries, with `TRUNCATE` revoked across application roles. Superuser actions that bypass triggers are captured via external WAL shipping.
6. **State-Preserving Multi-Branch Tenant Suspension & Reactivation:** Suspending a business operates cleanly across multi-branch organizations: users with active memberships in other active branches are not suspended globally. Reactivation restores *only* snapshotted users whose records are still in `'Suspended'` state, preserving independent terminations or status changes.
7. **Statutory Financial Retention:** `coupon_redemptions` enforces `ON DELETE RESTRICT` with legal name and customer email snapshots for compliance with Section 128(5) of the Indian Companies Act (8-year retention).

---

## 2. Technology Stack & Dependencies

| Component | Technology | Version | Justification |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React + TypeScript | React 18.x / TS 5.x | Consistent with VISTAAR production ecosystem. |
| **Build Tool** | Vite | 5.x | Ultra-fast HMR and optimized production bundles. |
| **Styling & Design** | Tailwind CSS + Lucide Icons | 3.4.x / Latest | Rapid UI layout with dark/light administrative styling. |
| **State & Data Fetching**| TanStack Query (React Query) | 5.x | Server-state caching, automatic cache invalidation. |
| **Backend API Gateway** | Node.js (Express / Edge API) | 20.x LTS | Trusted BFF layer managing GCAP signatures and service-role keys. |
| **Identity & Backend** | Supabase JS Client | 2.x | Unified authentication with AAL2 TOTP handling. |
| **Database** | PostgreSQL | 15.x (Supabase) | Atomic transactions, RLS, and security definer procedures. |

---

## 3. Project Directory & Application Structure

```
super_admin/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── scripts/
│   └── provision-super-admin.js       # Offline CLI first-admin provisioning script
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types/
│   │   ├── admin.ts                   # Admin roles, permissions, audit records
│   │   ├── business.ts                # Workspaces, organizations, subscription states
│   │   ├── coupon.ts                  # Coupons, campaigns, redemption records
│   │   └── metrics.ts                 # Platform revenue, GMV, MRR/ARR definitions
│   ├── services/
│   │   ├── supabaseClient.ts          # Frontend Supabase client (anon key ONLY)
│   │   ├── adminGatewayApi.ts         # Axios/Fetch wrapper for Backend Gateway BFF
│   │   └── mfaService.ts              # Supabase Auth TOTP enrollment and challenge
│   ├── context/
│   │   ├── AdminAuthContext.tsx       # Session state, AAL2 verification status
│   │   └── ThemeContext.tsx
│   ├── components/
│   │   ├── common/                    # Button, Modal, DataTable, Badge, Toast
│   │   ├── layout/                    # AdminSidebar, AdminHeader, PageWrapper
│   │   └── guards/
│   │       ├── AdminRouteGuard.tsx    # Blocks unauthenticated and non-admin users
│   │       └── MfaRouteGuard.tsx      # Forces TOTP challenge if session is AAL1
│   └── pages/
│       ├── auth/
│       │   ├── AdminLoginPage.tsx
│       │   ├── SetupMfaPage.tsx
│       │   └── VerifyMfaPage.tsx
│       ├── dashboard/
│       │   └── DashboardOverviewPage.tsx # MRR, GMV, Workspace & Subscription KPIs
│       ├── businesses/
│       │   ├── BusinessDirectoryPage.tsx # Workspace list, search, filter
│       │   └── BusinessDetailPage.tsx    # Suspension controls, branch explorer
│       ├── subscriptions/
│       │   ├── SubscriptionManagementPage.tsx
│       │   └── PlanOverrideModal.tsx
│       ├── coupons/
│       │   ├── CouponManagementPage.tsx   # Campaign creator, quota trackers
│       │   └── RedemptionLedgerPage.tsx   # Statutory redemption audit trail
│       ├── audit/
│       │   └── AuditLogExplorerPage.tsx   # Filterable immutable audit ledger
│       └── settings/
│           └── PlatformSettingsPage.tsx
```

---

## 4. Backend Gateway & Integration Architecture

### 4.1 Server-Authoritative Request Flow & GCAP Protocol

```
[Super Admin Browser] 
    │ (AAL2 JWT Bearer Token)
    ▼
[Backend API Gateway BFF]
    ├─ 1. Verifies JWT signature against SUPABASE_JWT_SECRET.
    ├─ 2. Asserts jwtClaims.aud === 'authenticated' && jwtClaims.exp > now.
    ├─ 3. Asserts jwtClaims.aal === 'aal2' && jwtClaims.amr.includes('totp').
    ├─ 4. Queries public.platform_admins WHERE id = auth.uid() AND is_active = TRUE.
    ├─ 5. Verifies required role for requested endpoint.
    ├─ 6. Generates GCAP Assertion Envelope (p_admin_id, p_request_timestamp, p_nonce, p_signature).
    ├─ 7. Executes privileged database RPC using service_role connection.
    └─ 8. Returns sanitized response to Super Admin Browser.
```

### 4.2 Gateway API Endpoints Specification

| Endpoint | Method | Role Required | MFA | Operation Description |
| :--- | :---: | :---: | :---: | :--- |
| `/api/admin/auth/me` | GET | `authenticated` | AAL1 | Checks if caller has active record in `platform_admins`. |
| `/api/admin/metrics` | GET | `billing_admin`, `super_admin` | **AAL2** | Issues GCAP envelope; calls `super_admin_get_platform_metrics()`. |
| `/api/admin/workspaces` | GET | `support_agent`, `super_admin` | **AAL2** | Paginated workspace directory with branch and plan status. |
| `/api/admin/workspaces/:id/suspend` | POST | `super_admin` | **AAL2** | Issues GCAP envelope; calls `super_admin_suspend_workspace()`. |
| `/api/admin/workspaces/:id/reactivate` | POST | `super_admin` | **AAL2** | Issues GCAP envelope; calls `super_admin_reactivate_workspace()`. |
| `/api/admin/coupons` | GET / POST | `billing_admin`, `super_admin` | **AAL2** | Lists campaigns / creates new promotional coupon. |
| `/api/admin/redemptions` | GET | `billing_admin`, `super_admin` | **AAL2** | Paginated statutory redemption history. |
| `/api/admin/audit-logs` | GET | `super_admin` | **AAL2** | Filterable immutable audit log explorer. |
| `/api/checkout/validate-coupon` | POST | `authenticated` (Tenant) | AAL1 | Extracts JWT `sub` as customer context; calls `validate_and_reserve_coupon()`. |
| `/api/checkout/activate-zero-promo` | POST | `authenticated` (Tenant) | AAL1 | Extracts JWT `sub` as customer context; calls `activate_zero_payable_subscription()`. |
| `/api/webhooks/payment` | POST | Payment Gateway HMAC | N/A | Verifies webhook HMAC; queries provider out-of-band; calls `settle_coupon_payment()`. |

---

## 5. First-Super-Admin Provisioning Protocol

Public registration is disabled. Root administrator provisioning is conducted via an offline administrative CLI ceremony:

```bash
# Executed in secure server/CLI environment with direct database credentials
node scripts/provision-super-admin.js \
  --email "admin@vistaarone.com" \
  --name "Root Platform Administrator"
```

### Script Execution Logic
1. Invokes Supabase Admin Auth API:
   ```javascript
   const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
     email: args.email,
     password: crypto.randomBytes(24).toString('hex'),
     email_confirm: true
   });
   ```
2. Inserts directly into `public.platform_admins`:
   ```sql
   INSERT INTO public.platform_admins (id, email, full_name, role, is_active, mfa_enabled)
   VALUES (v_auth_user_id, 'admin@vistaarone.com', 'Root Platform Administrator', 'super_admin', TRUE, FALSE);
   ```
3. Generates a one-time magic link or recovery token forcing the administrator to set their private password and immediately enroll in TOTP MFA before accessing `admin.vistaarone.com`.

---

## 6. Testing, Quality Assurance & Security Validation

### 6.1 Testing Sequence (Security-First Gate)
1. **Database & Function Unit Tests (Sandbox DB):**
   - Verify GCAP atomic nonce insertion rejects concurrent replays with `unique_violation (23505)`.
   - Verify `validate_and_reserve_coupon` and `activate_zero_payable_subscription` enforce workspace ownership without assuming `workspaces.owner_id`.
   - Verify mid-cycle plan switches raise `MID_CYCLE_PLAN_CHANGE_BLOCKED` (`P0008`).
   - Verify early renewal on same plan preserves unexpired days.
   - Verify `settle_coupon_payment` commits failed transaction record on amount mismatch without exception rollback.
   - Verify `settle_coupon_payment` routes late payments to `requires_support_review` and never silently activates subscriptions.
   - Verify `super_admin_suspend_workspace` snapshots active users into `platform_workspace_suspensions` without disabling multi-branch users.
   - Verify `super_admin_reactivate_workspace` restores only snapshotted users whose current status is still `'Suspended'`.
   - Verify `enforce_platform_audit_immutability` blocks `UPDATE` and `DELETE` on `platform_audit_logs`.
2. **Gateway Middleware & Security Integration Tests:**
   - Verify AAL1 sessions receive `403 Forbidden` on all `/api/admin/*` routes.
   - Verify webhook HMAC signature verification rejects forged payloads.
   - Verify client-supplied customer IDs in checkout endpoints are ignored in favor of verified JWT `sub`.
3. **Frontend Integration Tests:**
   - Verify Super Admin SPA enforces MFA redirect guards.
4. **End-to-End Adversarial Penetration Testing:**
   - Penetration tests simulating IDOR, concurrent nonce replay, cross-tenant zero-cost activation, and period tampering.

---

## 7. Deliverable Hierarchy & References

- Database Schema & Function Definitions: [SUPER_ADMIN_DATABASE_DESIGN.md](file:///d:/Project/vistaar-main/super_admin/SUPER_ADMIN_DATABASE_DESIGN.md)
- Security Architecture & Threat Defense: [SUPER_ADMIN_SECURITY_DESIGN.md](file:///d:/Project/vistaar-main/super_admin/SUPER_ADMIN_SECURITY_DESIGN.md)
- Coupon & Campaign Specification: [SUPER_ADMIN_COUPON_DESIGN.md](file:///d:/Project/vistaar-main/super_admin/SUPER_ADMIN_COUPON_DESIGN.md)
- Implementation Phases & Phase Gates: [SUPER_ADMIN_IMPLEMENTATION_PHASES.md](file:///d:/Project/vistaar-main/super_admin/SUPER_ADMIN_IMPLEMENTATION_PHASES.md)
- Phase 2.6 Changelog & Audits: [SUPER_ADMIN_PHASE_2_6_CHANGELOG.md](file:///d:/Project/vistaar-main/super_admin/SUPER_ADMIN_PHASE_2_6_CHANGELOG.md)
