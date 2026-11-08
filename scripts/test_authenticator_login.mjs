import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env.staging', 'utf8');
const getVar = (k) => { 
  const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)`, 'm')); 
  return m ? m[1].trim() : ''; 
};

const adminConnStr = getVar('STAGING_DATABASE_URL');
const baseHost = adminConnStr.split('@')[1].replace(':6543', ':5432');
const adminPass = adminConnStr.split('@')[0].split(':')[2];

// Check authenticator password or grant login
const adminClient = new pg.Client({ connectionString: adminConnStr });
await adminClient.connect();

// Try to set password for authenticator or check if it already has one
try {
  await adminClient.query("ALTER ROLE authenticator WITH PASSWORD 'BusinessOSAuthPass2026!#';");
  console.log('Set authenticator password.');
} catch (e) {
  console.log('Could not alter authenticator password:', e.message);
}

const authConnStr = `postgresql://authenticator.vlbhxcajphyjkeueubud:BusinessOSAuthPass2026!%23@${baseHost}`;
try {
  const authClient = new pg.Client({ connectionString: authConnStr });
  await authClient.connect();
  const res = await authClient.query('SELECT current_user, session_user, pg_backend_pid();');
  console.log('✓ Successfully connected as authenticator! User:', res.rows[0].current_user, 'PID:', res.rows[0].pg_backend_pid);
  await authClient.end();
} catch (e) {
  console.log('Authenticator login test:', e.message);
}

await adminClient.end();

