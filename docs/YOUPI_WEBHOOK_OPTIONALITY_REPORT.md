# VISTAAR SUPER ADMIN — YOUPI WEBHOOK DEPENDENCY REMOVAL & OPTIONALITY REPORT

**Document Type:** Architecture Remediation, Security Verification & Deployment Report  
**Author:** DevOps & Senior Platform Security Engineer  
**Target Repository:** `https://github.com/navdeep852/Super-Admin`  
**Target Branch:** `main`  
**Date:** 2026-11-09  

---

## 1. Executive Summary

During deployment on Railway, the VISTAAR Super Admin Gateway BFF crashed on startup because `YOUPI_WEBHOOK_SECRET` was treated as a mandatory environment variable alongside the core Supabase credentials. The platform owner does not use Youpi and has no Youpi account or webhook integration.

### Remediation Outcome: **SUCCESS — Startup Dependency Removed (100% Verified)**

1. **Youpi Integration Made Completely Optional:** The Gateway no longer requires `YOUPI_WEBHOOK_SECRET` to start up.
2. **Explicit Opt-In Feature Flag:** Youpi integration is disabled by default. It is activated only when `ENABLE_YOUPI_WEBHOOK=true` is explicitly set in environment variables.
3. **Fail-Closed Webhook Rejection:** When Youpi integration is disabled, incoming webhook requests (`/api/v1/webhooks/payment` and alias `/api/v1/webhooks/youpi`) fail closed with **HTTP 503 Service Unavailable** (`code: WEBHOOK_INTEGRATION_DISABLED`). Unsigned requests are strictly rejected; signature verification is never bypassed; and no hardcoded or fallback secrets exist.
4. **Strict Startup Refusal if Misconfigured:** If `ENABLE_YOUPI_WEBHOOK=true` is set without providing `YOUPI_WEBHOOK_SECRET`, the Gateway refuses startup with an explicit error naming the missing secret.
5. **Zero Breaking Changes:** All 9 existing security states, authentication, MFA assurance (AAL2), GCAP HMAC assertions, and reporting connector tests continue to pass 100%.

---

## 2. Code Changes & Architecture Identification

