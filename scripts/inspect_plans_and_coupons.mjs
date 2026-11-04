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

const client = new pg.Client({ connectionString: env.STAGING_DIRECT_DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coupons'
    ORDER BY ordinal_position;
  `);
  console.log('=== COUPONS COLUMNS ===');
  for (const c of cols.rows) {
    console.log(`  ${c.column_name}: ${c.data_type} (default: ${c.column_default})`);
  }

  const plans = await client.query('SELECT * FROM subscription_plans ORDER BY price_monthly_inr');
  console.log('\n=== SUBSCRIPTION PLANS IN STAGING ===');
  console.table(plans.rows);

  const subs = await client.query(`
    SELECT ws.id, ws.workspace_id, w.company_name, ws.plan_id, ws.status, ws.billing_interval, ws.trial_end, ws.current_period_end 
    FROM workspace_subscriptions ws 
    JOIN workspaces w ON w.id = ws.workspace_id
  `);
  console.log('\n=== WORKSPACE SUBSCRIPTIONS IN STAGING ===');
  console.table(subs.rows);

  const pt = await client.query(`
    SELECT id, workspace_id, transaction_reference, provider, amount_inr, status, created_at 
    FROM payment_transactions 
    ORDER BY created_at DESC 
    LIMIT 10
  `);
  console.log('\n=== PAYMENT TRANSACTIONS IN STAGING ===');
  console.table(pt.rows);

  await client.end();
}

main().catch(console.error);
