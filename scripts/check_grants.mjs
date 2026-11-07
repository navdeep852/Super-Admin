import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env.staging', 'utf8');
const getVar = (k) => { 
  const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)`, 'm')); 
  return m ? m[1].trim() : ''; 
};

const client = new pg.Client({ connectionString: getVar('STAGING_DATABASE_URL') });
await client.connect();

const res = await client.query(`
  SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'super_admin_reporting' AND grantee = 'v_super_admin_reporting'
  ORDER BY table_name;
`);
console.table(res.rows);

// Let's grant SELECT on super_admin_reporting.v_report_payments_collections to v_super_admin_reporting if missing
await client.query(`GRANT SELECT ON super_admin_reporting.v_report_payments_collections TO v_super_admin_reporting;`);
console.log('Granted SELECT on v_report_payments_collections to v_super_admin_reporting.');

await client.end();

