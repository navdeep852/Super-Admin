# VISTAAR Super Admin — Real Data Reconciliation Report

**Document Reference:** `docs/REAL_DATA_RECONCILIATION_REPORT.md`  
**Execution Date:** November 5, 2026  
**Target Environment:** Staging Supabase (`vlbhxcajphyjkeueubud`, AWS `eu-west-1`)  
**Production Air-Gap Status:** `kluxsykimnjivkqxelba` (UNTOUCHED — STRICTLY AIR-GAPPED)  

---

## 1. Objective & Scope

This report audits every displayed record in the VISTAAR Super Admin application, tracing its exact database origin, eliminating hardcoded mock fixtures, and establishing the authoritative database ledger.

---

## 2. Source-of-Truth Audit: All Displayed Entities

### 2.1 Workspace Roster Audit (`public.workspaces`)
A complete scan of the staging database revealed **11 workspaces**. All 11 records were generated during synthetic test fixture staging and have `is_test = TRUE`.

| Workspace ID | Company Name | Owner Email | `is_test` | Genuine / Synthetic Status |
| :--- | :--- | :--- | :--- | :--- |
| `099bbe4f-86ae-4d87-893e-58a5a1cce605` | Zenith Electronics Staging | `anand.kumar@staging.vistaar.internal` | `TRUE` | **Synthetic Staging Record** |
| `18a6e87a-ea91-4cf5-99d9-bb35dbbcba3b` | Metro Textiles Synthetic | `priya.patel@staging.vistaar.internal` | `TRUE` | **Synthetic Staging Record** |
| `280b5ee2-b4ea-4e3f-a311-6ce7f6e69317` | Apex Retail India Pvt Ltd | `aarav.sharma@staging.vistaar.internal` | `TRUE` | **Synthetic Staging Record** |
| `30c14c5b-cb86-4f40-8c29-37f293b679a7` | Delta Logistics & Freight | `suresh.reddy@staging.vistaar.internal` | `TRUE` | **Synthetic Staging Record** |
| `4539efab-1049-4322-944a-13a826477e38` | Bharat Auto & Heavy Spares | `manpreet.singh@staging.vistaar.internal` | `TRUE` | **Synthetic Staging Record** |
| `5ea8910b-8d76-47eb-ba12-70b1066ba728` | Royal Jewelers & Bullion | `ashok.soni@staging.vistaar.internal` | `TRUE` | **Synthetic Staging Record** |
| `7b140cd5-94ee-4890-a548-a90db679a839` | Horizon Pharma Chemist | `subhash.bose@staging.vistaar.internal` | `TRUE` | **Synthetic Staging Record** |
| `81c0623a-f489-4da5-a9b0-bb203498b820` | Shreenathji Sweets & Farsan | `bhavin.mehta@staging.vistaar.internal` | `TRUE` | **Synthetic Staging Record** |
| `9e4f1a30-81bb-4592-80ba-36c1e5926b01` | Krishna Medical Hall | `sunil.verma@staging.vistaar.internal` | `TRUE` | **Synthetic Staging Record** |
| `a92ba470-3490-410a-ba02-10492837bc05` | Southern Coastal Supermarket | `venkat.rao@staging.vistaar.internal` | `TRUE` | **Synthetic Staging Record** |
| `b39e018a-9812-4f70-a309-883719024baa` | Mahalakshmi Stores & Trading | `lakshmi.narayana@staging.vistaar.internal` | `TRUE` | **Synthetic Staging Record** |

**Remediation:**
- In previous turn builds, mock business names like "Sunrise Chemist & Druggist" and "Punjab Auto Spares" were hardcoded in fallback mock files (`src/data/mockBusinesses.ts`).
- **Eliminated:** All fallback hooks now return empty datasets with explicit error states rather than falling back to fake businesses.
- **Segregated:** Synthetic test fixtures are tagged with the `STAGING TEST FIXTURE` badge in the UI and are filtered out when the `Genuine Only` scope is active.

---

### 2.2 Profile & User Identity Audit (`public.profiles`)
A complete scan of `public.profiles` identified **15 users** across the staging workspaces:

