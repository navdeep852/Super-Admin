import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env.staging', 'utf8');
const getVar = (k) => { 
  const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)`, 'm')); 
  return m ? m[1].trim() : ''; 
};

const client = new pg.Client({ connectionString: getVar('STAGING_DATABASE_URL') });
await client.connect();

console.log('================================================================');
console.log(' VISTAAR SUPER ADMIN — LOCK & COST ANALYSIS ON REPORTING VIEWS');
console.log('================================================================');

// 1. Check locks acquired during view query inside transaction
console.log('\n--- 1. LOCK MODES ACQUIRED DURING SELECT ON v_report_invoices_receivables ---');
await client.query('BEGIN;');
await client.query('SELECT * FROM super_admin_reporting.v_report_invoices_receivables LIMIT 1;');

const locks = await client.query(`
  SELECT 
    c.relname, 
    c.relkind,
    l.locktype, 
    l.mode, 
    l.granted 
  FROM pg_locks l 
  JOIN pg_class c ON c.oid = l.relation 
  WHERE l.pid = pg_backend_pid() AND c.relname IN ('invoices', 'workspaces', 'v_report_invoices_receivables');
`);
console.table(locks.rows);
await client.query('ROLLBACK;');

// 2. Query execution plan and estimated costs for the heavy views
console.log('\n--- 2. EXPLAIN ANALYZE ON HEAVY REPORTING VIEWS ---');

const explainViews = [
  'v_report_invoices_receivables',
  'v_report_inventory_summary',
  'v_report_platform_kpi_aggregates'
];

for (const v of explainViews) {
  console.log(`\nEXPLAIN ANALYZE super_admin_reporting.${v}:`);
  const plan = await client.query(`EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM super_admin_reporting.${v};`);
  plan.rows.forEach(r => console.log('  ' + r['QUERY PLAN']));
}

await client.end();
