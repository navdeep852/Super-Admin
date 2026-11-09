// ==============================================================================
// VISTAAR Super Admin — Payment Webhook Lifecycle & Optionality Security Test Suite
// Verifies Youpi PG optionality, fail-closed disabling, startup validation & active settlement
// ==============================================================================

import assert from 'assert';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

// Load .env.staging if present
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

const TEST_PORT = 3097;
process.env.PORT = String(TEST_PORT);
process.env.NODE_ENV = 'test';

// Dynamically import gateway and validation utilities
const { server, supabase, validateEnvironment, getYoupiWebhookConfig } = await import('../server/gateway.mjs');

const testWebhookSecret = '74db307869faa7b02a31b0810eb4c80c83ee251f7676eb7b77a21fabea94e2e2';
const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

// Track settled transactions for idempotency simulation
const settledTransactions = new Set();

// Mock Supabase settle_coupon_payment RPC
supabase.rpc = async (fn, params) => {
  if (fn === 'settle_coupon_payment') {
    const ref = params.p_transaction_reference;
    if (settledTransactions.has(ref)) {
      return {
        data: {
          success: true,
          status: 'already_settled',
          message: 'Idempotent duplicate webhook handled cleanly.'
        },
        error: null
      };
    }

    settledTransactions.add(ref);
    return {
      data: {
        success: true,
        status: 'settled',
        redemption_id: params.p_redemption_id,
        transaction_reference: ref,
        amount_paid: params.p_amount_paid,
        currency: params.p_currency
      },
      error: null
    };
  }
  return { data: { success: true }, error: null };
};

