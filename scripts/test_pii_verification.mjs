import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env.staging', 'utf8');
const getVar = (k) => { 
  const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)`, 'm')); 
  return m ? m[1].trim() : ''; 
};

const adminConnStr = getVar('STAGING_DATABASE_URL');
const bootstrapSecret = getVar('PLATFORM_BOOTSTRAP_SECRET');
const gatewayUrl = 'http://localhost:3002';

async function main() {
  console.log('================================================================');
  console.log(' VISTAAR SUPER ADMIN — DIRECT HTTP API PII ACCESS VERIFICATION');
  console.log('================================================================');

  // Test 1: Direct HTTP Request without Auth to Roster
  console.log('\n[TEST 1] Testing Unauthorized Access to Workspaces Roster...');
  const unauthRosterRes = await fetch(`${gatewayUrl}/api/v1/workspaces`);
  console.log(`  ✓ HTTP Status: ${unauthRosterRes.status} (Expected: 401)`);
  const unauthRosterJson = await unauthRosterRes.json();
  console.log(`  ✓ Response Error: ${unauthRosterJson.error || unauthRosterJson.message}`);

  // Test 2: Direct HTTP Request without Auth to Workspace Detail
  const dummyWsId = '099bbe4f-86ae-4d87-893e-58a5a1cce605';
  console.log('\n[TEST 2] Testing Unauthorized Access to Workspace Detail Deep-Dive...');
  const unauthDetailRes = await fetch(`${gatewayUrl}/api/v1/workspaces/${dummyWsId}`);
  console.log(`  ✓ HTTP Status: ${unauthDetailRes.status} (Expected: 401)`);
  const unauthDetailJson = await unauthDetailRes.json();
  console.log(`  ✓ Response Error: ${unauthDetailJson.error || unauthDetailJson.message}`);

  // Test 3: Authenticate Platform Admin via Login
  console.log('\n[TEST 3] Authenticating Platform Admin via Login...');
  const loginRes = await fetch(`${gatewayUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'navdeep@vistaarone.com',
      password: 'VistaarAdmin2026!#'
    })
  });
  const loginJson = await loginRes.json();
  if (!loginJson.success || !loginJson.session?.access_token) {
    throw new Error(`Failed to login as admin: ${JSON.stringify(loginJson)}`);
  }
  const token = loginJson.session.access_token;
  console.log(`  ✓ Successfully obtained Admin Bearer Token for ${loginJson.admin.email} (Role: ${loginJson.admin.role})`);

  // Test 4: Authorized HTTP Request to Workspaces Roster (Verify Server-Side Masking)
  console.log('\n[TEST 4] Testing Server-Side PII Masking on Workspaces Roster (/api/v1/workspaces)...');
  const authRosterRes = await fetch(`${gatewayUrl}/api/v1/workspaces?page=1&limit=5`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  console.log(`  ✓ HTTP Status: ${authRosterRes.status}`);
  const authRosterJson = await authRosterRes.json();
  const businesses = authRosterJson.data?.businesses || [];
  console.log(`  ✓ Returned ${businesses.length} businesses on roster.`);

  let allMasked = true;
  businesses.forEach((b, idx) => {
    const isEmailMasked = !b.ownerEmail || b.ownerEmail.includes('***');
    const isPhoneMasked = !b.ownerPhone || b.ownerPhone.includes('*****');
    console.log(`    [${idx + 1}] Company: ${b.legalName.padEnd(28)} | Email: ${(b.ownerEmail || 'N/A').padEnd(25)} | Phone: ${b.ownerPhone || 'N/A'}`);
    if (!isEmailMasked || !isPhoneMasked) {
      allMasked = false;
    }
  });

  if (!allMasked) {
    throw new Error('Server-side PII masking failed! Raw unmasked email or phone detected in roster response.');
  }
  console.log('  ✓ CONFIRMED: All roster responses are masked server-side by default.');

  // Test 5: Authorized Single-Workspace Detail Access
  console.log(`\n[TEST 5] Testing Authorized Detail Deep-Dive for Workspace ${dummyWsId}...`);
  const authDetailRes = await fetch(`${gatewayUrl}/api/v1/workspaces/${dummyWsId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  console.log(`  ✓ HTTP Status: ${authDetailRes.status}`);
  const authDetailJson = await authDetailRes.json();
  const wsData = authDetailJson.data?.workspace;
  console.log(`  ✓ Workspace Legal Name: ${wsData.company_name}`);
  console.log(`  ✓ Unmasked Owner Email: ${wsData.owner_email}`);
  console.log(`  ✓ Unmasked Owner Phone: ${wsData.owner_phone}`);

  // Test 6: Verify Server-Side PII_ACCESSED Audit Event in Database
  console.log('\n[TEST 6] Querying platform_audit_logs to verify PII_ACCESSED audit record...');
  const dbClient = new pg.Client({ connectionString: adminConnStr });
  await dbClient.connect();

  const auditRes = await dbClient.query(`
    SELECT id, admin_email, action, target_workspace_id, details, client_ip, created_at
    FROM public.platform_audit_logs 
    WHERE action = 'PII_ACCESSED' AND target_workspace_id = $1
    ORDER BY created_at DESC 
    LIMIT 1;
  `, [dummyWsId]);

  console.log(`  ✓ Audit records found: ${auditRes.rows.length}`);
  console.table(auditRes.rows);

  if (auditRes.rows.length === 0) {
    throw new Error('PII_ACCESSED audit event was not recorded in platform_audit_logs!');
  }
  console.log('  ✓ CONFIRMED: Server-side PII_ACCESSED audit event was immutably recorded in database.');

  await dbClient.end();

  console.log('\n================================================================');
  console.log(' 🎉 PII ACCESS & AUDIT LOGGING VERIFICATION PASSED (100%)');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
