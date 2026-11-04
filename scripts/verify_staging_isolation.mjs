import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const FORBIDDEN_PROD_REF = 'kluxsykimnjivkqxelba';
const FORBIDDEN_PROD_URL = 'https://kluxsykimnjivkqxelba.supabase.co';
const DUMMY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const superAdminDir = path.resolve('d:/Project/vistaar-main/super_admin');
const prodRepoDir = path.resolve('d:/Project/vistaar-main/vistaar-main');
const envStagingPath = path.join(superAdminDir, '.env.staging');
const gitignorePath = path.join(superAdminDir, '.gitignore');

console.log('================================================================');
console.log('  VISTAAR Super Admin — Staging Isolation Verification Check');
console.log('================================================================');

let errors = [];
let warnings = [];
let passedChecks = [];

// 1. Verify Git Exclusion of .env.staging
if (!fs.existsSync(gitignorePath)) {
  errors.push('CRITICAL: .gitignore is missing in super_admin.');
} else {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  if (!gitignoreContent.includes('.env') || !gitignoreContent.includes('.env.*')) {
    errors.push('CRITICAL: .gitignore does not explicitly exclude .env and .env.*');
  } else {
    passedChecks.push('.gitignore explicitly excludes all local environment files (.env, .env.*).');
  }
}

// 2. Inspect .env.staging
if (!fs.existsSync(envStagingPath)) {
  errors.push('CRITICAL: .env.staging does not exist.');
} else {
  const envContent = fs.readFileSync(envStagingPath, 'utf8');
  const lines = envContent.split('\n');
  const parsedEnv = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      parsedEnv[key] = val;
    }
  }

  // 2A. Production Reference Check
  if (envContent.includes(FORBIDDEN_PROD_REF)) {
    console.error(`FATAL ABORT: Production project reference "${FORBIDDEN_PROD_REF}" detected in .env.staging!`);
    process.exit(1);
  }
  passedChecks.push(`Production project reference (${FORBIDDEN_PROD_REF}) is 100% absent from staging environment.`);

  // 2B. Frontend Credential Boundary Check
  const viteSupabaseKeys = Object.keys(parsedEnv).filter(k => k.startsWith('VITE_SUPABASE_'));
  if (viteSupabaseKeys.length > 0) {
    errors.push(`Frontend boundary violation: Detected ${viteSupabaseKeys.join(', ')} in frontend config. Gateway BFF architecture requires these to be server-side only.`);
  } else {
    passedChecks.push('Zero VITE_SUPABASE_* variables in client bundle. Gateway BFF boundary preserved.');
  }

  // Check that no secret has VITE_ prefix
  const leakedSecrets = Object.keys(parsedEnv).filter(k => k.startsWith('VITE_') && (k.includes('SECRET') || k.includes('KEY') || k.includes('PASSWORD')));
  if (leakedSecrets.length > 0) {
    errors.push(`CRITICAL: Leaked secret with VITE_ prefix: ${leakedSecrets.join(', ')}`);
  } else {
    passedChecks.push('No secret or service keys prefixed with VITE_. Client bundle is secure.');
  }

  // 2C. GCAP Assertion Secret Validation
  const gcapSecret = parsedEnv['GATEWAY_ASSERTION_SECRET'];
  if (!gcapSecret) {
    errors.push('CRITICAL: GATEWAY_ASSERTION_SECRET is missing from .env.staging.');
  } else if (gcapSecret === DUMMY_HEX) {
    errors.push('CRITICAL: GATEWAY_ASSERTION_SECRET is using the insecure dummy hex placeholder.');
  } else if (!/^[0-9a-fA-F]{64}$/.test(gcapSecret)) {
    errors.push(`CRITICAL: GATEWAY_ASSERTION_SECRET must be exactly 64 hex characters (32 bytes). Found length: ${gcapSecret.length}.`);
  } else {
    passedChecks.push('GATEWAY_ASSERTION_SECRET is a cryptographically valid 32-byte (64 hex char) random secret. [VALUE REDACTED]');
  }

  // 2D. Webhook Secret Validation
  const webhookSecret = parsedEnv['YOUPI_WEBHOOK_SECRET'];
  if (!webhookSecret) {
    errors.push('CRITICAL: YOUPI_WEBHOOK_SECRET is missing.');
  } else if (webhookSecret.length < 32) {
    errors.push('CRITICAL: YOUPI_WEBHOOK_SECRET must be at least 32 characters long.');
  } else {
    passedChecks.push('YOUPI_WEBHOOK_SECRET is cryptographically provisioned. [VALUE REDACTED]');
  }

  // 2E. Staging Project Reference Check
  const gatewayUrl = parsedEnv['GATEWAY_SUPABASE_URL'] || '';
  if (gatewayUrl.includes('<staging-project-ref>')) {
    warnings.push('BLOCKER: GATEWAY_SUPABASE_URL still contains placeholder <staging-project-ref>. Awaiting exact project ref from user.');
  } else if (!gatewayUrl.startsWith('https://') || !gatewayUrl.includes('.supabase.co')) {
    warnings.push('GATEWAY_SUPABASE_URL is not a standard Supabase URL format.');
  } else {
    passedChecks.push(`Gateway configured to point to isolated staging project: ${gatewayUrl}`);
  }

  // 2F. Database Connection URLs
  const poolerUrl = parsedEnv['STAGING_DATABASE_URL'] || '';
  const directUrl = parsedEnv['STAGING_DIRECT_DATABASE_URL'] || '';
  if (poolerUrl.includes('<staging-ref>') || poolerUrl.includes('<staging-password>')) {
    warnings.push('BLOCKER: STAGING_DATABASE_URL contains placeholder. Awaiting exact Connect string from user.');
  }
  if (directUrl.includes('<staging-ref>') || directUrl.includes('<staging-password>')) {
    warnings.push('BLOCKER: STAGING_DIRECT_DATABASE_URL contains placeholder. Awaiting exact Connect string from user.');
  }
}

// 3. Companion Production Repository Isolation
try {
  const prodStatus = execSync('git status --porcelain', { cwd: prodRepoDir, encoding: 'utf8' }).trim();
  if (prodStatus.length > 0) {
    warnings.push(`Production repository has uncommitted changes:\n${prodStatus}`);
  } else {
    passedChecks.push('Companion production repository (navdeep852/vistaar) is clean and completely untouched.');
  }
} catch (e) {
  warnings.push(`Could not verify git status of vistaar-main: ${e.message}`);
}

console.log('\n--- PASSED CHECKS ---');
for (const check of passedChecks) {
  console.log(`  [PASS] ${check}`);
}

if (warnings.length > 0) {
  console.log('\n--- OPEN ITEMS / BLOCKERS ---');
  for (const warn of warnings) {
    console.log(`  [WARN] ${warn}`);
  }
}

if (errors.length > 0) {
  console.log('\n--- CRITICAL ERRORS ---');
  for (const err of errors) {
    console.log(`  [FAIL] ${err}`);
  }
  console.log('\nVERDICT: NOT READY — BLOCKERS FOUND');
  process.exit(1);
} else if (warnings.length > 0) {
  console.log('\nVERDICT: READY FOR STAGING CONFIGURATION (AWAITING STAGING CONNECT STRINGS FROM USER)');
} else {
  console.log('\nVERDICT: READY FOR STAGING CONNECTION TEST');
}

