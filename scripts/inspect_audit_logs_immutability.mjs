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
console.log(' AUDIT-LOG IMMUTABILITY INSPECTION (platform_audit_logs)');
console.log('================================================================');

// 1. Table owner & namespace
const tableInfo = await client.query(`
  SELECT c.relname, pg_get_userbyid(c.relowner) as table_owner, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'platform_audit_logs';
`);
console.log('\n--- 1. TABLE OWNER & RLS STATUS ---');
console.table(tableInfo.rows);

// 2. Table Grants across roles
const tableGrants = await client.query(`
  SELECT grantee, privilege_type, is_grantable
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'platform_audit_logs'
  ORDER BY grantee, privilege_type;
`);
console.log('\n--- 2. ROLE TABLE GRANTS ---');
console.table(tableGrants.rows);

// 3. RLS Policies
const rlsPolicies = await client.query(`
  SELECT policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'platform_audit_logs';
`);
console.log('\n--- 3. RLS POLICIES ---');
console.table(rlsPolicies.rows);

// 4. Triggers on table
const triggers = await client.query(`
  SELECT tgname, tgenabled, pg_get_triggerdef(oid) as def
  FROM pg_trigger
  WHERE tgrelid = 'public.platform_audit_logs'::regclass;
`);
console.log('\n--- 4. TRIGGERS ON TABLE ---');
console.table(triggers.rows);

// 5. Functions referencing platform_audit_logs
const funcRefs = await client.query(`
  SELECT p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef, pg_get_functiondef(p.oid) as def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND pg_get_functiondef(p.oid) ILIKE '%platform_audit_logs%';
`);
console.log('\n--- 5. FUNCTIONS REFERENCING platform_audit_logs ---');
console.log(`Found ${funcRefs.rows.length} functions.`);
funcRefs.rows.forEach(r => {
  console.log(`\n- Function: ${r.proname} (Owner: ${r.owner}, Security Definer: ${r.prosecdef})`);
  console.log(r.def);
});

await client.end();
