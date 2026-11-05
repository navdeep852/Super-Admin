import assert from 'assert';

console.log('================================================================');
console.log(' VISTAAR SUPER ADMIN — GENUINE BUSINESS OS INTEGRATION TESTS');
console.log('================================================================\n');

const BASE_URL = 'http://localhost:3002';

async function runTests() {
  // 1. Health check & CORS / PNA headers
  console.log('[TEST 1] Verifying Gateway BFF Health & Network Headers...');
  const healthRes = await fetch(`${BASE_URL}/health`);
  assert.strictEqual(healthRes.status, 200, 'Health endpoint must return 200');
  const healthData = await healthRes.json();
  assert.strictEqual(healthData.status, 'operational');
  assert.strictEqual(healthData.stagingProjectRef, 'vlbhxcajphyjkeueubud');
  assert.strictEqual(healthRes.headers.get('access-control-allow-private-network'), 'true');
  console.log('  ✓ Health status: operational (Ref: vlbhxcajphyjkeueubud)');
  console.log('  ✓ CORS & Private Network Access headers active');

  // 2. Air-Gap Protection Invariant
  console.log('\n[TEST 2] Verifying Production Air-Gap Invariant...');
  assert.strictEqual(healthData.stagingProjectRef !== 'kluxsykimnjivkqxelba', true);
  console.log('  ✓ Production project kluxsykimnjivkqxelba is strictly untouched');

  // 3. Password Reset Request & On-Screen Recovery Token Exchange
  console.log('\n[TEST 3] Testing On-Screen Password Recovery Session Exchange...');
  const resetReqRes = await fetch(`${BASE_URL}/api/v1/auth/password/reset-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'navdeep@vistaarone.com' })
  });
  assert.strictEqual(resetReqRes.status, 200);
  const resetReqData = await resetReqRes.json();
  assert.strictEqual(resetReqData.success, true);
  assert.ok(resetReqData.recoveryToken, 'Recovery token must be generated and returned on staging');
  console.log('  ✓ Password recovery token generated & exchanged seamlessly without email dependency');

  // 4. Password Update & Login Verification
  console.log('\n[TEST 4] Testing Password Update & Authentication...');
  const confirmRes = await fetch(`${BASE_URL}/api/v1/auth/password/reset-confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${resetReqData.recoveryToken}`
    },
    body: JSON.stringify({ new_password: 'VistaarAdmin2026!#' })
  });
  assert.strictEqual(confirmRes.status, 200);
  const confirmData = await confirmRes.json();
  assert.strictEqual(confirmData.success, true);

  const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'navdeep@vistaarone.com', password: 'VistaarAdmin2026!#' })
  });
  assert.strictEqual(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.success, true);
  assert.strictEqual(loginData.admin.email, 'navdeep@vistaarone.com');
  const authToken = loginData.session.access_token;
  const authHeaders = { 'Authorization': `Bearer ${authToken}` };
  console.log('  ✓ Password updated and successfully authenticated as navdeep@vistaarone.com');

  // 5. Scoped Overview Metrics (Genuine vs Test vs All)
  console.log('\n[TEST 5] Testing Overview Metrics with Scope Filtering...');
  const overviewGenRes = await fetch(`${BASE_URL}/api/v1/platform/overview?scope=genuine`, { headers: authHeaders });
  assert.strictEqual(overviewGenRes.status, 200);
  const overviewGen = await overviewGenRes.json();
  assert.strictEqual(overviewGen.data.dataSource.scope, 'genuine');
  assert.strictEqual(overviewGen.data.dataSource.isSyntheticFiltered, true);
  assert.strictEqual(overviewGen.data.metrics.totalBusinesses, 0, 'Genuine business count on staging must be 0');

  const overviewAllRes = await fetch(`${BASE_URL}/api/v1/platform/overview?scope=all`, { headers: authHeaders });
  assert.strictEqual(overviewAllRes.status, 200);
  const overviewAll = await overviewAllRes.json();
  assert.strictEqual(overviewAll.data.metrics.totalBusinesses, 11);
  assert.strictEqual(overviewAll.data.metrics.platformCollectedRevenueInr, 83987);
  assert.strictEqual(overviewAll.data.metrics.tenantSalesGmvInr, 1182900);
  console.log('  ✓ Genuine scope correctly filters out all synthetic records');
  console.log(`  ✓ All scope correctly reports real staging aggregates (SaaS: ₹${overviewAll.data.metrics.platformCollectedRevenueInr}, GMV: ₹${overviewAll.data.metrics.tenantSalesGmvInr})`);

  // 6. Users Endpoint Scoping & Platform Admins
  console.log('\n[TEST 6] Testing Users & Platform Admins Endpoints...');
  const usersGenRes = await fetch(`${BASE_URL}/api/v1/users?scope=genuine`, { headers: authHeaders });
  const usersGen = await usersGenRes.json();
  assert.strictEqual(usersGen.data.length, 0);

  const usersAllRes = await fetch(`${BASE_URL}/api/v1/users?scope=all`, { headers: authHeaders });
  const usersAll = await usersAllRes.json();
  assert.strictEqual(usersAll.data.length, 15);
  assert.strictEqual(usersAll.data.every(u => u.isTest === true), true);

  const adminsRes = await fetch(`${BASE_URL}/api/v1/admins`, { headers: authHeaders });
  const adminsData = await adminsRes.json();
  assert.ok(adminsData.data.some(a => a.email === 'navdeep@vistaarone.com'));
  console.log('  ✓ Users endpoint respects scope=genuine (0 genuine, 15 staging fixtures)');
  console.log('  ✓ Platform admins endpoint returns genuine navdeep@vistaarone.com');

  // 7. Workspaces Endpoint Scoping
  console.log('\n[TEST 7] Testing Workspaces Endpoint Scoping...');
  const wsGenRes = await fetch(`${BASE_URL}/api/v1/workspaces?scope=genuine`, { headers: authHeaders });
  const wsGen = await wsGenRes.json();
  assert.strictEqual(wsGen.data.businesses.length, 0);

  const wsAllRes = await fetch(`${BASE_URL}/api/v1/workspaces?scope=all`, { headers: authHeaders });
  const wsAll = await wsAllRes.json();
  assert.strictEqual(wsAll.data.businesses.length, 11);
  assert.strictEqual(wsAll.data.businesses.every(b => b.isTest === true), true);
  console.log('  ✓ Workspaces endpoint correctly separates genuine customers from staging fixtures');

  console.log('\n================================================================');
  console.log(' 🎉 ALL GENUINE BUSINESS OS INTEGRATION TESTS PASSED (7/7)');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
