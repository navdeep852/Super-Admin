import fs from 'fs';
import path from 'path';

const FORBIDDEN_PROD_REF = 'kluxsykimnjivkqxelba';
const superAdminDir = path.resolve('d:/Project/vistaar-main/super_admin');
const envStagingPath = path.join(superAdminDir, '.env.staging');

if (!fs.existsSync(envStagingPath)) {
  console.log(JSON.stringify({ exists: false, error: '.env.staging does not exist' }));
  process.exit(0);
}

const content = fs.readFileSync(envStagingPath, 'utf8');
const lines = content.split('\n');
const parsed = {};

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) {
    const k = trimmed.slice(0, eqIdx).trim();
    const v = trimmed.slice(eqIdx + 1).trim();
    parsed[k] = v;
  }
}

// Extract project ref from URL if available
let stagingRef = null;
const url = parsed['GATEWAY_SUPABASE_URL'] || '';
if (url && !url.includes('<staging-project-ref>')) {
  const match = url.match(/https:\/\/([a-zA-Z0-9_-]+)\.supabase\.co/);
  if (match) stagingRef = match[1];
}

const isProdUrl = url.includes(FORBIDDEN_PROD_REF);
const hasProdAnywhere = content.includes(FORBIDDEN_PROD_REF);

const serviceRoleKey = parsed['GATEWAY_SUPABASE_SERVICE_ROLE_KEY'] || '';
const hasServiceRole = serviceRoleKey.length > 20 && !serviceRoleKey.includes('<staging-service-role-key>');
// Valid format: either legacy JWT (eyJ...) or modern Supabase Secret Key (sb_secret_... / sbp_...)
const isServiceRoleValidFormat = serviceRoleKey.startsWith('ey') || serviceRoleKey.startsWith('sb_secret_') || serviceRoleKey.startsWith('sbp_') || serviceRoleKey.startsWith('sb_');

const poolerUrl = parsed['STAGING_DATABASE_URL'] || '';
const hasPoolerUrl = poolerUrl.length > 15 && !poolerUrl.includes('<staging-ref>') && !poolerUrl.includes('<staging-password>');
const poolerPort6543 = poolerUrl.includes(':6543');
const poolerPgbouncer = poolerUrl.includes('pgbouncer=true');

const directUrl = parsed['STAGING_DIRECT_DATABASE_URL'] || '';
const hasDirectUrl = directUrl.length > 15 && !directUrl.includes('<staging-ref>') && !directUrl.includes('<staging-password>');
const directPort5432 = directUrl.includes(':5432');

const gcapSecret = parsed['GATEWAY_ASSERTION_SECRET'] || '';
const hasValidGcap = /^[0-9a-fA-F]{64}$/.test(gcapSecret) && gcapSecret !== '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const webhookSecret = parsed['YOUPI_WEBHOOK_SECRET'] || '';
const hasValidWebhook = webhookSecret.length >= 32;

const hasViteSupabase = Object.keys(parsed).some(k => k.startsWith('VITE_SUPABASE_'));

const result = {
  exists: true,
  hasProductionReference: hasProdAnywhere,
  stagingProjectRef: stagingRef,
  isUrlConfigured: stagingRef !== null,
  isServiceRoleConfigured: hasServiceRole,
  isServiceRoleValidFormat: isServiceRoleValidFormat,
  isPoolerUrlConfigured: hasPoolerUrl,
  isPoolerPort6543: poolerPort6543,
  isPoolerPgbouncerFlag: poolerPgbouncer,
  isDirectUrlConfigured: hasDirectUrl,
  isDirectPort5432: directPort5432,
  isGcapSecretValid: hasValidGcap,
  isWebhookSecretValid: hasValidWebhook,
  hasFrontendSupabaseLeak: hasViteSupabase
};

console.log(JSON.stringify(result, null, 2));
