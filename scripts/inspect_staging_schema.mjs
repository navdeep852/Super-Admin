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

  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log('Public tables count:', tables.rows.length);
  console.log('Public tables:', tables.rows.map(r => r.table_name));

  const funcs = await client.query(`
    SELECT routine_name 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    ORDER BY routine_name;
  `);
  console.log('Public routines count:', funcs.rows.length);
  console.log('Public routines:', funcs.rows.map(r => r.routine_name));

  await client.end();
}

main().catch(console.error);
