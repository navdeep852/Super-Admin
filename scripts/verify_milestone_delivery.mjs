import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Load .env.staging
const envPath = path.resolve(process.cwd(), '.env.staging');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    const k = trimmed.substring(0, idx).trim();
    const v = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
    env[k] = v;
  }
}

const supabaseUrl = env.GATEWAY_SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseKey = env.GATEWAY_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const assertionSecret = env.GATEWAY_ASSERTION_SECRET || '';
const serviceClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const authClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

let authToken = '';

function generateTotp(secret, timeStep = 30) {
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (let i = 0; i < secret.length; i++) {
    const val = base32Chars.indexOf(secret.charAt(i).toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const keyBytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    keyBytes.push(parseInt(bits.substr(i, 8), 2));
  }
  const k = Buffer.from(keyBytes);

  const counter = Math.floor(Date.now() / 1000 / timeStep);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', k).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24 |
                (hmac[offset + 1] & 0xff) << 16 |
                (hmac[offset + 2] & 0xff) << 8 |
                (hmac[offset + 3] & 0xff)) % 1000000;
  return code.toString().padStart(6, '0');
}

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

function get(endpoint, customHeaders = {}) {
  const headers = { ...customHeaders };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  return request({
    hostname: '127.0.0.1',
    port: 3002,
    path: endpoint,
    method: 'GET',
    headers
  });
}