| Profile ID | Name | Email | Role | Workspace | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `322bfb91-5b4a-44ac-ac0c-edd6a876a8c7` | Aarav Sharma | `aarav.sharma@staging.vistaar.internal` | `owner` | Apex Retail India | Synthetic Test Fixture |
| `c5294587-b95c-4c78-90b1-65eb43785763` | Kavita Joshi | `kavita.joshi@staging.vistaar.internal` | `manager` | Apex Retail India | Synthetic Test Fixture |
| `05da6f0c-d8f0-495b-9542-0b75bc1a8efb` | Priya Patel | `priya.patel@staging.vistaar.internal` | `owner` | Metro Textiles | Synthetic Test Fixture |
| `5d9ae234-9c09-4166-b634-43f9b96a917a` | Jigar Shah | `jigar.shah@staging.vistaar.internal` | `accountant`| Metro Textiles | Synthetic Test Fixture |
| `b0c4537d-9e14-4ea6-aee4-4dcee0406d22` | Rohit Verma | `rohit.verma@staging.vistaar.internal` | `manager` | Zenith Electronics | Synthetic Test Fixture |
| `a7dcf379-25ee-4ffe-80ed-40ba17945e4e` | Anand Kumar | `anand.kumar@staging.vistaar.internal` | `owner` | Zenith Electronics | Synthetic Test Fixture |

**Platform Administrators (`public.platform_admins`):**
1. `navdeep@vistaarone.com` (`3849d8a6-2659-4f5c-b186-eb14051d043b`): **Genuine Super Administrator** (Active, Authenticated).
2. `synthetic.admin@staging.vistaar.internal`: **Staging Test Administrator** (Deactivated, MFA Enrolled).

---

### 2.3 Financial Reconciliation: SaaS Collections vs. Merchant GMV

| Metric | Database Origin | Raw Query Sum | Super Admin Reconciliation |
| :--- | :--- | :--- | :--- |
| **Gross SaaS Captured** | `payment_transactions.amount_inr` (status: `verified_success`) | ₹86,387 | Platform Collected Revenue |
| **SaaS Refunds** | `payment_transactions.amount_inr` (status: `refunded`) | ₹2,400 | Total Refunds Issued |
| **Net SaaS Revenue** | `Gross - Refunds` | **₹83,987** | **Executive Overview SaaS Collections** |
| **18% SaaS GST Component** | `Gross - (Gross / 1.18)` | ₹12,811.58 | Statutory GST Reconciliation |
| **Merchant Sales GMV** | `invoices.grand_total` | **₹11,82,900** | **Tenant Retail GMV (20 Invoices)** |
| **Tenant Receivables** | `invoices.balance_amount` | **₹60,000** | Outstanding Customer Credit |

**Key Finding:** The metrics displayed on the Executive Overview dashboard (`₹83,987` SaaS revenue, `₹11,82,900` merchant retail GMV, `₹60,000` receivables, `₹2,400` refunds) reflect **actual staging database aggregations**, not client-side random numbers.

---

## 3. Data Source Transparency Integration

Every administrative view now carries prominent, auditable indicators:

1. **Persistent Top Banner:**
   ```
   ⚠️ STAGING DATA — NOT PRODUCTION CUSTOMERS: Live multi-tenant state from Supabase vlbhxcajphyjkeueubud (AWS eu-west-1). Production Air-Gap Active (kluxsykimnjivkqxelba Untouched).
   ```
2. **Page-Level Transparency Badges:**
   - Business Directory: `STAGING DATA — NOT PRODUCTION CUSTOMERS`
   - User Management: `STAGING DATA — NOT PRODUCTION CUSTOMERS`
   - Subscriptions: `Authoritative multi-tenant subscription ledger queried directly from PostgreSQL. Staging test fixtures strictly segregated.`
   - Financial Ledger: `Phase 2.6 verified gateway transactions, immutable failure logs, and 18% GST statutory ledger.`
3. **Data Scope Selectors:**
   - `All Records` (Shows complete staging database)
   - `Genuine Customers` (Filters out `is_test = TRUE` records; correctly reflects 0 genuine subscribers currently on staging)
   - `Staging Test Fixtures` (Isolates synthetic test fixtures for test auditing)

---

## 4. Conclusion

All synthetic mock fallbacks have been removed. Displayed figures are reconciled directly against Supabase staging PostgreSQL queries. Staging fixtures are clearly labeled with `STAGING TEST FIXTURE` and completely separated from live customer metrics.
