# VISTAAR SUPER ADMIN — PRODUCTION REPORTING VIEW SPECIFICATION

**Document Reference:** `docs/PRODUCTION_REPORTING_VIEW_SPECIFICATION.md`  
**Execution Date:** November 7, 2026  
**Status:** PROPOSED FOR OWNER APPROVAL — NOT EXECUTED  
**Target Database:** VISTAAR Business OS Production (`kluxsykimnjivkqxelba`)  
**Scope:** 9 Sanitized Administrative Reporting Views  

> [!IMPORTANT]
> **SCHEMA INTEGRITY AUDIT NOTE**  
> Every view definition in this specification is derived from verified schema migrations in `vistaar-main/supabase/migrations` (Migrations `001` through `076`). No hypothetical columns are referenced. Every financial calculation is mathematically defined.

---

## 1. Specification of the 9 Administrative Reporting Views

### View 1: Workspace Directory (`public.v_report_workspace_directory`)
- **Purpose:** Power the Super Admin Business Management roster, drawer deep-dive, and multi-branch rollups.
- **Underlying Tables:** `public.workspaces`, `public.business_settings`, `public.branches`, `public.profiles`.

```sql
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
  WHERE deleted_at IS NULL 
  GROUP BY workspace_id
) b_count ON b_count.workspace_id = w.id
LEFT JOIN (
  SELECT workspace_id, count(id) AS total_staff 
  FROM public.profiles 
  WHERE deleted_at IS NULL AND is_archived = FALSE 
  GROUP BY workspace_id
) p_count ON p_count.workspace_id = w.id
WHERE w.deleted_at IS NULL;
```

---

### View 2: User & Membership Directory (`public.v_report_users_memberships`)
- **Purpose:** Power User Management and staff directory oversight across all businesses.
- **Underlying Tables:** `public.profiles`, `public.workspaces`, `public.workspace_memberships`.
- **Security Sanitization:** Omits password hashes, salts, reset tokens, and internal OAuth metadata.

```sql
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
```

---

### View 3: Subscription Overview (`public.v_report_subscription_overview`)
- **Purpose:** Monitor multi-tenant SaaS plan tiers, trial lifecycle, renewals, and billing cadences.
- **Underlying Tables:** `public.workspace_subscriptions`, `public.subscription_plans`, `public.workspaces`.

```sql
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
  w.is_test
FROM public.workspace_subscriptions ws
JOIN public.workspaces w ON w.id = ws.workspace_id
LEFT JOIN public.subscription_plans sp ON sp.id = ws.plan_id
WHERE w.deleted_at IS NULL;
```

---

### View 4: Payment & Collection Summary (`public.v_report_payments_collections`)
- **Purpose:** Track authoritative SaaS subscription revenue collections and reversals (HSN 998313).
- **Underlying Tables:** `public.payment_transactions`, `public.workspaces`.
- **Financial Rule:** 
  $$\text{Taxable SaaS} = \frac{\text{amount\_inr}}{1.18}, \quad \text{GST Component} = \text{amount\_inr} - \text{Taxable SaaS}$$

```sql
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
```

---

### View 5: Invoice & Receivables Summary (`public.v_report_invoices_receivables`)
- **Purpose:** Aggregate merchant retail sales throughput (GMV) and tenant receivables per business.
- **Underlying Tables:** `public.invoices`, `public.workspaces`.
- **Financial Definitions:**
  - $\text{Total GMV} = \sum \text{grand\_total}$
  - $\text{Total Paid} = \sum \text{paid\_amount}$
  - $\text{Outstanding Receivables} = \sum \text{balance\_amount}$

```sql
CREATE OR REPLACE VIEW public.v_report_invoices_receivables AS
SELECT
  w.id AS workspace_id,
  w.company_name,
  count(i.id) AS total_invoices_count,
  COALESCE(sum(i.grand_total), 0) AS total_gmv_inr,
  COALESCE(sum(i.paid_amount), 0) AS total_paid_inr,
  COALESCE(sum(i.balance_amount), 0) AS total_receivables_inr,
  count(CASE WHEN i.status = 'Paid' THEN 1 END) AS paid_invoices_count,
  count(CASE WHEN i.status = 'Partially_Paid' THEN 1 END) AS partial_invoices_count,
  count(CASE WHEN i.status = 'Unpaid' THEN 1 END) AS unpaid_invoices_count,
  min(i.created_at) AS first_invoice_at,
  max(i.created_at) AS last_invoice_at,
  w.is_test
FROM public.workspaces w
LEFT JOIN public.invoices i ON i.workspace_id = w.id
WHERE w.deleted_at IS NULL
GROUP BY w.id, w.company_name, w.is_test;
```

---

### View 6: Inventory Summary (`public.v_report_inventory_summary`)
- **Purpose:** Monitor stock holdings, SKU counts, and stock valuations per branch.
- **Underlying Tables:** `public.branch_inventory`, `public.products`, `public.branches`, `public.workspaces`.
- **Valuation Rule:** $\text{SKU Valuation} = \text{current\_stock} \times \text{COALESCE(purchase\_price, buy\_price, 0)}$

```sql
CREATE OR REPLACE VIEW public.v_report_inventory_summary AS
SELECT
  bi.workspace_id,
  w.company_name,
  bi.branch_id,
  b.branch_name,
  count(DISTINCT bi.product_id) AS total_active_skus,
  COALESCE(sum(bi.current_stock), 0) AS total_stock_units,
  COALESCE(sum(bi.current_stock * COALESCE(bi.purchase_price, p.buy_price, 0)), 0) AS total_inventory_valuation_inr,
  count(CASE WHEN bi.current_stock <= bi.min_stock AND bi.current_stock > 0 THEN 1 END) AS low_stock_sku_count,
  count(CASE WHEN bi.current_stock <= 0 THEN 1 END) AS out_of_stock_sku_count,
  w.is_test
FROM public.branch_inventory bi
JOIN public.workspaces w ON w.id = bi.workspace_id
JOIN public.branches b ON b.id = bi.branch_id
JOIN public.products p ON p.id = bi.product_id
WHERE w.deleted_at IS NULL AND b.deleted_at IS NULL AND p.deleted_at IS NULL
GROUP BY bi.workspace_id, w.company_name, bi.branch_id, b.branch_name, w.is_test;
```

---

### View 7: Customer & Supplier Statistics (`public.v_report_customers_suppliers`)
- **Purpose:** Quantify merchant business scale, registered trade accounts, and customer credit ledger totals.
- **Underlying Tables:** `public.workspaces`, `public.customers`, `public.suppliers`, `public.udhari_records`.

```sql
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
  SELECT workspace_id, sum(remaining_amount) AS total_udhari_inr 
  FROM public.udhari_records 
  WHERE status != 'Paid' 
  GROUP BY workspace_id
) u ON u.workspace_id = w.id
WHERE w.deleted_at IS NULL;
```

---

### View 8: Business Activity & Recency (`public.v_report_business_activity`)
- **Purpose:** Track tenant vitality, dormant accounts, and throughput over the trailing 30 days.
- **Underlying Tables:** `public.workspaces`, `public.invoices`.

```sql
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
```

---

### View 9: Platform KPI Aggregates (`public.v_report_platform_kpi_aggregates`)
- **Purpose:** Supply top-level real-time telemetry for the Super Admin Executive Overview command center.
- **Underlying Tables:** Cross-table aggregate over genuine production records (`is_test = FALSE`).

```sql
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
```

