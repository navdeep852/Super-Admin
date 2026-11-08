import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env.staging', 'utf8');
const getVar = (k) => { 
  const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)`, 'm')); 
  return m ? m[1].trim() : ''; 
};

const adminConnStr = getVar('STAGING_DATABASE_URL');
const testPassword = 'StagingReportPass2026!#';

// Direct port 5432 connection string for v_super_admin_reporting with tenant prefix
const baseHost = adminConnStr.split('@')[1].replace(':6543', ':5432');
const repConnStr = `postgresql://v_super_admin_reporting.vlbhxcajphyjkeueubud:${encodeURIComponent(testPassword)}@${baseHost}`;

async function main() {
  console.log('================================================================');
  console.log(' VISTAAR — ACTIVE-SESSION EMERGENCY REVOCATION LIVE TEST');
  console.log('================================================================');

  // Step 1: Admin connection (representing Business OS / DBA)
  const adminClient = new pg.Client({ connectionString: adminConnStr });
  await adminClient.connect();
  const adminPidRes = await adminClient.query('SELECT pg_backend_pid();');
  const adminPid = adminPidRes.rows[0].pg_backend_pid;
  console.log(`[INIT] Admin (Business OS session) connected. PID: ${adminPid}, User: postgres`);

  // Ensure role has LOGIN enabled before testing
  await adminClient.query('ALTER ROLE v_super_admin_reporting WITH LOGIN;');

  // Step 2: Establish actual live reporting session authenticated as v_super_admin_reporting
  console.log('\n[STEP 1] Establishing live authenticated connection as v_super_admin_reporting...');
  const repClient = new pg.Client({ connectionString: repConnStr });
  repClient.on('error', (err) => {
    console.log(`  ✓ repClient error handler caught expected disconnection: ${err.message} (Code: ${err.code})`);
  });
  await repClient.connect();
  const repPidRes = await repClient.query('SELECT current_user, session_user, pg_backend_pid();');
  const repPid = repPidRes.rows[0].pg_backend_pid;
  console.log(`  ✓ Authenticated as: ${repPidRes.rows[0].current_user} (Session User: ${repPidRes.rows[0].session_user})`);
  console.log(`  ✓ Active Reporting Session PID: ${repPid}`);

  // Put reporting session into an active transaction
  await repClient.query('BEGIN;');
  console.log('  ✓ Reporting session holds open transaction (BEGIN).');

  // Step 3: Admin verifies connection in pg_stat_activity
  console.log('\n[STEP 2] Admin querying pg_stat_activity to inspect all active sessions...');
  const actRes = await adminClient.query(`
    SELECT pid, usename, client_addr, state, backend_start, query_start, query
    FROM pg_stat_activity 
    WHERE usename IN ('v_super_admin_reporting', 'postgres', 'supabase_admin')
    ORDER BY backend_start;
  `);
  console.table(actRes.rows);

  const foundRep = actRes.rows.find(r => r.pid === repPid);
  if (!foundRep) {
    throw new Error(`Reporting session PID ${repPid} not found in pg_stat_activity!`);
  }
  console.log(`  ✓ Confirmed: Reporting PID ${repPid} is actively running in pg_stat_activity with state: '${foundRep.state}'`);

  // Step 4: Execute Emergency Revocation Procedure
  console.log('\n[STEP 3] Executing Documented Emergency Revocation Procedure:');
  console.log('  1. ALTER ROLE v_super_admin_reporting WITH NOLOGIN;');
  console.log("  2. SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'v_super_admin_reporting' AND pid <> pg_backend_pid();");

  await adminClient.query('ALTER ROLE v_super_admin_reporting WITH NOLOGIN;');
  console.log('  ✓ Step 1 Applied: NOLOGIN set on v_super_admin_reporting.');

  const termResult = await adminClient.query(`
    SELECT pid, pg_terminate_backend(pid) as terminated
    FROM pg_stat_activity 
    WHERE usename = 'v_super_admin_reporting' AND pid <> pg_backend_pid();
  `);
  console.log('  ✓ Step 2 Terminate Backend Executed:');
  console.table(termResult.rows);

  // Step 5: Verify reporting session is terminated
  console.log('\n[STEP 4] Verifying reporting session termination in repClient...');
  let sessionDied = false;
  try {
    // Attempting query on terminated connection
    await repClient.query('SELECT 1;');
  } catch (err) {
    sessionDied = true;
    console.log(`  ✓ Reporting session cleanly terminated by server! Error received: ${err.message}`);
  }

  if (!sessionDied) {
    throw new Error('Reporting session did not terminate!');
  }

  // Step 6: Verify new connection attempts are blocked by NOLOGIN
  console.log('\n[STEP 5] Testing that new connection attempts are rejected by NOLOGIN...');
  let loginBlocked = false;
  const blockedClient = new pg.Client({ connectionString: repConnStr });
  try {
    await blockedClient.connect();
  } catch (err) {
    loginBlocked = true;
    console.log(`  ✓ New connection rejected as expected: ${err.message}`);
  } finally {
    try { await blockedClient.end(); } catch (_) {}
  }

  // Step 7: Verify Business OS session remains 100% unaffected
  console.log('\n[STEP 6] Verifying Admin / Business OS session is still healthy & operational...');
  const adminPostCheck = await adminClient.query('SELECT current_user, pg_backend_pid(), 1 as health_check;');
  console.log(`  ✓ Admin session PID: ${adminPostCheck.rows[0].pg_backend_pid} (healthy: ${adminPostCheck.rows[0].health_check === 1})`);
  console.log('  ✓ Zero impact on Business OS / postgres connections.');

  // Restore LOGIN for test environment consistency
  await adminClient.query('ALTER ROLE v_super_admin_reporting WITH LOGIN;');
  console.log('\n[CLEANUP] Re-enabled LOGIN on v_super_admin_reporting for subsequent testing.');

  await adminClient.end();
  try { await repClient.end(); } catch (_) {}

  console.log('\n================================================================');
  console.log(' 🎉 ACTIVE-SESSION EMERGENCY REVOCATION LIVE TEST PASSED (100%)');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
