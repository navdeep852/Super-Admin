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

const connectionString = env.STAGING_DIRECT_DATABASE_URL || env.STAGING_DATABASE_URL;
if (!connectionString) {
  console.error('Missing staging connection string');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to Staging PostgreSQL (vlbhxcajphyjkeueubud)');

  const sql = fs.readFileSync('d:/Project/vistaar-main/super_admin/migrations/081_workspace_test_classification_and_real_subscriptions.sql', 'utf8');
  await client.query(sql);
  console.log('Successfully executed migration 081');

  // Verify counts
  const res = await client.query('SELECT is_test, COUNT(*) FROM public.workspaces GROUP BY is_test');
  console.log('Workspaces is_test breakdown:', res.rows);

  const resSub = await client.query('SELECT is_test, COUNT(*) FROM public.workspace_subscriptions GROUP BY is_test');
  console.log('Workspace Subscriptions is_test breakdown:', resSub.rows);

  const viewCount = await client.query('SELECT COUNT(*) FROM public.v_authoritative_subscriptions');
  console.log('Total records in v_authoritative_subscriptions:', viewCount.rows[0].count);

  await client.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
