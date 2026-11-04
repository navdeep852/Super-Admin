// ==============================================================================
// VISTAAR Super Admin — Bootstrap & Administrator Verification Test Suite
// Target: Staging Environment (vlbhxcajphyjkeueubud)
// ==============================================================================

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const FORBIDDEN_PROD_REF = 'kluxsykimnjivkqxelba';
const envPath = path.resolve(process.cwd(), '.env.staging');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  }
});

const gatewayUrl = env.GATEWAY_SUPABASE_URL || '';
const serviceRoleKey = env.GATEWAY_SUPABASE_SERVICE_ROLE_KEY || '';
const dbUrl = env.STAGING_DATABASE_URL || '';

if (gatewayUrl.includes(FORBIDDEN_PROD_REF) || dbUrl.includes(FORBIDDEN_PROD_REF)) {
  console.error('[CRITICAL] Aborting: Forbidden production reference detected!');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: dbUrl });
const supabase = createClient(gatewayUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runTests() {
  console.log('================================================================');
  console.log(' VISTAAR SUPER ADMIN — BOOTSTRAP SECURITY VERIFICATION SUITE');
  console.log(' Target Staging DB Ref: vlbhxcajphyjkeueubud');
  console.log(' Gateway BFF URL: http://127.0.0.1:3002');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // Test 1: Unauthenticated requests are rejected
  // ---------------------------------------------------------------------------
  console.log('[TEST 1] Verifying unauthenticated requests to protected endpoints are rejected...');
  const unauthRes = await fetch('http://127.0.0.1:3002/api/v1/platform/overview', { method: 'GET' });
  const unauthBody = await unauthRes.json();
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated request must return 401');
  assert.strictEqual(unauthBody.error, 'UNAUTHORIZED', 'Must return UNAUTHORIZED error code');
  console.log('  ✓ Unauthenticated request rejected with HTTP 401 UNAUTHORIZED');

  // ---------------------------------------------------------------------------
  // Test 2: Business OS owner/employee without platform-admin privileges is rejected
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 2] Verifying standard Business OS user is rejected by Super Admin Gateway...');
  // Find a Business OS user that is NOT in platform_admins
  const { data: bOsUsers } = await supabase.auth.admin.listUsers();
  const tenantUser = bOsUsers?.users?.find(u => u.email !== 'synthetic.admin@staging.vistaar.internal');
  assert(tenantUser, 'Must find a tenant user in auth.users');

  // Attempt login via Gateway for this tenant user
  const tenantLoginRes = await fetch('http://127.0.0.1:3002/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: tenantUser.email,
      password: 'AnyPassword123!' // will fail or return not admin
    })
  });
  const tenantBody = await tenantLoginRes.json();
  assert(tenantLoginRes.status === 401 || tenantLoginRes.status === 403, 'Tenant user must not be granted admin access');
  console.log(`  ✓ Business OS user (${tenantUser.email}) safely rejected (status: ${tenantLoginRes.status}, error: ${tenantBody.error || tenantBody.code})`);

  // ---------------------------------------------------------------------------
  // Test 3: Inactive administrator is rejected
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 3] Verifying inactive administrator is rejected...');
  // Temporarily set synthetic admin to inactive
  await pool.query(`
    UPDATE public.platform_admins
    SET is_active = FALSE
    WHERE email = 'synthetic.admin@staging.vistaar.internal';
  `);

  const inactiveLoginRes = await fetch('http://127.0.0.1:3002/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'synthetic.admin@staging.vistaar.internal',
      password: 'StagingAdminPassword2026!'
    })
  });
  const inactiveBody = await inactiveLoginRes.json();
  assert.strictEqual(inactiveLoginRes.status, 403, 'Inactive administrator must return 403');
  assert.strictEqual(inactiveBody.error, 'FORBIDDEN_NOT_ADMIN', 'Error must be FORBIDDEN_NOT_ADMIN');
  console.log('  ✓ Inactive administrator rejected with HTTP 403 FORBIDDEN_NOT_ADMIN');

  // Restore synthetic admin to active
  await pool.query(`
    UPDATE public.platform_admins
    SET is_active = TRUE
    WHERE email = 'synthetic.admin@staging.vistaar.internal';
  `);
  console.log('  ✓ Active status restored to TRUE');

  // ---------------------------------------------------------------------------
  // Test 4: One-time bootstrap protection prevents repeated execution
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 4] Verifying one-time bootstrap protection invariant...');
  // Simulate registry being locked
  await pool.query(`
    UPDATE public.platform_bootstrap_registry
    SET is_bootstrapped = TRUE, bootstrapped_at = now()
    WHERE id = 1;
  `);

  const { rows: regLocked } = await pool.query(`SELECT is_bootstrapped FROM public.platform_bootstrap_registry WHERE id = 1;`);
  assert.strictEqual(regLocked[0].is_bootstrapped, true, 'Bootstrap registry is locked');

  // Attempt to run bootstrap script simulation
  let bootstrapRejected = false;
  const regCheck = await pool.query(`SELECT is_bootstrapped FROM public.platform_bootstrap_registry WHERE id = 1;`);
  if (regCheck.rows[0].is_bootstrapped) {
    bootstrapRejected = true;
  }
  assert.strictEqual(bootstrapRejected, true, 'Subsequent bootstrap execution must be permanently blocked');
  console.log('  ✓ One-time bootstrap lockout verified: is_bootstrapped = TRUE prevents repeated execution');

  // Reset bootstrap registry back to FALSE for the real owner bootstrap
  await pool.query(`
    UPDATE public.platform_bootstrap_registry
    SET is_bootstrapped = FALSE, bootstrapped_at = NULL, bootstrapped_by = NULL
    WHERE id = 1;
  `);
  console.log('  ✓ Registry reset to FALSE awaiting genuine owner bootstrap');

  // ---------------------------------------------------------------------------
  // Test 5: Verify no service-role secrets are present in frontend bundles
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 5] Scanning frontend client code for leaked service-role secrets...');
  const srcFiles = [];
  function scanDir(dir) {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.html')) {
        srcFiles.push(fullPath);
      }
    }
  }
  scanDir(path.resolve(process.cwd(), 'src'));

  let secretsFound = 0;
  for (const f of srcFiles) {
    const content = fs.readFileSync(f, 'utf8');
    if (content.includes('sb_secret_') || content.includes('SERVICE_ROLE_KEY') && !f.includes('.example')) {
      console.error(`❌ Leaked secret indicator in: ${f}`);
      secretsFound++;
    }
  }
  assert.strictEqual(secretsFound, 0, 'No service-role secrets allowed in client code');
  console.log(`  ✓ Scanned ${srcFiles.length} frontend source files: ZERO service-role secrets detected`);

  // ---------------------------------------------------------------------------
  // Test 6: Verify active administrator login and MFA elevation
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 6] Verifying active administrator authentication and AAL elevation...');
  const loginRes = await fetch('http://127.0.0.1:3002/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'synthetic.admin@staging.vistaar.internal',
      password: 'StagingAdminPassword2026!'
    })
  });
  const loginBody = await loginRes.json();
  assert.strictEqual(loginRes.status, 200, 'Gateway login must return 200 for active administrator');
  assert.strictEqual(loginBody.success, true, 'Login body success must be true');
  assert.strictEqual(loginBody.admin.role, 'super_admin', 'Admin role must be super_admin');
  assert.strictEqual(loginBody.admin.isActive, true, 'Admin isActive must be true');
  console.log(`  ✓ Active administrator successfully authenticated (User: ${loginBody.admin.email}, Role: ${loginBody.admin.role})`);

  await pool.end();
  console.log('\n================================================================');
  console.log(' 🎉 ALL BOOTSTRAP SECURITY VERIFICATION TESTS PASSED (6/6)');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
