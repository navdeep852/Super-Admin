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

const res = await client.query(`
  SELECT rolname, rolcanlogin, rolsuper, rolinherit, rolconnlimit 
  FROM pg_roles 
  WHERE rolname IN ('authenticated', 'anon', 'service_role', 'authenticator', 'postgres', 'v_super_admin_reporting')
  ORDER BY rolname;
`);
console.table(res.rows);

// Check members of authenticator and authenticated
const members = await client.query(`
  SELECT r.rolname as role, m.rolname as member
  FROM pg_auth_members am
  JOIN pg_roles r ON r.oid = am.roleid
  JOIN pg_roles m ON m.oid = am.member
  WHERE r.rolname IN ('authenticated', 'anon', 'service_role', 'authenticator');
`);
console.table(members.rows);

await client.end();

