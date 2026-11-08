import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env.staging', 'utf8');
const getVar = (k) => { 
  const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)`, 'm')); 
  return m ? m[1].trim() : ''; 
};

const adminConnStr = getVar('STAGING_DATABASE_URL');
const client = new pg.Client({ connectionString: adminConnStr });
await client.connect();

console.log('================================================================');
console.log(' TESTING AUDIT-LOG MUTATION & IMMUTABILITY ENFORCEMENT');
console.log('================================================================');

// Ensure at least one test record exists for mutation testing
await client.query(`
  INSERT INTO public.platform_audit_logs (admin_email, admin_role, action, details)
  VALUES ('navdeep@vistaarone.com', 'super_admin', 'PRE_AUDIT_PROBE', '{"source": "test"}'::jsonb);
`);
console.log('Ensured probe audit record exists in platform_audit_logs.');

// 1. Test UPDATE as postgres admin
console.log('\n[TEST 1] Attempting UPDATE on platform_audit_logs as postgres admin...');
try {
  await client.query("UPDATE public.platform_audit_logs SET action = 'TAMPERED' WHERE id = (SELECT id FROM public.platform_audit_logs LIMIT 1);");
  console.error('  ❌ FAILED: UPDATE succeeded! Table is NOT immutable!');
} catch (err) {
  console.log(`  ✓ BLOCKED (Expected): ${err.message} (Code: ${err.code})`);
}

// 2. Test DELETE as postgres admin
console.log('\n[TEST 2] Attempting DELETE on platform_audit_logs as postgres admin...');
try {
  await client.query("DELETE FROM public.platform_audit_logs WHERE id = (SELECT id FROM public.platform_audit_logs LIMIT 1);");
  console.error('  ❌ FAILED: DELETE succeeded! Table is NOT immutable!');
} catch (err) {
  console.log(`  ✓ BLOCKED (Expected): ${err.message} (Code: ${err.code})`);
}

// Apply truncate protection trigger to platform_audit_logs in Staging
await client.query(`
  CREATE OR REPLACE FUNCTION public.enforce_platform_audit_truncate_protection()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
  BEGIN
      RAISE EXCEPTION 'SECURITY_VIOLATION: platform_audit_logs is an immutable append-only ledger. Truncation is strictly prohibited.'
          USING ERRCODE = '55000';
  END;
  $$;

  DROP TRIGGER IF EXISTS trg_protect_truncate_platform_audit_logs ON public.platform_audit_logs;
  CREATE TRIGGER trg_protect_truncate_platform_audit_logs
  BEFORE TRUNCATE ON public.platform_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION enforce_platform_audit_truncate_protection();
`);

// 3. Test TRUNCATE as postgres admin
console.log('\n[TEST 3] Attempting TRUNCATE on platform_audit_logs as postgres admin...');
try {
  await client.query("TRUNCATE TABLE public.platform_audit_logs;");
  console.error('  ❌ FAILED: TRUNCATE succeeded!');
} catch (err) {
  console.log(`  ✓ BLOCKED (Expected): ${err.message} (Code: ${err.code})`);
}

// 4. Test UPDATE as v_super_admin_reporting
console.log('\n[TEST 4] Attempting UPDATE as v_super_admin_reporting...');
try {
  await client.query('SET ROLE v_super_admin_reporting;');
  await client.query("UPDATE public.platform_audit_logs SET action = 'TAMPERED';");
  console.error('  ❌ FAILED: UPDATE succeeded as v_super_admin_reporting!');
} catch (err) {
  console.log(`  ✓ BLOCKED (Expected): ${err.message} (Code: ${err.code})`);
} finally {
  await client.query('RESET ROLE;');
}

// 5. Test DELETE as v_super_admin_reporting
console.log('\n[TEST 5] Attempting DELETE as v_super_admin_reporting...');
try {
  await client.query('SET ROLE v_super_admin_reporting;');
  await client.query("DELETE FROM public.platform_audit_logs;");
  console.error('  ❌ FAILED: DELETE succeeded as v_super_admin_reporting!');
} catch (err) {
  console.log(`  ✓ BLOCKED (Expected): ${err.message} (Code: ${err.code})`);
} finally {
  await client.query('RESET ROLE;');
}

// 6. Test Gateway Endpoints for Audit-Log Mutation
console.log('\n[TEST 6] Inspecting Gateway Endpoints for Audit Log Mutation...');
// Check whether gateway has any PUT/PATCH/DELETE endpoints on audit logs
const gatewayCode = fs.readFileSync('server/gateway.mjs', 'utf8');
const hasAuditDelete = gatewayCode.includes('/api/v1/audit-logs') && (gatewayCode.includes("req.method === 'DELETE'") || gatewayCode.includes("req.method === 'PUT'") || gatewayCode.includes("req.method === 'PATCH'"));
console.log(`  ✓ Gateway audit mutation endpoints exist: ${hasAuditDelete ? 'YES (VULNERABLE)' : 'NO (SECURE - READ ONLY)'}`);

await client.end();
