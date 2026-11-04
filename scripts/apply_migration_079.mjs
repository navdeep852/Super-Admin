import fs from 'fs';
import path from 'path';
import pg from 'pg';

const envContent = fs.readFileSync('.env.staging', 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
}

async function main() {
  console.log('Connecting to Staging Database (vlbhxcajphyjkeueubud)...');
  const client = new pg.Client({ 
    connectionString: env.STAGING_DIRECT_DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });
  await client.connect();

  const sqlPath = path.resolve('migrations/079_enforce_workspace_suspension_rls.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  console.log('Executing migration 079_enforce_workspace_suspension_rls.sql...');
  await client.query(sql);
  console.log('✅ Migration 079 executed SUCCESSFULLY on Staging!');

  // Verify functions exist
  const res = await client.query(`
    SELECT routine_name 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
      AND routine_name IN ('current_user_workspace_id', 'user_has_workspace_access', 'super_admin_suspend_workspace', 'super_admin_reactivate_workspace')
  `);
  console.log('Verified routines in public schema:', res.rows.map(r => r.routine_name));

  await client.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

