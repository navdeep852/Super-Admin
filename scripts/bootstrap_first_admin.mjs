#!/usr/bin/env node
// ==============================================================================
// VISTAAR Super Admin — First Real Administrator Bootstrap CLI
// Target: Staging Environment (vlbhxcajphyjkeueubud)
// Security: Strictly Out-of-Band CLI | One-Time Execution Lockout
// ==============================================================================

import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const FORBIDDEN_PROD_REF = 'kluxsykimnjivkqxelba';
const envPath = path.resolve(process.cwd(), '.env.staging');

if (!fs.existsSync(envPath)) {
  console.error('[CRITICAL] Missing .env.staging configuration file.');
  process.exit(1);
}

// 1. Load configuration from .env.staging
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  }
});

const gatewayUrl = env.GATEWAY_SUPABASE_URL || '';
const serviceRoleKey = env.GATEWAY_SUPABASE_SERVICE_ROLE_KEY || '';
const dbUrl = env.STAGING_DATABASE_URL || '';

// 2. Air-gap validation (Never touch production)
if (gatewayUrl.includes(FORBIDDEN_PROD_REF) || dbUrl.includes(FORBIDDEN_PROD_REF)) {
  console.error('🛑 [CRITICAL ERROR] Production reference (kluxsykimnjivkqxelba) detected! Aborting immediately.');
  process.exit(1);
}

if (!gatewayUrl || !serviceRoleKey || !dbUrl) {
  console.error('❌ [ERROR] Missing required environment variables in .env.staging.');
  process.exit(1);
}

// 3. Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      options.email = args[++i].trim().toLowerCase();
    } else if (args[i] === '--name' && args[i + 1]) {
      options.fullName = args[++i].trim();
    } else if (args[i] === '--existing-user-id' && args[i + 1]) {
      options.existingUserId = args[++i].trim();
    }
  }
  return options;
}

const { email, fullName, existingUserId } = parseArgs();

if (!email || !fullName) {
  console.log(`
================================================================================
 VISTAAR SUPER ADMIN — FIRST REAL ADMINISTRATOR BOOTSTRAP TOOL
================================================================================
Usage:
  node scripts/bootstrap_first_admin.mjs --email <OWNER_EMAIL> --name "<FULL_NAME>"

Optional:
  --existing-user-id <UUID>    (If user was already created/invited in Dashboard)

Example:
  node scripts/bootstrap_first_admin.mjs --email owner@example.com --name "Platform Owner"

Security Invariants:
  - Connects strictly to Staging (vlbhxcajphyjkeueubud). Production is air-gapped.
  - Sends a genuine Supabase Auth invitation email to the owner.
  - Does NOT generate or hardcode passwords. The owner establishes their own password.
  - One-time execution: platform_bootstrap_registry permanently locks out re-bootstrap.
================================================================================
`);
  process.exit(0);
}

