import fs from 'fs';
import path from 'path';

const gatewayPath = path.resolve('server/gateway.mjs');
let content = fs.readFileSync(gatewayPath, 'utf8');

// 1. Add pricingEngine import if not present
if (!content.includes("from './pricingEngine.mjs'")) {
  content = content.replace(
    "import { createClient } from '@supabase/supabase-js';",
    "import { createClient } from '@supabase/supabase-js';\nimport { calculateSubscriptionPrice, validateOfferEligibility, toPaise, toInr } from './pricingEngine.mjs';"
  );
}

// 2. Enhance GET /api/v1/workspaces/:id to include payment_transactions and workspace_subscription_events
const oldWsDetailEnd = `      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          workspace: ws,
          businessSettings: Array.isArray(ws.business_settings) ? ws.business_settings[0] : ws.business_settings,
          subscription: Array.isArray(ws.workspace_subscriptions) ? ws.workspace_subscriptions[0] : ws.workspace_subscriptions,
          employees: employees || [],
          recentInvoices: invData || [],
          suspensions: suspensions || [],
          auditLogs: auditLogs || [],
          metrics: {
            memberCount: (employees || []).length,
            invoiceCount: (invData || []).length,
            totalGmvInr: totalGmv,
            totalCollectedInr: totalCollected,
            totalOutstandingInr: totalOutstanding
          }
        }
      }));`;

const newWsDetailEnd = `      // 5. Payment transactions for this workspace
      const { data: wsPayments } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      // 6. Subscription events / audit history for this workspace
      const { data: wsSubEvents } = await supabase
        .from('workspace_subscription_events')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      const subObj = Array.isArray(ws.workspace_subscriptions) ? ws.workspace_subscriptions[0] : ws.workspace_subscriptions;
      const effectivePrice = subObj?.custom_price_inr 
        ? Number(subObj.custom_price_inr) 
        : Number(subObj?.subscription_plans?.price_monthly_inr || 0);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          workspace: ws,
          businessSettings: Array.isArray(ws.business_settings) ? ws.business_settings[0] : ws.business_settings,
          subscription: subObj ? {
            ...subObj,
            effectivePriceInr: effectivePrice,
            pricingModel: subObj.pricing_model || (subObj.custom_price_inr ? 'custom_negotiated' : 'standard')
          } : null,
          employees: employees || [],
          recentInvoices: invData || [],
          paymentTransactions: wsPayments || [],
          subscriptionEvents: wsSubEvents || [],
          suspensions: suspensions || [],
          auditLogs: auditLogs || [],
          metrics: {
            memberCount: (employees || []).length,
            invoiceCount: (invData || []).length,
            totalGmvInr: totalGmv,
            totalCollectedInr: totalCollected,
            totalOutstandingInr: totalOutstanding,
            effectiveSubscriptionPriceInr: effectivePrice
          }
        }
      }));`;

const normalize = s => s.replace(/\r\n/g, '\n');
content = normalize(content).replace(normalize(oldWsDetailEnd), normalize(newWsDetailEnd));

