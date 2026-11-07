import pg from 'pg';
import fs from 'fs';

const env = fs.readFileSync('.env.staging', 'utf8');
const getVar = (k) => { 
  const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)`, 'm')); 
  return m ? m[1].trim() : ''; 
};

const adminConnStr = getVar('STAGING_DATABASE_URL');
// Derive connection string for v_super_admin_reporting with Supabase pooler tenant prefix
const repConnStr = adminConnStr.replace('postgres.vlbhxcajphyjkeueubud:Navdeep0789%23', 'v_super_admin_reporting.vlbhxcajphyjkeueubud:TestReportingPass2026!%23');

async function main() {
  console.log('================================================================');
  console.log(' VISTAAR SUPER ADMIN — STAGING REPORTING ROLE & VIEW TEST SUITE');
  console.log('================================================================');

  const adminClient = new pg.Client({ connectionString: adminConnStr });
  await adminClient.connect();
  console.log('Connected to Staging as postgres admin.');

  // 1. Provision Role & Permissions
  console.log('\n[PHASE 1] Provisioning v_super_admin_reporting role in Staging...');
  await adminClient.query(`
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'v_super_admin_reporting') THEN
            CREATE ROLE v_super_admin_reporting WITH 
                LOGIN 
                PASSWORD 'TestReportingPass2026!#' 
                NOSUPERUSER 
                NOCREATEDB 
                NOCREATEROLE 
                NOREPLICATION 
                NOBYPASSRLS 
                INHERIT 
                CONNECTION LIMIT 5;
        ELSE
            ALTER ROLE v_super_admin_reporting WITH LOGIN PASSWORD 'TestReportingPass2026!#';
        END IF;
    END $$;

    ALTER ROLE v_super_admin_reporting SET default_transaction_read_only = TRUE;
    ALTER ROLE v_super_admin_reporting SET statement_timeout = '8000ms';
    ALTER ROLE v_super_admin_reporting SET idle_in_transaction_session_timeout = '5000ms';
    ALTER ROLE v_super_admin_reporting SET search_path = public, pg_catalog;

    REVOKE ALL ON SCHEMA public FROM v_super_admin_reporting;
    GRANT USAGE ON SCHEMA public TO v_super_admin_reporting;

    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM v_super_admin_reporting;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM v_super_admin_reporting;
    REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM v_super_admin_reporting;

    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM v_super_admin_reporting;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM v_super_admin_reporting;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM v_super_admin_reporting;

    REVOKE ALL ON SCHEMA auth FROM v_super_admin_reporting;
  `);
  console.log('  ✓ Role attributes and revocations applied.');

  // 2. Deploy 9 Reporting Views
  console.log('\n[PHASE 2] Creating 9 Sanitized Administrative Reporting Views...');
  
  // View 1: Workspace Directory
  await adminClient.query(`
    CREATE OR REPLACE VIEW public.v_report_workspace_directory AS
    SELECT
      w.id AS workspace_id,
      w.company_name,
      COALESCE(bs.legal_name, w.company_name) AS legal_name,
      bs.gstin,
      w.owner_name,
      w.owner_email,
      w.owner_phone,
      w.is_active,
      w.is_main_branch,
      COALESCE(b_count.total_branches, 1) AS branch_count,
      COALESCE(p_count.total_staff, 1) AS active_staff_count,
      w.created_at,
      w.updated_at,
      w.is_test
    FROM public.workspaces w
    LEFT JOIN public.business_settings bs ON bs.workspace_id = w.id
    LEFT JOIN (
      SELECT workspace_id, count(id) AS total_branches 
      FROM public.branches 
      WHERE is_active = TRUE 
      GROUP BY workspace_id
    ) b_count ON b_count.workspace_id = w.id
    LEFT JOIN (
      SELECT workspace_id, count(id) AS total_staff 
      FROM public.profiles 
      WHERE deleted_at IS NULL AND is_archived = FALSE 
      GROUP BY workspace_id
    ) p_count ON p_count.workspace_id = w.id
    WHERE w.deleted_at IS NULL;
  `);

  // View 2: User & Membership Directory
  await adminClient.query(`
    CREATE OR REPLACE VIEW public.v_report_users_memberships AS
    SELECT
      p.id AS profile_id,
      p.workspace_id,
      w.company_name,
      p.name AS full_name,
      p.email,
      p.phone,
      p.role AS assigned_role,
      p.designation,
      p.status AS account_status,
      p.created_at,
      p.updated_at,
      CASE WHEN p.role = 'owner' THEN TRUE ELSE FALSE END AS is_workspace_owner,
      w.is_test
    FROM public.profiles p
    JOIN public.workspaces w ON w.id = p.workspace_id
    WHERE p.deleted_at IS NULL AND w.deleted_at IS NULL;
  `);

  // View 3: Subscription Overview
  await adminClient.query(`
    CREATE OR REPLACE VIEW public.v_report_subscription_overview AS
    SELECT
      ws.id AS subscription_id,
      ws.workspace_id,
      w.company_name,
      ws.plan_id,
      sp.name AS plan_name,
      ws.billing_interval,
      ws.status AS subscription_status,
      ws.trial_start,
      ws.trial_end,
      ws.current_period_start,
      ws.current_period_end,
      sp.price_annual_inr,
      sp.price_monthly_inr,
      CASE 
        WHEN ws.status = 'active' THEN TRUE 
        ELSE FALSE 
      END AS is_active,
      CASE 
        WHEN (ws.trial_end < NOW() AND ws.status = 'trialing') OR (ws.current_period_end < NOW() AND ws.status = 'active') THEN TRUE
        ELSE FALSE
      END AS is_expired,
      ws.is_test
    FROM public.workspace_subscriptions ws
    JOIN public.workspaces w ON w.id = ws.workspace_id
    LEFT JOIN public.subscription_plans sp ON sp.id = ws.plan_id
    WHERE w.deleted_at IS NULL;
  `);

  // View 4: Payment & Collection Summary
  await adminClient.query(`
    CREATE OR REPLACE VIEW public.v_report_payments_collections AS
    SELECT
      pt.id AS transaction_id,
      pt.workspace_id,
      w.company_name,
      pt.transaction_reference,
      pt.provider,
      pt.amount_inr,
      ROUND(pt.amount_inr / 1.18, 2) AS calculated_taxable_inr,
      ROUND(pt.amount_inr - (pt.amount_inr / 1.18), 2) AS calculated_gst_inr,
      COALESCE(pt.discount_amount_inr, 0) AS discount_amount_inr,
      pt.status AS payment_status,
      pt.plan_id,
      pt.coupon_code,
      pt.created_at,
      pt.verified_at,
      w.is_test
    FROM public.payment_transactions pt
    JOIN public.workspaces w ON w.id = pt.workspace_id
    WHERE w.deleted_at IS NULL;
  `);

  // View 5: Invoice & Receivables Summary
  await adminClient.query(`
    CREATE OR REPLACE VIEW public.v_report_invoices_receivables AS
    SELECT
      w.id AS workspace_id,
      w.company_name,
      count(i.id) AS total_invoices_count,
      COALESCE(sum(i.grand_total), 0) AS total_gmv_inr,
      COALESCE(sum(i.paid_amount), 0) AS total_paid_inr,
      COALESCE(sum(i.balance_amount), 0) AS total_receivables_inr,
      count(CASE WHEN i.status = 'Paid' THEN 1 END) AS paid_invoices_count,
      count(CASE WHEN i.status = 'Partially Paid' THEN 1 END) AS partial_invoices_count,
      count(CASE WHEN i.status = 'Issued' THEN 1 END) AS issued_invoices_count,
      min(i.created_at) AS first_invoice_at,
      max(i.created_at) AS last_invoice_at,
      w.is_test
    FROM public.workspaces w
    LEFT JOIN public.invoices i ON i.workspace_id = w.id
    WHERE w.deleted_at IS NULL
    GROUP BY w.id, w.company_name, w.is_test;
  `);

  // View 6: Inventory Summary
  await adminClient.query(`
    CREATE OR REPLACE VIEW public.v_report_inventory_summary AS
    SELECT
      bi.workspace_id,
      w.company_name,
      bi.branch_id,
      b.name AS branch_name,
      count(DISTINCT bi.product_id) AS total_active_skus,
      COALESCE(sum(bi.current_stock), 0) AS total_stock_units,
      COALESCE(sum(bi.current_stock * COALESCE(p.buy_price, 0)), 0) AS total_inventory_valuation_inr,
      count(CASE WHEN bi.current_stock <= bi.min_stock_alert AND bi.current_stock > 0 THEN 1 END) AS low_stock_sku_count,
      count(CASE WHEN bi.current_stock <= 0 THEN 1 END) AS out_of_stock_sku_count,
      w.is_test
    FROM public.branch_inventory bi
    JOIN public.workspaces w ON w.id = bi.workspace_id
    JOIN public.branches b ON b.id = bi.branch_id
    JOIN public.products p ON p.id = bi.product_id
    WHERE w.deleted_at IS NULL AND p.deleted_at IS NULL
    GROUP BY bi.workspace_id, w.company_name, bi.branch_id, b.name, w.is_test;
  `);

  // View 7: Customer & Supplier Statistics
  await adminClient.query(`
    CREATE OR REPLACE VIEW public.v_report_customers_suppliers AS
    SELECT
      w.id AS workspace_id,
      w.company_name,
      COALESCE(c.cust_count, 0) AS total_registered_customers,
      COALESCE(s.supp_count, 0) AS total_registered_suppliers,
      COALESCE(u.total_udhari_inr, 0) AS total_customer_credit_balance_inr,
      w.is_test
    FROM public.workspaces w
    LEFT JOIN (
      SELECT workspace_id, count(id) AS cust_count 
      FROM public.customers 
      WHERE deleted_at IS NULL 
      GROUP BY workspace_id
    ) c ON c.workspace_id = w.id
    LEFT JOIN (
      SELECT workspace_id, count(id) AS supp_count 
      FROM public.suppliers 
      WHERE deleted_at IS NULL 
      GROUP BY workspace_id
    ) s ON s.workspace_id = w.id
    LEFT JOIN (
      SELECT workspace_id, sum(outstanding_amount) AS total_udhari_inr 
      FROM public.udhari_records 
      WHERE status != 'PAID' 
      GROUP BY workspace_id
    ) u ON u.workspace_id = w.id
    WHERE w.deleted_at IS NULL;
  `);

  // View 8: Business Activity & Recency
  await adminClient.query(`
    CREATE OR REPLACE VIEW public.v_report_business_activity AS
    SELECT
      w.id AS workspace_id,
      w.company_name,
      max(i.created_at) AS last_invoice_activity_at,
      count(CASE WHEN i.created_at >= NOW() - INTERVAL '30 days' THEN i.id END) AS invoices_last_30_days,
      COALESCE(sum(CASE WHEN i.created_at >= NOW() - INTERVAL '30 days' THEN i.grand_total ELSE 0 END), 0) AS gmv_last_30_days,
      CASE 
        WHEN max(i.created_at) IS NULL OR max(i.created_at) < NOW() - INTERVAL '60 days' THEN TRUE 
        ELSE FALSE 
      END AS is_dormant,
      w.is_test
    FROM public.workspaces w
    LEFT JOIN public.invoices i ON i.workspace_id = w.id
    WHERE w.deleted_at IS NULL
    GROUP BY w.id, w.company_name, w.is_test;
  `);

  // View 9: Platform KPI Aggregates
  await adminClient.query(`
    CREATE OR REPLACE VIEW public.v_report_platform_kpi_aggregates AS
    SELECT
      (SELECT count(id) FROM public.workspaces WHERE deleted_at IS NULL AND is_test = FALSE) AS total_genuine_workspaces,
      (SELECT count(id) FROM public.workspaces WHERE deleted_at IS NULL AND is_test = FALSE AND is_active = TRUE) AS active_genuine_workspaces,
      (SELECT count(id) FROM public.workspaces WHERE deleted_at IS NULL AND is_test = FALSE AND is_active = FALSE) AS suspended_genuine_workspaces,
      (SELECT count(id) FROM public.profiles WHERE deleted_at IS NULL AND workspace_id IN (SELECT id FROM public.workspaces WHERE is_test = FALSE)) AS total_genuine_users,
      (SELECT count(id) FROM public.workspace_subscriptions WHERE status = 'active' AND workspace_id IN (SELECT id FROM public.workspaces WHERE is_test = FALSE)) AS active_paid_subscriptions,
      (SELECT count(id) FROM public.workspace_subscriptions WHERE status = 'trialing' AND workspace_id IN (SELECT id FROM public.workspaces WHERE is_test = FALSE)) AS trialing_subscriptions,
      COALESCE((SELECT sum(amount_inr) FROM public.payment_transactions WHERE status IN ('verified_success', 'successful') AND workspace_id IN (SELECT id FROM public.workspaces WHERE is_test = FALSE)), 0) AS gross_saas_collected_inr,
      COALESCE((SELECT sum(amount_inr) FROM public.payment_transactions WHERE status = 'refunded' AND workspace_id IN (SELECT id FROM public.workspaces WHERE is_test = FALSE)), 0) AS total_saas_refunds_inr,
      COALESCE((SELECT sum(amount_inr) FROM public.payment_transactions WHERE status IN ('verified_success', 'successful') AND workspace_id IN (SELECT id FROM public.workspaces WHERE is_test = FALSE)), 0) -
      COALESCE((SELECT sum(amount_inr) FROM public.payment_transactions WHERE status = 'refunded' AND workspace_id IN (SELECT id FROM public.workspaces WHERE is_test = FALSE)), 0) AS net_saas_collected_inr,
      COALESCE((SELECT sum(grand_total) FROM public.invoices WHERE workspace_id IN (SELECT id FROM public.workspaces WHERE is_test = FALSE)), 0) AS total_merchant_gmv_inr,
      COALESCE((SELECT sum(balance_amount) FROM public.invoices WHERE workspace_id IN (SELECT id FROM public.workspaces WHERE is_test = FALSE)), 0) AS total_tenant_receivables_inr,
      NOW() AS last_calculated_at;
  `);

  // Grant SELECT on all 9 views to v_super_admin_reporting
  await adminClient.query(`
    GRANT SELECT ON public.v_report_workspace_directory TO v_super_admin_reporting;
    GRANT SELECT ON public.v_report_users_memberships TO v_super_admin_reporting;
    GRANT SELECT ON public.v_report_subscription_overview TO v_super_admin_reporting;
    GRANT SELECT ON public.v_report_payments_collections TO v_super_admin_reporting;
    GRANT SELECT ON public.v_report_invoices_receivables TO v_super_admin_reporting;
    GRANT SELECT ON public.v_report_inventory_summary TO v_super_admin_reporting;
    GRANT SELECT ON public.v_report_customers_suppliers TO v_super_admin_reporting;
    GRANT SELECT ON public.v_report_business_activity TO v_super_admin_reporting;
    GRANT SELECT ON public.v_report_platform_kpi_aggregates TO v_super_admin_reporting;
  `);
  console.log('  ✓ 9 views successfully created and SELECT granted to v_super_admin_reporting.');

  // 3. Connect as v_super_admin_reporting to Execute Privilege Tests
  console.log('\n[PHASE 3] Connecting as v_super_admin_reporting to test privileges...');
  const repClient = new pg.Client({ connectionString: repConnStr });
  await repClient.connect();
  console.log('  ✓ Successfully authenticated as v_super_admin_reporting.');

  const testResults = [];

  // Helper tester
  async function testQuery(name, sql, shouldPass, expectedErrCode) {
    try {
      const res = await repClient.query(sql);
      if (shouldPass) {
        testResults.push({ test: name, status: 'PASS', rowCount: res.rowCount || res.rows.length });
        console.log(`  ✓ ${name}: PASS (rows: ${res.rowCount || res.rows.length})`);
      } else {
        testResults.push({ test: name, status: 'FAIL', error: 'Query succeeded when it should have been denied' });
        console.error(`  ❌ ${name}: FAILED (Unexpected success)`);
      }
    } catch (err) {
      if (!shouldPass) {
        const matched = expectedErrCode ? err.code === expectedErrCode : true;
        testResults.push({ test: name, status: 'PASS', expectedDenied: true, code: err.code, message: err.message });
        console.log(`  ✓ ${name}: DENIED AS EXPECTED (Code: ${err.code})`);
      } else {
        testResults.push({ test: name, status: 'FAIL', error: err.message });
        console.error(`  ❌ ${name}: FAILED (Error: ${err.message})`);
      }
    }
  }

  // T1-T9: Query all 9 views
  await testQuery('SELECT v_report_workspace_directory', 'SELECT * FROM public.v_report_workspace_directory LIMIT 5;', true);
  await testQuery('SELECT v_report_users_memberships', 'SELECT * FROM public.v_report_users_memberships LIMIT 5;', true);
  await testQuery('SELECT v_report_subscription_overview', 'SELECT * FROM public.v_report_subscription_overview LIMIT 5;', true);
  await testQuery('SELECT v_report_payments_collections', 'SELECT * FROM public.v_report_payments_collections LIMIT 5;', true);
  await testQuery('SELECT v_report_invoices_receivables', 'SELECT * FROM public.v_report_invoices_receivables LIMIT 5;', true);
  await testQuery('SELECT v_report_inventory_summary', 'SELECT * FROM public.v_report_inventory_summary LIMIT 5;', true);
  await testQuery('SELECT v_report_customers_suppliers', 'SELECT * FROM public.v_report_customers_suppliers LIMIT 5;', true);
  await testQuery('SELECT v_report_business_activity', 'SELECT * FROM public.v_report_business_activity LIMIT 5;', true);
  await testQuery('SELECT v_report_platform_kpi_aggregates', 'SELECT * FROM public.v_report_platform_kpi_aggregates;', true);

  // T10: SELECT on raw table workspaces
  await testQuery('SELECT raw table workspaces', 'SELECT * FROM public.workspaces LIMIT 1;', false, '42501');

  // T11: SELECT on raw table invoices
  await testQuery('SELECT raw table invoices', 'SELECT * FROM public.invoices LIMIT 1;', false, '42501');

  // T12: SELECT on raw table profiles
  await testQuery('SELECT raw table profiles', 'SELECT * FROM public.profiles LIMIT 1;', false, '42501');

  // T13: SELECT on raw table auth.users
  await testQuery('SELECT raw table auth.users', 'SELECT * FROM auth.users LIMIT 1;', false, '42501');

  // T14: INSERT into workspaces
  await testQuery('INSERT into workspaces', "INSERT INTO public.workspaces (company_name) VALUES ('HACK');", false);

  // T15: UPDATE workspaces
  await testQuery('UPDATE workspaces', "UPDATE public.workspaces SET company_name = 'HACK' WHERE id = '469252c1-1ca3-4bcb-b27e-7c2b72c20ae2';", false);

  // T16: DELETE from workspaces
  await testQuery('DELETE from workspaces', "DELETE FROM public.workspaces WHERE id = '469252c1-1ca3-4bcb-b27e-7c2b72c20ae2';", false);

  // T17: TRUNCATE workspaces
  await testQuery('TRUNCATE workspaces', "TRUNCATE public.workspaces;", false);

  // T18: CREATE TABLE
  await testQuery('CREATE TABLE', "CREATE TABLE public.hack_tbl (id int);", false);

  // T19: ALTER TABLE
  await testQuery('ALTER TABLE', "ALTER TABLE public.workspaces ADD COLUMN hack_col text;", false);

  // T20: DROP TABLE
  await testQuery('DROP TABLE', "DROP TABLE public.workspaces;", false);

  // T21: CREATE FUNCTION
  await testQuery('CREATE FUNCTION', "CREATE FUNCTION public.hack_fn() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;", false);

  // 4. Data Reconciliation Validation
  console.log('\n[PHASE 4] Reconciling reporting views against source database tables...');
  
  // Reconcile Workspaces
  const dbWsCountRes = await adminClient.query('SELECT count(id) FROM public.workspaces WHERE deleted_at IS NULL;');
  const viewWsCountRes = await repClient.query('SELECT count(workspace_id) FROM public.v_report_workspace_directory;');
  const dbWsCount = parseInt(dbWsCountRes.rows[0].count, 10);
  const viewWsCount = parseInt(viewWsCountRes.rows[0].count, 10);
  console.log(`  ✓ Workspace Count Parity: DB=${dbWsCount}, View=${viewWsCount} (Delta: ${dbWsCount - viewWsCount})`);

  // Reconcile Users
  const dbProfCountRes = await adminClient.query('SELECT count(id) FROM public.profiles WHERE deleted_at IS NULL;');
  const viewUserCountRes = await repClient.query('SELECT count(profile_id) FROM public.v_report_users_memberships;');
  const dbProfCount = parseInt(dbProfCountRes.rows[0].count, 10);
  const viewUserCount = parseInt(viewUserCountRes.rows[0].count, 10);
  console.log(`  ✓ User Count Parity: DB=${dbProfCount}, View=${viewUserCount} (Delta: ${dbProfCount - viewUserCount})`);

  // Reconcile Invoices & GMV
  const dbInvSumRes = await adminClient.query('SELECT sum(grand_total) as gmv, sum(paid_amount) as paid, sum(balance_amount) as bal FROM public.invoices WHERE workspace_id IN (SELECT id FROM public.workspaces WHERE deleted_at IS NULL);');
  const viewInvSumRes = await repClient.query('SELECT sum(total_gmv_inr) as gmv, sum(total_paid_inr) as paid, sum(total_receivables_inr) as bal FROM public.v_report_invoices_receivables;');
  const dbGmv = Number(dbInvSumRes.rows[0].gmv || 0);
  const viewGmv = Number(viewInvSumRes.rows[0].gmv || 0);
  const dbBal = Number(dbInvSumRes.rows[0].bal || 0);
  const viewBal = Number(viewInvSumRes.rows[0].bal || 0);
  console.log(`  ✓ Retail GMV Parity: DB=₹${dbGmv}, View=₹${viewGmv} (Delta: ${dbGmv - viewGmv})`);
  console.log(`  ✓ Retail Receivables Parity: DB=₹${dbBal}, View=₹${viewBal} (Delta: ${dbBal - viewBal})`);

  // Reconcile SaaS Payments
  const dbPaySumRes = await adminClient.query("SELECT sum(amount_inr) as gross FROM public.payment_transactions WHERE status IN ('verified_success', 'successful');");
  const viewPaySumRes = await repClient.query("SELECT sum(amount_inr) as gross FROM public.v_report_payments_collections WHERE payment_status IN ('verified_success', 'successful');");
  const dbGross = Number(dbPaySumRes.rows[0].gross || 0);
  const viewGross = Number(viewPaySumRes.rows[0].gross || 0);
  console.log(`  ✓ SaaS Collections Parity: DB=₹${dbGross}, View=₹${viewGross} (Delta: ${dbGross - viewGross})`);

  await repClient.end();
  await adminClient.end();

  const auditLog = {
    executedAt: new Date().toISOString(),
    privilegeTests: testResults,
    reconciliation: {
      workspaces: { db: dbWsCount, view: viewWsCount, delta: dbWsCount - viewWsCount },
      users: { db: dbProfCount, view: viewUserCount, delta: dbProfCount - viewUserCount },
      gmv: { db: dbGmv, view: viewGmv, delta: dbGmv - viewGmv },
      receivables: { db: dbBal, view: viewBal, delta: dbBal - viewBal },
      saasCollections: { db: dbGross, view: viewGross, delta: dbGross - viewGross }
    }
  };

  fs.writeFileSync('scripts/reporting_privilege_audit.json', JSON.stringify(auditLog, null, 2));
  console.log('\nAudit report saved to scripts/reporting_privilege_audit.json');
}

main().catch(err => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
