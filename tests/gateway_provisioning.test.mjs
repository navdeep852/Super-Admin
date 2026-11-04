// ==============================================================================
// VISTAAR Super Admin — Gateway BFF Security & Integration Test Suite
// Version: 3.0.0 (Phase 4.2 V9 Hardened Administrative Control Plane)
// Target: Automated HTTP integration testing with isolated test mocks
// ==============================================================================

import http from 'http';
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

const TEST_PORT = 3099;
process.env.PORT = String(TEST_PORT);
process.env.NODE_ENV = 'test';

// Import gateway server and supabase client
const { server, supabase, rateLimitMap } = await import('../server/gateway.mjs');

// -----------------------------------------------------------------------------
// Isolated Test Harness Mocks (STRICTLY confined to test runner, never gateway.mjs)
// -----------------------------------------------------------------------------
const testAdminId = '88888888-8888-8888-8888-888888888888';
const nonMfaAdminId = '77777777-7777-7777-7777-777777777777';
const billingAdminId = '66666666-6666-6666-6666-666666666666';
const targetUserId = '11111111-1111-1111-1111-111111111111';

// Token store for simulating verified Supabase Auth JWT sessions
const validTokens = new Map([
  ['valid-aal2-token', { id: testAdminId, email: 'synthetic.admin@staging.vistaar.internal', aal: 'aal2' }],
  ['valid-aal1-token', { id: testAdminId, email: 'synthetic.admin@staging.vistaar.internal', aal: 'aal1' }],
  ['non-mfa-token', { id: nonMfaAdminId, email: 'nonmfa.admin@staging.vistaar.internal', aal: 'aal2' }],
  ['billing-admin-token', { id: billingAdminId, email: 'billing.admin@staging.vistaar.internal', aal: 'aal2' }]
]);

// Mock genuine Supabase Auth verification in test environment
supabase.auth.getUser = async (token) => {
  if (validTokens.has(token)) {
    return { data: { user: validTokens.get(token) }, error: null };
  }
  return { data: { user: null }, error: new Error('Invalid or expired authentication token') };
};

// Mock database query on platform_admins
const originalFrom = supabase.from.bind(supabase);
supabase.from = (table) => {
  if (table === 'platform_admins') {
    return {
      select: () => ({
        eq: (col, val) => ({
          single: async () => {
            if (val === testAdminId) {
              return {
                data: {
                  id: testAdminId,
                  email: 'synthetic.admin@staging.vistaar.internal',
                  role: 'super_admin',
                  is_active: true,
                  mfa_enrolled: true
                },
                error: null
              };
            }
            if (val === nonMfaAdminId) {
              return {
                data: {
                  id: nonMfaAdminId,
                  email: 'nonmfa.admin@staging.vistaar.internal',
                  role: 'super_admin',
                  is_active: true,
                  mfa_enrolled: false // MFA not enrolled!
                },
                error: null
              };
            }
            if (val === billingAdminId) {
              return {
                data: {
                  id: billingAdminId,
                  email: 'billing.admin@staging.vistaar.internal',
                  role: 'billing_admin', // Not super_admin!
                  is_active: true,
                  mfa_enrolled: true
                },
                error: null
              };
            }
            return { data: null, error: { message: 'Record not found' } };
          }
        })
      })
    };
  }
  return originalFrom(table);
};

// Mock authoritative RPC execution
supabase.rpc = async (fn, params) => {
  if (fn === 'super_admin_create_admin_invitation') {
    return {
      data: {
        success: true,
        invitation_id: 'mock-invitation-uuid-0001',
        target_user_id: params.p_target_user_id,
        target_email: params.p_target_email,
        role: params.p_role,
        session_aal: params.p_session_aal
      },
      error: null
    };
  }
  if (fn === 'super_admin_provision_platform_admin') {
    return {
      data: {
        success: true,
        admin_id: params.p_admin_id,
        email: params.p_email,
        role: params.p_role,
        session_aal: params.p_session_aal,
        mfa_enrolled: false
      },
      error: null
    };
  }
  if (fn === 'super_admin_enroll_mfa') {
    return {
      data: {
        success: true,
        admin_id: params.p_admin_id,
        mfa_enrolled: true,
        mfa_enrolled_at: new Date().toISOString()
      },
      error: null
    };
  }
  if (fn === 'super_admin_revoke_mfa') {
    return {
      data: {
        success: true,
        target_admin_id: params.p_target_admin_id,
        mfa_enrolled: false
      },
      error: null
    };
  }
  return { data: null, error: { message: `RPC ${fn} unhandled in mock` } };
};

