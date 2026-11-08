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
  SELECT pg_get_functiondef(oid) as def 
  FROM pg_proc 
  WHERE proname = 'enforce_platform_audit_immutability';
`);
console.log('--- enforce_platform_audit_immutability DEFINITION ---');
console.log(res.rows[0].def);

await client.end();

