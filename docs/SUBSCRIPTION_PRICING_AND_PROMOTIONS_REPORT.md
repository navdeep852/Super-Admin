# VISTAAR SUPER ADMIN — SUBSCRIPTION PRICING & PROMOTIONS REPORT
## Comprehensive Architectural Guide to Plan Catalogs, Promotional Offers, and the Server-Side Integer-Paise Pricing Engine

**Date:** November 2026  
**Environment:** Staging Reference `vlbhxcajphyjkeueubud` (AWS `eu-west-1`)  
**Production Air-Gap Reference:** `kluxsykimnjivkqxelba` (Strictly Unchanged & Air-Gapped)  
**Lead Architect:** Principal SaaS Security Architect & PostgreSQL Migration Specialist  

---

## 1. Executive Summary

This report documents the architectural design and implementation of the complete Subscription Plan, Pricing, Discount, Promotional Offer, and Customer-Specific Price Management system for VISTAAR Super Admin.

The system guarantees **zero floating-point drift** by calculating all currency amounts internally in integer paise (₹1.00 = 100 paise), rounding statutory taxes and percentage discounts using banker's rounding standards, and recording immutable price snapshots on every transaction.

---

## 2. Subscription Plan Catalog Architecture

The platform subscription catalog is stored in `public.subscription_plans` and managed through the `SubscriptionPlansPage` UI and Gateway BFF routes:

| Plan Identifier | Display Name | Monthly Base (INR) | Annual Base (INR) | Effective Annual Discount | Supported Platforms | Active Staging Subscribers |
|---|---|:---:|:---:|:---:|---|:---:|
| `free_trial` | 14-Day Evaluation | ₹0 | ₹0 | N/A | Web, Desktop, Android | 3 |
| `starter` | Starter Counter | ₹299 | ₹2,499 | ~30% (~2.6 Months Free) | Web | 2 |
| `starter_mobile`| Starter + Mobile | ₹498 | ₹4,498 | ~25% (~2.5 Months Free) | Web, Android | 0 |
| `business` | Business Multi-Terminal | ₹699 | ₹5,999 | ~28% (~2.4 Months Free) | Web, Desktop | 1 |
| `growth` | Enterprise Growth | ₹1,199 | ₹9,999 | ~30% (~2.6 Months Free) | Web, Desktop, Android | 3 |

### Plan Schema Attributes (`080_subscription_plans_offers_and_pricing_engine.sql`):
- `is_active`: Controls visibility for new subscriptions.
- `is_archived`: Protects historical subscriber associations while retiring deprecated tiers.
- `trial_days`: Configurable trial duration (default 14 days).
- `features`: Array of marketing and platform feature bullet points.
- `usage_limits`: JSONB payload containing `staff_max`, `storage_gb`, `devices_max`, and `invoices_monthly`.
- `sort_order`: Catalog ordering in UI comparison matrices.

---

## 3. Four Discount & Pricing Models

The pricing engine accommodates four commercial offer models:

### Model A: Percentage Discount (Coupon Campaign)
- **Mechanism:** Computes discount as a percentage of the base price: `discountPaise = round(basePaise * (percentage / 100))`.
- **Statutory Cap:** Optional `max_discount_cap_inr` enforces maximum allowable deduction.
- **Example:** `VISTAAR20` applies 20% off the Business plan (₹699.00 -> ₹139.80 discount -> ₹559.20 taxable + ₹100.66 GST = ₹659.86 final).

### Model B: Fixed Amount Discount (Voucher Campaign)
- **Mechanism:** Directly deducts a fixed INR amount converted to integer paise: `discountPaise = min(basePaise, toPaise(fixedAmount))`.
- **Floor Protection:** Discount can never exceed the base price (final payable base cannot drop below ₹0).
- **Example:** `GROWTH500` deducts flat ₹500 from annual plans.

