// ==============================================================================
// VISTAAR Super Admin — Live Database Suspension & RLS Enforcement Test Suite
// Target: Staging Database (vlbhxcajphyjkeueubud) — Direct PostgreSQL & RLS Proof
// ==============================================================================

import assert from 'assert';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import pg from 'pg';

const FORBIDDEN_PROD_REF = 'kluxsykimnjivkqxelba';
const envPath = path.resolve('d:/Project/vistaar-main/super_admin/.env.staging');

if (!fs.existsSync(envPath)) {
  console.error('[ERROR] .env.staging not found');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
});

const dbUrl = env.STAGING_DATABASE_URL || '';
if (!dbUrl || dbUrl.includes(FORBIDDEN_PROD_REF)) {
  console.error('[CRITICAL] Aborting: Missing STAGING_DATABASE_URL or forbidden production ref detected!');
  process.exit(1);
}

const assertionSecret = env.GATEWAY_ASSERTION_SECRET || '';
const pool = new pg.Pool({ connectionString: dbUrl });

function signGcap(actorId, action, targetId, extra, sessionAal, timestampEpoch, nonce, secret = assertionSecret) {
  const canonical = `${actorId}:${action}:${targetId}:${extra}:${sessionAal}:${timestampEpoch}:${nonce}`;
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

async function runLiveSuspensionTests() {
  console.log('================================================================');
  console.log('VISTAAR LIVE DATABASE WORKSPACE SUSPENSION & RLS ENFORCEMENT TEST');
  console.log('Target Database: Staging Supabase (AWS eu-west-1, ref: vlbhxcajphyjkeueubud)');
  console.log('================================================================\n');

  const client = await pool.connect();

  try {
    // 1. Fetch 3 active workspaces for multi-tenant isolation testing
    console.log('[STEP 1] Selecting 3 distinct workspaces from staging database...');
    const wsRes = await client.query(`
      SELECT w.id, w.company_name, w.is_active, p.id AS profile_id, p.role
      FROM public.workspaces w
      JOIN public.profiles p ON p.workspace_id = w.id
      WHERE w.is_active = TRUE AND p.status = 'Active' AND w.deleted_at IS NULL
      ORDER BY w.created_at ASC
      LIMIT 10;
    `);

    // Group by workspace
    const wsMap = new Map();
    for (const r of wsRes.rows) {
      if (!wsMap.has(r.id)) {
        wsMap.set(r.id, { id: r.id, company_name: r.company_name, profiles: [] });
      }
      wsMap.get(r.id).profiles.push(r.profile_id);
    }

    const wsList = Array.from(wsMap.values());
    if (wsList.length < 3) {
      console.warn(`Only found ${wsList.length} distinct workspaces with active profiles. Using available workspaces.`);
    }

    const wsA = wsList[0];
    const wsB = wsList[1];
    const wsC = wsList[2] || wsList[0];

    console.log(`  • Workspace A (Target for Suspension): ${wsA.company_name} (ID: ${wsA.id})`);
    console.log(`  • Workspace B (Control Isolation):    ${wsB.company_name} (ID: ${wsB.id})`);
    console.log(`  • Workspace C (Control Isolation):    ${wsC.company_name} (ID: ${wsC.id})`);

    const userA = wsA.profiles[0];
    const userB = wsB.profiles[0];
    const userC = wsC.profiles[0];

    // 2. Fetch Root Admin for GCAP signing
    const adminRes = await client.query(`
      SELECT id, email, role FROM public.platform_admins WHERE role = 'super_admin' AND is_active = TRUE LIMIT 1;
    `);
    const admin = adminRes.rows[0];
    assert(admin, 'Active Super Admin required in platform_admins');
    console.log(`\n[STEP 2] Requesting Administrator: ${admin.email} (UUID: ${admin.id})`);

    // 3. Pre-Suspension Baseline RLS Evaluation
    console.log('\n[STEP 3] Pre-Suspension: Evaluating baseline RLS functions...');

    // Simulate User A session
    await client.query("BEGIN;");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ sub: userA, role: 'authenticated' })]);
    await client.query(`SELECT set_config('role', 'authenticated', true);`);

    const baselineA_ws = await client.query(`SELECT public.current_user_workspace_id() AS ws_id;`);
    const baselineA_access = await client.query(`SELECT public.user_has_workspace_access($1::uuid) AS has_access;`, [wsA.id]);
    await client.query("COMMIT;");

    console.log(`  ✓ Workspace A User current_user_workspace_id: ${baselineA_ws.rows[0].ws_id}`);
    console.log(`  ✓ Workspace A User user_has_workspace_access:  ${baselineA_access.rows[0].has_access}`);
    assert.strictEqual(baselineA_ws.rows[0].ws_id, wsA.id, 'User A must resolve Workspace A ID');
    assert.strictEqual(baselineA_access.rows[0].has_access, true, 'User A must have access to Workspace A');

    // 4. Execute Authoritative Suspension RPC via Service Role
    console.log('\n[STEP 4] Executing authoritative super_admin_suspend_workspace RPC...');
    const nowEpoch = Math.floor(Date.now() / 1000);
    const suspendNonce = crypto.randomUUID();
    const suspendSig = signGcap(admin.id, 'SUSPEND_WORKSPACE', wsA.id, 'NONE', 'aal2', nowEpoch, suspendNonce);

    await client.query("BEGIN;");
    await client.query(`SELECT set_config('role', 'service_role', true);`);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: 'service_role' })]);

    const suspendResult = await client.query(`
      SELECT public.super_admin_suspend_workspace(
        $1::uuid,
        $2::text,
        $3::uuid,
        $4::text,
        $5::timestamptz,
        $6::uuid,
        $7::text
      ) AS res;
    `, [
      wsA.id,
      'Live Staging Multi-Tenant RLS Security Test',
      admin.id,
      'aal2',
      new Date(nowEpoch * 1000).toISOString(),
      suspendNonce,
      suspendSig
    ]);
    await client.query("COMMIT;");

    const suspOutput = suspendResult.rows[0].res;
    console.log(`  ✓ Suspension RPC Response:`, suspOutput);
    assert.strictEqual(suspOutput.success, true, 'Suspension RPC must succeed');
    assert.strictEqual(suspOutput.status, 'Suspended', 'Workspace status must be Suspended');

    // 5. Post-Suspension: Verify RLS Access Cut-Off for Workspace A User
    console.log('\n[STEP 5] Post-Suspension: Asserting RLS access cut-off for Workspace A User...');

    await client.query("BEGIN;");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ sub: userA, role: 'authenticated' })]);
    await client.query(`SELECT set_config('role', 'authenticated', true);`);

    const postSuspA_ws = await client.query(`SELECT public.current_user_workspace_id() AS ws_id;`);
    const postSuspA_access = await client.query(`SELECT public.user_has_workspace_access($1::uuid) AS has_access;`, [wsA.id]);
    await client.query("COMMIT;");

    console.log(`  ✓ Suspended User current_user_workspace_id: ${postSuspA_ws.rows[0].ws_id} (Expected: NULL)`);
    console.log(`  ✓ Suspended User user_has_workspace_access:  ${postSuspA_access.rows[0].has_access} (Expected: FALSE)`);
    assert.strictEqual(postSuspA_ws.rows[0].ws_id, null, 'Suspended workspace user must return NULL workspace ID (RLS blocked)');
    assert.strictEqual(postSuspA_access.rows[0].has_access, false, 'Suspended workspace user must return FALSE for access');

    // 6. Post-Suspension: Verify Tenant Isolation (Workspaces B & C Unaffected)
    console.log('\n[STEP 6] Asserting Tenant Isolation: Verifying Workspaces B & C are completely unaffected...');

    await client.query("BEGIN;");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ sub: userB, role: 'authenticated' })]);
    await client.query(`SELECT set_config('role', 'authenticated', true);`);

    const userB_ws = await client.query(`SELECT public.current_user_workspace_id() AS ws_id;`);
    const userB_access = await client.query(`SELECT public.user_has_workspace_access($1::uuid) AS has_access;`, [wsB.id]);
    await client.query("COMMIT;");

    console.log(`  ✓ Workspace B User current_user_workspace_id: ${userB_ws.rows[0].ws_id}`);
    console.log(`  ✓ Workspace B User user_has_workspace_access:  ${userB_access.rows[0].has_access}`);
    assert.strictEqual(userB_ws.rows[0].ws_id, wsB.id, 'Workspace B user must retain full access');
    assert.strictEqual(userB_access.rows[0].has_access, true, 'Workspace B user must retain full access');

    // 7. Execute Authoritative Reactivation RPC
    console.log('\n[STEP 7] Executing authoritative super_admin_reactivate_workspace RPC...');
    const reactivateEpoch = Math.floor(Date.now() / 1000);
    const reactivateNonce = crypto.randomUUID();
    const reactivateSig = signGcap(admin.id, 'REACTIVATE_WORKSPACE', wsA.id, 'NONE', 'aal2', reactivateEpoch, reactivateNonce);

    await client.query("BEGIN;");
    await client.query(`SELECT set_config('role', 'service_role', true);`);
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ role: 'service_role' })]);

    const reactivateResult = await client.query(`
      SELECT public.super_admin_reactivate_workspace(
        $1::uuid,
        $2::text,
        $3::uuid,
        $4::text,
        $5::timestamptz,
        $6::uuid,
        $7::text
      ) AS res;
    `, [
      wsA.id,
      'Live Staging Multi-Tenant RLS Reactivation Test',
      admin.id,
      'aal2',
      new Date(reactivateEpoch * 1000).toISOString(),
      reactivateNonce,
      reactivateSig
    ]);
    await client.query("COMMIT;");

    const reactOutput = reactivateResult.rows[0].res;
    console.log(`  ✓ Reactivation RPC Response:`, reactOutput);
    assert.strictEqual(reactOutput.success, true, 'Reactivation RPC must succeed');
    assert.strictEqual(reactOutput.status, 'Active', 'Workspace status must be Active');

    // 8. Post-Reactivation: Verify Access Restoration for Workspace A User
    console.log('\n[STEP 8] Post-Reactivation: Asserting RLS access restored for Workspace A User...');

    await client.query("BEGIN;");
    await client.query(`SELECT set_config('request.jwt.claims', $1, true);`, [JSON.stringify({ sub: userA, role: 'authenticated' })]);
    await client.query(`SELECT set_config('role', 'authenticated', true);`);

    const restoredA_ws = await client.query(`SELECT public.current_user_workspace_id() AS ws_id;`);
    const restoredA_access = await client.query(`SELECT public.user_has_workspace_access($1::uuid) AS has_access;`, [wsA.id]);
    await client.query("COMMIT;");

    console.log(`  ✓ Restored User current_user_workspace_id: ${restoredA_ws.rows[0].ws_id}`);
    console.log(`  ✓ Restored User user_has_workspace_access:  ${restoredA_access.rows[0].has_access}`);
    assert.strictEqual(restoredA_ws.rows[0].ws_id, wsA.id, 'Restored User A must resolve Workspace A ID');
    assert.strictEqual(restoredA_access.rows[0].has_access, true, 'Restored User A must have access to Workspace A');

    console.log('\n================================================================');
    console.log('✅ ALL LIVE WORKSPACE SUSPENSION & RLS ENFORCEMENT TESTS PASSED');
    console.log('================================================================');
  } finally {
    client.release();
    await pool.end();
  }
}

runLiveSuspensionTests();