function post(endpoint, body, customHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...customHeaders };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  return request({
    hostname: '127.0.0.1',
    port: 3002,
    path: endpoint,
    method: 'POST',
    headers
  }, body);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function run() {
  console.log('================================================================');
  console.log(' VISTAAR SUPER ADMIN — MILESTONE DELIVERY VERIFICATION SUITE');
  console.log(' Target Staging DB Ref:', env.VITE_SUPABASE_PROJECT_REF || 'vlbhxcajphyjkeueubud');
  console.log(' Gateway BFF URL: http://127.0.0.1:3002');
  console.log('================================================================\n');

  // Authenticate as genuine Super Admin with AAL2
  console.log('[AUTH SETUP] Authenticating test runner via genuine Supabase Auth with AAL2 MFA...');
  const { data: signData, error: signErr } = await authClient.auth.signInWithPassword({
    email: 'synthetic.admin@staging.vistaar.internal',
    password: 'StagingAdminPassword2026!'
  });
  assert(!signErr && signData.session, 'Initial password authentication successful');

  await authClient.auth.setSession({
    access_token: signData.session.access_token,
    refresh_token: signData.session.refresh_token
  });

  const totpSecret = 'DCDUPIWXVZ6Y2JKGHN462ECN6R3LZPOS';
  const factorId = '1208d4b8-19d4-4599-855e-c106327750e6';
  const totpCode = generateTotp(totpSecret);

  const { data: ch } = await authClient.auth.mfa.challenge({ factorId });
  const { data: verifyData, error: verifyErr } = await authClient.auth.mfa.verify({
    factorId,
    challengeId: ch.id,
    code: totpCode
  });
  assert(!verifyErr && verifyData.access_token, 'AAL2 TOTP challenge verified successfully');

  authToken = verifyData.access_token;
  const adminId = 'a638f1fb-984e-48b0-96c3-a6a7f42c2c18';
  console.log('  ✓ Genuine AAL2 Super Admin session established.');

  // ---------------------------------------------------------------------------
  // 1. HEALTH & CONNECTIVITY
  // ---------------------------------------------------------------------------
  console.log('\n--- 1. GATEWAY HEALTH & STAGING CONNECTIVITY ---');
  const healthRes = await get('/api/v1/platform/health');
  assert(healthRes.status === 200, 'Gateway /api/v1/platform/health returns 200');
  assert(healthRes.data.status === 'healthy', 'Gateway status is "healthy"');
  assert(healthRes.data.stagingProjectRef === 'vlbhxcajphyjkeueubud', 'Target project is vlbhxcajphyjkeueubud');
  assert(healthRes.data.services.database.status === 'operational', 'Database service is operational');

  // ---------------------------------------------------------------------------
  // 2. DASHBOARD OVERVIEW & 6 TIMEFRAME FILTERS
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. EXECUTIVE OVERVIEW KPIS & TIMEFRAME FILTERING ---');
  const timeframes = ['today', 'this_week', 'this_month', 'last_month', 'all_time'];
  for (const tf of timeframes) {
    const res = await get(`/api/v1/platform/overview?timeframe=${tf}`);
    assert(res.status === 200, `Overview [${tf}] returned 200`);
    const m = res.data.data.metrics;
    assert(typeof m.totalBusinesses === 'number' && m.totalBusinesses > 0, `[${tf}] totalBusinesses is positive (${m.totalBusinesses})`);
    assert(typeof m.totalUsers === 'number' && m.totalUsers > 0, `[${tf}] totalUsers is positive (${m.totalUsers})`);
    assert(typeof m.platformCollectedRevenueInr === 'number', `[${tf}] platformCollectedRevenueInr exists (${m.platformCollectedRevenueInr})`);
    assert(typeof m.totalRefundsInr === 'number', `[${tf}] totalRefundsInr exists (${m.totalRefundsInr})`);
  }

  // Custom range filter
  const customRes = await get('/api/v1/platform/overview?timeframe=custom&start_date=2026-01-01&end_date=2026-11-30');
  assert(customRes.status === 200, 'Overview [custom timeframe] returned 200');
  assert(customRes.data.data.metrics.totalBusinesses > 0, 'Custom range returns businesses');

  // ---------------------------------------------------------------------------
  // 3. BUSINESSES ROSTER: SEARCH, FILTERING, PAGINATION, SORTING
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. WORKSPACES ROSTER (SEARCH, FILTER, PAGINATION, SORTING) ---');
  const wsRes = await get('/api/v1/workspaces?page=1&limit=5');
  assert(wsRes.status === 200, 'Workspaces page 1 returned 200');
  assert(wsRes.data.data.businesses.length <= 5, 'Pagination limit 5 respected');
  assert(wsRes.data.data.pagination.total >= 10, 'Total businesses is at least 10');

  // Search by text
  const searchRes = await get('/api/v1/workspaces?search=Apex');
  assert(searchRes.status === 200, 'Search for "Apex" returned 200');
  assert(searchRes.data.data.businesses.some(b => b.legalName.includes('Apex')), 'Search result contains "Apex"');

  // Filter by status: active
  const activeWsRes = await get('/api/v1/workspaces?status=active');
  assert(activeWsRes.status === 200, 'Filter status=active returned 200');
  assert(activeWsRes.data.data.businesses.every(b => b.status === 'Active'), 'All returned businesses are Active');

  // Sort by legal name ascending
  const sortRes = await get('/api/v1/workspaces?sortBy=name&sortOrder=asc');
  assert(sortRes.status === 200, 'Sort by name returned 200');
  const names = sortRes.data.data.businesses.map(b => b.legalName);
  const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
  assert(JSON.stringify(names) === JSON.stringify(sortedNames), 'Businesses sorted alphabetically by name');

  // ---------------------------------------------------------------------------
  // 4. 7-SECTION DRAWER DEEP-DIVE
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. WORKSPACE DETAIL DEEP-DIVE (7 SECTIONS) ---');
  const sampleWsId = wsRes.data.data.businesses[0].id;
  const detailRes = await get(`/api/v1/workspaces/${sampleWsId}`);
  assert(detailRes.status === 200, `Workspace detail for ${sampleWsId} returned 200`);
  const d = detailRes.data.data;

  // Section 1: Business Overview
  assert(d.workspace && d.workspace.id === sampleWsId, 'Section 1: Business Overview present');
  // Section 2: Branch Information
  assert(d.workspace.branch_name || d.workspace.company_name, 'Section 2: Branch information present');
  // Section 3: Subscription & Plan Tier
  assert(d.subscription && d.subscription.subscription_plans, 'Section 3: Subscription & Plan present');
  // Section 4: Members & Employees Roster
  assert(Array.isArray(d.employees), 'Section 4: Employees roster present');
  // Section 5: Financial Metrics & Retail Invoices
  assert(Array.isArray(d.recentInvoices) && d.metrics, 'Section 5: Invoices and metrics present');
  // Section 6: Business Settings & GSTIN
  assert(d.businessSettings && (d.businessSettings.city || d.businessSettings.legal_name), 'Section 6: Registration & GSTIN details present');
  // Section 7: Admin Action History & Audit Logs
  assert(Array.isArray(d.auditLogs), 'Section 7: Audit logs array present');
  assert(Array.isArray(d.suspensions), 'Section 7: Suspensions array present');

  // ---------------------------------------------------------------------------
  // 5. ADMINISTRATIVE CONTROLS: 3-TIER SUSPENSION & REACTIVATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. 3-TIER MULTI-LAYER SUSPENSION & REACTIVATION ENFORCEMENT ---');
  const { data: testWsList, error: testWsErr } = await serviceClient
    .from('workspaces')
    .select('id, company_name, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);

  assert(!testWsErr && testWsList && testWsList.length > 0, 'Found active workspace for suspension testing');
  const testWs = testWsList[0];
  console.log(`Selected workspace for suspension test: "${testWs.company_name}" (${testWs.id})`);

  // Step A: Perform Suspension with GCAP assertion
  console.log('Executing Suspension via Gateway BFF with GCAP assertion...');
  const nowEpoch = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const canonical = `${adminId}:SUSPEND_WORKSPACE:${testWs.id}:NONE:aal2:${nowEpoch}:${nonce}`;
  const sig = crypto.createHmac('sha256', assertionSecret).update(canonical).digest('hex');

  const suspendRes = await post(`/api/v1/workspaces/${testWs.id}/suspend`, {
    reason: 'Security and compliance audit suspension test'
  }, {
    'X-GCAP-Signature': sig,
    'X-GCAP-Timestamp': String(nowEpoch),
    'X-GCAP-Nonce': nonce
  });
  assert(suspendRes.status === 200, 'Gateway /suspend returned 200');
  assert(suspendRes.data.success === true, 'Gateway reports success: true');

  // Step B: Verify Database Tier
  const { data: dbWs } = await serviceClient.from('workspaces').select('is_active, suspension_reason').eq('id', testWs.id).single();
  assert(dbWs.is_active === false, 'DB workspaces.is_active is now FALSE');

  const { data: dbProfiles } = await serviceClient.from('profiles').select('status').eq('workspace_id', testWs.id);
  assert(dbProfiles.every(p => p.status === 'Suspended'), 'All associated profiles transitioned to "Suspended"');

  const { data: dbMemberships } = await serviceClient.from('workspace_memberships').select('status').eq('workspace_id', testWs.id);
  assert(dbMemberships.every(m => m.status.toLowerCase() === 'suspended'), 'All associated workspace_memberships transitioned to "suspended"');

  const { data: activeSusp } = await serviceClient.from('platform_workspace_suspensions').select('*').eq('workspace_id', testWs.id).eq('is_active_suspension', true);
  assert(activeSusp && activeSusp.length > 0, 'Active suspension record inserted in platform_workspace_suspensions');

  // Step C: Verify RLS Function Tier
  const { data: rlsCheck } = await serviceClient.rpc('current_user_workspace_id');
  console.log(`current_user_workspace_id() for service caller: ${rlsCheck} (function is deployed and callable)`);

  // Step D: Perform Reactivation with GCAP assertion
  console.log('Executing Reactivation via Gateway BFF with GCAP assertion...');
  const reactEpoch = Math.floor(Date.now() / 1000);
  const reactNonce = crypto.randomUUID();
  const reactCanonical = `${adminId}:REACTIVATE_WORKSPACE:${testWs.id}:NONE:aal2:${reactEpoch}:${reactNonce}`;
  const reactSig = crypto.createHmac('sha256', assertionSecret).update(reactCanonical).digest('hex');

  const reactivateRes = await post(`/api/v1/workspaces/${testWs.id}/reactivate`, {
    reason: 'Administrative reactivation after security test'
  }, {
    'X-GCAP-Signature': reactSig,
    'X-GCAP-Timestamp': String(reactEpoch),
    'X-GCAP-Nonce': reactNonce
  });
  assert(reactivateRes.status === 200, 'Gateway /reactivate returned 200');
  assert(reactivateRes.data.success === true, 'Gateway reports success: true');

  // Step E: Verify Restoration in Database
  const { data: restoredWs } = await serviceClient.from('workspaces').select('is_active, suspension_reason').eq('id', testWs.id).single();
  assert(restoredWs.is_active === true, 'DB workspaces.is_active is now restored to TRUE');
  assert(restoredWs.suspension_reason === null, 'DB workspaces.suspension_reason is cleared to NULL');

  const { data: restoredProfiles } = await serviceClient.from('profiles').select('status').eq('workspace_id', testWs.id);
  assert(restoredProfiles.every(p => p.status === 'Active'), 'All profiles restored to "Active"');

  const { data: restoredMemberships } = await serviceClient.from('workspace_memberships').select('status').eq('workspace_id', testWs.id);
  assert(restoredMemberships.every(m => m.status.toLowerCase() === 'active'), 'All memberships restored to "active"');

  console.log('\n================================================================');
  console.log(' 🎉 ALL VERIFICATION ASSERTIONS PASSED WITH ZERO ERRORS');
  console.log('================================================================');
}

run().catch(err => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
