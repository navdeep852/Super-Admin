// ==============================================================================
// VISTAAR Super Admin — Gateway Security Matrix Comprehensive Test Suite
// Verifies 9 Security States across all REST endpoints in server/gateway.mjs
// ==============================================================================

import assert from 'assert';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

// Load .env.staging
const envPath = path.resolve('d:/Project/vistaar-main/super_admin/.env.staging');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  });
}

const TEST_PORT = 3098;
process.env.PORT = String(TEST_PORT);
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_MAX_REQUESTS = '500';

const { server, supabase } = await import('../server/gateway.mjs');

const SUPER_ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NON_AAL2_ADMIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const BILLING_ADMIN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SUPPORT_AGENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const INACTIVE_ADMIN_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const NON_ADMIN_USER_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const TEST_WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';

const tokens = new Map([
  ['token-super-aal2', { id: SUPER_ADMIN_ID, email: 'super@staging.vistaar.internal', aal: 'aal2' }],
  ['token-super-aal1', { id: NON_AAL2_ADMIN_ID, email: 'super.aal1@staging.vistaar.internal', aal: 'aal1' }],
  ['token-billing-aal2', { id: BILLING_ADMIN_ID, email: 'billing@staging.vistaar.internal', aal: 'aal2' }],
  ['token-support-aal1', { id: SUPPORT_AGENT_ID, email: 'support@staging.vistaar.internal', aal: 'aal1' }],
  ['token-inactive', { id: INACTIVE_ADMIN_ID, email: 'inactive@staging.vistaar.internal', aal: 'aal2' }],
  ['token-non-admin', { id: NON_ADMIN_USER_ID, email: 'tenant.user@staging.vistaar.internal', aal: 'aal2' }]
]);

// Mock Supabase Auth getUser
supabase.auth.getUser = async (tok) => {
  if (tokens.has(tok)) {
    return { data: { user: tokens.get(tok) }, error: null };
  }
  return { data: { user: null }, error: new Error('Invalid token') };
};

// Mock Supabase from('platform_admins')
const originalFrom = supabase.from.bind(supabase);
supabase.from = (table) => {
  if (table === 'platform_admins') {
    return {
      select: () => ({
        eq: (col, val) => ({
          single: async () => {
            if (val === SUPER_ADMIN_ID) {
              return { data: { id: SUPER_ADMIN_ID, email: 'super@staging.vistaar.internal', full_name: 'Super Admin', role: 'super_admin', is_active: true, mfa_enrolled: true }, error: null };
            }
            if (val === NON_AAL2_ADMIN_ID) {
              return { data: { id: NON_AAL2_ADMIN_ID, email: 'super.aal1@staging.vistaar.internal', full_name: 'AAL1 Admin', role: 'super_admin', is_active: true, mfa_enrolled: true }, error: null };
            }
            if (val === BILLING_ADMIN_ID) {
              return { data: { id: BILLING_ADMIN_ID, email: 'billing@staging.vistaar.internal', full_name: 'Billing Admin', role: 'billing_admin', is_active: true, mfa_enrolled: true }, error: null };
            }
            if (val === SUPPORT_AGENT_ID) {
              return { data: { id: SUPPORT_AGENT_ID, email: 'support@staging.vistaar.internal', full_name: 'Support Agent', role: 'support_agent', is_active: true, mfa_enrolled: true }, error: null };
            }
            if (val === INACTIVE_ADMIN_ID) {
              return { data: { id: INACTIVE_ADMIN_ID, email: 'inactive@staging.vistaar.internal', full_name: 'Deactivated Admin', role: 'super_admin', is_active: false, mfa_enrolled: true }, error: null };
            }
            return { data: null, error: new Error('Not found') };
          }
        })
      })
    };
  }
  return originalFrom(table);
};

// Mock RPC calls
supabase.rpc = async (fn, params) => {
  if (fn === 'super_admin_suspend_workspace') {
    return { data: { success: true, workspace_id: params.p_workspace_id, status: 'suspended' }, error: null };
  }
  if (fn === 'super_admin_reactivate_workspace') {
    return { data: { success: true, workspace_id: params.p_workspace_id, status: 'active' }, error: null };
  }
  return { data: { success: true }, error: null };
};

const baseUrl = `http://127.0.0.1:${TEST_PORT}`;
const assertionSecret = process.env.GATEWAY_ASSERTION_SECRET || '08f88a93048fb6c3ae8a9de8f83070b348e3d86683de5163cdde651a5bcf1399';

function signGcap(actorId, action, targetId, extra, sessionAal, timestampEpoch, nonce) {
  const canonical = `${actorId}:${action}:${targetId}:${extra}:${sessionAal}:${timestampEpoch}:${nonce}`;
  return crypto.createHmac('sha256', assertionSecret).update(canonical).digest('hex');
}

