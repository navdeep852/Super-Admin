// ==============================================================================
// VISTAAR Super Admin — Payment Webhook Lifecycle Security Test Suite
// Verifies Youpi PG HMAC signature verification, timestamp freshness & settlement RPC
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

const TEST_PORT = 3097;
process.env.PORT = String(TEST_PORT);
process.env.NODE_ENV = 'test';

const { server, supabase } = await import('../server/gateway.mjs');

const webhookSecret = process.env.YOUPI_WEBHOOK_SECRET || '74db307869faa7b02a31b0810eb4c80c83ee251f7676eb7b77a21fabea94e2e2';
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

function signWebhook(body, secret = webhookSecret) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function runPaymentWebhookTests() {
  await new Promise((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`[Webhook Runner] Test server listening on ${baseUrl}`);

  try {
    console.log('\n=== RUNNING PAYMENT WEBHOOK LIFECYCLE TESTS ===\n');

    const testPayload = JSON.stringify({
      redemption_id: '22222222-2222-2222-2222-222222222222',
      transaction_reference: 'TXN-STAGE-TEST-001',
      gateway_provider: 'youpi_pg',
      amount_paid: 2499.00,
      currency: 'INR',
      provider_status: 'captured',
      payment_authorized_at: new Date().toISOString()
    });

    // 1. Missing Signature Header
    const res1 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: testPayload
    });
    assert.strictEqual(res1.status, 401, 'Missing signature header must return 401');
    const body1 = await res1.json();
    assert.strictEqual(body1.error, 'WEBHOOK_SIGNATURE_MISSING');
    console.log('  ✓ Test 1: Missing X-Youpi-Signature rejected with 401 WEBHOOK_SIGNATURE_MISSING');

    // 2. Malformed / Invalid Format Signature
    const res2 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youpi-Signature': 'invalid-short-sig'
      },
      body: testPayload
    });
    assert.strictEqual(res2.status, 401, 'Malformed signature must return 401');
    const body2 = await res2.json();
    assert.strictEqual(body2.error, 'INVALID_WEBHOOK_SIGNATURE');
    console.log('  ✓ Test 2: Malformed signature rejected with 401 INVALID_WEBHOOK_SIGNATURE');

    // 3. Mismatched HMAC Signature (Tampered Payload)
    const tamperedPayload = JSON.stringify({ ...JSON.parse(testPayload), amount_paid: 1.00 });
    const tamperedSig = signWebhook(testPayload); // signed original, sent tampered

    const res3 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youpi-Signature': tamperedSig
      },
      body: tamperedPayload
    });
    assert.strictEqual(res3.status, 401, 'Tampered payload signature mismatch must return 401');
    const body3 = await res3.json();
    assert.strictEqual(body3.error, 'INVALID_WEBHOOK_SIGNATURE');
    console.log('  ✓ Test 3: Tampered payload signature mismatch rejected with 401');

    // 4. Expired Timestamp (> 5 minutes skew)
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 360; // 6 minutes ago
    const sig4 = signWebhook(testPayload);

    const res4 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youpi-Signature': sig4,
        'X-Webhook-Timestamp': String(expiredTimestamp)
      },
      body: testPayload
    });
    assert.strictEqual(res4.status, 401, 'Expired webhook timestamp must return 401');
    const body4 = await res4.json();
    assert.strictEqual(body4.error, 'WEBHOOK_TIMESTAMP_EXPIRED');
    console.log('  ✓ Test 4: Expired webhook timestamp (> 5 min) rejected with 401 WEBHOOK_TIMESTAMP_EXPIRED');

    // 5. Missing Required Payload Fields
    const incompletePayload = JSON.stringify({ redemption_id: '22222222-2222-2222-2222-222222222222' });
    const sig5 = signWebhook(incompletePayload);

    const res5 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youpi-Signature': sig5
      },
      body: incompletePayload
    });
    assert.strictEqual(res5.status, 400, 'Incomplete payload must return 400');
    const body5 = await res5.json();
    assert.strictEqual(body5.error, 'MISSING_REQUIRED_FIELDS');
    console.log('  ✓ Test 5: Incomplete webhook payload rejected with 400 MISSING_REQUIRED_FIELDS');

    // 6. Valid Webhook Execution & Authoritative Settlement
    const validSig = signWebhook(testPayload);
    const validTimestamp = Math.floor(Date.now() / 1000);

    const res6 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youpi-Signature': validSig,
        'X-Webhook-Timestamp': String(validTimestamp)
      },
      body: testPayload
    });
    assert.strictEqual(res6.status, 200, 'Valid webhook must return 200');
    const body6 = await res6.json();
    assert.strictEqual(body6.status, 'settled', 'Status must be settled');
    assert.strictEqual(body6.transaction_reference, 'TXN-STAGE-TEST-001');
    console.log('  ✓ Test 6: Valid webhook processed and authoritative settlement RPC invoked with 200 OK');

    // 7. Idempotent Duplicate Delivery Handling
    const res7 = await fetch(`${baseUrl}/api/v1/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Youpi-Signature': validSig,
        'X-Webhook-Timestamp': String(validTimestamp)
      },
      body: testPayload
    });
    assert.strictEqual(res7.status, 200, 'Duplicate webhook must return 200');
    const body7 = await res7.json();
    assert.strictEqual(body7.status, 'already_settled', 'Status must be already_settled');
    console.log('  ✓ Test 7: Duplicate delivery handled idempotently: returns 200 already_settled');

    console.log('\n================================================================');
    console.log('✅ ALL 7 PAYMENT WEBHOOK LIFECYCLE TESTS PASSED');
    console.log('================================================================');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

runPaymentWebhookTests();

