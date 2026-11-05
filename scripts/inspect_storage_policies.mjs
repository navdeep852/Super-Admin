import fs from 'fs';
import pg from 'pg';

const envContent = fs.readFileSync('d:/Project/vistaar-main/super_admin/.env.staging', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
});

const client = new pg.Client({
  connectionString: env.STAGING_DIRECT_DATABASE_URL || env.STAGING_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT polname, polcmd, polroles::regrole[] 
    FROM pg_policy 
    WHERE polrelid = 'storage.objects'::regclass;
  `);
  console.log('Policies on storage.objects:', res.rows);
  await client.end();
}

main().catch(console.error);

