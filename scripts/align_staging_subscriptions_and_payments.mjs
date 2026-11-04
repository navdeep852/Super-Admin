import fs from 'fs';
import pg from 'pg';
import crypto from 'crypto';

const envContent = fs.readFileSync('d:/Project/vistaar-main/super_admin/.env.staging', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
});

const pool = new pg.Pool({
  connectionString: env['STAGING_DIRECT_DATABASE_URL'],
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('Aligning workspaces, plans, and SaaS payments...');

    // 1. Remove duplicate Apex Retail without subscriptions/profiles
    const dupes = await client.query(`
      SELECT w.id FROM public.workspaces w
      WHERE w.company_name = 'Apex Retail India Pvt Ltd'
        AND NOT EXISTS (SELECT 1 FROM public.workspace_subscriptions s WHERE s.workspace_id = w.id)
    `);
    for (const d of dupes.rows) {
      console.log('Removing duplicate workspace:', d.id);
      await client.query('DELETE FROM public.workspaces WHERE id = $1', [d.id]);
    }

    // 2. Set distinct plans for each business
    const planMappings = [
      { name: 'Apex Retail India Pvt Ltd', plan: 'growth', status: 'active', payment: 9999 },
      { name: 'Metro Textiles Synthetic', plan: 'business', status: 'active', payment: 5999 },
      { name: 'Deccan Logistics & Supply', plan: 'growth', status: 'active', payment: 9999 },
      { name: 'Shree Ganesh Jewelers', plan: 'growth', status: 'active', payment: 9999 },
      { name: 'Sunrise Chemist & Druggist', plan: 'starter', status: 'active', payment: 2499 },
      { name: 'Zenith Electronics Staging', plan: 'starter_mobile', status: 'cancelled', payment: 4498 },
      { name: 'Bharat Hardware Synthetic', plan: 'starter', status: 'active', payment: 2499 },
      { name: 'Punjab Auto Spares & Tools', plan: 'free_trial', status: 'expired', payment: 0 },
      { name: 'Kalyan Kirana Stores', plan: 'free_trial', status: 'trialing', payment: 0 }
    ];

    for (const m of planMappings) {
      const ws = await client.query('SELECT id FROM public.workspaces WHERE company_name = $1 LIMIT 1', [m.name]);
      if (ws.rowCount === 0) continue;
      const wsId = ws.rows[0].id;

      const trialEnd = m.status === 'expired' 
        ? new Date(Date.now() - 5 * 86400000) 
        : new Date(Date.now() + 10 * 86400000);
      const periodEnd = new Date(Date.now() + 300 * 86400000);

      await client.query(`
        INSERT INTO public.workspace_subscriptions (
          workspace_id, plan_id, status, trial_start, trial_end, current_period_start, current_period_end,
          billing_interval, cancel_at_period_end, created_at, updated_at
        ) VALUES ($1, $2, $3, NOW(), $4, NOW(), $5, 'annual', false, NOW(), NOW())
        ON CONFLICT (workspace_id) DO UPDATE SET
          plan_id = EXCLUDED.plan_id,
          status = EXCLUDED.status,
          trial_end = EXCLUDED.trial_end,
          current_period_end = EXCLUDED.current_period_end,
          updated_at = NOW()
      `, [wsId, m.plan, m.status, trialEnd, periodEnd]);

      if (m.payment > 0) {
        const payId = crypto.randomUUID();
        const ref = `SaaS-${m.name.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;
        await client.query(`
          INSERT INTO public.payment_transactions (
            id, workspace_id, transaction_reference, provider, amount_inr,
            currency, plan_id, status, verified_at, created_at
          ) VALUES ($1, $2, $3, 'youpi_pg', $4, 'INR', $5, 'verified_success', NOW(), NOW())
        `, [payId, wsId, ref, m.payment, m.plan]);
      }
    }

    // Add 1 refund record to verify refund KPI calculation
    const deccanWs = await client.query("SELECT id FROM public.workspaces WHERE company_name = 'Deccan Logistics & Supply' LIMIT 1");
    if (deccanWs.rowCount > 0) {
      await client.query(`
        INSERT INTO public.payment_transactions (
          id, workspace_id, transaction_reference, provider, amount_inr,
          currency, plan_id, status, verified_at, created_at
        ) VALUES ($1, $2, 'REF-DEC-001', 'youpi_pg', 1200, 'INR', 'growth', 'refunded', NOW(), NOW())
      `, [crypto.randomUUID(), deccanWs.rows[0].id]);
    }

    console.log('✅ Aligned plans, subscriptions, and SaaS payment transactions successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