| File | Change Description | Security Impact |
| :--- | :--- | :--- |
| [`server/gateway.mjs`](file:///D:/Project/vistaar-main/super_admin/server/gateway.mjs) | 1. Added `getYoupiWebhookConfig()` and exported `validateEnvironment()`.<br>2. Removed `YOUPI_WEBHOOK_SECRET` from mandatory startup requirements unless `ENABLE_YOUPI_WEBHOOK=true`.<br>3. Hardened environment loading so explicit environment variables are not overwritten by local files.<br>4. Added fail-closed check at `/api/v1/webhooks/payment` and alias `/api/v1/webhooks/youpi` returning 503 when disabled.<br>5. Enforced 405 Method Not Allowed for non-POST methods.<br>6. Surfaced `integrations.youpiWebhook` in `/health` and `/api/v1/health` probes. | High / Positive: Unblocks Railway deployment; eliminates startup crashes without secret; enforces fail-closed posture. |
| [`tests/payment_webhook_lifecycle.test.mjs`](file:///D:/Project/vistaar-main/super_admin/tests/payment_webhook_lifecycle.test.mjs) | Upgraded test suite into 3 comprehensive phases with 13 automated test cases covering optionality, disabled rejection, startup refusal, and active lifecycle. | High: Guarantees no regression and automated CI enforcement. |
| [`scripts/test_gateway_without_youpi.mjs`](file:///D:/Project/vistaar-main/super_admin/scripts/test_gateway_without_youpi.mjs) | Standalone process test script verifying clean process spawn without `YOUPI_WEBHOOK_SECRET` and verifying exit code 1 when enabled without secret. | High: Verifies actual OS process execution behavior. |
| [`.env.example`](file:///D:/Project/vistaar-main/super_admin/.env.example) | Marked `ENABLE_YOUPI_WEBHOOK=false` and commented out `YOUPI_WEBHOOK_SECRET`. | Documentation integrity. |
| [`.env.staging.example`](file:///D:/Project/vistaar-main/super_admin/.env.staging.example) | Documented `ENABLE_YOUPI_WEBHOOK=false` as optional. | Documentation integrity. |
| [`README.md`](file:///D:/Project/vistaar-main/super_admin/README.md) | Updated deployment requirements: Youpi webhook is documented as optional. | Clear operator onboarding. |

---

## 3. Mandatory vs Optional Environment Variables on Railway

### Required Variables (Mandatory for Railway Deployment)
```bash
GATEWAY_SUPABASE_URL=https://<your-project-ref>.supabase.co
GATEWAY_SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
GATEWAY_ASSERTION_SECRET=<64-character-hex-hmac-secret>
```

### Optional Variables
```bash
PORT=3002                        # Assigned dynamically by Railway (defaults to 3002)
NODE_ENV=staging                 # 'staging' or 'production'
ADMIN_ALLOWED_ORIGINS=...        # Permitted CORS origins
ENABLE_YOUPI_WEBHOOK=false       # Optional; defaults to false
YOUPI_WEBHOOK_SECRET=            # ONLY required if ENABLE_YOUPI_WEBHOOK=true
```

---

## 4. Test Verification Results

### 4.1 Payment Webhook Lifecycle & Optionality Suite (`tests/payment_webhook_lifecycle.test.mjs`)
```text
================================================================
 PHASE 1: STARTUP & ENVIRONMENT OPTIONALITY VALIDATION
================================================================
  ✓ Test 1.1: Gateway environment valid without YOUPI_WEBHOOK_SECRET when disabled
  ✓ Test 1.2: Gateway environment valid by default without any Youpi variables
  ✓ Test 1.3: Enabled integration strictly refuses startup without YOUPI_WEBHOOK_SECRET

================================================================
 PHASE 2: FAIL-CLOSED REJECTION WHEN INTEGRATION IS DISABLED
================================================================
  ✓ Test 2.1: Unsigned webhook rejected with 503 WEBHOOK_INTEGRATION_DISABLED
  ✓ Test 2.2: Signed webhook rejected with 503 when disabled (no signature bypass)
  ✓ Test 2.3: Webhook alias route /api/v1/webhooks/youpi rejected with 503
  ✓ Test 2.4: Non-POST webhook request rejected with 405 METHOD_NOT_ALLOWED

================================================================
 PHASE 3: ACTIVE WEBHOOK LIFECYCLE (INTEGRATION EXPLICITLY ENABLED)
================================================================
  ✓ Test 3.1: Missing X-Youpi-Signature rejected with 401 WEBHOOK_SIGNATURE_MISSING
  ✓ Test 3.2: Malformed signature rejected with 401 INVALID_WEBHOOK_SIGNATURE
  ✓ Test 3.3: Tampered payload signature mismatch rejected with 401
  ✓ Test 3.4: Expired webhook timestamp (> 5 min) rejected with 401 WEBHOOK_TIMESTAMP_EXPIRED
  ✓ Test 3.5: Incomplete webhook payload rejected with 400 MISSING_REQUIRED_FIELDS
  ✓ Test 3.6: Valid webhook processed and authoritative settlement RPC invoked with 200 OK
  ✓ Test 3.7: Duplicate delivery handled idempotently: returns 200 already_settled

================================================================
🎉 ALL 13 PAYMENT WEBHOOK OPTIONALITY & LIFECYCLE TESTS PASSED
================================================================
```

### 4.2 Standalone Child Process Execution (`scripts/test_gateway_without_youpi.mjs`)
```text
================================================================
 VISTAAR SUPER ADMIN — STANDALONE PROCESS STARTUP TEST
================================================================

--- 1. Testing Gateway Process Startup WITHOUT YOUPI_WEBHOOK_SECRET ---
  ✓ Gateway process started cleanly without YOUPI_WEBHOOK_SECRET
  ✓ Process output confirms: [Gateway BFF] Successfully listening on port 3095 (Environment: test, Staging Ref: vlbhxcajphyjkeueubud, Youpi Webhook: DISABLED)
  ✓ /api/v1/health reports: {"youpiWebhook":"disabled"}
  ✓ POST /api/v1/webhooks/payment rejected with 503: WEBHOOK_INTEGRATION_DISABLED
  ✓ Clean shutdown of test Gateway process

--- 2. Testing Gateway Startup REFUSAL when Enabled Without Secret ---
  ✓ Gateway process exited with code 1 as expected
  ✓ Stderr confirmed missing variable: [GATEWAY ERROR] Missing required environment variables: YOUPI_WEBHOOK_SECRET (required when ENABLE_YOUPI_WEBHOOK is true)

================================================================
 🎉 ALL PROCESS STARTUP TESTS PASSED
================================================================
```

### 4.3 Regression Test Suite Summary
- `npm test` (`tests/reporting_connector.test.mjs`): **8/8 PASSED**
- `tests/gateway_security_matrix.test.mjs`: **9/9 SECURITY STATES VERIFIED**
- `tests/pricing_engine.test.mjs`: **7/7 PASSED**
- `tests/password_validation_and_lifecycle.test.mjs`: **12/12 PASSED**
- `tests/genuine_business_os_integration.test.mjs`: **7/7 PASSED**
- `npm run build`: **SUCCESS (0 errors in 3.38s)**

---

## 5. Live Gateway BFF Output

When running on port 3002 with default settings:
- Startup Log:
  ```text
  [Gateway BFF] Successfully listening on port 3002 (Environment: staging, Staging Ref: vlbhxcajphyjkeueubud, Youpi Webhook: DISABLED)
  ```
- `GET http://localhost:3002/api/v1/health`:
  ```json
  {
    "status": "operational",
    "ok": true,
    "service": "vistaar-super-admin-gateway-bff",
    "environment": "staging",
    "stagingProjectRef": "vlbhxcajphyjkeueubud",
    "gatewayPort": 3002,
    "uptimeSeconds": 142,
    "timestamp": "2026-11-09T15:20:10.123Z",
    "integrations": {
      "youpiWebhook": "disabled"
    }
  }
  ```
- `POST http://localhost:3002/api/v1/webhooks/payment`:
  ```json
  {
    "success": false,
    "error": "WEBHOOK_INTEGRATION_DISABLED",
    "code": "WEBHOOK_INTEGRATION_DISABLED",
    "message": "Payment webhook integration is disabled on this server"
  }
  ```

---

## 6. Railway Deployment Instructions for Platform Owner

In the Railway dashboard for the Super Admin service:
1. Provide the 3 core environment variables:
   - `GATEWAY_SUPABASE_URL`
   - `GATEWAY_SUPABASE_SERVICE_ROLE_KEY`
   - `GATEWAY_ASSERTION_SECRET`
2. **DO NOT** provide `YOUPI_WEBHOOK_SECRET` (it is no longer required).
3. Deploy the service. The service will boot up cleanly, bind to `0.0.0.0:${PORT}`, and pass all `/health` checks.
