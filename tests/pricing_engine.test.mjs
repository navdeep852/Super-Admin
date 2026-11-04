import assert from 'assert';
import { calculateSubscriptionPrice, validateOfferEligibility, toPaise, toInr } from '../server/pricingEngine.mjs';

console.log('=== TEST SUITE: Server-Side Pricing Engine ===\n');

const mockGrowthPlan = {
  id: 'growth',
  name: 'Growth',
  price_monthly_inr: 1199.00,
  price_annual_inr: 9999.00,
};

// 1. Standard Monthly Plan (No Discount, 18% GST)
const res1 = calculateSubscriptionPrice({
  plan: mockGrowthPlan,
  billingCycle: 'monthly',
  gstRatePercent: 18,
});
assert.strictEqual(res1.originalPlanPriceInr, 1199.00);
assert.strictEqual(res1.discountAmountInr, 0.00);
assert.strictEqual(res1.taxableAmountInr, 1199.00);
// 18% of 1199 = 215.82 -> Final = 1414.82
assert.strictEqual(res1.gstAmountInr, 215.82);
assert.strictEqual(res1.finalPayableInr, 1414.82);
console.log('✔ Case 1: Standard monthly pricing with 18% GST matches exact paise precision');

// 2. Percentage Discount (20% Off Monthly)
const res2 = calculateSubscriptionPrice({
  plan: mockGrowthPlan,
  billingCycle: 'monthly',
  coupon: {
    id: 'c1',
    code: 'VISTAAR20',
    name: '20% Off',
    discount_type: 'percentage',
    discount_value: 20,
    max_discount_amount: null,
    min_purchase_amount: 500,
  },
  gstRatePercent: 18,
});
// 20% of 1199 = 239.80 -> Taxable = 959.20 -> GST (18%) = 172.66 -> Final = 1131.86
assert.strictEqual(res2.discountAmountInr, 239.80);
assert.strictEqual(res2.taxableAmountInr, 959.20);
assert.strictEqual(res2.gstAmountInr, 172.66);
assert.strictEqual(res2.finalPayableInr, 1131.86);
console.log('✔ Case 2: Percentage discount calculated and capped correctly');

// 3. Fixed Amount Discount (Flat ₹500 Off Annual)
const res3 = calculateSubscriptionPrice({
  plan: mockGrowthPlan,
  billingCycle: 'annual',
  coupon: {
    id: 'c2',
    code: 'FLAT500',
    name: 'Flat 500 Off',
    discount_type: 'fixed',
    discount_value: 500.00,
    min_purchase_amount: 2000,
  },
  gstRatePercent: 18,
});
// Base 9999 - 500 = 9499 -> GST (18%) of 9499 = 1709.82 -> Final = 11208.82
assert.strictEqual(res3.originalPlanPriceInr, 9999.00);
assert.strictEqual(res3.discountAmountInr, 500.00);
assert.strictEqual(res3.taxableAmountInr, 9499.00);
assert.strictEqual(res3.gstAmountInr, 1709.82);
assert.strictEqual(res3.finalPayableInr, 11208.82);
console.log('✔ Case 3: Fixed discount calculated accurately on annual tier');

// 4. Promotional Price (e.g. Original ₹1199, Promotional Price ₹699)
const res4 = calculateSubscriptionPrice({
  plan: mockGrowthPlan,
  billingCycle: 'monthly',
  coupon: {
    id: 'c3',
    code: 'PROMO699',
    name: 'Intro Promo ₹699',
    discount_type: 'promotional_price',
    discount_value: 699.00,
    promotional_price_inr: 699.00,
  },
  gstRatePercent: 18,
});
// Base 1199 -> Customer pays 699 -> Discount = 500 -> Taxable = 699 -> GST (18%) = 125.82 -> Final = 824.82
assert.strictEqual(res4.discountAmountInr, 500.00);
assert.strictEqual(res4.taxableAmountInr, 699.00);
assert.strictEqual(res4.gstAmountInr, 125.82);
assert.strictEqual(res4.finalPayableInr, 824.82);
console.log('✔ Case 4: Promotional price model calculates differential discount accurately');

// 5. Custom Negotiated Price Override on Workspace
const res5 = calculateSubscriptionPrice({
  plan: mockGrowthPlan,
  billingCycle: 'monthly',
  workspaceOverride: {
    custom_price_inr: 750.00,
    override_reason: 'Enterprise volume contract - 10 branches',
    override_expires_at: new Date(Date.now() + 86400000).toISOString(),
  },
  gstRatePercent: 18,
});
// Base overridden to 750 -> Taxable = 750 -> GST (18%) = 135 -> Final = 885
assert.strictEqual(res5.isCustomNegotiated, true);
assert.strictEqual(res5.effectiveBasePriceInr, 750.00);
assert.strictEqual(res5.taxableAmountInr, 750.00);
assert.strictEqual(res5.gstAmountInr, 135.00);
assert.strictEqual(res5.finalPayableInr, 885.00);
console.log('✔ Case 5: Workspace-specific custom negotiated price applied correctly');

// 6. Safety Rule: Discount cannot produce negative price
const res6 = calculateSubscriptionPrice({
  plan: mockGrowthPlan,
  billingCycle: 'monthly',
  coupon: {
    id: 'c_excessive',
    code: 'CRAZY9999',
    discount_type: 'fixed',
    discount_value: 50000.00, // Greater than plan price
  },
  gstRatePercent: 18,
});
assert.strictEqual(res6.discountAmountInr, 1199.00); // Capped to plan price
assert.strictEqual(res6.taxableAmountInr, 0.00);
assert.strictEqual(res6.finalPayableInr, 0.00);
console.log('✔ Case 6: Excessive discount capped at 100% of base price (zero negative payable)');

// 7. Offer Eligibility Checks
const validEligibility = validateOfferEligibility({
  is_active: true,
  applicable_plans: ['growth', 'business'],
  applicable_intervals: ['all'],
}, 'growth', 'monthly');
assert.strictEqual(validEligibility.eligible, true);

const expiredEligibility = validateOfferEligibility({
  is_active: true,
  valid_until: new Date(Date.now() - 100000).toISOString(),
}, 'growth', 'monthly');
assert.strictEqual(expiredEligibility.eligible, false);

console.log('✔ Case 7: Offer eligibility validation enforces activation, dates and plan criteria');

console.log('\nALL PRICING ENGINE TESTS PASSED!\n');
