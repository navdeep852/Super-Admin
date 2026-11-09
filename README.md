# VISTAAR Super Admin Platform

Enterprise Multi-Tenant Administration, Security Governance & Observability Engine for the VISTAAR Business OS ecosystem.

---

## 🌟 Overview

The **VISTAAR Super Admin** platform is a mission-critical, enterprise SaaS control plane designed for high-assurance platform governance, real-time multi-tenant management, multi-layer suspension enforcement, and financial analytics. It pairs with the **VISTAAR Business OS** to provide centralized administration across retail and enterprise tenants while preserving zero-trust security boundaries.

### Core Architectural Pillars
- **Strict Tenant Isolation & Governance:** PostgREST Row-Level Security (RLS) policies evaluated at the PostgreSQL engine level.
- **Enterprise Defense-in-Depth:** Mandatory Supabase GoTrue Auth token validation, strict Role-Based Access Control (RBAC), and Authenticator Assurance Level 2 (AAL2) TOTP MFA step-up.
- **Gateway Cryptographic Assertion Protocol (GCAP):** Deterministic HMAC-SHA256 signature verification with single-use atomic nonces and timestamp drift validation on all sensitive platform mutations.
- **Authoritative Multi-Layer Suspension Engine:** State-preserving snapshot mechanisms with database RPC-level execution and instant PostgREST RLS cut-off.
- **Financial & Accounting Segregation:** Total isolation between Platform SaaS Subscription Revenue and Tenant Retail GMV.
- **Authoritative Payment Webhook Handler:** Secure ingestion of PG callbacks with HMAC validation and idempotent coupon discount settlement.

---

## 🏛 Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────┐
│         VISTAAR Super Admin React SPA (Vite)          │
│       TailwindCSS • Lucide Icons • Web Crypto API      │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / WSS
                            ▼
┌────────────────────────────────────────────────────────┐
│            Super Admin Gateway BFF (Node.js)           │
│    Centralized Auth Middleware • Rate Limiting • GCAP   │
└───────────────────────────┬────────────────────────────┘
                            │ Service-Role Pooler / RPC
                            ▼