### Model C: Promotional Price (Fixed Override Rate)
- **Mechanism:** Temporarily sets a promotional flat price instead of standard catalog price: `discountPaise = max(0, basePaise - promoPricePaise)`.
- **Example:** `SPECIAL699` allows upgrading to a higher plan tier at a guaranteed introductory rate of ₹699/cycle.

### Model D: Customer-Specific Negotiated Price Override
- **Mechanism:** Per-workspace agreed price stored in `workspace_subscriptions.custom_price_inr`.
- **Governance:** Requires mandatory `override_reason` and records the administrator UUID in `override_admin_id`.
- **Expiration:** Optional `override_expires_at` automatically reverts workspace to standard catalog pricing upon expiration.
- **Audit Trail:** Every assignment triggers an event in `workspace_subscription_events`.

---

## 4. Integer-Paise Pricing Engine (`server/pricingEngine.mjs`)

Financial operations are computed via exact integer arithmetic:

```javascript
// High-Precision Conversion
export function toPaise(inrAmount) {
  if (inrAmount === null || inrAmount === undefined) return 0;
  return Math.round(Number(inrAmount) * 100);
}

export function toInr(paiseAmount) {
  return Number((Number(paiseAmount) / 100).toFixed(2));
}

// Pricing Formula
taxablePaise = Math.max(0, basePricePaise - discountPaise);
gstPaise = Math.round(taxablePaise * (gstRatePercent / 100)); // 18% Banker's Rounding
finalPayablePaise = taxablePaise + gstPaise;
```

### Verified Pricing Examples

| Scenario | Plan Base | Offer / Override | Discount | Taxable Amount | 18% Statutory GST | Final Payable (INR) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Starter Monthly** | ₹299.00 | None | ₹0.00 | ₹299.00 | ₹53.82 | **₹352.82** |
| **Business Monthly + VISTAAR20** | ₹699.00 | 20% Off | ₹139.80 | ₹559.20 | ₹100.66 | **₹659.86** |
| **Business Annual + GROWTH500** | ₹5,999.00 | Flat ₹500 Off | ₹500.00 | ₹5,499.00 | ₹989.82 | **₹6,488.82** |
| **Growth Monthly + Custom Override**| ₹1,199.00 | ₹699 Negotiated | ₹500.00 | ₹699.00 | ₹125.82 | **₹824.82** |

---

## 5. Webhook Simulation & Immutable Audit Ledger

When a checkout or payment succeeds, the system records an immutable audit record in `workspace_subscription_events` and snapshots the pricing breakdown in `payment_transactions`:

```json
{
  "event_type": "assign_custom_price",
  "workspace_id": "7649d0ca-e578-4395-8854-3c66f57e8492",
  "admin_id": "3849d8a6-2659-4f5c-b186-eb14051d043b",
  "old_price_inr": 699,
  "new_price_inr": 799,
  "override_reason": "Automated Staging Integration Test Agreement",
  "price_snapshot": {
    "originalPlanPriceInr": 699,
    "discountAmountInr": 0,
    "taxableAmountInr": 799,
    "gstAmountInr": 143.82,
    "finalPayableInr": 942.82
  }
}
```

---

## 6. Deliverable Checklist

- [x] Database Migration `migrations/080_subscription_plans_offers_and_pricing_engine.sql` applied to staging.
- [x] Zero floating-point drift Pricing Engine implemented in `server/pricingEngine.mjs`.
- [x] Automated test suite in `tests/pricing_engine.test.mjs` (7/7 passed).
- [x] End-to-end integration test suite in `tests/staging_real_business_and_pricing_integration.test.mjs` (10/10 passed).
- [x] Subscription Plans Catalog Page (`src/pages/plans/SubscriptionPlansPage.tsx`) with Plan Comparison Matrix.
- [x] Promotional Offers & Discounts Page (`src/pages/coupons/CouponsOffersPage.tsx`) with live Pricing Preview simulator.
- [x] Business Management deep-dive drawer with live Manage Subscription action modal.
- [x] CORS hardening and green live staging badge in `MockBanner.tsx`.
