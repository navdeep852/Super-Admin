import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const targetDir = path.resolve('d:/Project/vistaar-main/super_admin');
const envStagingPath = path.join(targetDir, '.env.staging');

// Generate cryptographically random 32-byte (256-bit) secrets
const gcapAssertionSecret = crypto.randomBytes(32).toString('hex');
const youpiWebhookSecret = crypto.randomBytes(32).toString('hex');

// Read existing .env.staging if present to preserve any existing user keys
let existingStagingRef = '<staging-project-ref>';
let existingServiceRole = '<staging-service-role-key>';
let existingPoolerUrl = 'postgresql://postgres.<staging-ref>:<staging-password>@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true';
let existingDirectUrl = 'postgresql://postgres.<staging-ref>:<staging-password>@aws-0-[region].pooler.supabase.com:5432/postgres';

if (fs.existsSync(envStagingPath)) {
  const content = fs.readFileSync(envStagingPath, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('GATEWAY_SUPABASE_URL=')) {
      const match = trimmed.replace('GATEWAY_SUPABASE_URL=', '').trim();
      if (match && !match.includes('<staging-project-ref>')) existingStagingRef = match;
    }
    if (trimmed.startsWith('GATEWAY_SUPABASE_SERVICE_ROLE_KEY=')) {
      const match = trimmed.replace('GATEWAY_SUPABASE_SERVICE_ROLE_KEY=', '').trim();
      if (match && !match.includes('<staging-service-role-key>')) existingServiceRole = match;
    }
    if (trimmed.startsWith('STAGING_DATABASE_URL=')) {
      const match = trimmed.replace('STAGING_DATABASE_URL=', '').trim();
      if (match && !match.includes('<staging-ref>')) existingPoolerUrl = match;
    }
    if (trimmed.startsWith('STAGING_DIRECT_DATABASE_URL=')) {
      const match = trimmed.replace('STAGING_DIRECT_DATABASE_URL=', '').trim();
      if (match && !match.includes('<staging-ref>')) existingDirectUrl = match;
    }
  }
}

// Assemble .env.staging adhering strictly to:
// 1. NO VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (Gateway BFF architecture)
// 2. Cryptographically generated 32-byte secrets
// 3. Exact connect dialog format placeholders
const envStagingContent = `# ==============================================================================
# VISTAAR Super Admin — Staging Environment Configuration
# Project: vistaar-super-admin-staging
# SECURITY WARNING: DO NOT COMMIT THIS FILE TO VERSION CONTROL
# ==============================================================================

# 1. Frontend Client Configuration (Vite — Publicly Bundled)
# Note: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are strictly excluded
# because the frontend communicates exclusively via the Gateway BFF.
VITE_API_GATEWAY_URL=http://localhost:3002
VITE_PLATFORM_ENV=staging

# 2. Server-Side Gateway BFF Configuration (Node.js — Strictly Confidential)
PORT=3002
NODE_ENV=staging
GATEWAY_SUPABASE_URL=${existingStagingRef.startsWith('http') ? existingStagingRef : 'https://' + existingStagingRef + '.supabase.co'}
GATEWAY_SUPABASE_SERVICE_ROLE_KEY=${existingServiceRole}
GATEWAY_ASSERTION_SECRET=${gcapAssertionSecret}
YOUPI_WEBHOOK_SECRET=${youpiWebhookSecret}

# 3. Staging Direct & Pooled Database Connections (Migration Runner & Automated Tests)
# Copy exact strings from Supabase Dashboard -> Connect Dialog
# Shared Pooler Transaction Mode (Port 6543)
STAGING_DATABASE_URL=${existingPoolerUrl}

# Shared Pooler Session / Direct Mode (Port 5432 - Required for DDL migrations)
STAGING_DIRECT_DATABASE_URL=${existingDirectUrl}
`;

fs.writeFileSync(envStagingPath, envStagingContent, { encoding: 'utf8', mode: 0o600 });
console.log('Successfully written .env.staging with cryptographically random secrets (length: 32 bytes / 64 hex chars). Secret values redacted.');

