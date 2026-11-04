# VISTAAR SUPER ADMIN — GATEWAY BFF API REFERENCE
## End-to-End Administrative & Surveillance API Specification
**Version:** 3.1.0-STAGING  
**Base URL:** `http://localhost:3002` (Staging Gateway BFF)  
**Security Model:** Supabase Auth JWT + Role Verification + HMAC-SHA256 GCAP Assertions + AAL2 MFA  
**Production Air-Gap:** STRICT ENFORCEMENT (`kluxsykimnjivkqxelba` permanently blocked)

---

## 1. Global Authentication & Request Headers

### 1.1 Standard Operational Requests (Read-Only & Dashboard)
All operational endpoints accept standard Supabase Auth Bearer tokens:
```http
Authorization: Bearer <supabase_access_token>
Accept: application/json
```

### 1.2 Privileged Mutation Requests (GCAP Cryptographic Assertions)
Privileged endpoints (`/api/v1/admins/*`, `/api/v1/workspaces/:id/suspend`, etc.) enforce the **Gateway Cryptographic Assertion Protocol (GCAP)**:

| Header Name | Type | Description |
| :--- | :--- | :--- |
| `Authorization` | String | `Bearer <supabase_access_token>` representing authenticated administrator. |
| `X-GCAP-Signature` | String | 64-character lowercase hex HMAC-SHA256 signature. |
| `X-GCAP-Timestamp` | String | ISO 8601 or UNIX epoch timestamp (strictly bounded to $\pm 30$ seconds). |
| `X-GCAP-Nonce` | UUID | Single-use UUIDv4 nonce consumed atomically in PostgreSQL. |

**Canonical String Format (7-Part Strict Format):**
```
<METHOD>|<PATH>|<TIMESTAMP>|<NONCE>|<ACTOR_ID>|<SESSION_AAL>|<BODY_SHA256>
```

---

## 2. Platform Health & Infrastructure Telemetry

### 2.1 Basic Gateway Health
`GET /health` or `GET /api/v1/health`
- **Access:** Public / Unauthenticated
- **Response 200 OK:**
```json
{
  "status": "ok",
  "service": "vistaar-super-admin-gateway-bff",
  "environment": "staging",
  "stagingProjectRef": "vlbhxcajphyjkeueubud",
  "gatewayPort": 3002,
  "uptimeSeconds": 1420,
  "timestamp": "2026-11-03T17:20:00.000Z"
}
```

### 2.2 Deep Platform Health & Diagnostic Check
`GET /api/v1/platform/health`
- **Access:** Admin / Staging Diagnostic
- **Description:** Performs round-trip latency pings to PostgreSQL database and Supabase GoTrue Auth Admin API.
- **Response 200 OK:**
```json
{
  "status": "healthy",
  "timestamp": "2026-11-03T17:20:00.000Z",
  "environment": "staging",
  "stagingProjectRef": "vlbhxcajphyjkeueubud",
  "services": {
    "database": {
      "status": "operational",
      "latencyMs": 42,
      "error": null
    },
    "supabaseAuth": {
      "status": "operational",
      "latencyMs": 85,
      "error": null
    },
    "gatewayBff": {
      "status": "operational",
      "uptimeSeconds": 1420,
      "memoryMb": 28
    }
  }
}
```

---

## 3. Platform Executive Overview Endpoints

### 3.1 Aggregated Metrics & Visual Trends
`GET /api/v1/platform/overview`
- **Access:** Super Admin, Billing Admin, Support Agent
- **Description:** Calculates real-time multi-tenant health, distinct platform SaaS collected revenue, GST components, and retail tenant throughput GMV.
- **Response 200 OK:**
```json
{
  "success": true,
  "data": {
    "metrics": {
      "totalBusinesses": 14,
      "activeBusinesses": 13,
      "suspendedBusinesses": 1,
      "totalUsers": 28,
      "activeSubscriptions": 8,
      "trialSubscriptions": 6,
      "expiredSubscriptions": 0,
      "pendingRenewals": 1,
      "platformCollectedRevenueInr": 24990.00,
      "gstComponentInr": 3812.03,
      "netPlatformRevenueInr": 21177.97,
      "failedPaymentsCount": 0,
      "totalRefundsInr": 0,
      "mrrInr": 5999.00,
      "arrInr": 71988.00,
      "tenantSalesGmvInr": 348500.00
    },
    "planDistribution": [
      { "name": "14-Day Free Trial", "count": 6, "revenuePercent": 43, "color": "#94a3b8" },
      { "name": "Starter", "count": 4, "revenuePercent": 29, "color": "#38bdf8" },
      { "name": "Business", "count": 4, "revenuePercent": 29, "color": "#10b981" }
    ],
    "revenueTrends": [ ... ],
    "upcomingExpirations": [ ... ]
  }
}
```

---

## 4. Workspaces & Tenant Surveillance

### 4.1 Searchable & Paginated Directory
`GET /api/v1/workspaces`
- **Query Parameters:**
  - `page` (optional integer, default `1`)
  - `limit` (optional integer, default `20`, max `100`)
  - `search` (optional string, searches `company_name`, `owner_name`, `owner_email`)
  - `status` (optional string: `all` | `active` | `suspended`)
  - `plan` (optional string: `all` | plan_id)