async function runSecurityMatrix() {
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`[Matrix Runner] Test server listening on ${baseUrl}`);

  try {
    console.log('\n=== RUNNING GATEWAY SECURITY MATRIX (9 SECURITY STATES) ===\n');

    // -------------------------------------------------------------------------
    // STATE 1: Unauthenticated Requests (No Bearer Token) -> 401 UNAUTHORIZED
    // -------------------------------------------------------------------------
    const protectedGetRoutes = [
      '/api/v1/platform/overview',
      '/api/v1/workspaces',
      `/api/v1/workspaces/${TEST_WORKSPACE_ID}`,
      `/api/v1/workspaces/${TEST_WORKSPACE_ID}/members`,
      `/api/v1/workspaces/${TEST_WORKSPACE_ID}/activity`,
      '/api/v1/platform/health',
      '/api/v1/users',
      '/api/v1/subscriptions',
      '/api/v1/payments',
      '/api/v1/coupons',
      '/api/v1/admins/me'
    ];

    for (const r of protectedGetRoutes) {
      const res = await fetch(`${baseUrl}${r}`);
      assert.strictEqual(res.status, 401, `Unauthenticated GET ${r} must return 401`);
      const body = await res.json();
      assert.strictEqual(body.error, 'UNAUTHORIZED', `GET ${r} must return UNAUTHORIZED`);
    }
    console.log(`  ✓ State 1: All ${protectedGetRoutes.length} protected GET routes reject unauthenticated requests with 401`);

    // -------------------------------------------------------------------------
    // STATE 2: Malformed / Fabricated Token -> 401 INVALID_TOKEN
    // -------------------------------------------------------------------------
    for (const r of ['/api/v1/platform/overview', '/api/v1/workspaces', '/api/v1/coupons']) {
      const res = await fetch(`${baseUrl}${r}`, {
        headers: { 'Authorization': 'Bearer fabricated-tampered-token-xyz' }
      });
      assert.strictEqual(res.status, 401, `Malformed token on ${r} must return 401`);
    }
    console.log('  ✓ State 2: Fabricated and malformed Bearer tokens rejected with 401');

    // -------------------------------------------------------------------------
    // STATE 3: Non-Admin User Token -> 403 ACTOR_INACTIVE_OR_NOT_FOUND
    // -------------------------------------------------------------------------
    const nonAdminRes = await fetch(`${baseUrl}/api/v1/workspaces`, {
      headers: { 'Authorization': 'Bearer token-non-admin' }
    });
    assert.strictEqual(nonAdminRes.status, 403, 'Non-admin user token must return 403');
    const nonAdminBody = await nonAdminRes.json();
    assert.strictEqual(nonAdminBody.error, 'ACTOR_INACTIVE_OR_NOT_FOUND', 'Error code must be ACTOR_INACTIVE_OR_NOT_FOUND');
    console.log('  ✓ State 3: Authenticated non-admin users rejected with 403 ACTOR_INACTIVE_OR_NOT_FOUND');

    // -------------------------------------------------------------------------
    // STATE 4: Deactivated Platform Admin -> 403 ACTOR_INACTIVE_OR_NOT_FOUND
    // -------------------------------------------------------------------------
    const inactiveRes = await fetch(`${baseUrl}/api/v1/workspaces`, {
      headers: { 'Authorization': 'Bearer token-inactive' }
    });
    assert.strictEqual(inactiveRes.status, 403, 'Deactivated admin token must return 403');
    console.log('  ✓ State 4: Deactivated platform administrators rejected with 403');

    // -------------------------------------------------------------------------
    // STATE 5: Insufficient Role Privileges -> 403 FORBIDDEN_INSUFFICIENT_PRIVILEGES
    // -------------------------------------------------------------------------
    // Support agent cannot access Subscriptions or Payments or Suspend
    const suppSubRes = await fetch(`${baseUrl}/api/v1/subscriptions`, {
      headers: { 'Authorization': 'Bearer token-support-aal1' }
    });
    assert.strictEqual(suppSubRes.status, 403, 'Support agent accessing subscriptions must return 403');
    const suppSubBody = await suppSubRes.json();
    assert.strictEqual(suppSubBody.error, 'FORBIDDEN_INSUFFICIENT_PRIVILEGES');

    const suppPayRes = await fetch(`${baseUrl}/api/v1/payments`, {
      headers: { 'Authorization': 'Bearer token-support-aal1' }
    });
    assert.strictEqual(suppPayRes.status, 403, 'Support agent accessing payments must return 403');

    const suppSuspRes = await fetch(`${baseUrl}/api/v1/workspaces/${TEST_WORKSPACE_ID}/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-support-aal1'
      },
      body: JSON.stringify({ reason: 'Test' })
    });
    assert.strictEqual(suppSuspRes.status, 403, 'Support agent attempting workspace suspension must return 403');
    console.log('  ✓ State 5: Role-Based Access Control (RBAC) enforced: role mismatches rejected with 403');

    // -------------------------------------------------------------------------
    // STATE 6: Missing AAL2 on Privileged Mutation -> 403 MFA_ASSURANCE_REQUIRED
    // -------------------------------------------------------------------------
    const aal1SuspRes = await fetch(`${baseUrl}/api/v1/workspaces/${TEST_WORKSPACE_ID}/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-super-aal1'
      },
      body: JSON.stringify({ reason: 'Test' })
    });
    assert.strictEqual(aal1SuspRes.status, 403, 'AAL1 session on suspend must return 403');
    const aal1SuspBody = await aal1SuspRes.json();
    assert.strictEqual(aal1SuspBody.error, 'MFA_ASSURANCE_REQUIRED');
    console.log('  ✓ State 6: AAL1 session assurance on privileged action rejected with 403 MFA_ASSURANCE_REQUIRED');

    // -------------------------------------------------------------------------
    // STATE 7: Missing GCAP Assertion Headers -> 401 GCAP_ASSERTION_MISSING
    // -------------------------------------------------------------------------
    const noGcapRes = await fetch(`${baseUrl}/api/v1/workspaces/${TEST_WORKSPACE_ID}/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-super-aal2'
      },
      body: JSON.stringify({ reason: 'Test' })
    });
    assert.strictEqual(noGcapRes.status, 401, 'Missing GCAP headers must return 401');
    const noGcapBody = await noGcapRes.json();
    assert.strictEqual(noGcapBody.error, 'GCAP_ASSERTION_MISSING');
    console.log('  ✓ State 7: Missing GCAP headers on privileged action rejected with 401 GCAP_ASSERTION_MISSING');

    // -------------------------------------------------------------------------
    // STATE 8: Skewed / Expired GCAP Assertion Timestamp -> 401 ASSERTION_TIMESTAMP_EXPIRED
    // -------------------------------------------------------------------------
    const skewedEpoch = Math.floor(Date.now() / 1000) - 60; // 60s skew (> 30s)
    const nonce8 = crypto.randomUUID();
    const sig8 = signGcap(SUPER_ADMIN_ID, 'SUSPEND_WORKSPACE', TEST_WORKSPACE_ID, 'NONE', 'aal2', skewedEpoch, nonce8);

    const skewedRes = await fetch(`${baseUrl}/api/v1/workspaces/${TEST_WORKSPACE_ID}/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-super-aal2',
        'X-GCAP-Signature': sig8,
        'X-GCAP-Timestamp': String(skewedEpoch),
        'X-GCAP-Nonce': nonce8
      },
      body: JSON.stringify({ reason: 'Test' })
    });
    assert.strictEqual(skewedRes.status, 401, 'Skewed timestamp must return 401');
    const skewedBody = await skewedRes.json();
    assert.strictEqual(skewedBody.error, 'ASSERTION_TIMESTAMP_EXPIRED');
    console.log('  ✓ State 8: Skewed GCAP assertion timestamp (> 30s) rejected with 401 ASSERTION_TIMESTAMP_EXPIRED');

    // -------------------------------------------------------------------------
    // STATE 9: Fully Authorized Super Admin with AAL2 and Valid GCAP Assertion -> 200 OK
    // -------------------------------------------------------------------------
    const validEpoch = Math.floor(Date.now() / 1000);
    const validNonce = crypto.randomUUID();
    const validSig = signGcap(SUPER_ADMIN_ID, 'SUSPEND_WORKSPACE', TEST_WORKSPACE_ID, 'NONE', 'aal2', validEpoch, validNonce);

    const validRes = await fetch(`${baseUrl}/api/v1/workspaces/${TEST_WORKSPACE_ID}/suspend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token-super-aal2',
        'X-GCAP-Signature': validSig,
        'X-GCAP-Timestamp': String(validEpoch),
        'X-GCAP-Nonce': validNonce
      },
      body: JSON.stringify({ reason: 'Security maintenance test' })
    });
    assert.strictEqual(validRes.status, 200, 'Valid super admin suspend request must return 200');
    const validBody = await validRes.json();
    assert.strictEqual(validBody.success, true);
    console.log('  ✓ State 9: Genuine Super Admin with AAL2 and valid GCAP assertion succeeded with 200 OK');

    console.log('\n================================================================');
    console.log('✅ ALL 9 GATEWAY SECURITY MATRIX STATES VERIFIED SUCCESSFULLY');
    console.log('================================================================');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

runSecurityMatrix();

