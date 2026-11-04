# VISTAAR Super Admin — Frontend to Gateway BFF API Contract Specification
**Document Version:** 3.0.0  
**Target Domain:** `admin.vistaarone.com`  
**Backend Protocol:** HTTPS / JSON REST with Gateway Cryptographic Assertion Protocol (GCAP)  
**Security Boundary:** Client never connects directly to Supabase with service-role keys. All requests route through the Gateway BFF (`gateway.admin.vistaarone.com`).

---

## 1. Authentication & Security Headers

All outgoing requests from the Super Admin frontend must include the verified session bearer token and, for state-mutating requests, the single-use GCAP assertion nonce.

```http
Authorization: Bearer <JWT_ACCESS_TOKEN>
X-Admin-Role: <super_admin | billing_admin | support_agent>
X-GCAP-Nonce: <UUIDv4_NONCE>          # Required for POST, PUT, PATCH, DELETE
X-GCAP-Timestamp: <ISO_8601_TIMESTAMP> # Checked against 30s skew window
Content-Type: application/json
```

---

## 2. API Endpoints by Module

### 2.1 Overview & Metrics (`/api/v1/overview`)

#### `GET /api/v1/overview/metrics`
Retrieves consolidated platform metrics with strict revenue segregation.
- **Access:** `super_admin`, `billing_admin`, `support_agent`
- **Response `200 OK`:**
```json
{
  "totalBusinesses": 1248,
  "activeBusinesses": 1184,
  "suspendedBusinesses": 64,
  "totalUsers": 4892,
  "activeSubscriptions": 1112,
  "trialSubscriptions": 92,
  "expiredSubscriptions": 44,
  "pendingRenewals": 78,
  "platformCollectedRevenueInr": 4825900.00,
  "gstComponentInr": 736154.24,
  "netPlatformRevenueInr": 4089745.76,
  "failedPaymentsCount": 19,
  "totalRefundsInr": 34990.00,
  "mrrInr": 428500.00,
  "arrInr": 5142000.00,
  "tenantSalesGmvInr": 142850000.00
}
```

#### `GET /api/v1/overview/revenue-trends?months=6`
Returns monthly gross collections, net revenue, and merchant GMV.
- **Response `200 OK`:**
```json
[
  { "month": "Jun 2026", "platformRevenue": 342000, "netRevenue": 289830, "gmvInCrores": 9.8 },
  { "month": "Jul 2026", "platformRevenue": 368000, "netRevenue": 311864, "gmvInCrores": 10.4 },
  { "month": "Nov 2026", "platformRevenue": 482590, "netRevenue": 408974, "gmvInCrores": 14.3 }
]
```

---

### 2.2 Business Management (`/api/v1/businesses`)

#### `GET /api/v1/businesses?status={status}&plan={plan}&search={query}&page={page}&pageSize={pageSize}`
Search and paginated listing of tenant businesses.
- **Response `200 OK`:**
```json
{
  "data": [
    {
      "id": "ws-101",
      "legalName": "Apex Retail India Pvt Ltd",
      "organizationId": "org-01",
      "ownerName": "Rajesh Sharma",
      "ownerEmail": "rajesh.sharma@apexretail.in",
      "ownerPhone": "+91 98201 44521",
      "status": "Active",
      "planId": "business",
      "planName": "Business Annual",
      "billingInterval": "annual",
      "subscriptionStatus": "active",
      "periodEnd": "2026-11-04T23:59:59Z",
      "totalBranches": 4,
      "branches": [
        { "id": "br-101-1", "branchName": "Apex Flagship", "branchCode": "MUM-01", "isMainBranch": true, "isActive": true, "userCount": 8 }
      ],
      "monthlyGmvInr": 2840000.00,
      "totalCollectedRevenueInr": 49980.00,
      "registeredAt": "2025-11-04T10:15:00Z",
      "lastActiveAt": "2026-11-01T15:20:00Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 10, "total": 1248 }
}
```

#### `POST /api/v1/businesses/{workspaceId}/suspend`
Executes workspace suspension with cryptographic membership snapshot.
- **Access:** `super_admin` only
- **Headers:** `X-GCAP-Nonce` required
- **Request Body:**
```json
{
  "reason": "Repeated payment decline and non-response to compliance verification"
}
```
- **Response `200 OK`:**
```json
{
  "success": true,
  "workspaceId": "ws-103",
  "status": "Suspended",
  "suspensionDetails": {
    "suspendedAt": "2026-11-01T18:00:00Z",
    "suspendedBy": "admin@vistaarone.com",
    "reason": "Repeated payment decline...",
    "suspendedMembershipsCount": 2,
    "suspendedProfilesCount": 2
  }
}
```