- **Response 200 OK:**
```json
{
  "success": true,
  "data": {
    "businesses": [
      {
        "id": "239fd2c2-bb61-4850-898e-307aa79e6d81",
        "legalName": "Apex Retail India Synthetic",
        "organizationId": "239fd2c2-bb61-4850-898e-307aa79e6d81",
        "gstin": null,
        "ownerName": "Aarav Sharma",
        "ownerEmail": "synthetic.tenant1@staging.vistaar.internal",
        "ownerPhone": "9876543211",
        "address": "Registered Office",
        "city": "Mumbai",
        "state": "Maharashtra",
        "status": "Active",
        "plan": "14-Day Free Trial",
        "planId": "free_trial",
        "planName": "14-Day Free Trial",
        "billingInterval": "annual",
        "subscriptionStatus": "trialing",
        "registeredAt": "2026-11-03T16:45:00.000Z",
        "lastActiveAt": "2026-11-03T16:45:00.000Z",
        "periodEnd": "2026-11-17T16:45:00.000Z",
        "totalBranches": 1,
        "branches": [
          {
            "id": "239fd2c2-bb61-4850-898e-307aa79e6d81",
            "branchName": "Main Branch",
            "branchCode": "MAIN",
            "isMainBranch": true,
            "isActive": true,
            "userCount": 1
          }
        ],
        "branchCount": 1,
        "activeStaffCount": 1,
        "monthlyGmvInr": 45000.00,
        "totalCollectedRevenueInr": 0,
        "mrrContributionInr": 0,
        "isSuspended": false,
        "suspensionReason": null
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 20,
      "totalPages": 1
    }
  }
}
```

### 4.2 Single Workspace Deep-Dive
`GET /api/v1/workspaces/:id`
- **Response 200 OK:** Returns workspace profile, legal business settings, active subscription details, branch list, and historical suspension ledger.

### 4.3 Workspace Member Roster
`GET /api/v1/workspaces/:id/members`
- **Response 200 OK:**
```json
{
  "success": true,
  "data": [
    {
      "id": "6c2fe825-cf47-440e-a656-d803620d3237",
      "employee_id": "VST-EMP-001",
      "name": "Aarav Sharma",
      "email": "synthetic.tenant1@staging.vistaar.internal",
      "phone": "9876543211",
      "role": "owner",
      "status": "Active",
      "created_at": "2026-11-03T16:45:00.000Z"
    }
  ]
}
```

### 4.4 Workspace Retail Activity
`GET /api/v1/workspaces/:id/activity`
- **Response 200 OK:** Returns recent retail invoices, total customer count, product count, and cumulative workspace GMV.

---

## 5. Administrative Control Actions

### 5.1 Suspend Workspace
`POST /api/v1/workspaces/:id/suspend`
- **Payload:**
```json
{
  "reason": "Suspected breach of Terms of Service / Non-payment"
}
```
- **Operations Performed:**
  1. Sets `workspaces.is_active = FALSE`.
  2. Inserts authoritative record into `platform_workspace_suspensions` (`is_active_suspension = TRUE`).
  3. Writes immutable entry into `platform_audit_logs`.
- **Response 200 OK:**
```json
{
  "success": true,
  "message": "Workspace suspended successfully",
  "workspace_id": "239fd2c2-bb61-4850-898e-307aa79e6d81"
}
```

### 5.2 Reactivate Workspace
`POST /api/v1/workspaces/:id/reactivate`
- **Operations Performed:**
  1. Sets `workspaces.is_active = TRUE`.
  2. Updates `platform_workspace_suspensions` (`is_active_suspension = FALSE`).
  3. Writes immutable entry into `platform_audit_logs`.
- **Response 200 OK:**
```json
{
  "success": true,
  "message": "Workspace reactivated successfully",
  "workspace_id": "239fd2c2-bb61-4850-898e-307aa79e6d81"
}
```

---

## 6. Global User, Subscription & Payment Feeds

### 6.1 Users Roster
`GET /api/v1/users?search=<query>`
- **Response 200 OK:** Array of platform users across all workspaces with business name, role, phone, and status.

### 6.2 Subscriptions Roster
`GET /api/v1/subscriptions`
- **Response 200 OK:** Array of all workspace subscriptions joined with canonical plan pricing and owner details.

### 6.3 Payments Ledger
`GET /api/v1/payments`
- **Response 200 OK:** Array of all verified SaaS payments and transaction references.

---

## 7. Error Handling & Standard Error Codes

All errors return a standardized JSON schema:
```json
{
  "success": false,
  "error": "FORBIDDEN_INSUFFICIENT_PRIVILEGES",
  "message": "Forbidden: Only active Super Admins can perform this operation."
}
```

| HTTP Status | Error Code | Description |
| :--- | :--- | :--- |
| `400` | `INVALID_PARAMETER` | Malformed UUID or invalid request parameters. |
| `401` | `UNAUTHORIZED` | Missing or invalid Supabase Auth Bearer token. |
| `401` | `INVALID_GCAP_SIGNATURE` | Invalid HMAC-SHA256 assertion signature. |
| `401` | `ASSERTION_TIMESTAMP_EXPIRED` | GCAP timestamp skewed beyond allowable 30-second window. |
| `403` | `FORBIDDEN_INSUFFICIENT_PRIVILEGES` | Current role lacks required permissions. |
| `403` | `MFA_ASSURANCE_REQUIRED` | Operation requires AAL2 session assurance. |
| `404` | `NOT_FOUND` | Workspace, user, or resource does not exist. |
| `409` | `CONFLICT_REPLAY_OR_DUPLICATE` | Nonce already consumed or identity conflict. |
| `413` | `PAYLOAD_TOO_LARGE` | Request body exceeds 16KB strict boundary. |
| `429` | `RATE_LIMIT_EXCEEDED` | Request rate exceeded (burst protection). |
| `500` | `SERVER_ERROR` | Internal gateway error. Raw error details safely sanitized. |