function signWebhook(body, secret = testWebhookSecret) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function runPaymentWebhookTests() {
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`[Webhook Runner] Test server listening on ${baseUrl}`);

  try {
    console.log('\n================================================================');
    console.log(' PHASE 1: STARTUP & ENVIRONMENT OPTIONALITY VALIDATION');
    console.log('================================================================');

    // 1.1 Startup validation without Youpi secret when integration is disabled
    const disabledEnv = {
      GATEWAY_SUPABASE_URL: 'https://staging-project.supabase.co',
      GATEWAY_SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      GATEWAY_ASSERTION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      ENABLE_YOUPI_WEBHOOK: 'false'
      // YOUPI_WEBHOOK_SECRET intentionally omitted
    };
    const resEnv1 = validateEnvironment(disabledEnv);
    assert.strictEqual(resEnv1.isValid, true, 'Gateway must be valid without Youpi secret when disabled');
    assert.strictEqual(resEnv1.missing.length, 0);
    console.log('  ✓ Test 1.1: Gateway environment valid without YOUPI_WEBHOOK_SECRET when disabled');

    // 1.2 Startup validation when ENABLE_YOUPI_WEBHOOK is completely unset
    const unsetEnv = {
      GATEWAY_SUPABASE_URL: 'https://staging-project.supabase.co',
      GATEWAY_SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      GATEWAY_ASSERTION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    };
    const resEnv2 = validateEnvironment(unsetEnv);
    assert.strictEqual(resEnv2.isValid, true, 'Gateway must be valid when ENABLE_YOUPI_WEBHOOK is unset');
    assert.strictEqual(resEnv2.missing.length, 0);
    console.log('  ✓ Test 1.2: Gateway environment valid by default without any Youpi variables');

    // 1.3 Startup validation refuses when enabled without secret
    const enabledNoSecretEnv = {
      GATEWAY_SUPABASE_URL: 'https://staging-project.supabase.co',
      GATEWAY_SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      GATEWAY_ASSERTION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      ENABLE_YOUPI_WEBHOOK: 'true'
      // Missing YOUPI_WEBHOOK_SECRET
    };
    const resEnv3 = validateEnvironment(enabledNoSecretEnv);
    assert.strictEqual(resEnv3.isValid, false, 'Gateway must refuse startup when enabled without secret');
    assert.strictEqual(resEnv3.missing.some(m => m.includes('YOUPI_WEBHOOK_SECRET')), true);
    console.log('  ✓ Test 1.3: Enabled integration strictly refuses startup without YOUPI_WEBHOOK_SECRET');

    console.log('\n================================================================');
    console.log(' PHASE 2: FAIL-CLOSED REJECTION WHEN INTEGRATION IS DISABLED');
    console.log('================================================================');

    // Set integration disabled
    process.env.ENABLE_YOUPI_WEBHOOK = 'false';
    delete process.env.YOUPI_WEBHOOK_SECRET;

    const testPayload = JSON.stringify({
      redemption_id: '22222222-2222-2222-2222-222222222222',
      transaction_reference: 'TXN-STAGE-TEST-001',
      gateway_provider: 'youpi_pg',
      amount_paid: 2499.00,
      currency: 'INR',
      provider_status: 'captured',
      payment_authorized_at: new Date().toISOString()
    });

    // 2.1 Unsigned webhook request when disabled -> 503 WEBHOOK_INTEGRATION_DISABLED
    const resDisabled1 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: testPayload
    });
    assert.strictEqual(resDisabled1.status, 503, 'Disabled integration must reject with 503');
    const bodyDisabled1 = await resDisabled1.json();
    assert.strictEqual(bodyDisabled1.error, 'WEBHOOK_INTEGRATION_DISABLED');
    console.log('  ✓ Test 2.1: Unsigned webhook rejected with 503 WEBHOOK_INTEGRATION_DISABLED');

    // 2.2 Signed webhook request when disabled -> 503 (no bypass)
    const dummySig = crypto.createHmac('sha256', 'dummy-secret').update(testPayload).digest('hex');
    const resDisabled2 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youpi-Signature': dummySig
      },
      body: testPayload
    });
    assert.strictEqual(resDisabled2.status, 503, 'Signed webhook must still be rejected with 503 when disabled');
    const bodyDisabled2 = await resDisabled2.json();
    assert.strictEqual(bodyDisabled2.error, 'WEBHOOK_INTEGRATION_DISABLED');
    console.log('  ✓ Test 2.2: Signed webhook rejected with 503 when disabled (no signature bypass)');

    // 2.3 Alias route /api/v1/webhooks/youpi also rejected when disabled
    const resDisabled3 = await fetch(`${baseUrl}/api/v1/webhooks/youpi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: testPayload
    });
    assert.strictEqual(resDisabled3.status, 503, 'Webhook alias must also be rejected with 503');
    const bodyDisabled3 = await resDisabled3.json();
    assert.strictEqual(bodyDisabled3.error, 'WEBHOOK_INTEGRATION_DISABLED');
    console.log('  ✓ Test 2.3: Webhook alias route /api/v1/webhooks/youpi rejected with 503');

    // 2.4 Non-POST request rejected with 405 Method Not Allowed
    const resDisabled4 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'GET'
    });
    assert.strictEqual(resDisabled4.status, 405, 'Non-POST webhook request must return 405');
    const bodyDisabled4 = await resDisabled4.json();
    assert.strictEqual(bodyDisabled4.error, 'METHOD_NOT_ALLOWED');
    console.log('  ✓ Test 2.4: Non-POST webhook request rejected with 405 METHOD_NOT_ALLOWED');

    console.log('\n================================================================');
    console.log(' PHASE 3: ACTIVE WEBHOOK LIFECYCLE (INTEGRATION EXPLICITLY ENABLED)');
    console.log('================================================================');

    // Explicitly enable integration and set secret
    process.env.ENABLE_YOUPI_WEBHOOK = 'true';
    process.env.YOUPI_WEBHOOK_SECRET = testWebhookSecret;

    // 3.1 Missing Signature Header
    const res31 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: testPayload
    });
    assert.strictEqual(res31.status, 401, 'Missing signature header must return 401');
    const body31 = await res31.json();
    assert.strictEqual(body31.error, 'WEBHOOK_SIGNATURE_MISSING');
    console.log('  ✓ Test 3.1: Missing X-Youpi-Signature rejected with 401 WEBHOOK_SIGNATURE_MISSING');

    // 3.2 Malformed / Invalid Format Signature
    const res32 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youpi-Signature': 'invalid-short-sig'
      },
      body: testPayload
    });
    assert.strictEqual(res32.status, 401, 'Malformed signature must return 401');
    const body32 = await res32.json();
    assert.strictEqual(body32.error, 'INVALID_WEBHOOK_SIGNATURE');
    console.log('  ✓ Test 3.2: Malformed signature rejected with 401 INVALID_WEBHOOK_SIGNATURE');

    // 3.3 Mismatched HMAC Signature (Tampered Payload)
    const tamperedPayload = JSON.stringify({ ...JSON.parse(testPayload), amount_paid: 1.00 });
    const tamperedSig = signWebhook(testPayload);

    const res33 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youpi-Signature': tamperedSig
      },
      body: tamperedPayload
    });
    assert.strictEqual(res33.status, 401, 'Tampered payload signature mismatch must return 401');
    const body33 = await res33.json();
    assert.strictEqual(body33.error, 'INVALID_WEBHOOK_SIGNATURE');
    console.log('  ✓ Test 3.3: Tampered payload signature mismatch rejected with 401');

    // 3.4 Expired Timestamp (> 5 minutes skew)
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 360; // 6 minutes ago
    const sig34 = signWebhook(testPayload);

    const res34 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youpi-Signature': sig34,
        'X-Webhook-Timestamp': String(expiredTimestamp)
      },
      body: testPayload
    });
    assert.strictEqual(res34.status, 401, 'Expired webhook timestamp must return 401');
    const body34 = await res34.json();
    assert.strictEqual(body34.error, 'WEBHOOK_TIMESTAMP_EXPIRED');
    console.log('  ✓ Test 3.4: Expired webhook timestamp (> 5 min) rejected with 401 WEBHOOK_TIMESTAMP_EXPIRED');

    // 3.5 Missing Required Payload Fields
    const incompletePayload = JSON.stringify({ redemption_id: '22222222-2222-2222-2222-222222222222' });
    const sig35 = signWebhook(incompletePayload);

    const res35 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youpi-Signature': sig35
      },
      body: incompletePayload
    });
    assert.strictEqual(res35.status, 400, 'Incomplete payload must return 400');
    const body35 = await res35.json();
    assert.strictEqual(body35.error, 'MISSING_REQUIRED_FIELDS');
    console.log('  ✓ Test 3.5: Incomplete webhook payload rejected with 400 MISSING_REQUIRED_FIELDS');

    // 3.6 Valid Webhook Execution & Authoritative Settlement
    const validSig = signWebhook(testPayload);
    const validTimestamp = Math.floor(Date.now() / 1000);

    const res36 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youpi-Signature': validSig,
        'X-Webhook-Timestamp': String(validTimestamp)
      },
      body: testPayload
    });
    assert.strictEqual(res36.status, 200, 'Valid webhook must return 200');
    const body36 = await res36.json();
    assert.strictEqual(body36.status, 'settled', 'Status must be settled');
    assert.strictEqual(body36.transaction_reference, 'TXN-STAGE-TEST-001');
    console.log('  ✓ Test 3.6: Valid webhook processed and authoritative settlement RPC invoked with 200 OK');

    // 3.7 Idempotent Duplicate Delivery Handling
    const res37 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youpi-Signature': validSig,
        'X-Webhook-Timestamp': String(validTimestamp)
      },
      body: testPayload
    });
    assert.strictEqual(res37.status, 200, 'Duplicate webhook must return 200');
    const body37 = await res37.json();
    assert.strictEqual(body37.status, 'already_settled', 'Status must be already_settled');
    console.log('  ✓ Test 3.7: Duplicate delivery handled idempotently: returns 200 already_settled');

    console.log('\n================================================================');
    console.log('🎉 ALL 13 PAYMENT WEBHOOK OPTIONALITY & LIFECYCLE TESTS PASSED');
    console.log('================================================================\n');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

runPaymentWebhookTests();
