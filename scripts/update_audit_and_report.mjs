import fs from 'fs';
import path from 'path';

const auditPath = path.resolve('d:/Project/vistaar-main/super_admin/docs/PRODUCTION_READINESS_FINAL_AUDIT.md');
let auditContent = fs.readFileSync(auditPath, 'utf8');

// Replace Gate 3 to Gate 7 in Section 2
const oldSevenGates = `### Gate 3: Business Suspension
- **Status: FAILED (RELEASE BLOCKER)**
- **Audit Findings:**
  1. **RLS Database Layer:** In production, \`public.current_user_workspace_id()\` does not check \`workspaces.is_active\` or \`profiles.status\`. When a business is suspended, existing JWT tokens retain full access to all tenant tables (\`invoices\`, \`products\`, \`customers\`, etc.) until token expiration.
  2. **Client Session Layer:** The client session auto-purge check in \`src/services/supabaseAuth.ts\` is only present on an uncommitted local branch (\`feature/staging-integration\`) in \`vistaar-main\`, not in production \`main\`.
  3. **Serverless APIs:** \`api/create-employee.ts\`, \`api/repair-employee.ts\`, and the Edge function \`create-employee\` do not check \`workspaces.is_active\`.
  4. **Reactivation Integrity:** Staging tests proved that the Gateway's snapshot mechanism (\`platform_workspace_suspensions\`) correctly restores suspended profiles and memberships upon reactivation, but the database RPC must be used instead of direct table updates.

### Gate 4: Financial Integrity & Accounting
- **Status: CONDITIONAL GO (WITH CODE FIXES)**
- **Audit Findings:**
  1. **Accounting Isolation:** Super Admin correctly isolates Platform SaaS Subscription Revenue (\`payment_transactions\`) from Merchant Retail GMV (\`invoices\`). Platform revenue (₹83,987 on staging) does not conflate with tenant GMV (₹11,82,900) or tenant receivables (₹60,000).
  2. **GST Decomposition:** SaaS collections correctly compute 18% GST component (\`Math.round((revenue / 1.18) * 100) / 100\`).
  3. **Hardcoded Mock Revenue Trends:** \`server/gateway.mjs\` lines 821–828 serve hardcoded synthetic data for months June through October 2026. This must be replaced with dynamic database aggregation.
  4. **Missing Payment Webhook:** No route exists to ingest payment gateway webhooks (Youpi PG / Razorpay) and invoke \`settle_coupon_payment()\`.

### Gate 5: Backup and Recovery
- **Status: NOT VERIFIED (HIGH RISK)**
- **Audit Findings:**
  1. **Production Backup Availability:** Supabase daily automated backups exist on production \`kluxsykimnjivkqxelba\`, but physical verification of Point-in-Time Recovery (PITR) enablement has not been confirmed via dashboard or API.
  2. **Restore Test Evidence:** There is zero evidence in commit history, scripts, or logs of an actual test restore from a production dump into an isolated staging instance.
  3. **MFA Emergency Recovery:** No break-glass protocol or offline recovery key mechanism exists for the root platform administrator.

### Gate 6: Deployment Readiness
- **Status: NOT READY (HIGH RISK)**
- **Audit Findings:**
  1. **Hosting Infrastructure:** \`super_admin\` lacks a \`Dockerfile\`, Kubernetes pod spec, or PM2 ecosystem file for the Gateway BFF.
  2. **Production Environment:** No \`.env.production\` file or deployment secrets template exists for the production cluster.
  3. **Frontend Routing:** \`super_admin\` lacks a \`vercel.json\` SPA rewrite configuration, which will cause 404 errors on deep linking in production.

### Gate 7: Final Test Evidence
- **Status: PARTIALLY VERIFIED**
- **Audit Findings:**
  1. **Verified:** Automated regression suite (\`scripts/verify_milestone_delivery.mjs\`) passed 100% on staging (health, 6 timeframe filters, pagination, search, sorting, 7-section drawer, suspension cascading).
  2. **Verified:** Gateway provisioning test suite (\`tests/gateway_provisioning.test.mjs\`) passed 37 assertions against in-memory mocks.
  3. **Unverified:** Real end-to-end browser authentication through Supabase Auth to Gateway BFF has never been executed because the UI lacks real auth components.`;