#### `POST /api/v1/businesses/{workspaceId}/reactivate`
Reinstates workspace and snapshotted staff.
- **Access:** `super_admin` only
- **Headers:** `X-GCAP-Nonce` required
- **Response `200 OK`:**
```json
{
  "success": true,
  "workspaceId": "ws-103",
  "status": "Active",
  "reinstatedMembershipsCount": 2
}
```

---

### 2.3 User Management (`/api/v1/users`)

#### `GET /api/v1/users/tenant?search={query}&page={page}`
- **Response `200 OK`:** Array of `TenantUser` objects with associated workspace memberships.

#### `POST /api/v1/users/tenant/{userId}/trigger-password-reset`
Dispatches a time-limited (15m) secure recovery email via the Supabase Auth dispatch engine.
- **Response `200 OK`:** `{ "success": true, "dispatchedTo": "user@domain.com" }`

---

### 2.4 Subscriptions & Plan Overrides (`/api/v1/subscriptions`)

#### `GET /api/v1/subscriptions?status={status}&page={page}`
Returns subscriptions across all 8 canonical states.

#### `POST /api/v1/subscriptions/{subscriptionId}/override`
Applies administrative plan tier adjustment or grace period extension.
- **Access:** `super_admin` only
- **Headers:** `X-GCAP-Nonce` required
- **Request Body:**
```json
{
  "newPlanId": "growth",
  "extensionDays": 30,
  "reason": "Approved pilot extension per enterprise partner agreement"
}
```
- **Response `200 OK`:** Updated `Subscription` record with `isManualOverride: true`.

---

### 2.5 Payments & Settlements (`/api/v1/payments`)

#### `GET /api/v1/payments?status={status}&page={page}`
- **Response `200 OK`:**
```json
{
  "data": [
    {
      "id": "tx-301",
      "transactionReference": "YOUPI_TX_20261101_882910",
      "workspaceId": "ws-101",
      "workspaceName": "Apex Retail India Pvt Ltd",
      "customerEmail": "rajesh.sharma@apexretail.in",
      "amountInr": 22491.00,
      "currency": "INR",
      "provider": "youpi_pg",
      "status": "verified_success",
      "planId": "business",
      "couponRedemptionId": "red-401",
      "couponCode": "ANNUAL10",
      "verifiedAt": "2026-11-01T10:15:32Z",
      "createdAt": "2026-11-01T10:14:45Z"
    }
  ],
  "reconciliationSummary": {
    "totalCapturedInr": 4825900.00,
    "totalRefundsInr": 34990.00,
    "gstLiabilityInr": 736154.24,
    "netPlatformSettlementInr": 4089745.76
  }
}
```

---

### 2.6 Coupons & Promotional Campaigns (`/api/v1/coupons`)

#### `GET /api/v1/coupons`
Returns active and archived coupon campaigns with real-time quota usage.

#### `POST /api/v1/coupons`
Creates a promotional coupon campaign.
- **Access:** `super_admin`, `billing_admin`
- **Headers:** `X-GCAP-Nonce` required
- **Request Body:**
```json
{
  "code": "FESTIVE2026",
  "name": "Festive Discount 2026",
  "discountType": "percentage",
  "discountValue": 20,
  "maxDiscountCapInr": 1500,
  "minPurchaseAmountInr": 2000,
  "applicablePlans": ["business", "growth"],
  "applicableInterval": "annual",
  "customerTargeting": "all",
  "validFrom": "2026-11-01T00:00:00Z",
  "validUntil": "2026-12-01T23:59:59Z",
  "maxTotalRedemptions": 500,
  "maxRedemptionsPerWorkspace": 1
}
```
- **Response `201 Created`:** Created `Coupon` object.

#### `GET /api/v1/coupons/redemptions?page={page}`
Returns the immutable coupon redemption audit ledger.

---

### 2.7 Security & Audit Logs (`/api/v1/security`)

#### `GET /api/v1/security/audit-logs?action={action}&admin={email}&page={page}`
Returns append-only audit entries containing verified GCAP nonces, admin identities, and before/after state snapshots.
- **Access:** `super_admin` only

---

### 2.8 System Health (`/api/v1/system/health`)

#### `GET /api/v1/system/health`
Probes all 6 infrastructure clusters and reports latency, SLO compliance, and active incidents.
- **Response `200 OK`:** Array of `SystemServiceHealth` and active `Incident` records.

---

## 3. Standard Error Envelope

When an API error occurs, the Gateway BFF returns:
```json
{
  "error": {
    "code": "GCAP_NONCE_REPLAY_REJECTED",
    "message": "The supplied assertion nonce has already been consumed or has expired beyond the 30-second window.",
    "status": 403,
    "timestamp": "2026-11-01T18:05:00Z",
    "requestId": "req-99021-gcap"
  }
}
```

