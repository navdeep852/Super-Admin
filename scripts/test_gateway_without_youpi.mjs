// ==============================================================================
// VISTAAR Super Admin — Gateway Startup Without Youpi Secret Test
// Empirically verifies Gateway starts without YOUPI_WEBHOOK_SECRET when disabled
// and verifies startup is refused when enabled without secret.
// ==============================================================================

import { spawn } from 'child_process';
import assert from 'assert';
import path from 'path';
import fs from 'fs';

// Load base staging credentials for test instance
const envPath = path.resolve('d:/Project/vistaar-main/super_admin/.env.staging');
const envVars = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      envVars[k] = v;
    }
  });
}

const TEST_PORT = 3095;

async function testDisabledStartup() {
  console.log('\n--- 1. Testing Gateway Process Startup WITHOUT YOUPI_WEBHOOK_SECRET ---');
  
  // Custom env with ZERO Youpi variables
  const cleanEnv = {
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT,
    NODE_ENV: 'test',
    PORT: String(TEST_PORT),
    SKIP_ENV_FILE: 'true',
    GATEWAY_SUPABASE_URL: envVars.GATEWAY_SUPABASE_URL,
    GATEWAY_SUPABASE_SERVICE_ROLE_KEY: envVars.GATEWAY_SUPABASE_SERVICE_ROLE_KEY,
    GATEWAY_ASSERTION_SECRET: envVars.GATEWAY_ASSERTION_SECRET
    // YOUPI_WEBHOOK_SECRET and ENABLE_YOUPI_WEBHOOK explicitly omitted
  };

  const proc = spawn('node', ['server/gateway.mjs'], { env: cleanEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  
  let started = false;
  let stdoutData = '';
  let stderrData = '';

  proc.stdout.on('data', d => {
    stdoutData += d.toString();
  });
  proc.stderr.on('data', d => {
    stderrData += d.toString();
  });

  // Wait for listening signal
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error(`Timeout waiting for Gateway to start. Output: ${stdoutData} / Errors: ${stderrData}`));
    }, 8000);

    const checkInterval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/health`);
        if (res.ok) {
          started = true;
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve();
        }
      } catch (e) {
        // Retry
      }
    }, 500);
  });

  console.log('  ✓ Gateway process started cleanly without YOUPI_WEBHOOK_SECRET');
  console.log('  ✓ Process output confirms:', stdoutData.trim());

  // Check health endpoint
  const healthRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/health`);
  const healthData = await healthRes.json();
  assert.strictEqual(healthData.status, 'operational');
  assert.strictEqual(healthData.integrations.youpiWebhook, 'disabled');
  console.log('  ✓ /api/v1/health reports:', JSON.stringify(healthData.integrations));

  // Check webhook rejection
  const webhookRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/v1/webhooks/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ test: true })
  });
  assert.strictEqual(webhookRes.status, 503);
  const webhookBody = await webhookRes.json();
  assert.strictEqual(webhookBody.error, 'WEBHOOK_INTEGRATION_DISABLED');
  console.log('  ✓ POST /api/v1/webhooks/payment rejected with 503:', webhookBody.error);

  proc.kill('SIGTERM');
  await new Promise(r => proc.on('exit', r));
  console.log('  ✓ Clean shutdown of test Gateway process');
}

async function testEnabledWithoutSecretFails() {
  console.log('\n--- 2. Testing Gateway Startup REFUSAL when Enabled Without Secret ---');

  const invalidEnv = {
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT,
    NODE_ENV: 'test',
    PORT: String(TEST_PORT),
    SKIP_ENV_FILE: 'true',
    GATEWAY_SUPABASE_URL: envVars.GATEWAY_SUPABASE_URL,
    GATEWAY_SUPABASE_SERVICE_ROLE_KEY: envVars.GATEWAY_SUPABASE_SERVICE_ROLE_KEY,
    GATEWAY_ASSERTION_SECRET: envVars.GATEWAY_ASSERTION_SECRET,
    ENABLE_YOUPI_WEBHOOK: 'true'
    // Missing YOUPI_WEBHOOK_SECRET
  };

  const proc = spawn('node', ['server/gateway.mjs'], { env: invalidEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  
  let stderrData = '';
  proc.stderr.on('data', d => {
    stderrData += d.toString();
  });

  const exitCode = await new Promise((resolve) => {
    proc.on('exit', resolve);
  });

  assert.strictEqual(exitCode, 1, 'Gateway process must exit with code 1 when missing required secret');
  assert.strictEqual(stderrData.includes('YOUPI_WEBHOOK_SECRET'), true, 'Error log must name YOUPI_WEBHOOK_SECRET');
  console.log('  ✓ Gateway process exited with code 1 as expected');
  console.log('  ✓ Stderr confirmed missing variable:', stderrData.trim());
}

async function main() {
  console.log('================================================================');
  console.log(' VISTAAR SUPER ADMIN — STANDALONE PROCESS STARTUP TEST');
  console.log('================================================================');
  await testDisabledStartup();
  await testEnabledWithoutSecretFails();
  console.log('\n================================================================');
  console.log(' 🎉 ALL PROCESS STARTUP TESTS PASSED');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