async function executeBootstrap() {
  const pool = new pg.Pool({ connectionString: dbUrl });
  const supabase = createClient(gatewayUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const client = await pool.connect();

  try {
    console.log('================================================================');
    console.log(' VISTAAR SUPER ADMIN — SECURE ONE-TIME BOOTSTRAP PROCESS');
    console.log(' Environment: STAGING (vlbhxcajphyjkeueubud)');
    console.log(` Target Owner Email: ${email}`);
    console.log(` Full Name: ${fullName}`);
    console.log('================================================================\n');

    // Step 1: Check One-Time Invariant in platform_bootstrap_registry
    console.log('[Step 1/6] Checking platform bootstrap status in registry...');
    const regCheck = await client.query(`
      SELECT is_bootstrapped, bootstrapped_at, bootstrapped_by
      FROM public.platform_bootstrap_registry
      WHERE id = 1;
    `);

    if (regCheck.rows.length > 0 && regCheck.rows[0].is_bootstrapped) {
      console.error('🛑 [LOCKED OUT] Initial platform bootstrap has already been completed.');
      console.error(`   Bootstrapped At: ${regCheck.rows[0].bootstrapped_at}`);
      console.error(`   Bootstrapped By: ${regCheck.rows[0].bootstrapped_by}`);
      console.error('   Initial bootstrap is permanently locked out. Subsequent administrators must be invited by an active super_admin.');
      process.exit(1);
    }
    console.log('  ✓ Bootstrap registry is open (is_bootstrapped = FALSE).');

    // Step 2: Supabase Auth Invitation / Lookup
    console.log('\n[Step 2/6] Provisioning Supabase Auth identity via GoTrue...');
    let authUserId = existingUserId;

    if (!authUserId) {
      // Check if user already exists in auth.users
      const { data: listData } = await supabase.auth.admin.listUsers();
      const existingUser = listData?.users?.find(u => u.email?.toLowerCase() === email);

      if (existingUser) {
        authUserId = existingUser.id;
        console.log(`  ✓ Auth user already exists in auth.users (UUID: ${authUserId}).`);
      } else {
        console.log(`  Sending secure Supabase Auth invitation to ${email}...`);
        const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
          redirectTo: 'http://localhost:3001/',
          data: {
            full_name: fullName,
            account_type: 'platform_admin'
          }
        });

        if (inviteErr) {
          console.error(`❌ [AUTH ERROR] Failed to send Supabase Auth invitation: ${inviteErr.message}`);
          console.error('   Hint: If Supabase mailer rate limit is hit, you can invite the user from the Supabase Dashboard:');
          console.error('   Dashboard -> Authentication -> Users -> "Invite user", then re-run with --existing-user-id <UUID>');
          process.exit(1);
        }

        authUserId = inviteData.user.id;
        console.log(`  ✓ Supabase Auth invitation sent successfully!`);
        console.log(`  ✓ Created Supabase Auth User ID: ${authUserId}`);
      }
    } else {
      console.log(`  ✓ Using provided Auth User ID: ${authUserId}`);
      // Verify user exists in auth.users
      const userCheck = await client.query(`SELECT id, email FROM auth.users WHERE id = $1;`, [authUserId]);
      if (userCheck.rows.length === 0) {
        console.error(`❌ [ERROR] Auth UUID ${authUserId} not found in auth.users!`);
        process.exit(1);
      }
    }

    // Step 3: Transaction-Level Database Mutation
    console.log('\n[Step 3/6] Applying atomic database bootstrap transaction...');
    await client.query('BEGIN');

    // Deactivate synthetic fixture in platform_admins so only the genuine administrator is active
    await client.query(`
      UPDATE public.platform_admins
      SET is_active = FALSE, updated_at = now()
      WHERE email = 'synthetic.admin@staging.vistaar.internal';
    `);

    // Insert or promote the genuine administrator
    const adminInsert = await client.query(`
      INSERT INTO public.platform_admins (
        id, email, full_name, role, is_active, mfa_enrolled, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'super_admin', TRUE, FALSE, now(), now()
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = 'super_admin',
        is_active = TRUE,
        updated_at = now()
      RETURNING id, email, full_name, role, is_active, mfa_enrolled;
    `, [authUserId, email, fullName]);

    const adminRecord = adminInsert.rows[0];
    console.log(`  ✓ platform_admins record created:`);
    console.log(`    - ID: ${adminRecord.id}`);
    console.log(`    - Email: ${adminRecord.email}`);
    console.log(`    - Full Name: ${adminRecord.full_name}`);
    console.log(`    - Role: ${adminRecord.role}`);
    console.log(`    - Active Status: ${adminRecord.is_active}`);
    console.log(`    - MFA Enrolled: ${adminRecord.mfa_enrolled}`);

    // Step 4: Lock Bootstrap Registry
    console.log('\n[Step 4/6] Permanently locking platform_bootstrap_registry...');
    await client.query(`
      UPDATE public.platform_bootstrap_registry
      SET is_bootstrapped = TRUE,
          bootstrapped_at = now(),
          bootstrapped_by = $1,
          bootstrap_ip = 'cli_out_of_band',
          updated_at = now()
      WHERE id = 1;
    `, [authUserId]);
    console.log('  ✓ platform_bootstrap_registry locked (is_bootstrapped = TRUE).');

    // Step 5: Append-Only Immutable Security Audit Log
    console.log('\n[Step 5/6] Recording immutable security audit log...');
    const auditDetails = JSON.stringify({
      message: 'Initial platform super administrator bootstrapped via one-time secure CLI',
      full_name: fullName,
      email: email,
      environment: 'staging',
      project_ref: 'vlbhxcajphyjkeueubud'
    });

    await client.query(`
      INSERT INTO public.platform_audit_logs (
        admin_id, admin_email, admin_role, action, target_user_id, details, client_ip
      ) VALUES (
        $1::uuid, $2::text, 'super_admin', 'BOOTSTRAP_INITIAL_ADMIN', $1::uuid, $3::jsonb, '127.0.0.1'
      );
    `, [authUserId, email, auditDetails]);
    console.log('  ✓ Security audit log recorded in platform_audit_logs.');

    await client.query('COMMIT');
    console.log('\n[Step 6/6] Bootstrap transaction committed successfully!');

    // Generate direct secure password-establishment link via GoTrue
    const { data: linkData } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: 'http://localhost:3001/'
      }
    });

    console.log('\n================================================================');
    console.log(' 🎉 FIRST SUPER ADMINISTRATOR BOOTSTRAP COMPLETE');
    console.log('================================================================');
    console.log(`\nAdministrator Account: ${email}`);
    console.log(`Auth User ID: ${authUserId}`);
    console.log(`Platform Role: super_admin`);
    console.log('\n--- PASSWORD ESTABLISHMENT ---');
    console.log('You can establish your secure personal password in either of two ways:');
    console.log('A) Check your inbox for the Supabase invitation email.');
    if (linkData?.properties?.action_link) {
      console.log('B) OR click your direct secure password-setup link:');
      console.log(`   ${linkData.properties.action_link}`);
    }
    console.log('\n--- NEXT STEPS ---');
    console.log('1. Open the password link and establish your personal passphrase.');
    console.log('2. Log in at the Super Admin portal:');
    console.log('   http://localhost:3001/');
    console.log('3. Complete TOTP MFA enrollment to achieve verified AAL2 assurance.');
    console.log('================================================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ [FATAL] Bootstrap failed, transaction rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

executeBootstrap().catch(console.error);

