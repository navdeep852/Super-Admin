import fs from 'fs';
import pg from 'pg';

const env = fs.readFileSync('d:/Project/vistaar-main/super_admin/.env.staging', 'utf8')
  .split('\n')
  .reduce((acc, l) => {
    const [k, ...v] = l.trim().split('=');
    if (k && !k.startsWith('#')) acc[k] = v.join('=');
    return acc;
  }, {});

async function checkPlans() {
  const client = new pg.Client({
    connectionString: env['STAGING_DIRECT_DATABASE_URL'],
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const res = await client.query('SELECT id, name, price_annual_inr, price_monthly_inr, max_users, max_branches FROM public.subscription_plans ORDER BY price_annual_inr;');
  console.log('Subscription plans:', res.rows);
  await client.end();
}

checkPlans().catch(console.error);

