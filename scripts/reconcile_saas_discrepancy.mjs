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
console.log(' VISTAAR SUPER ADMIN — SAAS FINANCIAL RECONCILIATION AUDIT');
console.log('================================================================');

// 1. All rows in payment_transactions
const txns = await client.query(`
  SELECT id, transaction_reference, amount_inr, status, provider, created_at
  FROM public.payment_transactions
  ORDER BY created_at;
`);
console.log('\n--- 1. ALL PAYMENT TRANSACTIONS IN STAGING (14 rows) ---');
console.table(txns.rows);

// 2. Breakdown by status
const breakdown = await client.query(`
  SELECT 
    status, 
    count(*) as row_count, 
    sum(amount_inr) as total_amount_inr
  FROM public.payment_transactions
  GROUP BY status;
`);
console.log('\n--- 2. BREAKDOWN BY STATUS ---');
console.table(breakdown.rows);

// 3. Formula A (Original Accounting Definition in docs/READ_ONLY_REPORTING_RECONCILIATION.md):
// Total Initiated / Processed (14 rows): ₹86,387
// Refunded Transactions (2 rows): ₹2,400
// Net Collections = Total Initiated - Refunds = ₹86,387 - ₹2,400 = ₹83,987
const totalAll = await client.query(`SELECT sum(amount_inr) as total_all_records FROM public.payment_transactions;`);
const refunds = await client.query(`SELECT sum(amount_inr) as total_refunds FROM public.payment_transactions WHERE status = 'refunded';`);
const successfulOnly = await client.query(`SELECT sum(amount_inr) as total_success FROM public.payment_transactions WHERE status IN ('verified_success', 'successful');`);

console.log('\n--- 3. COMPARISON OF MATHEMATICAL DEFINITIONS ---');
console.log('Total across ALL records (Status: verified_success + refunded):', totalAll.rows[0].total_all_records);
console.log('Total Refunded (Status: refunded):', refunds.rows[0].total_refunds);
console.log('Total Verified Success (Status: verified_success):', successfulOnly.rows[0].total_success);

console.log('\n--- FORMULA A (Previous Report: Gross includes all ledger entries):');
console.log('  Gross SaaS Collected (All 14 rows):           ₹' + totalAll.rows[0].total_all_records);
console.log('  Total Refunds (2 rows):                       ₹' + refunds.rows[0].total_refunds);
console.log('  Net SaaS Collected (Gross - Refunds):         ₹' + (Number(totalAll.rows[0].total_all_records) - Number(refunds.rows[0].total_refunds)));

console.log('\n--- FORMULA B (View 9 Implementation in v_report_platform_kpi_aggregates):');
console.log('  Gross SaaS Collected (WHERE status = verified_success): ₹' + successfulOnly.rows[0].total_success);
console.log('  Total Refunds (WHERE status = refunded):                 ₹' + refunds.rows[0].total_refunds);
console.log('  Net SaaS Collected (Gross - Refunds):                   ₹' + (Number(successfulOnly.rows[0].total_success) - Number(refunds.rows[0].total_refunds)));
console.log('  Notice: In Formula B, refunds are deducted from verified_success, which ALREADY excludes refunded rows!');
console.log('  Difference in Net:', (Number(totalAll.rows[0].total_all_records) - Number(refunds.rows[0].total_refunds)) - (Number(successfulOnly.rows[0].total_success) - Number(refunds.rows[0].total_refunds)));

await client.end();
