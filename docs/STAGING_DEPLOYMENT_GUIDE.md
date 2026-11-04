# STAGING DEPLOYMENT & OPERATION GUIDE
## VISTAAR Business OS ↔ VISTAAR Super Admin
**Document Reference:** `docs/STAGING_DEPLOYMENT_GUIDE.md`  
**Revision:** 1.0.0-FINAL  
**Date:** November 3, 2026  
**Target Environment:** Staging Supabase Project `vlbhxcajphyjkeueubud` (AWS `eu-west-1`)  
**Strict Safety Requirement:** ZERO connection or execution against production (`kluxsykimnjivkqxelba`)

---

## 1. System Architecture & Port Allocation

The staging integration ecosystem comprises three coordinated services:

```
+-----------------------------------------------------------------------------------------+
|                                    LOCAL DEVELOPER HOST                                 |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|  [VISTAAR Business OS]         [VISTAAR Super Admin UI]       [Gateway BFF Service]     |
|      Port 5173                      Port 3001                      Port 3002            |
|          |                              |                              |                |
|          |                              +------------ HTTP ------------+                |
|          |                               (CORS & Bearer Auth)          |                |
|          |                                                             |                |
+----------|-------------------------------------------------------------|----------------+
           |                                                             |
           | (Anon/Authenticated RLS)                                    | (Service-Role Client)
           v                                                             v
+-----------------------------------------------------------------------------------------+
|                                 STAGING SUPABASE PROJECT                                |
|                                   Ref: vlbhxcajphyjkeueubud                             |
|                                        (AWS eu-west-1)                                  |
+-----------------------------------------------------------------------------------------+
|  - auth.users (Tenant Identities & Super Admin Operators)                               |
|  - public.workspaces & public.profiles (Tenant Businesses)                              |
|  - public.workspace_subscriptions (14-Day Free Trial Auto-Enrollment)                   |
|  - public.invoices & public.payments (Tenant Retail Operations)                         |
|  - public.platform_admins, suspensions, audit logs, coupons                             |
+-----------------------------------------------------------------------------------------+
```

| Component | Repository Path | Service Port | Primary Protocol | Role |
| :--- | :--- | :--- | :--- | :--- |
| **VISTAAR Business OS** | `d:\Project\vistaar-main\vistaar-main` | `5173` | HTTP / WebSocket | Tenant retail POS, billing, inventory |
| **VISTAAR Super Admin** | `d:\Project\vistaar-main\super_admin` | `3001` | HTTP (Vite SPA) | Platform surveillance dashboard |
| **Super Admin Gateway BFF** | `d:\Project\vistaar-main\super_admin` | `3002` | Node.js HTTP REST | Secure backend-for-frontend service |
| **Staging Supabase DB** | Hosted (`eu-west-1`) | `5432` / `6543` | PostgreSQL 17.11 | Unified multi-tenant persistence layer |

---

## 2. Pre-Flight Verification & Staging Database Provisioning

### 2.1 Air-Gap Verification
Before starting any service, verify that no environment file references production:
```bash
# Must return ZERO matches in both repositories
grep -rn "kluxsykimnjivkqxelba" d:/Project/vistaar-main/super_admin/.env*
grep -rn "kluxsykimnjivkqxelba" d:/Project/vistaar-main/vistaar-main/.env*
```

### 2.2 Database Migration Sequence
The shared staging database (`vlbhxcajphyjkeueubud`) requires the following baseline migrations:
1. `super_admin/migrations/000_baseline_schema_snapshot.sql`
   - Provisions all core multi-tenant entities (`workspaces`, `profiles`, `invoices`, `organizations`, `workspace_memberships`, `subscription_plans`, `workspace_subscriptions`, `subscription_addons`, `payment_transactions`).
   - Hardens SQL privileges on `public` and `extensions` (least privilege, no `CREATE` for untrusted roles).
   - Seeds canonical subscription plans (`free_trial`, `starter`, `starter_mobile`, `business`, `growth`).
