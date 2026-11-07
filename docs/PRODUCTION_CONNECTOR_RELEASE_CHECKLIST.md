# VISTAAR SUPER ADMIN — PRODUCTION CONNECTOR RELEASE CHECKLIST

**Document Reference:** `docs/PRODUCTION_CONNECTOR_RELEASE_CHECKLIST.md`  
**Execution Date:** November 7, 2026  
**Status:** RELEASE GATE PROTOCOL (PRE-CUTOVER)  
**Target Production Reference:** `kluxsykimnjivkqxelba`  

> [!CAUTION]
> **GOVERNANCE ENFORCEMENT: FAIL-CLOSED RELEASE CRITERIA**  
> Under no circumstances can production access be enabled until every single checkbox below is certified and signed off by the platform owner. If any single criterion fails, the Super Admin Gateway BFF must fail closed and maintain the staging air-gap.

---

## 1. Six Mandatory Production Activation Gates

```mermaid
flowchart LR
    G1["Gate 1: Audit Approved"] --> G2["Gate 2: SQL Reviewed"]
    G2 --> G3["Gate 3: Role Reviewed"]
    G3 --> G4["Gate 4: Creds Provisioned"]
    G4 --> G5["Gate 5: Owner Authorized"]
    G5 --> G6["Gate 6: Config Verified"]
    G6 --> GO["Production Connector Activated"]
```

### Gate 1: Production Readiness Audit Approval
- [ ] Principal Security Architect has verified all CRITICAL/HIGH remediations in `docs/PRODUCTION_READINESS_FINAL_AUDIT.md`.
- [ ] Migration `079_enforce_workspace_suspension_rls.sql` is committed and scheduled for production.
- [ ] Client session auto-purge check in `src/services/supabaseAuth.ts` is merged to `main` in `vistaar-main`.
- **Environment Flag:** `PROD_AUDIT_APPROVED=true`

### Gate 2: Reporting SQL Independent Review
- [ ] Reporting SQL specification in `docs/PRODUCTION_REPORTING_VIEW_SPECIFICATION.md` has been reviewed by the Database Administrator.
- [ ] SHA-256 checksum of the view creation script is computed and matched.
- [ ] Confirmed that all 9 views query verified columns and zero hypothetical entities.
- **Environment Flag:** `PROD_SQL_REVIEWED=true`

### Gate 3: Dedicated Database Role Review
- [ ] Role specification in `docs/PRODUCTION_REPORTING_ROLE_SQL_REVIEW.md` verified.
- [ ] Confirmed `v_super_admin_reporting` has `default_transaction_read_only = TRUE`.
- [ ] Confirmed `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, and DDL privileges are revoked.
- [ ] Confirmed role connection limit is capped at 5.
- **Environment Flag:** `PROD_ROLE_REVIEWED=true`

### Gate 4: Secure Credentials Provisioning
- [ ] Dedicated password for `v_super_admin_reporting` generated via secure cryptographic generator (min 32 chars).
- [ ] Password stored in AWS Secrets Manager / HashiCorp Vault.
- [ ] Confirmed that credentials are NOT committed to Git, `.env`, or client-side bundles.
- [ ] Read-only pooled connection string configured in server environment:
  `PROD_READONLY_DATABASE_URL=postgresql://v_super_admin_reporting:***@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`
- **Environment Flag:** `PROD_CREDS_PROVISIONED=true`

### Gate 5: Explicit Human Owner Authorization
- [ ] Platform owner (`navdeep@vistaarone.com`) has personally reviewed the cutover plan.
- [ ] Cryptographic authorization token (HMAC-SHA256 hash) issued and loaded into Gateway BFF environment.
- **Environment Flags:**
  `PROD_OWNER_AUTHORIZED=true`  
  `PROD_OWNER_AUTH_HASH=<64-char-hexadecimal-hash>`

### Gate 6: Production Deployment Configuration Verification
- [ ] Super Admin Gateway BFF deployed in isolated production container / PM2 cluster.
- [ ] CORS `ALLOWED_ORIGINS` strictly limited to production administrative FQDN (`admin.vistaarone.com`).
- [ ] Statement timeout hardcoded to 8,000 ms.
- [ ] Query pagination clamped to 100 records max.
- **Environment Flag:** `PROD_CONFIG_INDEPENDENTLY_CHECKED=true`

---

## 2. Step-by-Step Operator Cutover Runbook

```text
Step 1: Execute View & Role Provisioning on Production Supabase (kluxsykimnjivkqxelba)
        - Run `docs/PRODUCTION_REPORTING_ROLE_SQL_REVIEW.md` via Supabase SQL Editor as postgres superuser.
        - Run `docs/PRODUCTION_REPORTING_VIEW_SPECIFICATION.md` to create the 9 reporting views.

Step 2: Test Direct Read-Only Connection from Secure Bastion
        - Execute: psql "postgresql://v_super_admin_reporting:***@aws-0-eu-west-1.pooler.supabase.com:6543/postgres" -c "SELECT * FROM v_report_platform_kpi_aggregates;"
        - Verify write rejection: psql ... -c "INSERT INTO public.workspaces (company_name) VALUES ('HACK');"
          (Must fail with: ERROR: cannot execute INSERT in a read-only transaction)

Step 3: Deploy Production Secrets to Gateway BFF Cluster
        - Inject PROD_READONLY_DATABASE_URL and all 6 safeguard flags.

Step 4: Restart Gateway BFF & Monitor Verification Probes
        - Gateway BFF logs must output: "[REPORTING CONNECTOR] Production read-only connector initialized successfully (Ref: kluxsykimnjivkqxelba)".

Step 5: Frontend Sanity Check
        - Navigate to `admin.vistaarone.com`.
        - Banner must transition from "STAGING DATA" to "PRODUCTION BUSINESS OS (READ-ONLY REPORTING)".
        - Verify Genuine customer accounts populate with zero mock data.
```

---

## 3. Rollback & Emergency Abort Protocol

If any latency anomaly, permission issue, or unexpected behavior occurs during cutover:

1. **Immediate Gateway Rollback (T < 30 seconds):**
   - Unset `PROD_OWNER_AUTHORIZED` in Gateway environment and restart process.
   - Gateway automatically falls back to fail-closed Staging mode (`vlbhxcajphyjkeueubud`).
2. **Production Database Lockout (T < 60 seconds):**
   - Execute in Supabase SQL editor: `ALTER ROLE v_super_admin_reporting NOLOGIN;`
   - Instantly severs all connections from the reporting role.
3. **No Rollback of Customer Data Required:**
   - Because the reporting connector is 100% read-only, zero production customer data can be altered or corrupted.

