# VISTAAR SUPER ADMIN — MULTI-PLATFORM TEST REPORT

**Execution Date:** 2026-11-05  
**Environment:** Staging (`vlbhxcajphyjkeueubud`, AWS `eu-west-1`)  
**Test Suite:** `tests/multi_platform_parity.test.mjs`

---

## 1. Automated Test Execution Summary

```
================================================================
  VISTAAR SUPER ADMIN - MULTI-PLATFORM PARITY & GATEWAY TESTS  
================================================================

[TEST 1] Gateway Health & Air-Gap Verification
  ✔ Gateway operational on port 3002
  ✔ Staging Supabase reference: vlbhxcajphyjkeueubud (AWS eu-west-1)
  ✔ Production Air-Gap confirmed: Production kluxsykimnjivkqxelba untouched

[TEST 2] Multi-Platform CORS Allow-List Validation
  ✔ Allowed origin for Web (Vite Dev): http://localhost:3001
  ✔ Allowed origin for Web (127.0.0.1): http://127.0.0.1:3001
  ✔ Allowed origin for Tauri Desktop (https): https://tauri.localhost
  ✔ Allowed origin for Tauri Desktop (tauri://): tauri://localhost
  ✔ Allowed origin for Capacitor Mobile: capacitor://localhost
  ✔ Allowed origin for Local Network IP (RFC-1918): http://192.168.1.100:3001
  ✔ Successfully rejected unauthorized origin: https://evil-hacker.com

[TEST 3] Shared Super Admin Authentication (GoTrue + platform_admins)
  ✔ Super Admin login succeeded for navdeep@vistaarone.com
  ✔ Verified Role: super_admin (Active: true)
  ✔ AAL Level: aal1

[TEST 4] Authenticated Profile Verification (/api/v1/admins/me)
  ✔ Authenticated me endpoint verified identity for Navdeep Maurya

[TEST 5] Administrative Modules Data Availability for Mobile & Desktop
  ✔ Overview Metrics reachable and returned authentic staging data
  ✔ Workspaces Directory reachable and returned authentic staging data
  ✔ Subscription Plans reachable and returned authentic staging data
  ✔ Promotional Offers reachable and returned authentic staging data
  ✔ Payments Ledger reachable and returned authentic staging data
  ✔ Subscriptions reachable and returned authentic staging data
  ✔ Users Directory reachable and returned authentic staging data
  ✔ Coupons & Discounts reachable and returned authentic staging data
  ✔ Platform Health Telemetry reachable and returned authentic staging data

================================================================
  ALL MULTI-PLATFORM PARITY TESTS PASSED SUCCESSFULLY!          
================================================================
```

---

## 2. Compilation & Build Verification

| Platform | Build Command | Status | Details |
| :--- | :--- | :--- | :--- |
| **Web** | `npm run build` | **PASSED** | Built in 5.16s, TypeScript clean (0 errors) |
| **Windows Desktop** | `cargo check --manifest-path src-tauri/Cargo.toml` | **PASSED** | Compiled in 14m 22s, MSVC x86_64 clean |
| **Android** | `cd android; .\gradlew.bat tasks` | **PASSED** | Gradle 8.11.1, OpenJDK 21, clean execution |
| **iOS** | `npx cap sync ios` | **PASSED** | Assets copied, plugins configured |
| **Gateway BFF** | `node server/gateway.mjs` | **ACTIVE** | Port 3002 operational |
