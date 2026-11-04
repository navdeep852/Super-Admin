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

const client = new pg.Client({ 
  connectionString: env.STAGING_DIRECT_DATABASE_URL, 
  ssl: { rejectUnauthorized: false } 
});

async function inspectTable(tableName) {
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position;
  `, [tableName]);
  console.log(`\n=== TABLE: ${tableName} (${cols.rows.length} columns) ===`);
  for (const c of cols.rows) {
    console.log(`  ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable}, default: ${c.column_default})`);
  }
}

async function main() {
  await client.connect();
  const targetTables = [
    'workspaces',
    'profiles',
    'workspace_memberships',
    'subscription_plans',
    'workspace_subscriptions',
    'offers',
    'coupons',
    'coupon_redemptions',
    'payment_transactions',
    'invoices',
    'payments'
  ];

  for (const t of targetTables) {
    await inspectTable(t);
  }

  // Also check existing row counts
  console.log('\n=== ROW COUNTS ===');
  for (const t of targetTables) {
    const countRes = await client.query(`SELECT COUNT(*) FROM "${t}"`);
    console.log(`  ${t}: ${countRes.rows[0].count} rows`);
  }

  await client.end();
}

main().catch(console.error);
