#!/usr/bin/env node
// ==============================================================================
// VISTAAR Super Admin — Out-of-Band Initial Administrator Bootstrap CLI
// Version: 1.0.0 (Phase 4.2 V9 Hardened)
// Target: Out-of-band administrative script — strictly excluded from HTTP gateway
// ==============================================================================

import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const FORBIDDEN_PROD_REF = 'kluxsykimnjivkqxelba';
const envPath = path.resolve(process.cwd(), '.env.staging');

// 1. Load .env.staging if present
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  });
}

// 2. Air-gap and configuration validation
const gatewayUrl = process.env.GATEWAY_SUPABASE_URL || '';
const serviceRoleKey = process.env.GATEWAY_SUPABASE_SERVICE_ROLE_KEY || '';
const bootstrapSecret = process.env.PLATFORM_BOOTSTRAP_SECRET || '';

if (gatewayUrl.includes(FORBIDDEN_PROD_REF)) {
  console.error('[CRITICAL] Aborting: Production reference detected in GATEWAY_SUPABASE_URL!');
  process.exit(1);
}

if (!gatewayUrl || !serviceRoleKey || !bootstrapSecret) {
  console.error('[ERROR] Missing required configuration: GATEWAY_SUPABASE_URL, GATEWAY_SUPABASE_SERVICE_ROLE_KEY, or PLATFORM_BOOTSTRAP_SECRET');
  process.exit(1);
}

// 3. Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--admin-id' && args[i + 1]) {
      options.adminId = args[++i];
    } else if (args[i] === '--email' && args[i + 1]) {
      options.email = args[++i];
    } else if (args[i] === '--name' && args[i + 1]) {
      options.fullName = args[++i];
    }
  }
  return options;
}

async function runBootstrap() {
  const { adminId, email, fullName } = parseArgs();

  if (!adminId || !email || !fullName) {
    console.log(`
Usage:
  node scripts/bootstrap_super_admin.mjs --admin-id <UUID> --email <EMAIL> --name <FULL_NAME>

Requirements:
  - Account must be pre-provisioned via Supabase Auth Admin API
  - PLATFORM_BOOTSTRAP_SECRET must be configured
  - Can only be executed ONCE; subsequent calls are permanently locked out
`);
    process.exit(1);
  }

  console.log(`[BOOTSTRAP] Initiating initial super admin bootstrap for ${email} (ID: ${adminId})...`);

  const supabase = createClient(gatewayUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const { data, error } = await supabase.rpc('super_admin_bootstrap_initial_admin', {
      p_admin_id: adminId,
      p_email: email,
      p_full_name: fullName,
      p_bootstrap_token: bootstrapSecret
    });

    if (error) {
      if (error.code === '55000' && error.message.includes('BOOTSTRAP_ALREADY_COMPLETED')) {
        console.error('❌ [LOCKED OUT] Platform administrator bootstrap has already been completed. Initial bootstrap is permanently locked out.');
      } else if (error.code === '28000') {
        console.error('❌ [AUTHENTICATION_FAILED] Invalid or missing bootstrap authorization token.');
      } else if (error.code === '55001') {
        console.error('❌ [EMAIL_MISMATCH] Target email does not match Auth record in auth.users.');
      } else {
        console.error(`❌ [ERROR] Bootstrap failed: ${error.message} (code: ${error.code})`);
      }
      process.exit(1);
    }

    console.log('✅ [SUCCESS] Root super administrator bootstrapped successfully!');
    console.log(`   Admin ID: ${data.admin_id}`);
    console.log(`   Email: ${data.email}`);
    console.log(`   Role: ${data.role}`);
    console.log(`   MFA Enrolled: ${data.mfa_enrolled} (MFA enrollment must be completed via /api/v1/admins/mfa/enroll)`);
    console.log('   Registry: platform_bootstrap_registry marked is_bootstrapped = TRUE (one-time lockout active).');
  } catch (err) {
    console.error('❌ [FATAL] Unexpected error during bootstrap:', err.message);
    process.exit(1);
  }
}

runBootstrap();

