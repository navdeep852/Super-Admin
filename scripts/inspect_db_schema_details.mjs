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
    console.log('--- Checking Workspaces ---');
    const wsRes = await client.query('SELECT id, company_name, owner_name, owner_email, owner_phone, is_active, created_at FROM public.workspaces ORDER BY created_at DESC');
    console.log(`Found ${wsRes.rowCount} workspaces:`, wsRes.rows);

    console.log('--- Checking Profiles ---');
    const profRes = await client.query('SELECT id, workspace_id, name, email, role, status, created_at FROM public.profiles ORDER BY created_at DESC LIMIT 10');
    console.log(`Found ${profRes.rowCount} profiles:`, profRes.rows);

    console.log('--- Checking Subscriptions ---');
    const subRes = await client.query('SELECT * FROM public.workspace_subscriptions ORDER BY created_at DESC LIMIT 10');
    console.log(`Found ${subRes.rowCount} subscriptions:`, subRes.rows);

    console.log('--- Checking Invoices ---');
    const invRes = await client.query('SELECT workspace_id, count(*), sum(grand_total) as gmv, sum(paid_amount) as collected, sum(balance_amount) as outstanding FROM public.invoices GROUP BY workspace_id');
    console.log('Invoices aggregate by workspace:', invRes.rows);

    console.log('--- Checking Payments Table Schema & Data ---');
    const payCols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payments'");
    console.log('payments columns:', payCols.rows);
    const payRes = await client.query('SELECT * FROM public.payments LIMIT 5');
    console.log('payments rows:', payRes.rows);

    console.log('--- Checking Platform Workspace Suspensions ---');
    const suspRes = await client.query('SELECT * FROM public.platform_workspace_suspensions ORDER BY suspended_at DESC');
    console.log('suspensions:', suspRes.rows);

    console.log('--- Checking Platform Audit Logs ---');
    const auditRes = await client.query('SELECT * FROM public.platform_audit_logs ORDER BY created_at DESC LIMIT 5');
    console.log('recent audit logs:', auditRes.rows);

    console.log('--- Checking Platform Admins ---');
    const adminRes = await client.query('SELECT * FROM public.platform_admins');
    console.log('platform admins:', adminRes.rows);

    console.log('--- Checking RLS Policies on Workspaces and Invoices ---');
    const polRes = await client.query("SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('workspaces', 'profiles', 'invoices', 'products')");
    console.log('policies:', polRes.rows);

    console.log('--- Checking Function Definitions for RLS ---');
    const fnRes = await client.query("SELECT proname, prosrc FROM pg_proc WHERE proname IN ('current_user_workspace_id', 'is_workspace_owner', 'user_has_workspace_access')");
    fnRes.rows.forEach(r => console.log(r.proname + ':\n' + r.prosrc + '\n---'));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