┌────────────────────────────────────────────────────────┐
│            Supabase / PostgreSQL Database              │
│    Row-Level Security (RLS) • Cryptographic Nonces     │
│       Authoritative PL/pgSQL Stored Procedures         │
└────────────────────────────────────────────────────────┘
```

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide React, Web Crypto API.
- **Gateway BFF:** Node.js (v20 Alpine), HTTP/HTTPS, Crypto, Centralized RBAC Middleware, Connection Pooler.
- **Database & Auth:** Supabase GoTrue Auth (TOTP MFA), PostgreSQL 15+, PL/pgSQL RPCs, Row-Level Security (RLS).
- **Deployment Infrastructure:** Containerized Gateway via Docker (`Dockerfile`), Frontend on Vercel (`vercel.json`) with SPA deep-linking and hardened HTTP security headers.

---

## 🚀 Key Modules & Capabilities

### 1. Executive Platform Dashboard
- Dynamic real-time KPI metrics: Total Businesses, Active Tenants, Suspended Workspaces, Total Users, Platform SaaS Revenue, Tenant Sales GMV, Outstanding Receivables, and Refund Components.
- 6-Timeframe Filtering Engine: `Today`, `This Week`, `This Month`, `Last Month`, `All Time`, and `Custom Date Range`.
- Dynamic trailing 6-month financial aggregation querying `payment_transactions` and `invoices`.

### 2. Multi-Tenant Workspace Management
- Searchable, paginated, filterable, and sortable roster of all registered businesses.
- **7-Section Deep-Dive Drawer:**
  1. *Business Overview:* Workspace UUID, legal entity name, primary owner contacts.
  2. *Branch Information:* Multi-branch hierarchy, main branch designation, branch codes.
  3. *Subscription & Plan:* Active plan tier (`Starter`, `Mobile POS`, `Business`, `Growth`, `Enterprise`), billing interval, expiration dates.
  4. *Staff Roster:* Complete employee listing with status tags (`Active`, `Suspended`).
  5. *Financial Analytics:* Tenant GMV, collection rates, and latest retail invoices.
  6. *Business Settings & GST:* Registered business address, GSTIN, tax configurations.
  7. *Audit Trail & Suspensions:* Complete chronological ledger of administrative interventions and suspension history.

### 3. 3-Tier Multi-Layer Suspension & Reactivation
- **Authoritative Database Tier:** `super_admin_suspend_workspace` snapshots active memberships into `platform_workspace_suspensions`, sets `workspaces.is_active = FALSE`, transitions all profiles to `'Suspended'`, and logs the action into `platform_audit_logs`.
- **Database RLS Tier:** Migration `079` ensures `current_user_workspace_id()` and `user_has_workspace_access()` return `NULL` / `FALSE`, immediately cutting off all tenant PostgREST queries across `invoices`, `products`, `customers`, and orders.
- **Application Session Tier:** Client-side session auto-purge and redirection upon suspension detection.

### 4. Coupon & Campaign Management Engine
- Authoritative promotional quota system supporting percentage and fixed discounts.
- Two-phase reservation and settlement lifecycle (`validate_and_reserve_coupon`, `settle_coupon_payment`).
- Single-use constraint per workspace with expiration validation.

### 5. Optional Webhook Ingestion & Financial Settlement
- Ingestion endpoint `POST /api/v1/webhooks/payment` (disabled by default; fails closed with HTTP 503 if integration is disabled).
- When enabled (`ENABLE_YOUPI_WEBHOOK=true`), verifies HMAC-SHA256 signatures against `YOUPI_WEBHOOK_SECRET`.
- Timestamp skew validation ($< 300\text{ seconds}$) preventing replay attacks.
- Idempotent transaction settlement updating subscription state and consuming coupon reservations.

---

## 🔐 Security & Governance Model

| Mechanism | Implementation | Scope |
| :--- | :--- | :--- |
| **Authentication** | Supabase GoTrue Auth (JWT) | Mandatory on all `/api/v1/*` routes |
| **Two-Factor Assurance** | TOTP MFA (AAL2 Claim) | Required for suspensions, reactivations, coupons, admin invitations |
| **GCAP Assertions** | HMAC-SHA256 Signatures | Required for all state-mutating administrative actions |
| **Replay Defense** | Atomic Nonce Consumption | Table `platform_gcap_nonces` with 300s TTL |
| **Row-Level Security** | `current_user_workspace_id()` | Evaluates `workspaces.is_active` and `profiles.status` |
| **Audit Immutability** | Append-only trigger | Table `platform_audit_logs` guarded against `UPDATE` and `DELETE` |

---

## 📁 Repository Structure

```
super_admin/
├── Dockerfile                     # Production Node 20 Alpine container specification
├── vercel.json                    # SPA routing rewrite rules and security headers
├── package.json                   # Dependencies and build scripts
├── vite.config.ts                 # Vite bundler configuration
├── server/
│   └── gateway.mjs                # Enterprise Super Admin Gateway BFF service
├── src/
│   ├── App.tsx                    # Main application root with authentication guards
│   ├── main.tsx                   # React DOM entry point
│   ├── components/
│   │   ├── auth/                  # Real Supabase GoTrue login & TOTP MFA challenge
│   │   ├── dashboard/             # Executive dashboard, KPI cards, charts, filters
│   │   ├── layout/                # Admin navigation, verified AAL badge, header
│   │   ├── modals/                # Suspension modal with GCAP signing confirmation
│   │   ├── promotions/            # Coupon management, redemption tables
│   │   ├── settings/              # Platform configuration, audit logs, admin accounts
│   │   └── workspaces/            # Workspaces roster, 7-section deep-dive drawer
│   ├── context/                   # AdminAuthContext (real GoTrue session management)
│   ├── services/                  # adminGatewayClient.ts (Web Crypto GCAP signer)
│   └── types/                     # TypeScript definitions & data contracts
├── migrations/
│   ├── 077_super_admin_infrastructure.sql
│   ├── 078_coupon_and_promotional_campaign_system.sql
│   └── 079_enforce_workspace_suspension_rls.sql
├── scripts/
│   ├── bootstrap_super_admin.mjs  # Out-of-band root administrator provisioning CLI
│   ├── test_staging_backup_restore.mjs # 9-table schema recreation & SHA-256 test
│   └── verify_milestone_delivery.mjs   # End-to-end milestone verification suite
├── tests/
│   ├── gateway_provisioning.test.mjs   # 37-assertion provisioning security suite
│   ├── gateway_security_matrix.test.mjs# 9-state auth & RBAC matrix test
│   ├── payment_webhook_lifecycle.test.mjs # Webhook HMAC & settlement test
│   └── suspension_enforcement_live.test.mjs# Direct PostgreSQL RLS enforcement test
└── docs/
    ├── PRODUCTION_READINESS_FINAL_AUDIT.md
    └── PRODUCTION_READINESS_REMEDIATION_REPORT.md
```

---

## 🛠 Local Development & Setup

### 1. Prerequisites
- Node.js $\ge 18.0.0$ (Node 20 LTS recommended)
- npm $\ge 9.0.0$
- Accessible Supabase PostgreSQL instance (Staging or Local)

### 2. Environment Configuration
Create `.env.staging` (or `.env.production`) from the provided template:
```bash
cp .env.staging.example .env.staging
```
Configure:
- `VITE_API_GATEWAY_URL=http://localhost:3002`
- `PORT=3002`
- `GATEWAY_SUPABASE_URL=https://<your-project-ref>.supabase.co`
- `GATEWAY_SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`
- `GATEWAY_ASSERTION_SECRET=<64-char-hex-secret>`
- `ENABLE_YOUPI_WEBHOOK=false` (Optional; set to `true` only if payment webhooks are used)
- `YOUPI_WEBHOOK_SECRET=<webhook-secret>` (Only required if `ENABLE_YOUPI_WEBHOOK=true`)
- `STAGING_DATABASE_URL=postgresql://postgres.<ref>:<pass>@<host>:6543/postgres`

### 3. Install Dependencies
```bash
npm install
```

### 4. Run the Super Admin Gateway BFF
```bash
node server/gateway.mjs
```

### 5. Run the Super Admin Frontend
```bash
npm run dev
```

---

## 🧪 Testing & Verification

Run the comprehensive automated test suites:

```bash
# 1. Gateway RBAC & 9-State Security Matrix
node tests/gateway_security_matrix.test.mjs

# 2. Administrator Provisioning Security (37 Assertions)
node tests/gateway_provisioning.test.mjs

# 3. Payment Webhook HMAC & Settlement Lifecycle
node tests/payment_webhook_lifecycle.test.mjs

# 4. Live PostgreSQL RLS Suspension Enforcement
node tests/suspension_enforcement_live.test.mjs

# 5. Database Schema Recreation & Checksum Parity
node scripts/test_staging_backup_restore.mjs

# 6. End-to-End Milestone Delivery Verification (with AAL2 TOTP)
node scripts/verify_milestone_delivery.mjs
```

---

## 🚢 Production Release Playbook

Refer to [PRODUCTION_READINESS_REMEDIATION_REPORT.md](file:///d:/Project/vistaar-main/super_admin/docs/PRODUCTION_READINESS_REMEDIATION_REPORT.md) for detailed cutover protocols, sequential migration steps (`077` $\rightarrow$ `078` $\rightarrow$ `079`), out-of-band bootstrapping, and rollback procedures.

> **CRITICAL GUARDRAIL:** Do not execute `migrations/000_baseline_schema_snapshot.sql` against production.

---

## 📄 License
Proprietary & Confidential. Copyright © 2026 VISTAAR Inc. All rights reserved.

