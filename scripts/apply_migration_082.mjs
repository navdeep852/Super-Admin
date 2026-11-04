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

  const sql = fs.readFileSync('d:/Project/vistaar-main/super_admin/migrations/082_admin_profile_photo_management.sql', 'utf8');
  await client.query(sql);
  console.log('Successfully applied migration 082');

  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'platform_admins' 
      AND column_name IN ('id', 'email', 'full_name', 'avatar_url', 'avatar_updated_at', 'phone_number');
  `);
  console.log('Columns in platform_admins:', res.rows);

  await client.end();
}

main().catch(err => {
  console.error('Migration 082 failed:', err);
  process.exit(1);
});
