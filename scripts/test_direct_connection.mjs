import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env.staging', 'utf8');
const getVar = (k) => { 
  const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)`, 'm')); 
  return m ? m[1].trim() : ''; 
};

const adminConnStr = getVar('STAGING_DATABASE_URL');
const adminClient = new pg.Client({ connectionString: adminConnStr });
await adminClient.connect();
console.log('Connected as postgres admin.');

const testPassword = 'StagingReportPass2026!#';
await adminClient.query(`ALTER ROLE v_super_admin_reporting WITH PASSWORD '${testPassword}';`);
console.log('Set v_super_admin_reporting password on staging.');

// Let's test connection variants for pooler / direct
const baseUserPass = adminConnStr.split('@')[0];
const baseHost = adminConnStr.split('@')[1];

// Variant 1: Pooler port 6543 with tenant prefix: v_super_admin_reporting.vlbhxcajphyjkeueubud
const connStr1 = `postgresql://v_super_admin_reporting.vlbhxcajphyjkeueubud:${encodeURIComponent(testPassword)}@${baseHost}`;
console.log('\nTesting Variant 1 (Port 6543 with tenant prefix)...');
try {
  const c1 = new pg.Client({ connectionString: connStr1 });
  await c1.connect();
  const res1 = await c1.query('SELECT current_user, session_user, pg_backend_pid();');
  console.log('  ✓ Connected successfully! User:', res1.rows[0].current_user, 'PID:', res1.rows[0].pg_backend_pid);
  await c1.end();
} catch (e) {
  console.log('  ❌ Variant 1 failed:', e.message);
}

// Variant 2: Port 5432 (session pooler) with tenant prefix
const host5432 = baseHost.replace(':6543', ':5432');
const connStr2 = `postgresql://v_super_admin_reporting.vlbhxcajphyjkeueubud:${encodeURIComponent(testPassword)}@${host5432}`;
console.log('\nTesting Variant 2 (Port 5432 with tenant prefix)...');
try {
  const c2 = new pg.Client({ connectionString: connStr2 });
  await c2.connect();
  const res2 = await c2.query('SELECT current_user, session_user, pg_backend_pid();');
  console.log('  ✓ Connected successfully! User:', res2.rows[0].current_user, 'PID:', res2.rows[0].pg_backend_pid);
  await c2.end();
} catch (e) {
  console.log('  ❌ Variant 2 failed:', e.message);
}

// Variant 3: Without tenant prefix (just v_super_admin_reporting)
const connStr3 = `postgresql://v_super_admin_reporting:${encodeURIComponent(testPassword)}@${host5432}`;
console.log('\nTesting Variant 3 (Port 5432 without tenant prefix)...');
try {
  const c3 = new pg.Client({ connectionString: connStr3 });
  await c3.connect();
  const res3 = await c3.query('SELECT current_user, session_user, pg_backend_pid();');
  console.log('  ✓ Connected successfully! User:', res3.rows[0].current_user, 'PID:', res3.rows[0].pg_backend_pid);
  await c3.end();
} catch (e) {
  console.log('  ❌ Variant 3 failed:', e.message);
}

await adminClient.end();
