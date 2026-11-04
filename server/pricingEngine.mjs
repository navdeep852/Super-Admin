// ==============================================================================
// VISTAAR Super Admin — Authoritative Server-Side Pricing Engine
// Integer-Paise Precision Financial Engine (RFC compliant currency arithmetic)
// ==============================================================================

/**
 * Converts an INR currency amount (e.g. 799.20) to integer paise (79920).
 */
export function toPaise(amountInr) {
  if (amountInr === null || amountInr === undefined || isNaN(Number(amountInr))) {
    return 0;
  }
  return Math.round(Number(amountInr) * 100);
}

/**
 * Converts integer paise back to INR float representation rounded to 2 decimals.
 */
export function toInr(paise) {
  return Number((paise / 100).toFixed(2));
}

/**
 * Calculates authoritative subscription pricing breakdown using integer paise.
 *
 * @param {Object} params
 * @param {Object} params.plan - Plan record from subscription_plans
 * @param {string} params.billingCycle - 'monthly' | 'annual'
 * @param {Object} [params.coupon] - Validated coupon/offer record from coupons table
 * @param {Object} [params.workspaceOverride] - Active custom price override if applicable
 * @param {number} [params.gstRatePercent=18] - Applicable statutory GST rate (default 18%)
 * @returns {Object} Complete detailed price breakdown and immutable snapshot
 */
export function calculateSubscriptionPrice({
  plan,
  billingCycle = 'monthly',
  coupon = null,
  workspaceOverride = null,
  gstRatePercent = 18,
}) {
  if (!plan) {
    throw new Error('Valid subscription plan is required for pricing calculation');
  }

  const cycle = billingCycle.toLowerCase() === 'annual' ? 'annual' : 'monthly';

  // 1. Determine base plan price in integer paise
  const rawPlanPriceInr = cycle === 'annual'
    ? Number(plan.price_annual_inr || 0)
    : Number(plan.price_monthly_inr || 0);

  let originalPlanPricePaise = toPaise(rawPlanPriceInr);
  let basePricePaise = originalPlanPricePaise;
  let isCustomNegotiated = false;
  let customPriceReason = null;

  // 2. Check for active workspace-specific negotiated price override
  if (workspaceOverride && workspaceOverride.custom_price_inr !== null && workspaceOverride.custom_price_inr !== undefined) {
    const overrideExpiry = workspaceOverride.override_expires_at ? new Date(workspaceOverride.override_expires_at) : null;
    const isOverrideActive = !overrideExpiry || overrideExpiry > new Date();

    if (isOverrideActive) {
      basePricePaise = toPaise(workspaceOverride.custom_price_inr);
      isCustomNegotiated = true;
      customPriceReason = workspaceOverride.override_reason || 'Custom negotiated corporate rate';
    }
  }

  // 3. Evaluate Discount / Offer (if provided and applicable)
  let discountPaise = 0;
  let discountType = null;
  let discountValueApplied = 0;
  let offerId = null;
  let couponCode = null;

  if (coupon) {
    offerId = coupon.id;
    couponCode = coupon.code;
    discountType = coupon.discount_type;

    // Minimum purchase constraint check
    const minPurchasePaise = toPaise(coupon.min_purchase_amount || 0);
    if (basePricePaise < minPurchasePaise) {
      throw new Error(`Minimum purchase amount of ₹${toInr(minPurchasePaise)} is required to redeem offer '${coupon.code}'`);
    }

    if (coupon.discount_type === 'percentage') {
      const pct = Math.min(100, Math.max(0, Number(coupon.discount_value || 0)));
      discountValueApplied = pct;
      discountPaise = Math.round((basePricePaise * pct) / 100);

      // Enforce max discount cap if configured
      if (coupon.max_discount_amount) {
        const capPaise = toPaise(coupon.max_discount_amount);
        if (discountPaise > capPaise) {
          discountPaise = capPaise;
        }
      }
    } else if (coupon.discount_type === 'fixed') {
      const fixedPaise = toPaise(coupon.discount_value || 0);
      discountValueApplied = Number(coupon.discount_value || 0);
      // Fixed discount cannot exceed base price
      discountPaise = Math.min(fixedPaise, basePricePaise);
    } else if (coupon.discount_type === 'promotional_price') {
      const promoPaise = toPaise(coupon.promotional_price_inr || coupon.discount_value || 0);
      discountValueApplied = toInr(promoPaise);
      // Customer pays promo price: discount = basePrice - promoPrice
      discountPaise = Math.max(0, basePricePaise - promoPaise);
    }

    // Safety rule: Discount cannot exceed the applicable base price
    discountPaise = Math.min(discountPaise, basePricePaise);
  }

  // 4. Calculate Net Taxable Price (Paise)
  const taxablePaise = Math.max(0, basePricePaise - discountPaise);

  // 5. Calculate Statutory GST (Paise)
  const effectiveGstRate = Number(gstRatePercent || 0);
  const gstPaise = effectiveGstRate > 0
    ? Math.round((taxablePaise * effectiveGstRate) / 100)
    : 0;

  // 6. Calculate Final Payable Amount (Paise)
  const finalPayablePaise = taxablePaise + gstPaise;

  // 7. Format Output & Snapshot
  const breakdown = {
    planId: plan.id,
    planName: plan.name,
    billingCycle: cycle,
    currency: 'INR',
    originalPlanPriceInr: toInr(originalPlanPricePaise),
    effectiveBasePriceInr: toInr(basePricePaise),
    isCustomNegotiated,
    customPriceReason,
    offer: coupon ? {
      id: offerId,
      code: couponCode,
      name: coupon.name,
      discountType: discountType,
      discountValue: discountValueApplied,
    } : null,
    discountAmountInr: toInr(discountPaise),
    taxableAmountInr: toInr(taxablePaise),
    gstRatePercent: effectiveGstRate,
    gstAmountInr: toInr(gstPaise),
    finalPayableInr: toInr(finalPayablePaise),
    // Paise figures for high-precision audit storage
    raw: {
      originalPlanPricePaise,
      effectiveBasePricePaise: basePricePaise,
      discountPaise,
      taxablePaise,
      gstPaise,
      finalPayablePaise,
    },
    snapshotTimestamp: new Date().toISOString(),
  };

  return breakdown;
}

/**
 * Validates offer eligibility against a plan, billing interval, and workspace.
 */
export function validateOfferEligibility(coupon, planId, billingInterval, workspaceId = null) {
  if (!coupon || !coupon.is_active) {
    return { eligible: false, reason: 'Offer is currently inactive' };
  }

  const now = new Date();
  if (coupon.valid_from && new Date(coupon.valid_from) > now) {
    return { eligible: false, reason: 'Offer has not yet started' };
  }

  if (coupon.valid_until && new Date(coupon.valid_until) < now) {
    return { eligible: false, reason: 'Offer has expired' };
  }

  // Check applicable plans
  const applicablePlans = coupon.applicable_plans || ['all'];
  if (!applicablePlans.includes('all') && !applicablePlans.includes(planId)) {
    return { eligible: false, reason: `Offer is not applicable to plan '${planId}'` };
  }

  // Check applicable billing intervals
  const applicableIntervals = coupon.applicable_intervals || ['all'];
  if (!applicableIntervals.includes('all') && !applicableIntervals.includes(billingInterval)) {
    return { eligible: false, reason: `Offer is not applicable to '${billingInterval}' billing cycle` };
  }

  // Check workspace specific targeting
  if (coupon.target_workspace_id && coupon.target_workspace_id !== workspaceId) {
    return { eligible: false, reason: 'Offer is restricted to an authorized target workspace' };
  }

  return { eligible: true };
}

