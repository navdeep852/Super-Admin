import pg from 'pg';
import fs from 'fs';
import { getClientIp } from '../server/gateway.mjs';

const env = fs.readFileSync('.env.staging', 'utf8');
const getVar = (k) => { 
  const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)`, 'm')); 
  return m ? m[1].trim() : ''; 
};

const adminConnStr = getVar('STAGING_DATABASE_URL');
const gatewayUrl = 'http://localhost:3002';

async function main() {
  console.log('================================================================');
  console.log(' VISTAAR SUPER ADMIN — TRUSTED CLIENT IP AUDITING TEST SUITE');
  console.log('================================================================');

  // ---------------------------------------------------------------------------
  // 1. Unit Logic Assertions for getClientIp
  // ---------------------------------------------------------------------------
  console.log('\n[PHASE 1] Testing getClientIp Spoofing-Resistance Logic...');

  // Scenario A: Direct local request without proxy header
  const reqA = { socket: { remoteAddress: '127.0.0.1' }, headers: {} };
  const ipA = getClientIp(reqA);
  console.log(`  ✓ Scenario A (Direct loopback, no headers): ${ipA} (Expected: 127.0.0.1)`);
  if (ipA !== '127.0.0.1') throw new Error('Scenario A failed!');

  // Scenario B: Trusted proxy forwarding genuine client IP
  const reqB = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '203.0.113.195' } };
  const ipB = getClientIp(reqB);
  console.log(`  ✓ Scenario B (Trusted proxy forwarding client IP): ${ipB} (Expected: 203.0.113.195)`);
  if (ipB !== '203.0.113.195') throw new Error('Scenario B failed!');

  // Scenario C: Untrusted remote client attempting to spoof IP via X-Forwarded-For
  const reqC = { socket: { remoteAddress: '198.51.100.50' }, headers: { 'x-forwarded-for': '8.8.8.8, 1.1.1.1' } };
  const ipC = getClientIp(reqC);
  console.log(`  ✓ Scenario C (Untrusted client spoofing attempt): ${ipC} (Expected socket IP: 198.51.100.50)`);
  if (ipC !== '198.51.100.50') throw new Error('Scenario C failed! Untrusted header was accepted!');

  // Scenario D: Trusted proxy chain with internal loopback candidate
  const reqD = { socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: { 'x-forwarded-for': '127.0.0.1, 198.51.100.77' } };
  const ipD = getClientIp(reqD);
  console.log(`  ✓ Scenario D (Loopback filter in proxy chain): ${ipD} (Expected: 198.51.100.77)`);
  if (ipD !== '198.51.100.77') throw new Error('Scenario D failed!');

  // ---------------------------------------------------------------------------
  // 2. Live HTTP Integration Test against Gateway BFF with PII Access Audit
  // ---------------------------------------------------------------------------
  console.log('\n[PHASE 2] Testing Live HTTP API Audit Recording with Forwarded Header...');

  // Step 1: Login as admin
  const loginRes = await fetch(`${gatewayUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'navdeep@vistaarone.com', password: 'VistaarAdmin2026!#' })
  });
  const loginJson = await loginRes.json();
  const token = loginJson.session.access_token;
  console.log('  ✓ Authenticated as admin.');

  // Step 2: Request workspace detail passing a simulated forwarded client IP through trusted local socket
  const simulatedVisitorIp = '49.207.180.22';
  const targetWsId = '099bbe4f-86ae-4d87-893e-58a5a1cce605';
  console.log(`  ✓ Requesting /api/v1/workspaces/${targetWsId} with X-Forwarded-For: ${simulatedVisitorIp}...`);

  const detailRes = await fetch(`${gatewayUrl}/api/v1/workspaces/${targetWsId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Forwarded-For': simulatedVisitorIp
    }
  });
  console.log(`  ✓ HTTP Detail Status: ${detailRes.status}`);

  // Step 3: Query platform_audit_logs to verify client_ip recorded
  const dbClient = new pg.Client({ connectionString: adminConnStr });
  await dbClient.connect();

  const auditRes = await dbClient.query(`
    SELECT id, admin_email, action, target_workspace_id, client_ip, created_at
    FROM public.platform_audit_logs 
    WHERE action = 'PII_ACCESSED' AND target_workspace_id = $1
    ORDER BY created_at DESC 
    LIMIT 1;
  `, [targetWsId]);

  console.log('  ✓ Most recent audit record from database:');
  console.table(auditRes.rows);

  const recordedIp = auditRes.rows[0]?.client_ip;
  console.log(`  ✓ Database recorded client_ip: '${recordedIp}' (Expected: '${simulatedVisitorIp}')`);

  if (recordedIp !== simulatedVisitorIp) {
    throw new Error(`Recorded IP mismatch! Expected ${simulatedVisitorIp}, got ${recordedIp}`);
  }

  await dbClient.end();

  console.log('\n================================================================');
  console.log(' 🎉 TRUSTED CLIENT IP AUDITING TEST PASSED (100%)');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