// 3. New routes to append before "// Fallback 404"
const newRoutes = `
  // ---------------------------------------------------------------------------
  // Route: Workspace Subscription Management Action (Upgrade, Downgrade, Overrides)
  // ---------------------------------------------------------------------------
  const wsSubManageMatch = url.pathname.match(/^\\/api\\/v1\\/workspaces\\/([0-9a-f-]{36})\\/subscription$/i);
  if (wsSubManageMatch && req.method === 'POST') {
    try {
      const wsId = wsSubManageMatch[1];
      const { admin, sessionAal } = await authorizeAdmin(req, ['super_admin', 'billing_admin'], 'aal1');
      const rawBody = await readBoundedBody(req);
      const body = JSON.parse(rawBody || '{}');
      const {
        action,
        plan_id,
        billing_interval = 'monthly',
        custom_price_inr,
        override_reason,
        override_days = 365,
        extension_days = 14,
        coupon_code
      } = body;

      if (!action) {
        const err = new Error('Action is required for workspace subscription management');
        err.statusCode = 400;
        throw err;
      }

      // Fetch current workspace and subscription
      const { data: currentSub, error: subFetchErr } = await supabase
        .from('workspace_subscriptions')
        .select('*, subscription_plans(*)')
        .eq('workspace_id', wsId)
        .single();

      if (subFetchErr || !currentSub) {
        const err = new Error('No active subscription found for this workspace');
        err.statusCode = 404;
        throw err;
      }

      const updateData = { updated_at: new Date().toISOString() };
      let eventType = action;
      let reasonText = override_reason || \`Administrative action: \${action}\`;
      let prevPrice = currentSub.custom_price_inr || currentSub.subscription_plans?.price_monthly_inr;
      let newPrice = prevPrice;

      if (action === 'change_plan' || action === 'upgrade' || action === 'downgrade') {
        if (!plan_id) throw new Error('plan_id is required');
        const { data: targetPlan } = await supabase.from('subscription_plans').select('*').eq('id', plan_id).single();
        if (!targetPlan) throw new Error(\`Target plan '\${plan_id}' does not exist\`);

        updateData.plan_id = plan_id;
        updateData.billing_interval = billing_interval;
        updateData.status = 'active';
        updateData.current_period_start = new Date().toISOString();
        const durationMonths = billing_interval === 'annual' ? 12 : 1;
        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + durationMonths);
        updateData.current_period_end = periodEnd.toISOString();
        newPrice = billing_interval === 'annual' ? targetPlan.price_annual_inr : targetPlan.price_monthly_inr;
      } else if (action === 'extend_trial') {
        const currentTrialEnd = new Date(currentSub.trial_end || Date.now());
        const newTrialEnd = new Date(currentTrialEnd.getTime() + (Number(extension_days || 14) * 86400000));
        updateData.trial_end = newTrialEnd.toISOString();
        updateData.current_period_end = newTrialEnd.toISOString();
        updateData.status = 'trialing';
      } else if (action === 'extend_expiry') {
        const currentEnd = new Date(currentSub.current_period_end || Date.now());
        const newEnd = new Date(currentEnd.getTime() + (Number(extension_days || 30) * 86400000));
        updateData.current_period_end = newEnd.toISOString();
      } else if (action === 'assign_custom_price') {
        if (custom_price_inr === undefined || custom_price_inr === null) {
          throw new Error('custom_price_inr is required for custom price override');
        }
        const expiry = new Date(Date.now() + (Number(override_days || 365) * 86400000));
        updateData.custom_price_inr = Number(custom_price_inr);
        updateData.override_reason = override_reason || 'Custom negotiated corporate pricing';
        updateData.override_admin_id = admin.id;
        updateData.override_expires_at = expiry.toISOString();
        updateData.original_plan_price_inr = currentSub.subscription_plans?.price_monthly_inr || 0;
        updateData.effective_price_inr = Number(custom_price_inr);
        updateData.pricing_model = 'custom_negotiated';
        newPrice = Number(custom_price_inr);
      } else if (action === 'cancel_at_period_end') {
        updateData.cancel_at_period_end = true;
      } else {
        throw new Error(\`Unknown subscription action '\${action}'\`);
      }

      // Update workspace_subscriptions
      const { data: updatedSub, error: updateErr } = await supabase
        .from('workspace_subscriptions')
        .update(updateData)
        .eq('id', currentSub.id)
        .select('*, subscription_plans(*)')
        .single();

      if (updateErr) throw updateErr;

      // Insert into workspace_subscription_events
      await supabase.from('workspace_subscription_events').insert({
        workspace_id: wsId,
        event_type: eventType,
        old_plan_id: currentSub.plan_id,
        new_plan_id: updateData.plan_id || currentSub.plan_id,
        admin_id: admin.id,
        reason: reasonText,
        previous_price_inr: prevPrice ? Number(prevPrice) : null,
        new_price_inr: newPrice ? Number(newPrice) : null,
        metadata: { action, updateData, adminEmail: admin.email }
      });

      // Insert platform audit log
      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: \`WORKSPACE_SUBSCRIPTION_\${action.toUpperCase()}\`,
        target_workspace_id: wsId,
        details: { action, old_plan: currentSub.plan_id, new_plan: updateData.plan_id, newPrice, reason: reasonText },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: \`Subscription \${action} processed successfully\`,
        data: updatedSub
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Subscription Plans Management (List, Create, Update, Archive)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/plans' && req.method === 'GET') {
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent'], 'aal1');

      const { data: plans, error: planErr } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('price_monthly_inr', { ascending: true });

      if (planErr) throw planErr;

      // Count active subscribers for each plan
      const { data: subs } = await supabase
        .from('workspace_subscriptions')
        .select('plan_id, status, billing_interval');

      const activeCounts = {};
      const mrrMap = {};
      (subs || []).forEach(s => {
        if (s.status === 'active' || s.status === 'trialing') {
          activeCounts[s.plan_id] = (activeCounts[s.plan_id] || 0) + 1;
        }
      });

      const enrichedPlans = (plans || []).map(p => {
        const subCount = activeCounts[p.id] || 0;
        const estMrr = subCount * Number(p.price_monthly_inr || 0);
        return {
          ...p,
          priceMonthlyInr: Number(p.price_monthly_inr),
          priceAnnualInr: Number(p.price_annual_inr),
          activeSubscribers: subCount,
          estimatedMonthlyRevenueInr: estMrr,
          features: Array.isArray(p.features) ? p.features : [],
          usageLimits: p.usage_limits || {}
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: enrichedPlans
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  if (url.pathname === '/api/v1/plans' && req.method === 'POST') {
    try {
      const { admin } = await authorizeAdmin(req, ['super_admin'], 'aal1');
      const rawBody = await readBoundedBody(req);
      const body = JSON.parse(rawBody || '{}');
      const {
        id,
        name,
        tagline,
        price_monthly_inr,
        price_annual_inr,
        allowed_platforms = ['web'],
        max_users = 1,
        max_branches = 1,
        features = [],
        usage_limits = {},
        trial_days = 14,
        sort_order = 0
      } = body;

      if (!id || !name || price_monthly_inr === undefined || price_annual_inr === undefined) {
        const err = new Error('Plan id, name, price_monthly_inr, and price_annual_inr are required');
        err.statusCode = 400;
        throw err;
      }

      const planKey = id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

      const { data: newPlan, error } = await supabase
        .from('subscription_plans')
        .insert({
          id: planKey,
          name: name.trim(),
          tagline: tagline || null,
          price_monthly_inr: Number(price_monthly_inr),
          price_annual_inr: Number(price_annual_inr),
          allowed_platforms,
          max_users: Number(max_users || 1),
          max_branches: Number(max_branches || 1),
          features: Array.isArray(features) ? features : [],
          usage_limits: typeof usage_limits === 'object' ? usage_limits : {},
          trial_days: Number(trial_days || 14),
          sort_order: Number(sort_order || 0),
          is_active: true,
          is_archived: false
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'SUBSCRIPTION_PLAN_CREATED',
        details: { plan_id: planKey, name: newPlan.name, monthly: newPlan.price_monthly_inr, annual: newPlan.price_annual_inr },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Subscription plan created successfully',
        data: newPlan
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // Update Plan (PUT /api/v1/plans or /api/v1/plans/:id)
  const planUpdateMatch = url.pathname.match(/^\\/api\\/v1\\/plans(?:\\/([a-z0-9_]+))?$/i);
  if (planUpdateMatch && req.method === 'PUT') {
    try {
      const { admin } = await authorizeAdmin(req, ['super_admin'], 'aal1');
      const rawBody = await readBoundedBody(req);
      const body = JSON.parse(rawBody || '{}');
      const planId = planUpdateMatch[1] || body.id;

      if (!planId) throw new Error('Plan id is required for update');

      const updateFields = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) updateFields.name = body.name.trim();
      if (body.tagline !== undefined) updateFields.tagline = body.tagline;
      if (body.price_monthly_inr !== undefined) updateFields.price_monthly_inr = Number(body.price_monthly_inr);
      if (body.price_annual_inr !== undefined) updateFields.price_annual_inr = Number(body.price_annual_inr);
      if (body.allowed_platforms !== undefined) updateFields.allowed_platforms = body.allowed_platforms;
      if (body.max_users !== undefined) updateFields.max_users = Number(body.max_users);
      if (body.max_branches !== undefined) updateFields.max_branches = Number(body.max_branches);
      if (body.features !== undefined) updateFields.features = body.features;
      if (body.usage_limits !== undefined) updateFields.usage_limits = body.usage_limits;
      if (body.trial_days !== undefined) updateFields.trial_days = Number(body.trial_days);
      if (body.sort_order !== undefined) updateFields.sort_order = Number(body.sort_order);
      if (body.is_active !== undefined) updateFields.is_active = Boolean(body.is_active);

      const { data: updated, error } = await supabase
        .from('subscription_plans')
        .update(updateFields)
        .eq('id', planId)
        .select()
        .single();

      if (error) throw error;

      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'SUBSCRIPTION_PLAN_UPDATED',
        details: { plan_id: planId, updates: updateFields },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Plan updated successfully',
        data: updated
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // Archive Plan
  const planArchiveMatch = url.pathname.match(/^\\/api\\/v1\\/plans\\/([a-z0-9_]+)\\/archive$/i);
  if (planArchiveMatch && req.method === 'POST') {
    try {
      const planId = planArchiveMatch[1];
      const { admin } = await authorizeAdmin(req, ['super_admin'], 'aal1');

      const { data: updated, error } = await supabase
        .from('subscription_plans')
        .update({ is_archived: true, is_active: false, updated_at: new Date().toISOString() })
        .eq('id', planId)
        .select()
        .single();

      if (error) throw error;

      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'SUBSCRIPTION_PLAN_ARCHIVED',
        details: { plan_id: planId },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: \`Plan '\${planId}' archived successfully\`,
        data: updated
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Promotional Offers & Discounts Management
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/offers' && req.method === 'GET') {
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent'], 'aal1');

      const { data: offers, error } = await supabase
        .from('coupons')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch redemptions count
      const { data: redemptions } = await supabase
        .from('coupon_redemptions')
        .select('coupon_id, status');

      const redemptionCounts = {};
      (redemptions || []).forEach(r => {
        if (r.status === 'redeemed') {
          redemptionCounts[r.coupon_id] = (redemptionCounts[r.coupon_id] || 0) + 1;
        }
      });

      const enrichedOffers = (offers || []).map(o => ({
        ...o,
        redemptionCount: redemptionCounts[o.id] || 0,
        discountValue: Number(o.discount_value || 0),
        promotionalPriceInr: o.promotional_price_inr ? Number(o.promotional_price_inr) : null,
        maxDiscountAmount: o.max_discount_amount ? Number(o.max_discount_amount) : null,
        minPurchaseAmount: o.min_purchase_amount ? Number(o.min_purchase_amount) : 0,
        applicablePlans: o.applicable_plans || ['all'],
        applicableIntervals: o.applicable_intervals || ['all']
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: enrichedOffers
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  if (url.pathname === '/api/v1/offers' && req.method === 'POST') {
    try {
      const { admin } = await authorizeAdmin(req, ['super_admin', 'billing_admin'], 'aal1');
      const rawBody = await readBoundedBody(req);
      const body = JSON.parse(rawBody || '{}');
      const {
        code,
        name,
        description,
        discount_type,
        discount_value,
        promotional_price_inr,
        max_discount_amount,
        min_purchase_amount = 0,
        applicable_plans = ['all'],
        applicable_intervals = ['all'],
        customer_eligibility = 'all',
        valid_from = new Date().toISOString(),
        valid_until,
        max_total_redemptions,
        max_redemptions_per_workspace = 1,
        target_workspace_id = null,
        is_public = true,
        banner_text = null,
        priority = 0
      } = body;

      if (!code || !name || !discount_type) {
        const err = new Error('Offer code, name, and discount_type are required');
        err.statusCode = 400;
        throw err;
      }

      if (discount_type === 'percentage' && (Number(discount_value) <= 0 || Number(discount_value) > 100)) {
        throw new Error('Percentage discount must be between 1 and 100%');
      }

      const { data: newOffer, error } = await supabase
        .from('coupons')
        .insert({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          description: description || null,
          discount_type,
          discount_value: Number(discount_value || 0),
          promotional_price_inr: promotional_price_inr ? Number(promotional_price_inr) : null,
          max_discount_amount: max_discount_amount ? Number(max_discount_amount) : null,
          min_purchase_amount: Number(min_purchase_amount || 0),
          applicable_plans,
          applicable_intervals,
          customer_eligibility,
          valid_from,
          valid_until: valid_until || null,
          max_total_redemptions: max_total_redemptions ? Number(max_total_redemptions) : null,
          max_redemptions_per_workspace: Number(max_redemptions_per_workspace || 1),
          target_workspace_id: target_workspace_id || null,
          is_public: Boolean(is_public),
          banner_text: banner_text || null,
          priority: Number(priority || 0),
          is_active: true,
          created_by: admin.id
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'PROMOTIONAL_OFFER_CREATED',
        details: { code: newOffer.code, discount_type, discount_value },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Promotional offer created successfully',
        data: newOffer
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // Toggle Offer Active Status
  const offerToggleMatch = url.pathname.match(/^\\/api\\/v1\\/offers\\/([0-9a-f-]{36})\\/toggle$/i);
  if (offerToggleMatch && req.method === 'POST') {
    try {
      const offerId = offerToggleMatch[1];
      const { admin } = await authorizeAdmin(req, ['super_admin', 'billing_admin'], 'aal1');

      const { data: existing } = await supabase.from('coupons').select('id, is_active, code').eq('id', offerId).single();
      if (!existing) throw new Error('Offer not found');

      const newStatus = !existing.is_active;
      const { data: updated, error } = await supabase
        .from('coupons')
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq('id', offerId)
        .select()
        .single();

      if (error) throw error;

      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'PROMOTIONAL_OFFER_TOGGLED',
        details: { offerId, code: existing.code, is_active: newStatus },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: \`Offer '\${existing.code}' is now \${newStatus ? 'active' : 'inactive'}\`,
        data: updated
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Authoritative Server-Side Pricing Engine Preview
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/pricing/preview' && req.method === 'POST') {
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent'], 'aal1');
      const rawBody = await readBoundedBody(req);
      const body = JSON.parse(rawBody || '{}');
      const {
        plan_id,
        billing_cycle = 'monthly',
        workspace_id = null,
        coupon_code = null,
        custom_price_inr = null
      } = body;

      if (!plan_id) {
        throw new Error('plan_id is required for pricing preview');
      }

      // Fetch plan
      const { data: plan, error: planErr } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', plan_id)
        .single();

      if (planErr || !plan) {
        throw new Error(\`Plan '\${plan_id}' does not exist\`);
      }

      // Fetch coupon if specified
      let coupon = null;
      if (coupon_code) {
        const { data: cData } = await supabase
          .from('coupons')
          .select('*')
          .eq('code', coupon_code.trim().toUpperCase())
          .single();

        if (cData) {
          const eligibility = validateOfferEligibility(cData, plan_id, billing_cycle, workspace_id);
          if (!eligibility.eligible) {
            throw new Error(eligibility.reason || 'Offer cannot be applied to this plan selection');
          }
          coupon = cData;
        } else {
          throw new Error(\`Coupon code '\${coupon_code}' is invalid\`);
        }
      }

      // Check workspace override if workspace_id provided
      let workspaceOverride = null;
      if (custom_price_inr !== null && custom_price_inr !== undefined) {
        workspaceOverride = {
          custom_price_inr: Number(custom_price_inr),
          override_reason: 'Manual preview negotiated price'
        };
      } else if (workspace_id) {
        const { data: sub } = await supabase
          .from('workspace_subscriptions')
          .select('custom_price_inr, override_reason, override_expires_at')
          .eq('workspace_id', workspace_id)
          .single();

        if (sub && sub.custom_price_inr) {
          workspaceOverride = sub;
        }
      }

      const breakdown = calculateSubscriptionPrice({
        plan,
        billingCycle: billing_cycle,
        coupon,
        workspaceOverride,
        gstRatePercent: 18
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: breakdown
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }
`;

// Insert new routes before "// Fallback 404"
const fallbackMarker = '  // Fallback 404';
if (!content.includes(fallbackMarker)) {
  console.error('Could not locate fallbackMarker in gateway.mjs');
  process.exit(1);
}

const updatedContent = content.replace(fallbackMarker, newRoutes + '\n' + fallbackMarker);
fs.writeFileSync(gatewayPath, updatedContent, 'utf8');
console.log('Successfully patched server/gateway.mjs with plans, offers, and pricing endpoints');
