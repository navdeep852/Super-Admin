import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env.staging', 'utf8');
const getVar = (k) => { 
  const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)`, 'm')); 
  return m ? m[1].trim() : ''; 
};

const client = new pg.Client({ connectionString: getVar('STAGING_DATABASE_URL') });
await client.connect();

await client.query('SET ROLE v_reporting_view_owner;');
await client.query(`
  CREATE OR REPLACE VIEW super_admin_reporting.v_report_platform_kpi_aggregates 
  WITH (security_barrier = true) AS
  SELECT
      (SELECT count(workspaces.id) FROM public.workspaces WHERE workspaces.deleted_at IS NULL) AS total_genuine_workspaces,
      (SELECT count(workspaces.id) FROM public.workspaces WHERE workspaces.deleted_at IS NULL AND workspaces.is_active = true) AS active_genuine_workspaces,
      (SELECT count(workspaces.id) FROM public.workspaces WHERE workspaces.deleted_at IS NULL AND workspaces.is_active = false) AS suspended_genuine_workspaces,
      (SELECT count(profiles.id) FROM public.profiles WHERE profiles.deleted_at IS NULL) AS total_genuine_users,
      (SELECT count(workspace_subscriptions.id) FROM public.workspace_subscriptions WHERE workspace_subscriptions.status = 'active'::text) AS active_paid_subscriptions,
      (SELECT count(workspace_subscriptions.id) FROM public.workspace_subscriptions WHERE workspace_subscriptions.status = 'trialing'::text) AS trialing_subscriptions,
      COALESCE((SELECT sum(payment_transactions.amount_inr) FROM public.payment_transactions WHERE payment_transactions.status = ANY (ARRAY['verified_success'::text, 'successful'::text, 'refunded'::text])), 0::numeric) AS gross_saas_collected_inr,
      COALESCE((SELECT sum(payment_transactions.amount_inr) FROM public.payment_transactions WHERE payment_transactions.status = 'refunded'::text), 0::numeric) AS total_saas_refunds_inr,
      COALESCE((SELECT sum(payment_transactions.amount_inr) FROM public.payment_transactions WHERE payment_transactions.status = ANY (ARRAY['verified_success'::text, 'successful'::text])), 0::numeric) AS net_saas_collected_inr,
      COALESCE((SELECT sum(invoices.grand_total) FROM public.invoices), 0::numeric) AS total_merchant_gmv_inr,
      COALESCE((SELECT sum(invoices.balance_amount) FROM public.invoices), 0::numeric) AS total_tenant_receivables_inr,
      now() AS last_calculated_at;
`);
await client.query('RESET ROLE;');

const res = await client.query(`
  SELECT 
    gross_saas_collected_inr, 
    total_saas_refunds_inr, 
    net_saas_collected_inr, 
    (gross_saas_collected_inr - total_saas_refunds_inr) as calculated_net,
    (net_saas_collected_inr - (gross_saas_collected_inr - total_saas_refunds_inr)) as variance
  FROM super_admin_reporting.v_report_platform_kpi_aggregates;
`);
console.table(res.rows);
await client.end();
