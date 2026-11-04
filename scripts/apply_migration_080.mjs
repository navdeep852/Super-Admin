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

const client = new pg.Client({
  connectionString: env.STAGING_DIRECT_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('Connecting to Staging Database (vlbhxcajphyjkeueubud)...');
  await client.connect();
  console.log('Connected.');

  const migrationSql = fs.readFileSync(path.resolve('migrations/080_subscription_plans_offers_and_pricing_engine.sql'), 'utf8');
  console.log('Executing Migration 080: subscription_plans_offers_and_pricing_engine...');
  
  await client.query(migrationSql);
  console.log('Migration 080 executed successfully.');

  // Verify columns
  const planCols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'subscription_plans' AND column_name IN ('is_active', 'features', 'usage_limits');
  `);
  console.log('Verified subscription_plans enhanced columns:', planCols.rows);

  const couponRows = await client.query('SELECT code, name, discount_type, discount_value FROM coupons');
  console.log('Active coupons in staging:', couponRows.rows);

  await client.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