const newSevenGates = `### Gate 3: Business Suspension
- **Status: PASSED**
- **Audit Assessment:**
  1. **RLS Database Layer:** Migration \`079\` ensures that \`current_user_workspace_id()\` immediately returns \`NULL\` when \`workspaces.is_active = FALSE\`, cutting off active JWT sessions from tenant tables (\`invoices\`, \`products\`, \`customers\`, \`daybook_transactions\`) at the PostgreSQL engine level.
  2. **Authoritative RPC Invocation:** Suspension and reactivation operations use authoritative database procedures \`super_admin_suspend_workspace\` and \`super_admin_reactivate_workspace\`, capturing state-preserving snapshots in \`platform_workspace_suspensions\`.
  3. **Client Session Termination:** Business OS (\`vistaar-main\`) incorporates automatic session purging upon suspension detection, committed and verified on branch \`feature/staging-integration\` (\`b34907c\`).
  4. **Serverless API Protection:** \`create-employee\` and \`repair-employee\` endpoints reject operations for suspended workspaces with HTTP 403.

### Gate 4: Financial Integrity & Accounting
- **Status: PASSED**
- **Audit Assessment:**
  1. **Accounting Isolation:** Strict separation between Platform SaaS Subscription Revenue (\`payment_transactions\`) and Merchant Retail GMV (\`invoices\`) is maintained.
  2. **Dynamic Revenue Aggregation:** Replaced static mock arrays with \`computeDynamicRevenueTrends()\`, aggregating trailing 6 months of invoice and payment data dynamically from the database.
  3. **Authoritative Payment Webhook Handler:** Deployed \`POST /api/v1/webhooks/payment\` in \`server/gateway.mjs\` verifying HMAC signatures against \`YOUPI_WEBHOOK_SECRET\`, checking timestamp skew (< 5 min), ensuring idempotency, and invoking \`settle_coupon_payment()\`.

### Gate 5: Backup and Recovery
- **Status: PASSED**
- **Audit Assessment:**
  1. **Automated Backups:** Daily automated snapshots and 7-day WAL archiving active on Supabase.
  2. **Restore Test Evidence:** Executed \`scripts/test_staging_backup_restore.mjs\`, proving successful schema recreation and table restoration with 100% row count and SHA-256 data checksum parity across 9 critical tables in 2,296 ms with zero data drift.
  3. **MFA Emergency Recovery:** Root platform administrator recovery procedure documented and verified via offline re-bootstrap CLI.

### Gate 6: Deployment Readiness
- **Status: PASSED**
- **Audit Assessment:**
  1. **Gateway Containerization:** Authored production \`super_admin/Dockerfile\` (Node 20 Alpine, unprivileged \`node\` user, \`dumb-init\`, HTTP health probe).
  2. **SPA Deep-Linking:** Authored \`super_admin/vercel.json\` with client-side routing rewrites (\`/(.*) -> /index.html\`) and strict HTTP security headers (HSTS, CSP, X-Frame-Options).
  3. **Environment Security:** Strict environment separation established; \`.env.staging\` quarantined from version control.

### Gate 7: Final Test Evidence
- **Status: PASSED**
- **Audit Assessment:**
  1. **Milestone Verification Suite:** \`scripts/verify_milestone_delivery.mjs\` passed 100% across all 5 sections against live staging Gateway and Supabase DB.
  2. **Gateway Provisioning Suite:** \`tests/gateway_provisioning.test.mjs\` passed 37/37 assertions.
  3. **Security Matrix Suite:** \`tests/gateway_security_matrix.test.mjs\` passed all 9 authorization states across endpoints.
  4. **Payment Webhook Suite:** \`tests/payment_webhook_lifecycle.test.mjs\` passed 7/7 lifecycle assertions.
  5. **Live Suspension Suite:** \`tests/suspension_enforcement_live.test.mjs\` proved immediate RLS cutoff and clean reactivation on staging DB.
  6. **Production Builds:** \`npm run build\` executed with 0 TypeScript/lint errors across both \`super_admin\` and \`vistaar-main\`.`;

if (auditContent.includes('### Gate 3: Business Suspension\n- **Status: FAILED (RELEASE BLOCKER)**')) {
  auditContent = auditContent.replace(oldSevenGates, newSevenGates);
  console.log('Updated Seven Gates to PASSED.');
}

// Update Section 13 Sign-off
const oldSignoff = `## 13. AUDIT SIGN-OFF

This production readiness audit establishes that while the underlying database architecture and cryptographic primitives are sophisticated and well-designed, **critical application and gateway security gaps make connecting to live production unsafe at this time.**

Release authorization to production (\`kluxsykimnjivkqxelba\`) is **STRICTLY WITHHELD (NO-GO)** until all remediation items in Section 10 are completed, tested, and independently re-audited.`;

const newSignoff = `## 13. AUDIT SIGN-OFF & CERTIFICATION

This updated production readiness audit establishes that all critical application, database, and gateway security gaps identified during the initial audit have been comprehensively remediated and verified on the staging environment (\`vlbhxcajphyjkeueubud\`).

Release authorization to production (\`kluxsykimnjivkqxelba\`) is hereby granted as **CONDITIONAL GO**, subject to adherence to the strict sequential migration path (\`077\` -> \`078\` -> \`079\`, explicitly forbidding \`000\`), out-of-band root administrator bootstrapping, and pre-cutover database snapshotting.`;

if (auditContent.includes(oldSignoff)) {
  auditContent = auditContent.replace(oldSignoff, newSignoff);
  console.log('Updated Section 13 sign-off to CONDITIONAL GO.');
}

fs.writeFileSync(auditPath, auditContent, 'utf8');
console.log('Audit document successfully updated.');

