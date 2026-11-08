import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env.staging', 'utf8');
const getVar = (k) => { 
  const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)`, 'm')); 
  return m ? m[1].trim() : ''; 
};

const adminConnStr = getVar('STAGING_DATABASE_URL');
const baseHost = adminConnStr.split('@')[1].replace(':6543', ':5432');
const testPassword = 'StagingReportPass2026!#';
const repConnStr = `postgresql://v_super_admin_reporting.vlbhxcajphyjkeueubud:${encodeURIComponent(testPassword)}@${baseHost}`;

async function main() {
  console.log('================================================================');
  console.log(' VISTAAR — BUSINESS OS APPLICATION SESSION NON-INTERFERENCE TEST');
  console.log('================================================================');

  // Step 1: Admin setup
  const adminClient = new pg.Client({ connectionString: adminConnStr });
  await adminClient.connect();
  
  // Ensure reporting role has LOGIN
  await adminClient.query('ALTER ROLE v_super_admin_reporting WITH LOGIN;');

  // Provision / ensure Business OS dedicated application login role for staging testing
  await adminClient.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'business_os_app') THEN
        CREATE ROLE business_os_app WITH LOGIN PASSWORD 'BusinessOSAppPass2026!#' NOSUPERUSER INHERIT;
        GRANT authenticated TO business_os_app;
        GRANT USAGE ON SCHEMA public TO business_os_app;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO business_os_app;
      END IF;
    END
    $$;
  `);

  const appConnStr = `postgresql://business_os_app.vlbhxcajphyjkeueubud:BusinessOSAppPass2026!%23@${baseHost}`;

  // Step 2: Establish actual Business OS application session using business_os_app role
  console.log('\n[STEP 1] Establishing Business OS application session (role: business_os_app / authenticated)...');
  const appClient = new pg.Client({ connectionString: appConnStr });
  await appClient.connect();

  // Set role to authenticated to replicate exact PostgREST / JWT execution context
  await appClient.query('SET ROLE authenticated;');
  
  const appSessionRes = await appClient.query('SELECT current_user, session_user, pg_backend_pid();');
  const appPid = appSessionRes.rows[0].pg_backend_pid;
  console.log(`  ✓ Business OS App Session Established:`);
  console.log(`      PID:          ${appPid}`);
  console.log(`      Current User: ${appSessionRes.rows[0].current_user}`);
  console.log(`      Session User: ${appSessionRes.rows[0].session_user}`);

  // Hold an active transaction on the Business OS session
  await appClient.query('BEGIN;');
  const appInitialQuery = await appClient.query('SELECT count(*) as product_count FROM public.products;');
  console.log(`  ✓ Business OS operation inside open transaction: ${appInitialQuery.rows[0].product_count} products found.`);

  // Step 3: Establish reporting connection using v_super_admin_reporting
  console.log('\n[STEP 2] Establishing Reporting Session (v_super_admin_reporting)...');
  const repClient = new pg.Client({ connectionString: repConnStr });
  let repTerminatedNotice = false;
  repClient.on('error', (err) => {
    repTerminatedNotice = true;
    console.log(`  ✓ repClient error listener caught termination: ${err.message} (Code: ${err.code})`);
  });
  await repClient.connect();

  const repSessionRes = await repClient.query('SELECT current_user, session_user, pg_backend_pid();');
  const repPid = repSessionRes.rows[0].pg_backend_pid;
  console.log(`  ✓ Reporting Session Established:`);
  console.log(`      PID:          ${repPid}`);
  console.log(`      Current User: ${repSessionRes.rows[0].current_user}`);
  console.log(`      Session User: ${repSessionRes.rows[0].session_user}`);

  await repClient.query('BEGIN;');
  console.log('  ✓ Reporting session holds open transaction (BEGIN).');

  // Step 4: Verify both sessions actively present in pg_stat_activity
  console.log('\n[STEP 3] Inspecting active sessions in pg_stat_activity via Admin...');
  const actRes = await adminClient.query(`
    SELECT pid, usename, client_addr, state, query
    FROM pg_stat_activity 
    WHERE usename IN ('v_super_admin_reporting', 'business_os_app')
    ORDER BY usename;
  `);
  console.table(actRes.rows);

  if (actRes.rows.length < 2) {
    throw new Error('Both sessions were not found simultaneously in pg_stat_activity!');
  }

  // Step 5: Execute Emergency Revocation Procedure
  console.log('\n[STEP 4] Executing Emergency Reporting Revocation Procedure:');
  console.log('  1. ALTER ROLE v_super_admin_reporting WITH NOLOGIN;');
  console.log("  2. SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'v_super_admin_reporting' AND pid <> pg_backend_pid();");

  await adminClient.query('ALTER ROLE v_super_admin_reporting WITH NOLOGIN;');
  const termRes = await adminClient.query(`
    SELECT pid, pg_terminate_backend(pid) as terminated
    FROM pg_stat_activity 
    WHERE usename = 'v_super_admin_reporting' AND pid <> pg_backend_pid();
  `);
  console.log('  ✓ Termination executed on reporting sessions:');
  console.table(termRes.rows);

  // Step 6: Verify reporting session is terminated
  console.log('\n[STEP 5] Verifying reporting session termination in repClient...');
  let repDied = false;
  try {
    await repClient.query('SELECT 1;');
  } catch (err) {
    repDied = true;
    console.log(`  ✓ Reporting session successfully terminated! Error: ${err.message}`);
  }
  if (!repDied) {
    throw new Error('Reporting session did not terminate!');
  }

  // Step 7: Verify Business OS application session remains healthy and perform representative operation
  console.log('\n[STEP 6] Verifying Business OS application session (PID: ' + appPid + ') health & query execution...');
  
  // Safe Business OS operation 1: Commit active transaction
  await appClient.query('COMMIT;');
  console.log('  ✓ Business OS active transaction committed successfully.');

  // Safe Business OS operation 2: Representative operational query (Retail Products & Plans check)
  const prodRes = await appClient.query(`
    SELECT count(*) as total_products FROM public.products;
  `);
  const plansRes = await appClient.query(`
    SELECT id, name, price_monthly_inr FROM public.subscription_plans LIMIT 3;
  `);
  console.log(`  ✓ Representative Business OS POS queries succeeded:`);
  console.log(`      Products Count: ${prodRes.rows[0].total_products}`);
  console.table(plansRes.rows);

  // Safe Business OS operation 3: Verify session PID and user context unchanged
  const appPostCheck = await appClient.query('SELECT current_user, session_user, pg_backend_pid();');
  console.log(`  ✓ Business OS session verified intact: PID ${appPostCheck.rows[0].pg_backend_pid} (Expected: ${appPid})`);
  console.log(`  ✓ Current User remains: ${appPostCheck.rows[0].current_user}`);

  // Cleanup: Re-enable login on v_super_admin_reporting
  await adminClient.query('ALTER ROLE v_super_admin_reporting WITH LOGIN;');
  console.log('\n[CLEANUP] Re-enabled LOGIN on v_super_admin_reporting.');

  await appClient.end();
  try { await repClient.end(); } catch (_) {}
  await adminClient.end();

  console.log('\n================================================================');
  console.log(' 🎉 BUSINESS OS NON-INTERFERENCE VERIFICATION PASSED (100%)');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
