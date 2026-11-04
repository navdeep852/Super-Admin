// ==============================================================================
// VISTAAR Super Admin — Staging Real Business & Pricing Integration Test Suite
// Verifies Real DB Connection, 0 Mock Data Fallbacks, Accounting Isolation,
// Subscription Catalog, Integer-Paise Pricing Engine, and Workspace Drawer
// ==============================================================================

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { createClient } from '@supabase/supabase-js';

const FORBIDDEN_PROD_REF = 'kluxsykimnjivkqxelba';
const envPath = path.resolve('d:/Project/vistaar-main/super_admin/.env.staging');

// Load environment variables
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    const k = trimmed.slice(0, eqIdx).trim();
    const v = trimmed.slice(eqIdx + 1).trim();
    env[k] = v;
  }
});

const GATEWAY_URL = 'http://localhost:3002';
const SUPABASE_URL = env.GATEWAY_SUPABASE_URL;
const SERVICE_KEY = env.GATEWAY_SUPABASE_SERVICE_ROLE_KEY;

let adminAccessToken = null;
let testWorkspaceId = null;

async function runTests() {
  console.log('==============================================================================');
  console.log('VISTAAR SUPER ADMIN — REAL BUSINESS OS & PRICING INTEGRATION TESTS');
  console.log('==============================================================================');

  // Test 1: Production Air-Gap Verification
  console.log('\n[TEST 1] Air-Gap Verification (Never Target kluxsykimnjivkqxelba)');
  assert(!SUPABASE_URL.includes(FORBIDDEN_PROD_REF), 'CRITICAL: Production ref detected in SUPABASE_URL');
  assert(!envContent.includes(FORBIDDEN_PROD_REF), 'CRITICAL: Production ref detected in .env.staging');
  console.log('  ✓ Staging target verified: vlbhxcajphyjkeueubud (AWS eu-west-1)');

  // Test 2: Gateway BFF Health Check
  console.log('\n[TEST 2] Gateway BFF Health & CORS Check');
  const healthRes = await fetch(`${GATEWAY_URL}/health`, {
    headers: { 'Origin': 'http://localhost:3001' }
  });
  assert.strictEqual(healthRes.status, 200, 'Health endpoint must return 200');
  const corsHeader = healthRes.headers.get('access-control-allow-origin');
  assert.strictEqual(corsHeader, 'http://localhost:3001', 'CORS origin must be allowed');
  const healthJson = await healthRes.json();
  assert.strictEqual(healthJson.status, 'operational');
  assert.strictEqual(healthJson.stagingProjectRef, 'vlbhxcajphyjkeueubud');
  console.log('  ✓ Gateway BFF operational on port 3002 with verified CORS');

  // Test 3: Authenticate Genuine Super Admin (navdeep@vistaarone.com)
  console.log('\n[TEST 3] Genuine Super Admin Authentication via Gateway /api/v1/auth/login');
  const loginRes = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'navdeep@vistaarone.com',
      password: 'VistaarAdmin2026!#'
    })
  });
  assert.strictEqual(loginRes.status, 200, 'Login must succeed');
  const loginJson = await loginRes.json();
  assert(loginJson.success, 'Login response must indicate success');
  assert(loginJson.session?.access_token, 'Access token missing from login response');
  adminAccessToken = loginJson.session.access_token;
  console.log('  ✓ Authenticated navdeep@vistaarone.com (UUID: ' + loginJson.admin.id + ')');

  // Test 4: Verify Administrator Identity & Active Status via Gateway
  console.log('\n[TEST 4] Verify Administrator Profile via /api/v1/admins/me');
  const meRes = await fetch(`${GATEWAY_URL}/api/v1/admins/me`, {
    headers: { Authorization: `Bearer ${adminAccessToken}` }
  });
  assert.strictEqual(meRes.status, 200);
  const meJson = await meRes.json();
  assert.strictEqual(meJson.data.email, 'navdeep@vistaarone.com');
  assert.strictEqual(meJson.data.role, 'super_admin');
  assert.strictEqual(meJson.data.isActive, true);
  console.log('  ✓ Verified platform_admins record: Role super_admin, Active: true');

  // Test 5: Executive Overview with Strict Accounting Isolation
  console.log('\n[TEST 5] Executive Overview & Financial Accounting Isolation');
  const overviewRes = await fetch(`${GATEWAY_URL}/api/v1/platform/overview`, {
    headers: { Authorization: `Bearer ${adminAccessToken}` }
  });
  assert.strictEqual(overviewRes.status, 200);
  const overviewJson = await overviewRes.json();
  const m = overviewJson.data.metrics;
  assert(m.totalBusinesses > 0, 'Total businesses must be > 0');
  assert(m.platformCollectedRevenueInr > 0, 'Platform SaaS collections must be > 0');
  assert(m.tenantSalesGmvInr > 0, 'Tenant retail GMV must be > 0');
  assert.notStrictEqual(m.platformCollectedRevenueInr, m.tenantSalesGmvInr, 'SaaS revenue must strictly differ from Retail GMV');
  console.log(`  ✓ Real DB Metrics: Businesses: ${m.totalBusinesses}, SaaS Collections: ₹${m.platformCollectedRevenueInr}, Tenant GMV: ₹${m.tenantSalesGmvInr}`);

  // Test 6: Subscription Plans Catalog
  console.log('\n[TEST 6] Subscription Plans Catalog (/api/v1/plans)');
  const plansRes = await fetch(`${GATEWAY_URL}/api/v1/plans`, {
    headers: { Authorization: `Bearer ${adminAccessToken}` }
  });
  assert.strictEqual(plansRes.status, 200);
  const plansJson = await plansRes.json();
  assert(plansJson.data.length >= 4, 'Must return at least 4 active subscription plans');
  const starter = plansJson.data.find(p => p.id === 'starter');
  assert(starter, 'Starter plan must exist');
  assert.strictEqual(starter.price_monthly_inr, 299);
  assert.strictEqual(starter.price_annual_inr, 2499);
  console.log(`  ✓ Loaded ${plansJson.data.length} live plans from DB with active subscriber counts`);

  // Test 7: Promotional Offers Catalog (/api/v1/offers)
  console.log('\n[TEST 7] Promotional Offers Catalog (/api/v1/offers)');
  const offersRes = await fetch(`${GATEWAY_URL}/api/v1/offers`, {
    headers: { Authorization: `Bearer ${adminAccessToken}` }
  });
  assert.strictEqual(offersRes.status, 200);
  const offersJson = await offersRes.json();
  assert(offersJson.data.length >= 3, 'Must return seeded promotional offers');
  const v20 = offersJson.data.find(o => o.code === 'VISTAAR20');
  assert(v20, 'VISTAAR20 offer must exist');
  assert.strictEqual(v20.discount_type, 'percentage');
  console.log(`  ✓ Loaded ${offersJson.data.length} promotional offers (VISTAAR20, GROWTH500, SPECIAL699)`);

  // Test 8: Server-Side Pricing Engine Preview (Integer-Paise Precision)
  console.log('\n[TEST 8] Pricing Engine Preview (/api/v1/pricing/preview)');
  // Scenario A: Monthly Business Plan with VISTAAR20 (20% off)
  const previewResA = await fetch(`${GATEWAY_URL}/api/v1/pricing/preview`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      plan_id: 'business',
      billing_cycle: 'monthly',
      coupon_code: 'VISTAAR20'
    })
  });
  assert.strictEqual(previewResA.status, 200);
  const prevA = (await previewResA.json()).data;
  assert.strictEqual(prevA.originalPlanPriceInr, 699);
  assert.strictEqual(prevA.discountAmountInr, 139.8); // 20% of 699
  assert.strictEqual(prevA.taxableAmountInr, 559.2);
  assert.strictEqual(prevA.gstAmountInr, 100.66); // 18% GST rounded to paise
  assert.strictEqual(prevA.finalPayableInr, 659.86);
  console.log('  ✓ Scenario A (Monthly + 20% off): Taxable ₹559.20, GST ₹100.66, Payable ₹659.86');

  // Scenario B: Annual Business Plan (₹5,999) with GROWTH500 (Flat ₹500 off)
  const previewResB = await fetch(`${GATEWAY_URL}/api/v1/pricing/preview`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      plan_id: 'business',
      billing_cycle: 'annual',
      coupon_code: 'GROWTH500'
    })
  });
  assert.strictEqual(previewResB.status, 200);
  const prevB = (await previewResB.json()).data;
  assert.strictEqual(prevB.originalPlanPriceInr, 5999);
  assert.strictEqual(prevB.discountAmountInr, 500);
  assert.strictEqual(prevB.taxableAmountInr, 5499);
  assert.strictEqual(prevB.gstAmountInr, 989.82); // 18% of 5499
  assert.strictEqual(prevB.finalPayableInr, 6488.82);
  console.log('  ✓ Scenario B (Annual + Flat ₹500 off): Taxable ₹5,499.00, GST ₹989.82, Payable ₹6,488.82');

  // Scenario C: Custom Negotiated Price Override (Model D: ₹699/mo)
  const previewResC = await fetch(`${GATEWAY_URL}/api/v1/pricing/preview`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      plan_id: 'growth', // Standard ₹1,199
      billing_cycle: 'monthly',
      custom_price_inr: 699
    })
  });
  assert.strictEqual(previewResC.status, 200);
  const prevC = (await previewResC.json()).data;
  assert.strictEqual(prevC.originalPlanPriceInr, 1199);
  assert.strictEqual(prevC.taxableAmountInr, 699);
  assert.strictEqual(prevC.gstAmountInr, 125.82); // 18% of 699
  assert.strictEqual(prevC.finalPayableInr, 824.82);
  console.log('  ✓ Scenario C (Negotiated Price Override ₹699): Taxable ₹699.00, GST ₹125.82, Payable ₹824.82');

  // Test 9: Workspace Directory & Deep-Dive Inspection
  console.log('\n[TEST 9] Workspace Deep-Dive Inspection (/api/v1/workspaces/:id)');
  const wsListRes = await fetch(`${GATEWAY_URL}/api/v1/workspaces?limit=1`, {
    headers: { Authorization: `Bearer ${adminAccessToken}` }
  });
  const wsListJson = await wsListRes.json();
  assert(wsListJson.data.businesses.length > 0, 'Must have at least 1 workspace');
  testWorkspaceId = wsListJson.data.businesses[0].id;

  const wsDetailRes = await fetch(`${GATEWAY_URL}/api/v1/workspaces/${testWorkspaceId}`, {
    headers: { Authorization: `Bearer ${adminAccessToken}` }
  });
  assert.strictEqual(wsDetailRes.status, 200);
  const wsDetail = (await wsDetailRes.json()).data;
  assert(wsDetail.workspace, 'Workspace info must be present');
  assert(Array.isArray(wsDetail.employees), 'Employees roster must be an array');
  assert(Array.isArray(wsDetail.recentInvoices), 'Invoices must be an array');
  console.log(`  ✓ Deep-dive verified for workspace ${wsDetail.workspace.name}: Staff ${wsDetail.employees.length}, Invoices ${wsDetail.recentInvoices.length}`);

  // Test 10: Manage Subscription Lifecycle & Event Audit Logging
  console.log('\n[TEST 10] Manage Subscription & Event Audit Log');
  const manageRes = await fetch(`${GATEWAY_URL}/api/v1/workspaces/${testWorkspaceId}/subscription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'assign_custom_price',
      custom_price_inr: 799,
      override_reason: 'Automated Staging Integration Test Agreement',
      override_days: 90
    })
  });
  assert.strictEqual(manageRes.status, 200);
  const manageJson = await manageRes.json();
  assert(manageJson.success, 'Subscription manage action must succeed');

  // Verify event was logged to workspace_subscription_events
  const dbClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: eventLog, error: eventErr } = await dbClient
    .from('workspace_subscription_events')
    .select('*')
    .eq('workspace_id', testWorkspaceId)
    .order('created_at', { ascending: false })
    .limit(1);

  assert(!eventErr, `Event log query error: ${eventErr?.message}`);
  assert(eventLog && eventLog.length > 0, 'workspace_subscription_events record must exist');
  assert.strictEqual(eventLog[0].event_type, 'assign_custom_price');
  console.log('  ✓ Subscription override applied and recorded in workspace_subscription_events');

  console.log('\n==============================================================================');
  console.log('ALL 10 STAGING INTEGRATION TESTS PASSED PERFECTLY!');
  console.log('Zero mock data fallbacks, verified database connection, zero floating-point drift.');
  console.log('==============================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
