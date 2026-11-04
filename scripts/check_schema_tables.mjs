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

const pool = new pg.Pool({
  connectionString: env['STAGING_DIRECT_DATABASE_URL'],
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    const ws = await client.query('SELECT w.id, w.company_name, w.is_active, s.plan_id, s.status as sub_status, count(p.id) as employee_count FROM public.workspaces w LEFT JOIN public.workspace_subscriptions s ON w.id = s.workspace_id LEFT JOIN public.profiles p ON w.id = p.workspace_id GROUP BY w.id, w.company_name, w.is_active, s.plan_id, s.status ORDER BY w.company_name');
    console.log('Workspaces (' + ws.rowCount + '):');
    ws.rows.forEach(r => console.log('  - ' + r.company_name + ': Active=' + r.is_active + ', Plan=' + r.plan_id + ', SubStatus=' + r.sub_status + ', Staff=' + r.employee_count));

    const inv = await client.query('SELECT count(*) as count, sum(grand_total) as gmv, sum(paid_amount) as collected, sum(balance_amount) as outstanding FROM public.invoices');
    console.log('\nInvoices aggregate:', inv.rows[0]);

    const pt = await client.query("SELECT status, count(*) as count, sum(amount_inr) as total_inr FROM public.payment_transactions GROUP BY status");
    console.log('\nSaaS Payments by status:', pt.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
