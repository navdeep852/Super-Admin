import fs from 'fs';
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
  const client = new pg.Client({ 
    connectionString: env.STAGING_DIRECT_DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });
  await client.connect();

  const res = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_user_workspace_id';
  `);
  console.log('Function definition:');
  console.log(res.rows[0]?.definition);

  const res2 = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_has_workspace_access';
  `);
  console.log('\nuser_has_workspace_access definition:');
  console.log(res2.rows[0]?.definition);

  await client.end();
}

main().catch(console.error);

