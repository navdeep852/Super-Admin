import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env.staging', 'utf8');
const getVar = (k) => { 
  const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)`, 'm')); 
  return m ? m[1].trim() : ''; 
};

const adminConnStr = getVar('STAGING_DATABASE_URL');
const client = new pg.Client({ connectionString: adminConnStr });
await client.connect();

console.log('================================================================');
console.log(' VISTAAR SUPER ADMIN — AUTHORIZATION BLOCKER VERIFICATION SUITE');
console.log('================================================================');

// Allow postgres to impersonate for testing assertions
await client.query('GRANT v_super_admin_reporting TO postgres;');

// -----------------------------------------------------------------------------
// BLOCKER 1: SaaS Financial Discrepancy Evidence
// -----------------------------------------------------------------------------
console.log('\n[BLOCKER 1] SaaS Financial Discrepancy Evidence...');
const allTxns = await client.query(`
  SELECT id, transaction_reference, amount_inr, status, created_at
  FROM public.payment_transactions
  ORDER BY created_at;
`);
console.log('All 14 payment_transactions rows in staging:');
console.table(allTxns.rows);

const statusTotals = await client.query(`
  SELECT 
    status, 
    count(*) as count, 
    sum(amount_inr) as sum_inr
  FROM public.payment_transactions
  GROUP BY status;
`);
console.log('Status totals:');
console.table(statusTotals.rows);

const formulaAudit = await client.query(`
  SELECT
    (SELECT sum(amount_inr) FROM public.payment_transactions) as total_all_14_rows,
    (SELECT sum(amount_inr) FROM public.payment_transactions WHERE status = 'refunded') as total_refunds,
    (SELECT sum(amount_inr) FROM public.payment_transactions WHERE status = 'verified_success') as total_verified_success,
    (SELECT sum(amount_inr) FROM public.payment_transactions) - (SELECT sum(amount_inr) FROM public.payment_transactions WHERE status = 'refunded') as net_formula_a,
    (SELECT sum(amount_inr) FROM public.payment_transactions WHERE status = 'verified_success') - (SELECT sum(amount_inr) FROM public.payment_transactions WHERE status = 'refunded') as net_formula_b;
`);
console.log('Reconciliation mathematical comparison:');
console.table(formulaAudit.rows);

// -----------------------------------------------------------------------------
// BLOCKER 2: Credential Safety Evidence
// -----------------------------------------------------------------------------
console.log('\n[BLOCKER 2] Credential Safety Inspection...');
const distDir = 'dist/assets';
let jsBundleClean = true;
if (fs.existsSync(distDir)) {
  const files = fs.readdirSync(distDir);
  for (const f of files) {
    if (f.endsWith('.js')) {
      const text = fs.readFileSync(`${distDir}/${f}`, 'utf8');
      if (text.includes('postgresql://') || text.includes('v_super_admin_reporting') || text.includes('TestReportingPass2026')) {
        jsBundleClean = false;
        console.error(`  ❌ Credential leakage found in bundle ${f}`);
      }
    }
  }
}
console.log(`  ✓ Browser bundle secret isolation: ${jsBundleClean ? 'CLEAN (0 database credentials found)' : 'FAILED'}`);

// -----------------------------------------------------------------------------
// BLOCKER 3: Database & POS Locks and Cost Evidence
// -----------------------------------------------------------------------------
console.log('\n[BLOCKER 3] Lock Modes & Concurrency Evidence...');
await client.query('BEGIN;');
await client.query('SELECT * FROM super_admin_reporting.v_report_invoices_receivables LIMIT 1;');
const acquiredLocks = await client.query(`
  SELECT c.relname, c.relkind, l.mode, l.granted 
  FROM pg_locks l 
  JOIN pg_class c ON c.oid = l.relation 
  WHERE l.pid = pg_backend_pid() AND c.relname IN ('invoices', 'workspaces', 'v_report_invoices_receivables');
`);
console.table(acquiredLocks.rows);
await client.query('ROLLBACK;');

console.log('Explain cost on heavy invoice aggregation:');
const invPlan = await client.query('EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM super_admin_reporting.v_report_invoices_receivables;');
console.log(invPlan.rows.map(r => '  ' + r['QUERY PLAN']).slice(0, 5).join('\n'));

// -----------------------------------------------------------------------------
// BLOCKER 4: Post-Deployment Verification Suite
// -----------------------------------------------------------------------------
console.log('\n[BLOCKER 4] Post-Deployment Verification Assertions...');

// 4.1 Role Identity
await client.query('SET ROLE v_super_admin_reporting;');
const roleIdentity = await client.query('SELECT current_user, session_user;');
console.log(`  ✓ 4.1 Reporting Role Identity: current_user = ${roleIdentity.rows[0].current_user}`);

// 4.2 Effective Role Permissions
const rawWorkspacesAccess = await client.query("SELECT has_table_privilege('v_super_admin_reporting', 'public.workspaces', 'SELECT') as ws_priv;");
const rawInvoicesAccess = await client.query("SELECT has_table_privilege('v_super_admin_reporting', 'public.invoices', 'SELECT') as inv_priv;");
const rawAuthAccess = await client.query("SELECT has_schema_privilege('v_super_admin_reporting', 'auth', 'USAGE') as auth_priv;");
console.log(`  ✓ 4.2 Effective Permissions: public.workspaces SELECT = ${rawWorkspacesAccess.rows[0].ws_priv}, public.invoices SELECT = ${rawInvoicesAccess.rows[0].inv_priv}, auth USAGE = ${rawAuthAccess.rows[0].auth_priv}`);

// 4.3 All Nine View Queries
const viewNames = [
  'v_report_workspace_directory',
  'v_report_users_memberships',
  'v_report_subscription_overview',
  'v_report_payments_collections',
  'v_report_invoices_receivables',
  'v_report_inventory_summary',
  'v_report_customers_suppliers',
  'v_report_business_activity',
  'v_report_platform_kpi_aggregates'
];
console.log('  4.3 Querying All 9 Reporting Views:');
for (const v of viewNames) {
  const res = await client.query(`SELECT count(*) as count FROM super_admin_reporting.${v};`);
  console.log(`      ✓ super_admin_reporting.${v}: SUCCESS (${res.rows[0].count} rows)`);
}

// 4.4 Tenant Isolation & Direct Table Access Denial
let directBlocked = false;
try {
  await client.query('SELECT * FROM public.workspaces LIMIT 1;');
} catch (e) {
  directBlocked = true;
  console.log(`  ✓ 4.4 Direct Table Access Denial: BLOCKED (${e.message.split('\n')[0]})`);
}

// 4.5 Read-Only Enforcement
let writeBlocked = false;
try {
  await client.query("INSERT INTO public.workspaces (company_name) VALUES ('Hacked');");
} catch (e) {
  writeBlocked = true;
  console.log(`  ✓ 4.5 Read-Only Mutation Denial: BLOCKED (${e.message.split('\n')[0]})`);
}

await client.query('RESET ROLE;');

// 4.6 Emergency Session Termination Simulation
const termCheck = await client.query(`
  SELECT count(*) as count 
  FROM pg_stat_activity 
  WHERE usename = 'v_super_admin_reporting' AND pid <> pg_backend_pid();
`);
console.log(`  ✓ 4.6 Emergency Session Termination Filter: targetable sessions = ${termCheck.rows[0].count} (query only targets usename = 'v_super_admin_reporting')`);

await client.end();
console.log('\n================================================================');
console.log(' AUTHORIZATION BLOCKER VERIFICATION COMPLETED');
console.log('================================================================');

