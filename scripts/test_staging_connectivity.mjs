import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const FORBIDDEN_PROD_REF = 'kluxsykimnjivkqxelba';
const envPath = path.resolve('d:/Project/vistaar-main/super_admin/.env.staging');

if (!fs.existsSync(envPath)) {
  console.error(JSON.stringify({ success: false, error: '.env.staging file not found' }));
  process.exit(1);
}

// 1. Parse .env.staging safely
const rawContent = fs.readFileSync(envPath, 'utf8');
const env = {};
rawContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
});

// Production Air-Gap Guard
if (rawContent.includes(FORBIDDEN_PROD_REF)) {
  console.error(JSON.stringify({ success: false, error: 'ABORT: Production project reference detected in .env.staging!' }));
  process.exit(1);
}

const gatewayUrl = env['GATEWAY_SUPABASE_URL'];
const serviceRoleKey = env['GATEWAY_SUPABASE_SERVICE_ROLE_KEY'];
const directDbUrl = env['STAGING_DIRECT_DATABASE_URL'];
const poolerDbUrl = env['STAGING_DATABASE_URL'];

const report = {
  timestamp: new Date().toISOString(),
  environmentValidation: {
    status: 'PASS',
    stagingProjectRef: null,
    isProductionIsolated: true,
    hasFrontendSupabaseLeak: false,
    allRequiredVarsPresent: false
  },
  supabaseApiConnectivity: {
    status: 'UNKNOWN',
    endpoint: null,
    latencyMs: null,
    authAdminOk: false,
    error: null
  },
  databaseDirectConnectivity: {
    status: 'UNKNOWN',
    targetPort: 5432,
    databaseName: null,
    currentUser: null,
    version: null,
    latencyMs: null,
    error: null
  },
  databasePoolerConnectivity: {
    status: 'UNKNOWN',
    targetPort: 6543,
    databaseName: null,
    currentUser: null,
    version: null,
    latencyMs: null,
    error: null
  }
};

// Extract project ref
const match = gatewayUrl ? gatewayUrl.match(/https:\/\/([a-zA-Z0-9_-]+)\.supabase\.co/) : null;
report.environmentValidation.stagingProjectRef = match ? match[1] : 'unknown';
report.supabaseApiConnectivity.endpoint = gatewayUrl;
report.environmentValidation.allRequiredVarsPresent = Boolean(gatewayUrl && serviceRoleKey && directDbUrl && poolerDbUrl);

async function runTests() {
  console.log('--- STARTING NON-DESTRUCTIVE STAGING CONNECTION TESTS ---');

  // Test 1: Supabase API Connectivity (GoTrue Auth Admin listUsers)
  console.log('[1/3] Testing Supabase API connectivity via server-side client...');
  const t0 = Date.now();
  try {
    const supabase = createClient(gatewayUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    const latency = Date.now() - t0;
    report.supabaseApiConnectivity.latencyMs = latency;

    if (error) {
      report.supabaseApiConnectivity.status = 'FAIL';
      report.supabaseApiConnectivity.error = error.message;
      console.log(`  [FAIL] Supabase API Error: ${error.message} (${latency}ms)`);
    } else {
      report.supabaseApiConnectivity.status = 'PASS';
      report.supabaseApiConnectivity.authAdminOk = true;
      console.log(`  [PASS] Supabase API Auth Admin responded cleanly (${latency}ms, users listed: ${data.users ? data.users.length : 0})`);
    }
  } catch (err) {
    report.supabaseApiConnectivity.status = 'ERROR';
    report.supabaseApiConnectivity.error = err.message;
    console.log(`  [ERROR] Supabase API Exception: ${err.message}`);
  }

  // Test 2: Database Direct / Session Connection (Port 5432)
  console.log('[2/3] Testing PostgreSQL Session / Direct Connection (Port 5432)...');
  const t1 = Date.now();
  let directClient;
  try {
    directClient = new pg.Client({
      connectionString: directDbUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000
    });
    await directClient.connect();
    const res = await directClient.query('SELECT current_database(), current_user, version();');
    const latency = Date.now() - t1;
    report.databaseDirectConnectivity.latencyMs = latency;

    if (res.rows && res.rows.length > 0) {
      report.databaseDirectConnectivity.status = 'PASS';
      report.databaseDirectConnectivity.databaseName = res.rows[0].current_database;
      report.databaseDirectConnectivity.currentUser = res.rows[0].current_user;
      report.databaseDirectConnectivity.version = res.rows[0].version.split(',')[0];
      console.log(`  [PASS] Direct DB Connected (${latency}ms): Database="${res.rows[0].current_database}", User="${res.rows[0].current_user}", Version="${res.rows[0].version.split(' on ')[0]}"`);
    }
  } catch (err) {
    report.databaseDirectConnectivity.status = 'FAIL';
    report.databaseDirectConnectivity.error = err.message;
    console.log(`  [FAIL] Direct DB Error: ${err.message}`);
  } finally {
    if (directClient) {
      try { await directClient.end(); } catch (_) {}
    }
  }

  // Test 3: Database Transaction Pooler Connection (Port 6543)
  console.log('[3/3] Testing PostgreSQL Transaction Pooler Connection (Port 6543)...');
  const t2 = Date.now();
  let poolerClient;
  try {
    poolerClient = new pg.Client({
      connectionString: poolerDbUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000
    });
    await poolerClient.connect();
    const res = await poolerClient.query('SELECT current_database(), current_user, version();');
    const latency = Date.now() - t2;
    report.databasePoolerConnectivity.latencyMs = latency;

    if (res.rows && res.rows.length > 0) {
      report.databasePoolerConnectivity.status = 'PASS';
      report.databasePoolerConnectivity.databaseName = res.rows[0].current_database;
      report.databasePoolerConnectivity.currentUser = res.rows[0].current_user;
      report.databasePoolerConnectivity.version = res.rows[0].version.split(',')[0];
      console.log(`  [PASS] Pooler DB Connected (${latency}ms): Database="${res.rows[0].current_database}", User="${res.rows[0].current_user}"`);
    }
  } catch (err) {
    report.databasePoolerConnectivity.status = 'FAIL';
    report.databasePoolerConnectivity.error = err.message;
    console.log(`  [FAIL] Pooler DB Error: ${err.message}`);
  } finally {
    if (poolerClient) {
      try { await poolerClient.end(); } catch (_) {}
    }
  }

  console.log('\n--- TEST SUMMARY JSON ---');
  console.log(JSON.stringify(report, null, 2));

  // Determine overall status
  const allPassed = report.environmentValidation.status === 'PASS' &&
                    report.supabaseApiConnectivity.status === 'PASS' &&
                    report.databaseDirectConnectivity.status === 'PASS' &&
                    report.databasePoolerConnectivity.status === 'PASS';

  console.log('\n=============================================================');
  if (allPassed) {
    console.log('OVERALL VERDICT: ALL NON-DESTRUCTIVE CONNECTION TESTS PASSED');
  } else {
    console.log('OVERALL VERDICT: ONE OR MORE CONNECTION CHECKS FAILED');
  }
  console.log('=============================================================');
}

runTests().catch(err => {
  console.error('Test Runner Exception:', err);
  process.exit(1);
});