// -----------------------------------------------------------------------------
// Test Runner
// -----------------------------------------------------------------------------
async function runGatewaySecurityTests() {
  console.log('=== STARTING GATEWAY BFF V9 SECURITY INTEGRATION TESTS ===');
  
  await new Promise((resolve) => {
    server.listen(TEST_PORT, '127.0.0.1', () => {
      console.log(`[Test Server] Listening on http://127.0.0.1:${TEST_PORT}`);
      resolve();
    });
  });

  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;
  const secret = process.env.GATEWAY_ASSERTION_SECRET;
  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    console.log(`✅ PASS: ${message}`);
    passed++;
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Unauthenticated Request Rejection (401)
    // -------------------------------------------------------------------------
    const res1 = await fetch(`${baseUrl}/api/v1/admins/provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_id: targetUserId, email: 'target@staging.vistaar.internal', full_name: 'Target' })
    });
    const body1 = await res1.json();
    assert(res1.status === 401, 'Unauthenticated POST /api/v1/admins/provision returns HTTP 401');
    assert(body1.error === 'UNAUTHORIZED', 'Unauthenticated request returns UNAUTHORIZED error code');

    // -------------------------------------------------------------------------
    // TEST 2: Fabricated 'test-token-*' Bypass Removal Verification (401)
    // Proves that any hardcoded test-token shortcut in gateway has been completely removed
    // -------------------------------------------------------------------------
    const res2 = await fetch(`${baseUrl}/api/v1/admins/provision`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer test-token-${testAdminId}`
      },
      body: JSON.stringify({ admin_id: targetUserId, email: 'target@staging.vistaar.internal', full_name: 'Target' })
    });
    const body2 = await res2.json();
    assert(res2.status === 401, 'Fabricated test-token-* header is rejected with HTTP 401 (bypass removed)');
    assert(body2.error === 'INVALID_TOKEN' || body2.error === 'AUTH_FAILED', 'Fabricated token returns invalid/auth failure');

    // -------------------------------------------------------------------------
    // TEST 3: Invalid Bearer Token Rejection (401)
    // -------------------------------------------------------------------------
    const res3 = await fetch(`${baseUrl}/api/v1/admins/provision`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer totally-invalid-token-xyz'
      },
      body: JSON.stringify({ admin_id: targetUserId, email: 'target@staging.vistaar.internal', full_name: 'Target' })
    });
    assert(res3.status === 401, 'Invalid Bearer token returns HTTP 401');

    // -------------------------------------------------------------------------
    // TEST 4: Missing GCAP Cryptographic Headers Rejection (401)
    // -------------------------------------------------------------------------
    const res4 = await fetch(`${baseUrl}/api/v1/admins/provision`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-aal2-token'
      },
      body: JSON.stringify({ admin_id: targetUserId, email: 'target@staging.vistaar.internal', full_name: 'Target' })
    });
    const body4 = await res4.json();
    assert(res4.status === 401, 'Missing GCAP assertion headers returns HTTP 401');
    assert(body4.error === 'GCAP_ASSERTION_MISSING', 'Error code is GCAP_ASSERTION_MISSING');

    // -------------------------------------------------------------------------
    // TEST 5: Non-Hex or Invalid Format GCAP Signature Rejection (401)
    // -------------------------------------------------------------------------
    const nowEpoch = Math.floor(Date.now() / 1000);
    const nonce = '00000000-0000-0000-0000-000000000001';
    const res5 = await fetch(`${baseUrl}/api/v1/admins/provision`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-aal2-token',
        'X-GCAP-Signature': 'not-a-valid-hex-string-short',
        'X-GCAP-Timestamp': String(nowEpoch),
        'X-GCAP-Nonce': nonce
      },
      body: JSON.stringify({ admin_id: targetUserId, email: 'target@staging.vistaar.internal', full_name: 'Target', role: 'super_admin' })
    });
    const body5 = await res5.json();
    assert(res5.status === 401, 'Non-hex / short GCAP signature returns HTTP 401');
    assert(body5.error === 'INVALID_GCAP_SIGNATURE', 'Error code is INVALID_GCAP_SIGNATURE');

    // -------------------------------------------------------------------------
    // TEST 6: Invalid HMAC Signature Mismatch Rejection (401)
    // -------------------------------------------------------------------------
    const res6 = await fetch(`${baseUrl}/api/v1/admins/provision`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-aal2-token',
        'X-GCAP-Signature': 'deadbeef00000000000000000000000000000000000000000000000000000000',
        'X-GCAP-Timestamp': String(nowEpoch),
        'X-GCAP-Nonce': nonce
      },
      body: JSON.stringify({ admin_id: targetUserId, email: 'target@staging.vistaar.internal', full_name: 'Target', role: 'super_admin' })
    });
    const body6 = await res6.json();
    assert(res6.status === 401, 'Mismatched HMAC signature returns HTTP 401');
    assert(body6.error === 'INVALID_GCAP_SIGNATURE', 'Error code is INVALID_GCAP_SIGNATURE');

    // -------------------------------------------------------------------------
    // TEST 7: Expired / Skewed Assertion Timestamp Rejection (401)
    // -------------------------------------------------------------------------
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 60; // 60s skew (> 30s)
    const canonical7 = `${testAdminId}:PROVISION_PLATFORM_ADMIN:${targetUserId}:super_admin:aal2:${expiredTimestamp}:${nonce}`;
    const sig7 = crypto.createHmac('sha256', secret).update(canonical7).digest('hex');

    const res7 = await fetch(`${baseUrl}/api/v1/admins/provision`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-aal2-token',
        'X-GCAP-Signature': sig7,
        'X-GCAP-Timestamp': String(expiredTimestamp),
        'X-GCAP-Nonce': nonce
      },
      body: JSON.stringify({ admin_id: targetUserId, email: 'target@staging.vistaar.internal', full_name: 'Target', role: 'super_admin' })
    });
    const body7 = await res7.json();
    assert(res7.status === 401, 'Timestamp skewed by > 30s returns HTTP 401');
    assert(body7.error === 'ASSERTION_TIMESTAMP_EXPIRED', 'Error code is ASSERTION_TIMESTAMP_EXPIRED');

    // -------------------------------------------------------------------------
    // TEST 8: Forged Client-Supplied Actor ID Rejection (403)
    // -------------------------------------------------------------------------
    const forgedActorId = '99999999-9999-9999-9999-999999999999';
    const canonical8 = `${testAdminId}:PROVISION_PLATFORM_ADMIN:${targetUserId}:super_admin:aal2:${nowEpoch}:${nonce}`;
    const sig8 = crypto.createHmac('sha256', secret).update(canonical8).digest('hex');

    const res8 = await fetch(`${baseUrl}/api/v1/admins/provision`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-aal2-token',
        'X-GCAP-Signature': sig8,
        'X-GCAP-Timestamp': String(nowEpoch),
        'X-GCAP-Nonce': nonce
      },
      body: JSON.stringify({ 
        admin_id: targetUserId, 
        email: 'target@staging.vistaar.internal', 
        full_name: 'Target', 
        role: 'super_admin',
        actor_admin_id: forgedActorId // Forged actor in payload!
      })
    });
    const body8 = await res8.json();
    assert(res8.status === 403, 'Forged actor_admin_id in body returns HTTP 403');
    assert(body8.error === 'FORGED_ACTOR_IDENTITY', 'Error code is FORGED_ACTOR_IDENTITY');

    // -------------------------------------------------------------------------
    // TEST 9: Bounded Request-Body Size Rejection (413)
    // -------------------------------------------------------------------------
    const largePayload = 'A'.repeat(20000); // 20 KB (> 16 KB boundary)
    let caught413 = false;
    try {
      const res9 = await fetch(`${baseUrl}/api/v1/admins/provision`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid-aal2-token'
        },
        body: JSON.stringify({ data: largePayload })
      });
      if (res9.status === 413) caught413 = true;
    } catch {
      caught413 = true;
    }
    assert(caught413, 'Oversized request payload (> 16KB) is rejected with HTTP 413');

    // -------------------------------------------------------------------------
    // TEST 10: Explicit CORS Allowlist Boundary (No Wildcard on Privileged Route)
    // -------------------------------------------------------------------------
    const res10 = await fetch(`${baseUrl}/api/v1/admins/provision`, {
      method: 'OPTIONS',
      headers: { 
        'Origin': 'https://malicious-website.com',
        'Access-Control-Request-Method': 'POST'
      }
    });
    const corsOrigin = res10.headers.get('access-control-allow-origin');
    assert(corsOrigin !== '*', 'Privileged endpoint MUST NOT respond with Access-Control-Allow-Origin: *');
    assert(!corsOrigin || corsOrigin === 'null', 'Disallowed origin does not receive CORS authorization header');

    // -------------------------------------------------------------------------
    // TEST 11: Rate Limiting Enforcement (429)
    // -------------------------------------------------------------------------
    let rateLimited = false;
    for (let i = 0; i < 55; i++) {
      const resRate = await fetch(`${baseUrl}/api/v1/admins/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: 'x', target_email: 'x' })
      });
      if (resRate.status === 429) {
        rateLimited = true;
        break;
      }
    }
    assert(rateLimited, 'Rapid burst requests trigger HTTP 429 Rate Limit Exceeded');
    rateLimitMap.clear(); // Reset map for remaining tests

    // -------------------------------------------------------------------------
    // TEST 12: AAL1 Session Assurance Rejection on Privileged Route (403)
    // -------------------------------------------------------------------------
    const canonical12 = `${testAdminId}:PROVISION_PLATFORM_ADMIN:${targetUserId}:super_admin:aal1:${nowEpoch}:${nonce}`;
    const sig12 = crypto.createHmac('sha256', secret).update(canonical12).digest('hex');

    const res12 = await fetch(`${baseUrl}/api/v1/admins/provision`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-aal1-token', // Single-factor only (AAL1)
        'X-GCAP-Signature': sig12,
        'X-GCAP-Timestamp': String(nowEpoch),
        'X-GCAP-Nonce': nonce
      },
      body: JSON.stringify({ 
        admin_id: targetUserId, 
        email: 'target@staging.vistaar.internal', 
        full_name: 'Target', 
        role: 'super_admin' 
      })
    });
    const body12 = await res12.json();
    assert(res12.status === 403, 'AAL1 session assurance on privileged route returns HTTP 403');
    assert(body12.error === 'MFA_ASSURANCE_REQUIRED', 'Error code is MFA_ASSURANCE_REQUIRED');

    // -------------------------------------------------------------------------
    // TEST 13: Actor Without Enrolled MFA Rejection (403)
    // -------------------------------------------------------------------------
    const canonical13 = `${nonMfaAdminId}:PROVISION_PLATFORM_ADMIN:${targetUserId}:super_admin:aal2:${nowEpoch}:${nonce}`;
    const sig13 = crypto.createHmac('sha256', secret).update(canonical13).digest('hex');

    const res13 = await fetch(`${baseUrl}/api/v1/admins/provision`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer non-mfa-token', // Actor has mfa_enrolled = false in DB
        'X-GCAP-Signature': sig13,
        'X-GCAP-Timestamp': String(nowEpoch),
        'X-GCAP-Nonce': nonce
      },
      body: JSON.stringify({ 
        admin_id: targetUserId, 
        email: 'target@staging.vistaar.internal', 
        full_name: 'Target', 
        role: 'super_admin' 
      })
    });
    const body13 = await res13.json();
    assert(res13.status === 403, 'Actor without enrolled MFA returns HTTP 403');
    assert(body13.error === 'MFA_NOT_ENROLLED', 'Error code is MFA_NOT_ENROLLED');

    // -------------------------------------------------------------------------
    // TEST 14: Non-Super-Admin Role Rejection (403)
    // -------------------------------------------------------------------------
    const canonical14 = `${billingAdminId}:PROVISION_PLATFORM_ADMIN:${targetUserId}:super_admin:aal2:${nowEpoch}:${nonce}`;
    const sig14 = crypto.createHmac('sha256', secret).update(canonical14).digest('hex');

    const res14 = await fetch(`${baseUrl}/api/v1/admins/provision`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer billing-admin-token', // Actor is billing_admin, not super_admin
        'X-GCAP-Signature': sig14,
        'X-GCAP-Timestamp': String(nowEpoch),
        'X-GCAP-Nonce': nonce
      },
      body: JSON.stringify({ 
        admin_id: targetUserId, 
        email: 'target@staging.vistaar.internal', 
        full_name: 'Target', 
        role: 'super_admin' 
      })
    });
    const body14 = await res14.json();
    assert(res14.status === 403, 'Billing admin attempting provisioning returns HTTP 403');
    assert(body14.error === 'FORBIDDEN_INSUFFICIENT_PRIVILEGES', 'Error code is FORBIDDEN_INSUFFICIENT_PRIVILEGES');

    // -------------------------------------------------------------------------
    // TEST 15: Successful Administrator Invitation Issuance (200)
    // -------------------------------------------------------------------------
    const nonce15 = '00000000-0000-0000-0000-000000000015';
    const canonical15 = `${testAdminId}:CREATE_ADMIN_INVITATION:${targetUserId}:super_admin:aal2:${nowEpoch}:${nonce15}`;
    const sig15 = crypto.createHmac('sha256', secret).update(canonical15).digest('hex');

    const res15 = await fetch(`${baseUrl}/api/v1/admins/invite`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-aal2-token',
        'X-GCAP-Signature': sig15,
        'X-GCAP-Timestamp': String(nowEpoch),
        'X-GCAP-Nonce': nonce15
      },
      body: JSON.stringify({ 
        target_user_id: targetUserId, 
        target_email: 'synthetic.target@staging.vistaar.internal', 
        role: 'super_admin',
        expires_in_hours: 24 
      })
    });
    const body15 = await res15.json();
    assert(res15.status === 200, 'Super admin invitation issuance with AAL2 returns HTTP 200');
    assert(body15.success === true, 'Invitation response indicates success');
    assert(body15.invitation_id === 'mock-invitation-uuid-0001', 'Returns valid invitation_id');

    // -------------------------------------------------------------------------
    // TEST 16: Successful Administrator Provisioning (200)
    // -------------------------------------------------------------------------
    const nonce16 = '00000000-0000-0000-0000-000000000016';
    const canonical16 = `${testAdminId}:PROVISION_PLATFORM_ADMIN:${targetUserId}:super_admin:aal2:${nowEpoch}:${nonce16}`;
    const sig16 = crypto.createHmac('sha256', secret).update(canonical16).digest('hex');

    const res16 = await fetch(`${baseUrl}/api/v1/admins/provision`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-aal2-token',
        'X-GCAP-Signature': sig16,
        'X-GCAP-Timestamp': String(nowEpoch),
        'X-GCAP-Nonce': nonce16
      },
      body: JSON.stringify({ 
        admin_id: targetUserId, 
        email: 'synthetic.target@staging.vistaar.internal', 
        full_name: 'Target Administrator', 
        role: 'super_admin' 
      })
    });
    const body16 = await res16.json();
    assert(res16.status === 200, 'Super admin provisioning with AAL2 returns HTTP 200');
    assert(body16.success === true, 'Provisioning response indicates success');
    assert(body16.mfa_enrolled === false, 'Newly provisioned admin starts with mfa_enrolled = false');

    // -------------------------------------------------------------------------
    // TEST 17: MFA Enrollment Route (AAL2 Enforcement) (200 & 403)
    // -------------------------------------------------------------------------
    const res17A = await fetch(`${baseUrl}/api/v1/admins/mfa/enroll`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-aal1-token' // AAL1 attempt
      }
    });
    const body17A = await res17A.json();
    assert(res17A.status === 403, 'MFA self-enrollment with AAL1 returns HTTP 403');
    assert(body17A.error === 'MFA_ASSURANCE_REQUIRED', 'Error code is MFA_ASSURANCE_REQUIRED');

    const res17B = await fetch(`${baseUrl}/api/v1/admins/mfa/enroll`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-aal2-token' // AAL2 attempt
      }
    });
    const body17B = await res17B.json();
    assert(res17B.status === 200, 'MFA self-enrollment with AAL2 returns HTTP 200');
    assert(body17B.success === true, 'MFA enrollment succeeded');

    // -------------------------------------------------------------------------
    // TEST 18: HTTP Bootstrap Route Removed / Gone (410)
    // -------------------------------------------------------------------------
    const res18 = await fetch(`${baseUrl}/api/v1/admins/bootstrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_id: '1' })
    });
    const body18 = await res18.json();
    assert(res18.status === 410, 'POST /api/v1/admins/bootstrap returns HTTP 410 Gone');
    assert(body18.error === 'BOOTSTRAP_REMOVED_FROM_GATEWAY', 'Error indicates bootstrap must be executed out-of-band via CLI');

    console.log(`\n=== ALL ${passed}/${total} GATEWAY HTTP V9 SECURITY TESTS PASSED ===`);
  } finally {
    server.close();
  }
}

runGatewaySecurityTests().catch(err => {
  console.error('Test suite failure:', err);
  process.exit(1);
});