2. `super_admin/migrations/077_super_admin_infrastructure.sql`
   - Provisions `platform_admins`, `platform_gcap_nonces`, `platform_workspace_suspensions`, `platform_audit_logs`, `platform_bootstrap_registry`, `platform_admin_invitations`.
3. `super_admin/migrations/078_coupon_and_promotional_campaign_system.sql`
   - Provisions `coupons` and `coupon_redemptions`.
4. Run authoritative trigger update:
```bash
node d:/Project/vistaar-main/super_admin/scripts/update_handle_new_user.mjs
```
Guarantees newly registered business owners receive automatic 14-day free trial subscriptions and workspace memberships upon signup.

---

## 3. Service Startup Procedure

### Step 1: Start the Gateway BFF Service (Port 3002)
In `d:\Project\vistaar-main\super_admin`:
```bash
node server/gateway.mjs
```
*Expected Terminal Output:*
```
[Gateway BFF] Successfully listening on port 3002 (Environment: staging, Staging Ref: vlbhxcajphyjkeueubud)
```

Verify Gateway health via terminal or browser:
```bash
curl http://localhost:3002/api/v1/health
```

### Step 2: Start the Super Admin UI (Port 3001)
In `d:\Project\vistaar-main\super_admin`:
```bash
npm run dev
```
*Expected Terminal Output:*
```
  VITE v5.4.14  ready in 250 ms

  ➜  Local:   http://localhost:3001/
  ➜  Network: use --host to expose
```
When opened in your browser, the banner at the top will indicate:
> 🟢 **Live Staging Gateway Connected:** Serving live multi-tenant state from Supabase `vlbhxcajphyjkeueubud` (AWS eu-west-1).

### Step 3: Start VISTAAR Business OS (Port 5173)
In `d:\Project\vistaar-main\vistaar-main`:
Ensure `.env.local` is configured with staging variables:
```ini
VITE_SUPABASE_URL=https://vlbhxcajphyjkeueubud.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...<staging-anon-key>
```
Start the application:
```bash
npm run dev
```
*Expected Terminal Output:*
```
  VITE v6.2.2  ready in 480 ms

  ➜  Local:   http://localhost:5173/
```

---

## 4. End-to-End Operational Verification Workflow

To test the integration end-to-end:

1. **Register a New Business in Business OS (`http://localhost:5173`):**
   - Navigate to `/login` $\rightarrow$ "Register Company".
   - Enter Business Name: "Staging Test Mart", Owner Name: "Rahul Verma", Email: `test.rahul@staging.vistaar.internal`, Password: `Password123!@#$`.
   - Submit registration.
2. **Verify Instant Super Admin Discovery (`http://localhost:3001`):**
   - Open Super Admin dashboard $\rightarrow$ **Platform Executive Overview**.
   - Notice Total Businesses and Active Subscriptions immediately increment.
   - Navigate to **Businesses** directory $\rightarrow$ "Staging Test Mart" appears in the live roster under the "14-Day Free Trial" plan.
3. **Execute Administrative Action:**
   - Click "Suspend" on the business $\rightarrow$ provide reason $\rightarrow$ Confirm.
   - Status immediately transitions to **Suspended**.
   - An audit record is written into `platform_audit_logs`.
   - Click "Reactivate" $\rightarrow$ business status is restored to **Active**.

---

## 5. Automated Verification Test Suite

To run the complete automated integration test suite covering 3 synthetic tenants, retail invoice GMV, overview metrics, directory pagination, and suspension controls:
```bash
cd d:\Project\vistaar-main\super_admin
node tests/staging_multi_tenant_integration.test.mjs
```
*Expected Output:*
```
========================================================================
ALL MULTI-TENANT STAGING INTEGRATION TESTS PASSED (100% SUCCESS)
========================================================================
```

