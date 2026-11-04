// ==============================================================================
// VISTAAR Super Admin — Gateway BFF (Backend-for-Frontend) HTTP Service
// Version: 3.0.0 (Phase 4.2 V9 Hardened Administrative Control Plane)
// Target: Staging / Production Compatible Gateway BFF
// ==============================================================================

import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { calculateSubscriptionPrice, validateOfferEligibility, toPaise, toInr } from './pricingEngine.mjs';

const FORBIDDEN_PROD_REF = 'kluxsykimnjivkqxelba';
const envPath = path.resolve('d:/Project/vistaar-main/super_admin/.env.staging');

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

// 2. Air-Gap Defense Check
const gatewayUrl = process.env.GATEWAY_SUPABASE_URL || '';
const serviceRoleKey = process.env.GATEWAY_SUPABASE_SERVICE_ROLE_KEY || '';
const assertionSecret = process.env.GATEWAY_ASSERTION_SECRET || '';
const webhookSecret = process.env.YOUPI_WEBHOOK_SECRET || '';
const port = parseInt(process.env.PORT || '3002', 10);
const nodeEnv = process.env.NODE_ENV || 'staging';

if (gatewayUrl.includes(FORBIDDEN_PROD_REF)) {
  console.error('[GATEWAY CRITICAL] Aborting startup: Production project reference detected in GATEWAY_SUPABASE_URL!');
  process.exit(1);
}

// 3. Required Variables Assertion
const missing = [];
if (!gatewayUrl) missing.push('GATEWAY_SUPABASE_URL');
if (!serviceRoleKey) missing.push('GATEWAY_SUPABASE_SERVICE_ROLE_KEY');
if (!assertionSecret) missing.push('GATEWAY_ASSERTION_SECRET');
if (!webhookSecret) missing.push('YOUPI_WEBHOOK_SECRET');

if (missing.length > 0) {
  console.error(`[GATEWAY ERROR] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// 4. Extract Project Ref
const match = gatewayUrl.match(/https:\/\/([a-zA-Z0-9_-]+)\.supabase\.co/);
const stagingProjectRef = match ? match[1] : 'unknown';

// 5. Initialize Server-Side Supabase Client (Service Role)
export const supabase = createClient(gatewayUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const startTime = Date.now();

// -----------------------------------------------------------------------------
// Security Constants & Configuration
// -----------------------------------------------------------------------------
const MAX_BODY_SIZE = 16384; // 16 KB strict payload boundary
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || (process.env.NODE_ENV === 'test' ? '50' : '10'), 10);
export const rateLimitMap = new Map();

const ALLOWED_ORIGINS = (process.env.ADMIN_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002')
  .split(',')
  .map(o => o.trim().toLowerCase());

function isOriginAllowed(origin) {
  if (!origin) return false;
  const o = origin.toLowerCase().trim().replace(/\/+$/, '');
  if (ALLOWED_ORIGINS.includes(o)) return true;
  // Allow localhost or 127.0.0.1 on any port
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return true;
  // Allow RFC-1918 private network IPs on any port
  if (/^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(o)) return true;
  // Allow vistaarone.com and vistaar.internal domains on any port/subdomain
  if (/^https?:\/\/([a-zA-Z0-9-]+\.)*(vistaarone\.com|vistaar\.internal)(:\d+)?$/.test(o)) return true;
  return false;
}

// -----------------------------------------------------------------------------
// Helper Functions: Security & Sanitization
// -----------------------------------------------------------------------------
function handleCors(req, res, isPrivilegedRoute = false) {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // Direct non-browser invocation allowed
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (!isPrivilegedRoute) {
    // For non-privileged health checks, reflect origin to prevent false offline alerts
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-GCAP-Signature, X-GCAP-Timestamp, X-GCAP-Nonce, X-Youpi-Signature, X-Webhook-Signature, X-Webhook-Timestamp');
}

function checkRateLimit(key, maxRequests = RATE_LIMIT_MAX_REQUESTS) {
  const now = Date.now();
  let entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetTime) {
    entry = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(key, entry);
    return true;
  }
  entry.count++;
  if (entry.count > maxRequests) {
    return false;
  }
  return true;
}

function readBoundedBody(req, limit = MAX_BODY_SIZE) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        const err = new Error(`PAYLOAD_TOO_LARGE: Request body exceeds maximum allowed ${Math.round(limit / 1024)}KB`);
        err.statusCode = 413;
        err.code = 'PAYLOAD_TOO_LARGE';
        reject(err);
        return;
      }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', err => reject(err));
  });
}

// Strictly authenticates requests via genuine Supabase Auth (zero test-token shortcuts)
async function authenticateRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Authentication required: Missing or malformed Authorization header');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    const err = new Error('Authentication required: Bearer token is empty');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  // Supabase Auth genuine verification
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      const err = new Error('Invalid or expired authentication token');
      err.statusCode = 401;
      err.code = 'INVALID_TOKEN';
      throw err;
    }

    // Determine session assurance level (AAL)
    let sessionAal = 'aal1';
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (decoded.aal) {
          sessionAal = decoded.aal;
        }
      }
    } catch {
      // Ignore token parsing error; fallback to user metadata or aal1
    }

    if (user.aal) {
      sessionAal = user.aal;
    }

    return { ...user, session_aal: sessionAal };
  } catch (e) {
    if (e.statusCode) throw e;
    const err = new Error('Authentication token verification failed');
    err.statusCode = 401;
    err.code = 'AUTH_FAILED';
    throw err;
  }
}

// Timing-safe HMAC verification with strict 64-char hex format checks
function verifyGcapAssertion({ signature, timestamp, nonce, canonicalString, secret }) {
  if (!signature || !timestamp || !nonce) {
    const err = new Error('Missing required GCAP cryptographic assertion headers (X-GCAP-Signature, X-GCAP-Timestamp, X-GCAP-Nonce)');
    err.statusCode = 401;
    err.code = 'GCAP_ASSERTION_MISSING';
    throw err;
  }

  // Strict 64-character lowercase hex format validation
  const cleanSig = signature.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleanSig)) {
    const err = new Error('Invalid GCAP assertion signature format: must be 64-character lowercase hexadecimal string');
    err.statusCode = 401;
    err.code = 'INVALID_GCAP_SIGNATURE';
    throw err;
  }

  // 30-second skew window
  const reqTimeMs = isNaN(timestamp) 
    ? new Date(timestamp).getTime() 
    : (Number(timestamp) > 1e11 ? Number(timestamp) : Number(timestamp) * 1000);
  if (isNaN(reqTimeMs) || Math.abs(Date.now() - reqTimeMs) > 30000) {
    const err = new Error('GCAP assertion timestamp expired or skewed beyond allowable 30-second window');
    err.statusCode = 401;
    err.code = 'ASSERTION_TIMESTAMP_EXPIRED';
    throw err;
  }

  // Nonce format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(nonce)) {
    const err = new Error('Invalid GCAP assertion nonce format');
    err.statusCode = 400;
    err.code = 'INVALID_NONCE';
    throw err;
  }

  // Constant-time HMAC comparison
  const expectedSignatureHex = crypto.createHmac('sha256', secret).update(canonicalString).digest('hex').toLowerCase();
  const sigBuf = Buffer.from(cleanSig, 'hex');
  const expectedBuf = Buffer.from(expectedSignatureHex, 'hex');

  if (sigBuf.length !== 32 || expectedBuf.length !== 32 || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    const err = new Error('Invalid GCAP cryptographic assertion signature');
    err.statusCode = 401;
    err.code = 'INVALID_GCAP_SIGNATURE';
    throw err;
  }
}

// Centralized authentication and RBAC authorization helper
async function authorizeAdmin(req, allowedRoles = ['super_admin'], requiredAal = 'aal1') {
  const authUser = await authenticateRequest(req);
  const actorId = authUser.id;
  const sessionAal = authUser.session_aal || 'aal1';

  const { data: actor, error } = await supabase
    .from('platform_admins')
    .select('id, email, full_name, role, is_active, mfa_enrolled, avatar_url, phone_number')
    .eq('id', actorId)
    .single();

  if (error || !actor || !actor.is_active) {
    const err = new Error('Requesting administrator does not exist or is inactive');
    err.statusCode = 403;
    err.code = 'ACTOR_INACTIVE_OR_NOT_FOUND';
    throw err;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(actor.role)) {
    const err = new Error(`Forbidden: Role '${actor.role}' has insufficient privileges for this endpoint. Required: [${allowedRoles.join(', ')}]`);
    err.statusCode = 403;
    err.code = 'FORBIDDEN_INSUFFICIENT_PRIVILEGES';
    throw err;
  }

  if (requiredAal === 'aal2') {
    if (!actor.mfa_enrolled) {
      const err = new Error('Forbidden: Requesting administrator has not enrolled Multi-Factor Authentication (MFA)');
      err.statusCode = 403;
      err.code = 'MFA_NOT_ENROLLED';
      throw err;
    }

    if (sessionAal !== 'aal2') {
      const err = new Error(`Forbidden: Operation requires an AAL2 authenticated session (current session assurance: ${sessionAal})`);
      err.statusCode = 403;
      err.code = 'MFA_ASSURANCE_REQUIRED';
      throw err;
    }
  }

  return { user: authUser, admin: actor, sessionAal };
}

// Compatibility shim for existing callers
async function verifySuperAdminActor(actorId, sessionAal) {
  const { data: actor, error } = await supabase
    .from('platform_admins')
    .select('id, email, full_name, role, is_active, mfa_enrolled, avatar_url, phone_number')
    .eq('id', actorId)
    .single();

  if (error || !actor || !actor.is_active) {
    const err = new Error('Requesting administrator does not exist or is inactive');
    err.statusCode = 403;
    err.code = 'ACTOR_INACTIVE_OR_NOT_FOUND';
    throw err;
  }

  if (actor.role !== 'super_admin') {
    const err = new Error(`Forbidden: Only active Super Admins can perform this operation (current role: ${actor.role})`);
    err.statusCode = 403;
    err.code = 'FORBIDDEN_INSUFFICIENT_PRIVILEGES';
    throw err;
  }

  if (!actor.mfa_enrolled) {
    const err = new Error('Forbidden: Requesting administrator has not enrolled Multi-Factor Authentication (MFA)');
    err.statusCode = 403;
    err.code = 'MFA_NOT_ENROLLED';
    throw err;
  }

  if (sessionAal !== 'aal2') {
    const err = new Error(`Forbidden: Operation requires an AAL2 authenticated session (current session assurance: ${sessionAal || 'aal1'})`);
    err.statusCode = 403;
    err.code = 'MFA_ASSURANCE_REQUIRED';
    throw err;
  }

  return actor;
}

// Dynamic Monthly Revenue Trends (Aggregates real DB payment_transactions and invoices)
async function computeDynamicRevenueTrends() {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    months.push({
      month: start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      start,
      end,
      platformRevenue: 0,
      tenantGmv: 0,
      outstanding: 0
    });
  }

  const windowStartIso = months[0].start.toISOString();

  const [{ data: txns }, { data: invoices }] = await Promise.all([
    supabase.from('payment_transactions').select('amount_inr, status, created_at').gte('created_at', windowStartIso),
    supabase.from('invoices').select('grand_total, balance_amount, created_at').gte('created_at', windowStartIso)
  ]);

  (txns || []).forEach(tx => {
    if (tx.status === 'verified_success' || tx.status === 'successful') {
      const txDate = new Date(tx.created_at);
      const bucket = months.find(m => txDate >= m.start && txDate <= m.end);
      if (bucket) {
        bucket.platformRevenue += Number(tx.amount_inr || 0);
      }
    }
  });

  (invoices || []).forEach(inv => {
    const invDate = new Date(inv.created_at);
    const bucket = months.find(m => invDate >= m.start && invDate <= m.end);
    if (bucket) {
      bucket.tenantGmv += Number(inv.grand_total || 0);
      bucket.outstanding += Number(inv.balance_amount || 0);
    }
  });

  return months.map(m => ({
    month: m.month,
    platformRevenue: Math.round(m.platformRevenue),
    tenantGmv: Math.round(m.tenantGmv),
    outstanding: Math.round(m.outstanding)
  }));
}

// Validates image buffer, checks maximum 5MB size limit, and verifies magic bytes
function validateAndExtractImageBuffer(rawPayload) {
  let buffer;

  if (Buffer.isBuffer(rawPayload)) {
    buffer = rawPayload;
  } else if (typeof rawPayload === 'string') {
    const trimmed = rawPayload.trim();
    // Check if Data URL format: data:image/png;base64,...
    const match = trimmed.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/is);
    if (match) {
      buffer = Buffer.from(match[2], 'base64');
    } else {
      buffer = Buffer.from(trimmed, 'base64');
    }
  } else if (rawPayload && typeof rawPayload === 'object') {
    const base64Str = rawPayload.image || rawPayload.image_base64 || rawPayload.data || rawPayload.file;
    if (typeof base64Str === 'string') {
      return validateAndExtractImageBuffer(base64Str);
    }
  }

  if (!buffer || buffer.length === 0) {
    const err = new Error('No valid image data provided');
    err.statusCode = 400;
    err.code = 'INVALID_IMAGE_PAYLOAD';
    throw err;
  }

  // 5 MB strict limit
  const MAX_SIZE = 5 * 1024 * 1024;
  if (buffer.length > MAX_SIZE) {
    const err = new Error(`Image file size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of 5.00 MB`);
    err.statusCode = 413;
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }

  // Inspect binary magic bytes
  let detectedMime = null;
  let ext = 'png';

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
      buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
    detectedMime = 'image/png';
    ext = 'png';
  }
  // JPEG magic bytes: FF D8 FF
  else if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    detectedMime = 'image/jpeg';
    ext = 'jpg';
  }
  // WebP magic bytes: RIFF .... WEBP
  else if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    detectedMime = 'image/webp';
    ext = 'webp';
  }

  if (!detectedMime) {
    const err = new Error('Invalid image format. Only genuine PNG, JPEG, and WebP images are permitted');
    err.statusCode = 400;
    err.code = 'UNSUPPORTED_MEDIA_TYPE';
    throw err;
  }

  return { buffer, mimeType: detectedMime, extension: ext, sizeBytes: buffer.length };
}

function sendSafeError(res, err) {
  console.error('[Gateway Handler Error]:', err);
  let statusCode = err.statusCode || 500;
  let errorCode = err.code || 'SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred';

  // Map PostgreSQL and business logic errors to safe HTTP status codes
  if (err.code === '42501') {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
  } else if (err.code === '28000') {
    statusCode = 401;
    errorCode = 'AUTHENTICATION_FAILED';
  } else if (err.code === '23505') {
    statusCode = 409;
    errorCode = 'CONFLICT_REPLAY_OR_DUPLICATE';
  } else if (err.code === '55002') {
    statusCode = 409;
    errorCode = 'OVERWRITE_PROTECTION_TRIGGERED';
  } else if (err.code === '55003') {
    statusCode = 409;
    errorCode = 'DUPLICATE_ADMIN_EMAIL';
  } else if (err.code === '55001') {
    statusCode = 403;
    errorCode = 'UNAUTHORIZED_OR_EXPIRED_INVITATION';
  } else if (err.code === '55000') {
    statusCode = 400;
    errorCode = 'PRECONDITION_FAILED';
  } else if (err.code === '22023') {
    statusCode = 400;
    errorCode = 'INVALID_PARAMETER';
  } else if (statusCode === 500) {
    // Sanitize 500 messages to prevent database/credential leakage
    message = 'An internal gateway error occurred. Administrator action has been safely halted.';
  }

  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    success: false,
    error: errorCode,
    code: errorCode,
    message: message
  }));
}

// -----------------------------------------------------------------------------
// 6. HTTP Server Entrypoint
// -----------------------------------------------------------------------------
export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const isPrivileged = !['/health', '/api/v1/health'].includes(url.pathname);
  
  handleCors(req, res, isPrivileged);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health Check Endpoints
  if ((url.pathname === '/health' || url.pathname === '/api/v1/health') && req.method === 'GET') {
    const payload = {
      status: 'operational', ok: true,
      service: 'vistaar-super-admin-gateway-bff',
      environment: nodeEnv,
      stagingProjectRef: stagingProjectRef,
      gatewayPort: port,
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString()
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: One-Time Super Admin Initial Bootstrap (Removed from Gateway)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/admins/bootstrap') {
    res.writeHead(410, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'BOOTSTRAP_REMOVED_FROM_GATEWAY',
      message: 'Initial platform administrator bootstrap is an out-of-band administrative operation. Execute scripts/bootstrap_super_admin.mjs directly via secure CLI.'
    }));
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Administrator Login via Supabase Auth
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/auth/login' && req.method === 'POST') {
    try {
      const clientIp = req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(`auth_ip:${clientIp}`, 15)) {
        const err = new Error('Rate limit exceeded for authentication requests. Try again later.');
        err.statusCode = 429;
        err.code = 'RATE_LIMIT_EXCEEDED';
        throw err;
      }

      const rawBody = await readBoundedBody(req);
      const { email, password } = JSON.parse(rawBody || '{}');

      if (!email || !password) {
        const err = new Error('Email and password are required');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }

      const authClient = createClient(gatewayUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });

      if (authError || !authData?.session || !authData?.user) {
        const err = new Error('Invalid email or password');
        err.statusCode = 401;
        err.code = 'INVALID_CREDENTIALS';
        throw err;
      }

      const { data: admin, error: adminErr } = await supabase
        .from('platform_admins')
        .select('id, email, full_name, role, is_active, mfa_enrolled')
        .eq('id', authData.user.id)
        .single();

      if (adminErr || !admin || !admin.is_active) {
        const err = new Error('Account is not an active platform administrator');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_NOT_ADMIN';
        throw err;
      }

      let sessionAal = 'aal1';
      if (authData.session.access_token) {
        try {
          const parts = authData.session.access_token.split('.');
          if (parts.length === 3) {
            const dec = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            if (dec.aal) sessionAal = dec.aal;
          }
        } catch {}
      }

      const mfaRequired = admin.mfa_enrolled && sessionAal !== 'aal2';

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        session: authData.session,
        admin: {
          id: admin.id,
          email: admin.email,
          fullName: admin.full_name,
          role: admin.role,
          isActive: admin.is_active,
          mfaEnrolled: admin.mfa_enrolled,
          avatarUrl: admin.avatar_url || null,
          phoneNumber: admin.phone_number || null,
          sessionAal
        },
        mfaRequired
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: MFA Challenge Verification (Elevates Session to AAL2)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/auth/mfa/verify' && req.method === 'POST') {
    try {
      const authUser = await authenticateRequest(req);
      const rawBody = await readBoundedBody(req);
      const { factor_id, challenge_id, code } = JSON.parse(rawBody || '{}');

      if (!code) {
        const err = new Error('Verification code is required');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }

      const authHeader = req.headers.authorization;
      const token = authHeader.slice(7).trim();

      const userClient = createClient(gatewayUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      await userClient.auth.setSession({ access_token: token, refresh_token: '' });

      // If no challenge_id was supplied, create one dynamically
      let activeChallengeId = challenge_id;
      let activeFactorId = factor_id;

      if (!activeFactorId) {
        const { data: factorList } = await userClient.auth.mfa.listFactors();
        const totp = factorList?.totp?.[0];
        if (totp) activeFactorId = totp.id;
      }

      if (!activeChallengeId && activeFactorId) {
        const { data: ch, error: chErr } = await userClient.auth.mfa.challenge({ factorId: activeFactorId });
        if (chErr) throw chErr;
        activeChallengeId = ch.id;
      }

      if (!activeChallengeId || !activeFactorId) {
        const err = new Error('No enrolled TOTP MFA factor found for this administrator');
        err.statusCode = 400;
        err.code = 'MFA_FACTOR_NOT_FOUND';
        throw err;
      }

      const { data: verifyData, error: verifyErr } = await userClient.auth.mfa.verify({
        factorId: activeFactorId,
        challengeId: activeChallengeId,
        code: code.trim()
      });

      if (verifyErr) {
        const err = new Error('Invalid or expired MFA verification code');
        err.statusCode = 401;
        err.code = 'INVALID_MFA_CODE';
        throw err;
      }

      // Record verified MFA timestamp in platform_admins
      await supabase
        .from('platform_admins')
        .update({ mfa_last_verified_at: new Date().toISOString() })
        .eq('id', authUser.id);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        session: verifyData,
        sessionAal: 'aal2'
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Get Current Authenticated Administrator Profile
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/admins/me' && req.method === 'GET') {
    try {
      const { admin, sessionAal } = await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent', 'compliance_admin', 'platform_auditor'], 'aal1');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          id: admin.id,
          email: admin.email,
          fullName: admin.full_name,
          role: admin.role,
          isActive: admin.is_active,
          mfaEnrolled: admin.mfa_enrolled,
          avatarUrl: admin.avatar_url || null,
          phoneNumber: admin.phone_number || null,
          sessionAal
        }
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Upload / Change Profile Photo for Authenticated Administrator
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/admins/me/avatar' && req.method === 'POST') {
    try {
      const { admin } = await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent', 'compliance_admin', 'platform_auditor'], 'aal1');
      // Read bounded body up to 8 MB to accommodate base64 overhead of 5 MB images
      const rawBody = await readBoundedBody(req, 8 * 1024 * 1024);
      const parsedBody = JSON.parse(rawBody || '{}');

      const { buffer, mimeType, extension, sizeBytes } = validateAndExtractImageBuffer(parsedBody);

      const storagePath = `platform-admins/${admin.id}/avatar.${extension}`;

      const { error: uploadErr } = await supabase.storage
        .from('admin-profile-photos')
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: true
        });

      if (uploadErr) {
        throw new Error(`Storage upload failed: ${uploadErr.message}`);
      }

      const { data: pubData } = supabase.storage
        .from('admin-profile-photos')
        .getPublicUrl(storagePath);

      const publicUrl = `${pubData.publicUrl}?v=${Date.now()}`;

      // Update administrator record in database
      const { data: updatedAdmin, error: updateErr } = await supabase
        .from('platform_admins')
        .update({
          avatar_url: publicUrl,
          avatar_updated_at: new Date().toISOString()
        })
        .eq('id', admin.id)
        .select('id, email, full_name, role, is_active, mfa_enrolled, avatar_url, phone_number')
        .single();

      if (updateErr) throw updateErr;

      // Audit log entry
      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'ADMIN_AVATAR_UPLOAD',
        target_user_id: admin.id,
        details: {
          storage_path: storagePath,
          mime_type: mimeType,
          size_bytes: sizeBytes
        },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Profile photo updated successfully',
        avatarUrl: publicUrl,
        admin: {
          id: updatedAdmin.id,
          email: updatedAdmin.email,
          fullName: updatedAdmin.full_name,
          role: updatedAdmin.role,
          isActive: updatedAdmin.is_active,
          mfaEnrolled: updatedAdmin.mfa_enrolled,
          avatarUrl: updatedAdmin.avatar_url,
          phoneNumber: updatedAdmin.phone_number
        }
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Remove Profile Photo for Authenticated Administrator
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/admins/me/avatar' && req.method === 'DELETE') {
    try {
      const { admin } = await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent', 'compliance_admin', 'platform_auditor'], 'aal1');

      const pathsToRemove = [
        `platform-admins/${admin.id}/avatar.webp`,
        `platform-admins/${admin.id}/avatar.png`,
        `platform-admins/${admin.id}/avatar.jpg`,
        `platform-admins/${admin.id}/avatar.jpeg`
      ];

      await supabase.storage.from('admin-profile-photos').remove(pathsToRemove);

      const { data: updatedAdmin, error: updateErr } = await supabase
        .from('platform_admins')
        .update({
          avatar_url: null,
          avatar_updated_at: new Date().toISOString()
        })
        .eq('id', admin.id)
        .select('id, email, full_name, role, is_active, mfa_enrolled, avatar_url, phone_number')
        .single();

      if (updateErr) throw updateErr;

      // Audit log entry
      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'ADMIN_AVATAR_REMOVED',
        target_user_id: admin.id,
        details: { message: 'Profile photo removed' },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Profile photo removed successfully',
        avatarUrl: null,
        admin: {
          id: updatedAdmin.id,
          email: updatedAdmin.email,
          fullName: updatedAdmin.full_name,
          role: updatedAdmin.role,
          isActive: updatedAdmin.is_active,
          mfaEnrolled: updatedAdmin.mfa_enrolled,
          avatarUrl: null,
          phoneNumber: updatedAdmin.phone_number
        }
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Update Profile Metadata (Name, Phone) for Authenticated Administrator
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/admins/me/profile' && (req.method === 'PUT' || req.method === 'PATCH')) {
    try {
      const { admin } = await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent', 'compliance_admin', 'platform_auditor'], 'aal1');
      const rawBody = await readBoundedBody(req);
      const body = JSON.parse(rawBody || '{}');

      // Security check: Never permit self-editing of role, account status, email, or system IDs
      if ('role' in body || 'is_active' in body || 'id' in body || 'email' in body || 'mfa_enrolled' in body) {
        const err = new Error('Modification of role, account status, email, or system identifiers is strictly forbidden');
        err.statusCode = 403;
        err.code = 'FORBIDDEN_FIELD_MODIFICATION';
        throw err;
      }

      const updates = {};
      if (typeof body.fullName === 'string' || typeof body.full_name === 'string') {
        const name = (body.fullName || body.full_name).trim();
        if (name.length < 2 || name.length > 100) {
          const err = new Error('Full name must be between 2 and 100 characters');
          err.statusCode = 400;
          err.code = 'INVALID_NAME_LENGTH';
          throw err;
        }
        updates.full_name = name;
      }

      if (typeof body.phoneNumber === 'string' || typeof body.phone_number === 'string') {
        const phone = (body.phoneNumber || body.phone_number).trim();
        if (phone.length > 25) {
          const err = new Error('Phone number must not exceed 25 characters');
          err.statusCode = 400;
          err.code = 'INVALID_PHONE_LENGTH';
          throw err;
        }
        updates.phone_number = phone;
      }

      if (Object.keys(updates).length === 0) {
        const err = new Error('No permitted profile fields provided for update');
        err.statusCode = 400;
        err.code = 'EMPTY_UPDATE';
        throw err;
      }

      updates.updated_at = new Date().toISOString();

      const { data: updatedAdmin, error: updateErr } = await supabase
        .from('platform_admins')
        .update(updates)
        .eq('id', admin.id)
        .select('id, email, full_name, role, is_active, mfa_enrolled, avatar_url, phone_number')
        .single();

      if (updateErr) throw updateErr;

      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'ADMIN_PROFILE_UPDATED',
        target_user_id: admin.id,
        details: { updated_fields: Object.keys(updates).filter(k => k !== 'updated_at') },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Profile updated successfully',
        data: {
          id: updatedAdmin.id,
          email: updatedAdmin.email,
          fullName: updatedAdmin.full_name,
          role: updatedAdmin.role,
          isActive: updatedAdmin.is_active,
          mfaEnrolled: updatedAdmin.mfa_enrolled,
          avatarUrl: updatedAdmin.avatar_url,
          phoneNumber: updatedAdmin.phone_number
        }
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: In-App Password Change for Authenticated Administrator
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/auth/password/change' && req.method === 'POST') {
    try {
      const { admin, user } = await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent'], 'aal1');
      const rawBody = await readBoundedBody(req);
      const { current_password, new_password } = JSON.parse(rawBody || '{}');

      if (!new_password || new_password.length < 8) {
        const err = new Error('New password must be at least 8 characters long');
        err.statusCode = 400;
        err.code = 'INVALID_PASSWORD_LENGTH';
        throw err;
      }

      // If current password provided, verify it first
      if (current_password) {
        const authClient = createClient(gatewayUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false }
        });
        const { error: verifyErr } = await authClient.auth.signInWithPassword({
          email: admin.email,
          password: current_password
        });
        if (verifyErr) {
          const err = new Error('Current password is incorrect');
          err.statusCode = 401;
          err.code = 'INVALID_CURRENT_PASSWORD';
          throw err;
        }
      }

      // Update password in Supabase Auth via Admin API
      const { error: updateErr } = await supabase.auth.admin.updateUserById(admin.id, {
        password: new_password
      });

      if (updateErr) throw updateErr;

      // Log password change in platform_audit_logs
      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'PASSWORD_CHANGE',
        target_user_id: admin.id,
        details: { message: 'Administrator password changed securely via portal' },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Password updated successfully'
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Complete Password Reset with Recovery Token / Session
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/auth/password/reset-confirm' && req.method === 'POST') {
    try {
      const rawBody = await readBoundedBody(req);
      const { token, access_token, new_password } = JSON.parse(rawBody || '{}');

      if (!new_password || new_password.length < 8) {
        const err = new Error('New password must be at least 8 characters long');
        err.statusCode = 400;
        err.code = 'INVALID_PASSWORD_LENGTH';
        throw err;
      }

      // Extract bearer token from Authorization header or body
      let recoveryJwt = access_token || token;
      if (!recoveryJwt && req.headers['authorization']) {
        const authHeader = req.headers['authorization'];
        if (authHeader.startsWith('Bearer ')) {
          recoveryJwt = authHeader.slice(7);
        }
      }

      if (!recoveryJwt) {
        const err = new Error('Recovery access token is required');
        err.statusCode = 401;
        err.code = 'MISSING_RECOVERY_TOKEN';
        throw err;
      }

      // Validate recovery token against Supabase Auth
      const { data: userData, error: userErr } = await supabase.auth.getUser(recoveryJwt);
      if (userErr || !userData?.user) {
        const err = new Error('Invalid or expired password reset token');
        err.statusCode = 401;
        err.code = 'INVALID_RESET_TOKEN';
        throw err;
      }

      const userId = userData.user.id;
      const userEmail = userData.user.email;

      // Verify user is in platform_admins and active
      const { data: adminRecord, error: adminErr } = await supabase
        .from('platform_admins')
        .select('id, email, role, is_active')
        .eq('id', userId)
        .single();

      if (adminErr || !adminRecord || !adminRecord.is_active) {
        const err = new Error('Account is not an active platform administrator');
        err.statusCode = 403;
        err.code = 'ADMIN_NOT_AUTHORIZED';
        throw err;
      }

      // Update password via admin API
      const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
        password: new_password
      });

      if (updateErr) throw updateErr;

      // Audit log
      await supabase.from('platform_audit_logs').insert({
        admin_id: userId,
        admin_email: userEmail,
        admin_role: adminRecord.role,
        action: 'PASSWORD_RESET',
        target_user_id: userId,
        details: { message: 'Administrator password reset successfully completed via recovery token' },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Password has been reset successfully. You may now log in.'
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Password Reset Request (Forgot Password)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/auth/password/reset-request' && req.method === 'POST') {
    try {
      const clientIp = req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(`reset_pwd_ip:${clientIp}`, 5)) {
        const err = new Error('Rate limit exceeded for password reset requests. Try again later.');
        err.statusCode = 429;
        err.code = 'RATE_LIMIT_EXCEEDED';
        throw err;
      }

      const rawBody = await readBoundedBody(req);
      const { email } = JSON.parse(rawBody || '{}');

      if (!email) {
        const err = new Error('Email is required');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Check if user is in platform_admins
      const { data: adminRecord } = await supabase
        .from('platform_admins')
        .select('id, email, is_active')
        .eq('email', normalizedEmail)
        .single();

      let recoveryLink = null;
      if (adminRecord && adminRecord.is_active) {
        const { data: linkData } = await supabase.auth.admin.generateLink({
          type: 'recovery',
          email: normalizedEmail,
          options: {
            redirectTo: 'http://localhost:3001/'
          }
        });
        recoveryLink = linkData?.properties?.action_link || null;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'If the provided email belongs to an active administrator, password reset instructions have been generated.',
        recoveryLink: process.env.NODE_ENV === 'staging' ? recoveryLink : undefined
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: MFA Self-Enrollment for Authenticated Administrator
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/admins/mfa/enroll' && req.method === 'POST') {
    try {
      const authUser = await authenticateRequest(req);
      const actorId = authUser.id;
      const sessionAal = authUser.session_aal;

      if (sessionAal !== 'aal2') {
        const err = new Error('MFA enrollment requires an active AAL2 session assurance challenge');
        err.statusCode = 403;
        err.code = 'MFA_ASSURANCE_REQUIRED';
        throw err;
      }

      const { data, error } = await supabase.rpc('super_admin_enroll_mfa', {
        p_admin_id: actorId,
        p_session_aal: sessionAal
      });

      if (error) throw error;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Create Administrator Invitation (Pre-Authorization)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/admins/invite' && req.method === 'POST') {
    try {
      // 1. IP Rate Limiting (DoS Defense)
      const clientIp = req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(`inv_ip:${clientIp}`)) {
        const err = new Error('Rate limit exceeded for administrator invitation requests. Try again later.');
        err.statusCode = 429;
        err.code = 'RATE_LIMIT_EXCEEDED';
        throw err;
      }

      // 2. Mandatory Authentication via genuine Supabase Auth
      const authUser = await authenticateRequest(req);
      const actorId = authUser.id;
      const sessionAal = authUser.session_aal;

      // 3. Per-Actor Rate Limiting
      if (!checkRateLimit(`inv_actor:${actorId}`)) {
        const err = new Error('Rate limit exceeded for administrator invitation requests. Try again later.');
        err.statusCode = 429;
        err.code = 'RATE_LIMIT_EXCEEDED';
        throw err;
      }

      // 4. Body Reading & Bounded Size
      const body = await readBoundedBody(req);
      const payload = JSON.parse(body || '{}');

      // 5. Rejection of Forged Client-Supplied Actor ID
      if (payload.actor_admin_id && payload.actor_admin_id !== actorId) {
        const err = new Error('Client-supplied actor identity does not match authenticated principal');
        err.statusCode = 403;
        err.code = 'FORGED_ACTOR_IDENTITY';
        throw err;
      }

      // 5. Validate Input Fields
      const { target_user_id, target_email, role = 'super_admin', expires_in_hours = 24 } = payload;
      if (!target_user_id || !target_email) {
        const err = new Error('target_user_id and target_email are required');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
      if (!['super_admin', 'billing_admin', 'support_agent'].includes(role)) {
        const err = new Error(`Invalid target role: ${role}`);
        err.statusCode = 400;
        err.code = 'INVALID_ROLE';
        throw err;
      }

      // 6. GCAP Assertion Verification (Canonical String includes sessionAal)
      const signature = req.headers['x-gcap-signature'];
      const timestampHeader = req.headers['x-gcap-timestamp'];
      const nonce = req.headers['x-gcap-nonce'];
      const timestampEpoch = isNaN(timestampHeader) 
        ? Math.floor(new Date(timestampHeader).getTime() / 1000) 
        : Number(timestampHeader);

      const canonicalString = `${actorId}:CREATE_ADMIN_INVITATION:${target_user_id}:${role}:${sessionAal}:${timestampEpoch}:${nonce}`;

      verifyGcapAssertion({
        signature,
        timestamp: timestampHeader,
        nonce,
        canonicalString,
        secret: assertionSecret
      });

      // 7. Database Verification of Requesting Actor (active super_admin with enrolled MFA and AAL2)
      await verifySuperAdminActor(actorId, sessionAal);

      // 8. Invoke Authoritative Database RPC
      const { data, error } = await supabase.rpc('super_admin_create_admin_invitation', {
        p_target_user_id: target_user_id,
        p_target_email: target_email,
        p_role: role,
        p_session_aal: sessionAal,
        p_expires_in_hours: expires_in_hours,
        p_actor_admin_id: actorId,
        p_request_timestamp: new Date(timestampEpoch * 1000).toISOString(),
        p_nonce: nonce,
        p_signature: signature
      });

      if (error) throw error;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Authoritative Administrator Provisioning (Consumes Invitation)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/admins/provision' && req.method === 'POST') {
    try {
      // 1. IP Rate Limiting (DoS Defense)
      const clientIp = req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(`prov_ip:${clientIp}`)) {
        const err = new Error('Rate limit exceeded for administrator provisioning requests. Try again later.');
        err.statusCode = 429;
        err.code = 'RATE_LIMIT_EXCEEDED';
        throw err;
      }

      // 2. Mandatory Authentication via genuine Supabase Auth
      const authUser = await authenticateRequest(req);
      const actorId = authUser.id;
      const sessionAal = authUser.session_aal;

      // 3. Per-Actor Rate Limiting
      if (!checkRateLimit(`prov_actor:${actorId}`)) {
        const err = new Error('Rate limit exceeded for administrator provisioning requests. Try again later.');
        err.statusCode = 429;
        err.code = 'RATE_LIMIT_EXCEEDED';
        throw err;
      }

      // 4. Read Bounded Body
      const body = await readBoundedBody(req);
      const payload = JSON.parse(body || '{}');

      // 5. Rejection of Forged Client-Supplied Actor ID
      if (payload.actor_admin_id && payload.actor_admin_id !== actorId) {
        const err = new Error('Client-supplied actor identity does not match authenticated principal');
        err.statusCode = 403;
        err.code = 'FORGED_ACTOR_IDENTITY';
        throw err;
      }

      // 5. Validate Input Fields
      const { admin_id, email, full_name, role = 'super_admin' } = payload;
      if (!admin_id || !email || !full_name) {
        const err = new Error('admin_id, email, and full_name are required');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
      if (!['super_admin', 'billing_admin', 'support_agent'].includes(role)) {
        const err = new Error(`Invalid role: ${role}`);
        err.statusCode = 400;
        err.code = 'INVALID_ROLE';
        throw err;
      }

      // 6. Verify GCAP Cryptographic Assertion (Canonical string includes sessionAal)
      const signature = req.headers['x-gcap-signature'];
      const timestampHeader = req.headers['x-gcap-timestamp'];
      const nonce = req.headers['x-gcap-nonce'];
      const timestampEpoch = isNaN(timestampHeader) 
        ? Math.floor(new Date(timestampHeader).getTime() / 1000) 
        : Number(timestampHeader);

      const canonicalString = `${actorId}:PROVISION_PLATFORM_ADMIN:${admin_id}:${role}:${sessionAal}:${timestampEpoch}:${nonce}`;

      verifyGcapAssertion({
        signature,
        timestamp: timestampHeader,
        nonce,
        canonicalString,
        secret: assertionSecret
      });

      // 7. Database Verification of Requesting Actor (active super_admin with enrolled MFA and AAL2)
      await verifySuperAdminActor(actorId, sessionAal);

      // 8. Invoke Authoritative Database RPC via Service Role Client
      const { data, error } = await supabase.rpc('super_admin_provision_platform_admin', {
        p_admin_id: admin_id,
        p_email: email,
        p_full_name: full_name,
        p_role: role,
        p_session_aal: sessionAal,
        p_actor_admin_id: actorId,
        p_request_timestamp: new Date(timestampEpoch * 1000).toISOString(),
        p_nonce: nonce,
        p_signature: signature
      });

      if (error) throw error;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: MFA Revocation for Compromised Administrator
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/admins/mfa/revoke' && req.method === 'POST') {
    try {
      const authUser = await authenticateRequest(req);
      const actorId = authUser.id;
      const sessionAal = authUser.session_aal;

      const body = await readBoundedBody(req);
      const payload = JSON.parse(body || '{}');
      const { target_admin_id, reason } = payload;

      if (!target_admin_id || !reason) {
        const err = new Error('target_admin_id and reason are required');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }

      const signature = req.headers['x-gcap-signature'];
      const timestampHeader = req.headers['x-gcap-timestamp'];
      const nonce = req.headers['x-gcap-nonce'];
      const timestampEpoch = isNaN(timestampHeader) 
        ? Math.floor(new Date(timestampHeader).getTime() / 1000) 
        : Number(timestampHeader);

      const canonicalString = `${actorId}:REVOKE_MFA:${target_admin_id}:NONE:${sessionAal}:${timestampEpoch}:${nonce}`;

      verifyGcapAssertion({
        signature,
        timestamp: timestampHeader,
        nonce,
        canonicalString,
        secret: assertionSecret
      });

      await verifySuperAdminActor(actorId, sessionAal);

      const { data, error } = await supabase.rpc('super_admin_revoke_mfa', {
        p_actor_admin_id: actorId,
        p_target_admin_id: target_admin_id,
        p_reason: reason,
        p_session_aal: sessionAal,
        p_request_timestamp: new Date(timestampEpoch * 1000).toISOString(),
        p_nonce: nonce,
        p_signature: signature
      });

      if (error) throw error;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Platform Executive Overview Metrics (Phase 2.6 SaaS & Tenant Isolation)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/platform/overview' && req.method === 'GET') {
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent'], 'aal1');

      const timeframe = url.searchParams.get('timeframe') || 'all_time';
      const customStart = url.searchParams.get('start_date');
      const customEnd = url.searchParams.get('end_date');

      const now = new Date();
      let startDate = null;
      let endDate = new Date();

      if (timeframe === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (timeframe === 'this_week') {
        const dayOfWeek = now.getDay() || 7;
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1);
      } else if (timeframe === 'this_month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (timeframe === 'last_month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      } else if (timeframe === 'custom' && customStart) {
        startDate = new Date(customStart);
        if (customEnd) endDate = new Date(customEnd + 'T23:59:59.999Z');
      }

      // 1. Workspaces Metrics
      const { data: allWs, error: wsErr } = await supabase
        .from('workspaces')
        .select('id, company_name, is_active, created_at')
        .is('deleted_at', null);
      if (wsErr) throw wsErr;

      const totalBusinesses = (allWs || []).length;
      const activeBusinesses = (allWs || []).filter(w => w.is_active).length;
      const suspendedBusinesses = (allWs || []).filter(w => !w.is_active).length;

      // New registrations in timeframe
      const newRegistrations = (allWs || []).filter(w => {
        if (!startDate) return true;
        const c = new Date(w.created_at);
        return c >= startDate && c <= endDate;
      }).length;

      // 2. Profiles (Users & Employees)
      const { data: allProfiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, workspace_id, role, status, created_at');
      if (profErr) throw profErr;

      const totalUsers = (allProfiles || []).length;
      const totalEmployees = (allProfiles || []).filter(p => p.role !== 'owner').length;

      // 3. Subscriptions
      const { data: allSubs, error: subErr } = await supabase
        .from('workspace_subscriptions')
        .select(`
          id, workspace_id, plan_id, status, trial_start, trial_end, current_period_end,
          subscription_plans (id, name, price_monthly_inr, price_annual_inr)
        `);
      if (subErr) throw subErr;

      let activeSubscriptions = 0;
      let trialSubscriptions = 0;
      let expiredSubscriptions = 0;
      let mrrInr = 0;

      const planCounts = {};
      (allSubs || []).forEach(s => {
        const pName = s.subscription_plans?.name || (s.plan_id === 'free_trial' ? '14-Day Free Trial' : s.plan_id) || 'Free Trial';
        planCounts[pName] = (planCounts[pName] || 0) + 1;

        if (s.status === 'active') {
          activeSubscriptions++;
          mrrInr += Number(s.subscription_plans?.price_monthly_inr || 0);
        } else if (s.status === 'trialing') {
          const isExpired = s.trial_end && new Date(s.trial_end) < now;
          if (isExpired) {
            expiredSubscriptions++;
          } else {
            trialSubscriptions++;
          }
        } else if (['expired', 'cancelled', 'past_due'].includes(s.status)) {
          expiredSubscriptions++;
        }
      });
      const arrInr = mrrInr * 12;

      // 4. Platform SaaS Collections (payment_transactions: verified_success vs refunded)
      const { data: txns, error: txnErr } = await supabase
        .from('payment_transactions')
        .select('id, amount_inr, status, created_at');
      if (txnErr) throw txnErr;

      let platformCollectedRevenueInr = 0;
      let totalRefundsInr = 0;

      (txns || []).forEach(t => {
        const tDate = new Date(t.created_at);
        if (startDate && (tDate < startDate || tDate > endDate)) return;

        if (t.status === 'verified_success' || t.status === 'successful') {
          platformCollectedRevenueInr += Number(t.amount_inr || 0);
        } else if (t.status === 'refunded') {
          totalRefundsInr += Number(t.amount_inr || 0);
        }
      });

      const netPlatformRevenueInr = Math.round((platformCollectedRevenueInr / 1.18) * 100) / 100;
      const gstComponentInr = Math.round((platformCollectedRevenueInr - netPlatformRevenueInr) * 100) / 100;

      // 5. Tenant Retail Invoices (GMV, Collected, Outstanding)
      const { data: allInvoices, error: invErr } = await supabase
        .from('invoices')
        .select('id, grand_total, paid_amount, balance_amount, status, created_at');
      if (invErr) throw invErr;

      let tenantSalesGmvInr = 0;
      let tenantCollectedInr = 0;
      let outstandingAmountsInr = 0;

      (allInvoices || []).forEach(inv => {
        const invDate = new Date(inv.created_at);
        if (startDate && (invDate < startDate || invDate > endDate)) return;

        tenantSalesGmvInr += Number(inv.grand_total || 0);
        tenantCollectedInr += Number(inv.paid_amount || 0);
        outstandingAmountsInr += Number(inv.balance_amount || 0);
      });

      // 6. Plan Distribution Chart Data
      const planPalette = {
        '14-Day Free Trial': '#94a3b8',
        'Starter': '#38bdf8',
        'Starter + Mobile Add-on': '#818cf8',
        'Business': '#10b981',
        'Growth': '#f59e0b',
        'Enterprise': '#a855f7'
      };

      const planDistribution = Object.entries(planCounts).map(([name, count]) => ({
        name,
        count,
        revenuePercent: totalBusinesses > 0 ? Math.round((count / totalBusinesses) * 100) : 0,
        color: planPalette[name] || '#64748b'
      }));

      // 7. Business Status Distribution Chart Data
      const businessStatusDistribution = [
        { name: 'Active', count: activeBusinesses, color: '#10b981', percentage: totalBusinesses > 0 ? Math.round((activeBusinesses / totalBusinesses) * 100) : 0 },
        { name: 'Suspended', count: suspendedBusinesses, color: '#f43f5e', percentage: totalBusinesses > 0 ? Math.round((suspendedBusinesses / totalBusinesses) * 100) : 0 }
      ];

      // 8. Subscription Status Distribution Chart Data
      const subscriptionDistribution = [
        { name: 'Active', count: activeSubscriptions, color: '#10b981' },
        { name: 'Trialing', count: trialSubscriptions, color: '#38bdf8' },
        { name: 'Expired / Cancelled', count: expiredSubscriptions, color: '#f59e0b' }
      ];

      // 9. Registration Growth Chart Data (by month/date)
      const dateCounts = {};
      (allWs || []).forEach(w => {
        const d = new Date(w.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dateCounts[d] = (dateCounts[d] || 0) + 1;
      });
      const registrationGrowth = Object.entries(dateCounts).map(([date, count]) => ({ date, count }));

      // 10. Revenue Trends (Dynamic monthly database aggregation)
      const revenueTrends = await computeDynamicRevenueTrends();

      // 11. Upcoming Expirations
      const upcomingExpirations = (allSubs || [])
        .filter(s => s.trial_end || s.current_period_end)
        .sort((a, b) => new Date(a.trial_end || a.current_period_end) - new Date(b.trial_end || b.current_period_end))
        .slice(0, 5)
        .map(s => {
          const expDate = s.current_period_end || s.trial_end || new Date().toISOString();
          const diffDays = Math.max(0, Math.ceil((new Date(expDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
          const ws = (allWs || []).find(w => w.id === s.workspace_id);
          return {
            workspaceId: s.workspace_id,
            businessName: ws?.company_name || 'Retail Organization',
            planName: s.subscription_plans?.name || 'Starter Plan',
            expiresInDays: diffDays,
            expiryDate: expDate.split('T')[0],
            amountInr: Number(s.subscription_plans?.price_annual_inr || 2499.00),
            ownerEmail: ws?.owner_email || 'owner@example.com'
          };
        });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          metrics: {
            totalBusinesses,
            activeBusinesses,
            suspendedBusinesses,
            totalUsers,
            totalEmployees,
            activeSubscriptions,
            trialSubscriptions,
            expiredSubscriptions,
            newRegistrations,
            platformCollectedRevenueInr,
            gstComponentInr,
            netPlatformRevenueInr,
            outstandingAmountsInr,
            totalRefundsInr,
            tenantSalesGmvInr,
            tenantCollectedInr,
            mrrInr,
            arrInr
          },
          filters: {
            timeframe,
            startDate: startDate ? startDate.toISOString() : null,
            endDate: endDate ? endDate.toISOString() : null
          },
          charts: {
            registrationGrowth,
            subscriptionDistribution,
            planDistribution,
            businessStatusDistribution,
            revenueTrends
          },
          planDistribution,
          revenueTrends,
          upcomingExpirations
        }
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Searchable / Paginated Workspaces Roster
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/workspaces' && req.method === 'GET') {
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent'], 'aal1');

      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
      const scope = url.searchParams.get('scope') || 'all'; // 'genuine' | 'test' | 'all'
      const search = (url.searchParams.get('search') || '').trim();
      const status = (url.searchParams.get('status') || 'all').toLowerCase();
      const plan = url.searchParams.get('plan') || 'all';
      const sortBy = url.searchParams.get('sort_by') || url.searchParams.get('sortBy') || 'created_at';
      const sortOrder = (url.searchParams.get('sort_order') || url.searchParams.get('sortOrder') || 'desc').toLowerCase();

      // Fetch profiles to get accurate staff counts per workspace
      const { data: profRows } = await supabase.from('profiles').select('workspace_id');
      const staffCounts = {};
      (profRows || []).forEach(p => {
        if (p.workspace_id) staffCounts[p.workspace_id] = (staffCounts[p.workspace_id] || 0) + 1;
      });

      // Fetch invoice totals per workspace
      const { data: invRows } = await supabase.from('invoices').select('workspace_id, grand_total, paid_amount');
      const gmvMap = {};
      const collectedMap = {};
      (invRows || []).forEach(i => {
        if (i.workspace_id) {
          gmvMap[i.workspace_id] = (gmvMap[i.workspace_id] || 0) + Number(i.grand_total || 0);
          collectedMap[i.workspace_id] = (collectedMap[i.workspace_id] || 0) + Number(i.paid_amount || 0);
        }
      });

      let query = supabase
        .from('workspaces')
        .select(`
          id,
          company_name,
          owner_name,
          owner_email,
          owner_phone,
          is_active,
          is_test,
          is_main_branch,
          branch_name,
          branch_code,
          suspension_reason,
          suspended_at,
          suspended_by,
          created_at,
          updated_at,
          business_settings (
            legal_name,
            gstin,
            address,
            city,
            state
          ),
          workspace_subscriptions (
            id,
            plan_id,
            status,
            trial_start,
            trial_end,
            current_period_start,
            current_period_end,
            billing_interval,
            subscription_plans (
              id,
              name,
              price_annual_inr,
              price_monthly_inr
            )
          )
        `, { count: 'exact' })
        .is('deleted_at', null);

      if (scope === 'genuine') {
        query = query.eq('is_test', false);
      } else if (scope === 'test') {
        query = query.eq('is_test', true);
      }

      if (search) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search);
        if (isUuid) {
          query = query.or(`id.eq.${search},company_name.ilike.%${search}%,owner_name.ilike.%${search}%,owner_email.ilike.%${search}%,owner_phone.ilike.%${search}%`);
        } else {
          query = query.or(`company_name.ilike.%${search}%,owner_name.ilike.%${search}%,owner_email.ilike.%${search}%,owner_phone.ilike.%${search}%`);
        }
      }
      if (status === 'active') {
        query = query.eq('is_active', true);
      } else if (status === 'suspended') {
        query = query.eq('is_active', false);
      }

      if (sortBy === 'created_at') {
        query = query.order('created_at', { ascending: sortOrder === 'asc' });
      } else if (sortBy === 'name') {
        query = query.order('company_name', { ascending: sortOrder === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data: rows, count: totalCount, error } = await query;
      if (error) throw error;

      let businesses = (rows || []).map(ws => {
        const sub = Array.isArray(ws.workspace_subscriptions) ? ws.workspace_subscriptions[0] : ws.workspace_subscriptions;
        const planObj = sub?.subscription_plans;
        const bSetting = Array.isArray(ws.business_settings) ? ws.business_settings[0] : ws.business_settings;
        const actualStaff = staffCounts[ws.id] || 1;
        const monthlyGmv = gmvMap[ws.id] || 0;
        const collectedRev = collectedMap[ws.id] || 0;

        return {
          id: ws.id,
          legalName: bSetting?.legal_name || ws.company_name,
          organizationId: ws.id,
          gstin: bSetting?.gstin || null,
          ownerName: ws.owner_name,
          ownerEmail: ws.owner_email,
          ownerPhone: ws.owner_phone,
          address: bSetting?.address || 'Registered Office',
          city: bSetting?.city || 'City',
          state: bSetting?.state || 'State',
          status: ws.is_active ? 'Active' : 'Suspended',
          isTest: ws.is_test || false,
          plan: planObj?.name || (sub?.plan_id === 'free_trial' ? '14-Day Free Trial' : sub?.plan_id) || '14-Day Free Trial',
          planId: (sub?.plan_id || 'free_trial').toLowerCase(),
          planName: planObj?.name || (sub?.plan_id === 'free_trial' ? '14-Day Free Trial' : sub?.plan_id) || '14-Day Free Trial',
          billingInterval: sub?.billing_interval || 'annual',
          subscriptionStatus: sub?.status || 'trialing',
          registeredAt: ws.created_at,
          lastActiveAt: ws.updated_at || ws.created_at,
          expiresAt: sub?.current_period_end || sub?.trial_end || ws.created_at,
          periodEnd: sub?.current_period_end || sub?.trial_end || ws.created_at,
          totalBranches: 1,
          branches: [
            {
              id: ws.id,
              branchName: ws.branch_name || 'Main Branch',
              branchCode: ws.branch_code || 'MAIN',
              isMainBranch: ws.is_main_branch ?? true,
              isActive: ws.is_active ?? true,
              userCount: actualStaff
            }
          ],
          branchCount: 1,
          activeStaffCount: actualStaff,
          monthlyGmvInr: monthlyGmv,
          totalCollectedRevenueInr: collectedRev,
          mrrContributionInr: Number(planObj?.price_monthly_inr || 0),
          isSuspended: !ws.is_active,
          suspensionReason: ws.suspension_reason || null,
          suspensionDetails: !ws.is_active ? {
            suspendedAt: ws.suspended_at || ws.updated_at,
            suspendedBy: 'Super Administrator',
            reason: ws.suspension_reason || 'Administrative action',
            suspendedMembershipsCount: actualStaff,
            suspendedProfilesCount: actualStaff
          } : null
        };
      });

      // Filter by plan tier if specified
      if (plan && plan !== 'all') {
        businesses = businesses.filter(b => b.planId === plan.toLowerCase());
      }

      // Sort by employees, status, or name if requested
      if (sortBy === 'employees' || sortBy === 'staff_count') {
        businesses.sort((a, b) => sortOrder === 'asc' ? a.activeStaffCount - b.activeStaffCount : b.activeStaffCount - a.activeStaffCount);
      } else if (sortBy === 'status') {
        businesses.sort((a, b) => sortOrder === 'asc' ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status));
      } else if (sortBy === 'name') {
        businesses.sort((a, b) => sortOrder === 'asc' ? a.legalName.localeCompare(b.legalName) : b.legalName.localeCompare(a.legalName));
      }

      const totalFiltered = businesses.length;
      const from = (page - 1) * limit;
      const paginatedBusinesses = businesses.slice(from, from + limit);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          businesses: paginatedBusinesses,
          pagination: {
            total: totalFiltered,
            page,
            limit,
            totalPages: Math.ceil(totalFiltered / limit) || 1
          }
        }
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Single Workspace Detail Deep-Dive
  // ---------------------------------------------------------------------------
  const wsDetailMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([0-9a-f-]{36})$/i);
  if (wsDetailMatch && req.method === 'GET') {
    const wsId = wsDetailMatch[1];
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent'], 'aal1');

      const { data: ws, error } = await supabase
        .from('workspaces')
        .select(`
          *,
          business_settings (*),
          workspace_subscriptions (
            *,
            subscription_plans (*)
          )
        `)
        .eq('id', wsId)
        .single();

      if (error || !ws) {
        const err = new Error('Workspace not found');
        err.statusCode = 404;
        throw err;
      }

      // 1. Employees (all profiles for this workspace)
      const { data: employees } = await supabase
        .from('profiles')
        .select('id, employee_id, name, email, phone, role, designation, department, status, created_at, updated_at')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: true });

      // 2. Suspension history
      const { data: suspensions } = await supabase
        .from('platform_workspace_suspensions')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      // 3. Platform audit logs for this workspace
      const { data: auditLogs } = await supabase
        .from('platform_audit_logs')
        .select('*')
        .eq('target_workspace_id', wsId)
        .order('created_at', { ascending: false })
        .limit(20);

      // 4. Invoices & GMV
      const { data: invData } = await supabase
        .from('invoices')
        .select('id, invoice_number, date, customer_name, customer_phone, grand_total, paid_amount, balance_amount, status, created_at')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false })
        .limit(20);

      const totalGmv = (invData || []).reduce((acc, i) => acc + Number(i.grand_total || 0), 0);
      const totalCollected = (invData || []).reduce((acc, i) => acc + Number(i.paid_amount || 0), 0);
      const totalOutstanding = (invData || []).reduce((acc, i) => acc + Number(i.balance_amount || 0), 0);

      // 5. Payment transactions for this workspace
      const { data: wsPayments } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      // 6. Subscription events / audit history for this workspace
      const { data: wsSubEvents } = await supabase
        .from('workspace_subscription_events')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      const subObj = Array.isArray(ws.workspace_subscriptions) ? ws.workspace_subscriptions[0] : ws.workspace_subscriptions;
      const effectivePrice = subObj?.custom_price_inr 
        ? Number(subObj.custom_price_inr) 
        : Number(subObj?.subscription_plans?.price_monthly_inr || 0);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          workspace: ws,
          businessSettings: Array.isArray(ws.business_settings) ? ws.business_settings[0] : ws.business_settings,
          subscription: subObj ? {
            ...subObj,
            effectivePriceInr: effectivePrice,
            pricingModel: subObj.pricing_model || (subObj.custom_price_inr ? 'custom_negotiated' : 'standard')
          } : null,
          employees: employees || [],
          recentInvoices: invData || [],
          paymentTransactions: wsPayments || [],
          subscriptionEvents: wsSubEvents || [],
          suspensions: suspensions || [],
          auditLogs: auditLogs || [],
          metrics: {
            memberCount: (employees || []).length,
            invoiceCount: (invData || []).length,
            totalGmvInr: totalGmv,
            totalCollectedInr: totalCollected,
            totalOutstandingInr: totalOutstanding,
            effectiveSubscriptionPriceInr: effectivePrice
          }
        }
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Workspace Members Roster
  // ---------------------------------------------------------------------------
  const wsMembersMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([0-9a-f-]{36})\/members$/i);
  if (wsMembersMatch && req.method === 'GET') {
    const wsId = wsMembersMatch[1];
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent'], 'aal1');

      const { data: members, error } = await supabase
        .from('profiles')
        .select('id, employee_id, name, email, phone, role, status, created_at, updated_at')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: members || []
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Workspace Retail Activity
  // ---------------------------------------------------------------------------
  const wsActivityMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([0-9a-f-]{36})\/activity$/i);
  if (wsActivityMatch && req.method === 'GET') {
    const wsId = wsActivityMatch[1];
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent'], 'aal1');

      const { data: recentInvoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, customer_id, grand_total, status, created_at')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false })
        .limit(10);

      const { count: customerCount } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', wsId);

      const { count: productCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', wsId);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          recentInvoices: recentInvoices || [],
          customerCount: customerCount || 0,
          productCount: productCount || 0
        }
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Platform System Health Status
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/platform/health' && req.method === 'GET') {
    const t0 = Date.now();
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent'], 'aal1');

      // Direct DB ping
      const { error: dbErr } = await supabase.from('subscription_plans').select('id').limit(1);
      const dbLatency = Date.now() - t0;

      // Supabase Auth ping
      const tAuth = Date.now();
      const { error: authErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
      const authLatency = Date.now() - tAuth;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: dbErr ? 'degraded' : 'healthy',
        timestamp: new Date().toISOString(),
        environment: nodeEnv,
        stagingProjectRef,
        services: {
          database: {
            status: dbErr ? 'unhealthy' : 'operational',
            latencyMs: dbLatency,
            error: dbErr ? dbErr.message : null
          },
          supabaseAuth: {
            status: authErr ? 'unhealthy' : 'operational',
            latencyMs: authLatency,
            error: authErr ? authErr.message : null
          },
          gatewayBff: {
            status: 'operational',
            uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
            memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
          }
        }
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Suspend Workspace (Authoritative Database RPC super_admin_suspend_workspace)
  // ---------------------------------------------------------------------------
  const wsSuspendMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([0-9a-f-]{36})\/suspend$/i);
  if (wsSuspendMatch && req.method === 'POST') {
    const wsId = wsSuspendMatch[1];
    try {
      // 1. IP Rate Limiting
      const clientIp = req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(`suspend_ip:${clientIp}`)) {
        const err = new Error('Rate limit exceeded for workspace suspension requests.');
        err.statusCode = 429;
        err.code = 'RATE_LIMIT_EXCEEDED';
        throw err;
      }

      // 2. Centralized Authentication & RBAC (Requires Super Admin with AAL2)
      const { admin, sessionAal } = await authorizeAdmin(req, ['super_admin'], 'aal2');

      // 3. Per-Actor Rate Limiting
      if (!checkRateLimit(`suspend_actor:${admin.id}`)) {
        const err = new Error('Rate limit exceeded for workspace suspension requests.');
        err.statusCode = 429;
        err.code = 'RATE_LIMIT_EXCEEDED';
        throw err;
      }

      // 4. Read & Validate Bounded Body
      const rawBody = await readBoundedBody(req);
      const body = JSON.parse(rawBody || '{}');
      const reason = (body.reason || 'Administrative suspension').trim();

      // 5. Verify GCAP Cryptographic Assertion
      const signature = req.headers['x-gcap-signature'];
      const timestampHeader = req.headers['x-gcap-timestamp'];
      const nonce = req.headers['x-gcap-nonce'];
      const timestampEpoch = isNaN(timestampHeader) 
        ? Math.floor(new Date(timestampHeader).getTime() / 1000) 
        : (Number(timestampHeader) > 1e11 ? Math.floor(Number(timestampHeader) / 1000) : Number(timestampHeader));

      const canonicalString = `${admin.id}:SUSPEND_WORKSPACE:${wsId}:NONE:${sessionAal}:${timestampEpoch}:${nonce}`;

      verifyGcapAssertion({
        signature,
        timestamp: timestampHeader,
        nonce,
        canonicalString,
        secret: assertionSecret
      });

      // 6. Invoke Authoritative Database RPC via Service Role
      const { data, error } = await supabase.rpc('super_admin_suspend_workspace', {
        p_workspace_id: wsId,
        p_reason: reason,
        p_admin_id: admin.id,
        p_session_aal: sessionAal,
        p_request_timestamp: new Date(timestampEpoch * 1000).toISOString(),
        p_nonce: nonce,
        p_signature: signature
      });

      if (error) throw error;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Reactivate Workspace (Authoritative Database RPC super_admin_reactivate_workspace)
  // ---------------------------------------------------------------------------
  const wsReactivateMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([0-9a-f-]{36})\/reactivate$/i);
  if (wsReactivateMatch && req.method === 'POST') {
    const wsId = wsReactivateMatch[1];
    try {
      // 1. IP Rate Limiting
      const clientIp = req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(`reactivate_ip:${clientIp}`)) {
        const err = new Error('Rate limit exceeded for workspace reactivation requests.');
        err.statusCode = 429;
        err.code = 'RATE_LIMIT_EXCEEDED';
        throw err;
      }

      // 2. Centralized Authentication & RBAC (Requires Super Admin with AAL2)
      const { admin, sessionAal } = await authorizeAdmin(req, ['super_admin'], 'aal2');

      // 3. Per-Actor Rate Limiting
      if (!checkRateLimit(`reactivate_actor:${admin.id}`)) {
        const err = new Error('Rate limit exceeded for workspace reactivation requests.');
        err.statusCode = 429;
        err.code = 'RATE_LIMIT_EXCEEDED';
        throw err;
      }

      // 4. Read & Validate Bounded Body
      const rawBody = await readBoundedBody(req);
      const body = JSON.parse(rawBody || '{}');
      const reason = (body.reason || 'Administrative reactivation').trim();

      // 5. Verify GCAP Cryptographic Assertion
      const signature = req.headers['x-gcap-signature'];
      const timestampHeader = req.headers['x-gcap-timestamp'];
      const nonce = req.headers['x-gcap-nonce'];
      const timestampEpoch = isNaN(timestampHeader) 
        ? Math.floor(new Date(timestampHeader).getTime() / 1000) 
        : (Number(timestampHeader) > 1e11 ? Math.floor(Number(timestampHeader) / 1000) : Number(timestampHeader));

      const canonicalString = `${admin.id}:REACTIVATE_WORKSPACE:${wsId}:NONE:${sessionAal}:${timestampEpoch}:${nonce}`;

      verifyGcapAssertion({
        signature,
        timestamp: timestampHeader,
        nonce,
        canonicalString,
        secret: assertionSecret
      });

      // 6. Invoke Authoritative Database RPC via Service Role
      const { data, error } = await supabase.rpc('super_admin_reactivate_workspace', {
        p_workspace_id: wsId,
        p_reason: reason,
        p_admin_id: admin.id,
        p_session_aal: sessionAal,
        p_request_timestamp: new Date(timestampEpoch * 1000).toISOString(),
        p_nonce: nonce,
        p_signature: signature
      });

      if (error) throw error;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Platform Coupons Listing & Creation (Phase F Control)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/coupons' && req.method === 'GET') {
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin'], 'aal1');

      const { data: coupons, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: coupons || [] }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  if (url.pathname === '/api/v1/coupons' && req.method === 'POST') {
    try {
      const clientIp = req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(`coupon_ip:${clientIp}`)) {
        const err = new Error('Rate limit exceeded for coupon creation.');
        err.statusCode = 429;
        err.code = 'RATE_LIMIT_EXCEEDED';
        throw err;
      }

      // Mandatory Authentication & RBAC (Requires Super Admin or Billing Admin with AAL2)
      const { admin, sessionAal } = await authorizeAdmin(req, ['super_admin', 'billing_admin'], 'aal2');

      const rawBody = await readBoundedBody(req);
      const body = JSON.parse(rawBody || '{}');
      const { code, discount_type, discount_value, max_redemptions, valid_until } = body;

      if (!code || discount_value === undefined) {
        const err = new Error('Coupon code and discount_value are required');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }

      // Verify GCAP Cryptographic Assertion
      const signature = req.headers['x-gcap-signature'];
      const timestampHeader = req.headers['x-gcap-timestamp'];
      const nonce = req.headers['x-gcap-nonce'];
      const timestampEpoch = isNaN(timestampHeader) 
        ? Math.floor(new Date(timestampHeader).getTime() / 1000) 
        : (Number(timestampHeader) > 1e11 ? Math.floor(Number(timestampHeader) / 1000) : Number(timestampHeader));

      const canonicalString = `${admin.id}:CREATE_COUPON:${(code || '').toUpperCase().trim()}:${Number(discount_value)}:${sessionAal}:${timestampEpoch}:${nonce}`;

      verifyGcapAssertion({
        signature,
        timestamp: timestampHeader,
        nonce,
        canonicalString,
        secret: assertionSecret
      });

      const { data, error } = await supabase
        .from('coupons')
        .insert({
          code: (code || '').toUpperCase().trim(),
          discount_type: discount_type || 'percentage',
          discount_value: Number(discount_value || 0),
          max_redemptions: max_redemptions ? parseInt(max_redemptions, 10) : null,
          valid_until: valid_until || null,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      // Platform audit log
      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'COUPON_CREATED',
        details: { code: data.code, discount_type: data.discount_type, discount_value: data.discount_value }
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Global Users Listing (User Management)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/users' && req.method === 'GET') {
    try {
      await authorizeAdmin(req, ['super_admin', 'support_agent'], 'aal1');

      const search = (url.searchParams.get('search') || '').trim();
      let query = supabase
        .from('profiles')
        .select(`
          id,
          employee_id,
          name,
          email,
          phone,
          department,
          designation,
          role,
          status,
          created_at,
          workspace_id,
          workspaces (company_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (search) {
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,employee_id.ilike.%${search}%`);
      }

      const { data: users, error } = await query;
      if (error) throw error;

      const formatted = (users || []).map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        status: u.status,
        department: u.department,
        designation: u.designation,
        businessName: u.workspaces?.company_name || 'Unassigned',
        workspaceId: u.workspace_id,
        createdAt: u.created_at
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: formatted }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Subscriptions Listing (Subscription Management — Real Data Integrity)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/subscriptions' && req.method === 'GET') {
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin'], 'aal1');

      const scope = url.searchParams.get('scope') || 'genuine'; // 'genuine' | 'test' | 'all'
      const statusFilter = url.searchParams.get('status') || 'all';
      const planFilter = url.searchParams.get('plan') || 'all';
      const searchQuery = (url.searchParams.get('search') || '').trim().toLowerCase();

      // Query authoritative view
      let query = supabase
        .from('v_authoritative_subscriptions')
        .select('*')
        .order('subscription_created_at', { ascending: false });

      if (scope === 'genuine') {
        query = query.eq('subscription_is_test', false);
      } else if (scope === 'test') {
        query = query.eq('subscription_is_test', true);
      }

      if (statusFilter !== 'all') {
        query = query.eq('subscription_status', statusFilter);
      }

      if (planFilter !== 'all') {
        query = query.eq('plan_id', planFilter);
      }

      const { data: rawSubs, error } = await query;
      if (error) throw error;

      // Filter by search query if supplied
      let filtered = rawSubs || [];
      if (searchQuery) {
        filtered = filtered.filter(s =>
          (s.workspace_name && s.workspace_name.toLowerCase().includes(searchQuery)) ||
          (s.owner_name && s.owner_name.toLowerCase().includes(searchQuery)) ||
          (s.owner_email && s.owner_email.toLowerCase().includes(searchQuery)) ||
          (s.subscription_id && s.subscription_id.toLowerCase().includes(searchQuery)) ||
          (s.plan_name && s.plan_name.toLowerCase().includes(searchQuery))
        );
      }

      // Compute statistics directly from database
      const { data: allStatsSubs, error: statsErr } = await supabase
        .from('v_authoritative_subscriptions')
        .select('*');

      if (statsErr) throw statsErr;

      const statsPool = scope === 'genuine' 
        ? (allStatsSubs || []).filter(s => !s.subscription_is_test)
        : scope === 'test'
        ? (allStatsSubs || []).filter(s => s.subscription_is_test)
        : (allStatsSubs || []);

      let wsCountQuery = supabase
        .from('workspaces')
        .select('*', { count: 'exact', head: true });

      if (scope === 'genuine') {
        wsCountQuery = wsCountQuery.eq('is_test', false);
      } else if (scope === 'test') {
        wsCountQuery = wsCountQuery.eq('is_test', true);
      }

      const { count: totalWsCount } = await wsCountQuery;

      const stats = {
        totalRegisteredWorkspaces: totalWsCount || 0,
        totalSubscribedWorkspaces: statsPool.length,
        activePaidSubscriptions: statsPool.filter(s => s.subscription_status === 'active' && s.plan_id !== 'free_trial').length,
        activeFreeTrials: statsPool.filter(s => s.subscription_status === 'trialing' || s.plan_id === 'free_trial').length,
        expiredSubscriptions: statsPool.filter(s => s.subscription_status === 'expired').length,
        cancelledSubscriptions: statsPool.filter(s => s.subscription_status === 'cancelled').length,
        pastDueSubscriptions: statsPool.filter(s => s.subscription_status === 'past_due').length,
        totalRecurringValueInr: statsPool
          .filter(s => s.subscription_status === 'active' && s.plan_id !== 'free_trial')
          .reduce((sum, s) => {
            const price = Number(s.effective_price_inr || s.standard_plan_price_inr || 0);
            return sum + (s.billing_interval === 'annual' ? Math.round(price / 12) : price);
          }, 0)
      };

      // Map rows with exact, transparent financial properties
      const mapped = filtered.map(s => {
        const isTrial = s.subscription_status === 'trialing' || s.plan_id === 'free_trial';
        const stdPrice = Number(s.standard_plan_price_inr || 0);
        const effectivePrice = isTrial ? 0 : Number(s.effective_price_inr || stdPrice);
        const discountApplied = Math.max(0, stdPrice - effectivePrice);
        const gstAmount = Number((effectivePrice * 0.18).toFixed(2));
        const finalPayable = Number((effectivePrice + gstAmount).toFixed(2));

        return {
          id: s.subscription_id,
          workspaceId: s.workspace_id,
          workspaceName: s.workspace_name,
          ownerName: s.owner_name || 'Owner',
          ownerEmail: s.owner_email || '—',
          ownerPhone: s.owner_phone || '—',
          planId: s.plan_id,
          planName: s.plan_name || 'Standard Plan',
          status: s.subscription_status,
          billingInterval: s.billing_interval || 'annual',
          originalPlanPriceInr: stdPrice,
          effectivePriceInr: effectivePrice,
          discountAppliedInr: discountApplied,
          gstAmountInr: gstAmount,
          finalPayableInr: finalPayable,
          customPriceInr: s.custom_price_inr,
          overrideReason: s.override_reason,
          pricingModel: s.pricing_model || 'standard',
          trialStart: s.trial_start,
          trialEnd: s.trial_end,
          currentPeriodStart: s.current_period_start,
          currentPeriodEnd: s.current_period_end,
          cancelAtPeriodEnd: s.cancel_at_period_end || false,
          isTest: s.subscription_is_test || false,
          createdAt: s.subscription_created_at
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        meta: {
          environment: nodeEnv,
          stagingProjectRef,
          isProduction: false,
          dataSource: 'Supabase PostgreSQL (v_authoritative_subscriptions)',
          synchronizedAt: new Date().toISOString(),
          scope,
          totalReturned: mapped.length,
          stats
        },
        data: mapped
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Payments & Revenue Ledger
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/payments' && req.method === 'GET') {
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin'], 'aal1');

      const { data: txns, error } = await supabase
        .from('payment_transactions')
        .select(`
          id,
          workspace_id,
          amount_inr,
          status,
          gateway_order_id,
          gateway_payment_id,
          created_at,
          workspaces (company_name, owner_email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: txns || [] }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Inbound Payment Gateway Webhook (Youpi PG / Authoritative Settlement)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/webhooks/payment' && req.method === 'POST') {
    try {
      const clientIp = req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(`wh_ip:${clientIp}`, 100)) {
        const err = new Error('Rate limit exceeded for inbound payment webhooks.');
        err.statusCode = 429;
        err.code = 'RATE_LIMIT_EXCEEDED';
        throw err;
      }

      const rawBody = await readBoundedBody(req);
      if (!rawBody) {
        const err = new Error('Empty webhook payload received.');
        err.statusCode = 400;
        err.code = 'EMPTY_PAYLOAD';
        throw err;
      }

      // 1. Validate Signature Format & Verification with YOUPI_WEBHOOK_SECRET
      const signature = (
        req.headers['x-youpi-signature'] || 
        req.headers['x-webhook-signature'] || 
        req.headers['x-signature'] || 
        ''
      ).trim().toLowerCase();

      if (!signature) {
        const err = new Error('Missing payment webhook HMAC signature header (X-Youpi-Signature)');
        err.statusCode = 401;
        err.code = 'WEBHOOK_SIGNATURE_MISSING';
        throw err;
      }

      if (!/^[0-9a-f]{64}$/.test(signature)) {
        const err = new Error('Invalid webhook signature format: must be 64-character lowercase hex');
        err.statusCode = 401;
        err.code = 'INVALID_WEBHOOK_SIGNATURE';
        throw err;
      }

      const expectedSig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex').toLowerCase();
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expectedSig, 'hex');

      if (sigBuf.length !== 32 || expBuf.length !== 32 || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        const err = new Error('Payment webhook HMAC signature verification failed');
        err.statusCode = 401;
        err.code = 'INVALID_WEBHOOK_SIGNATURE';
        throw err;
      }

      // 2. Timestamp Skew Validation (Max 5 minutes)
      const timestampHeader = req.headers['x-webhook-timestamp'] || req.headers['x-timestamp'];
      if (timestampHeader) {
        const reqTimeMs = isNaN(timestampHeader) 
          ? new Date(timestampHeader).getTime() 
          : (Number(timestampHeader) > 1e11 ? Number(timestampHeader) : Number(timestampHeader) * 1000);
        if (isNaN(reqTimeMs) || Math.abs(Date.now() - reqTimeMs) > 300000) {
          const err = new Error('Payment webhook timestamp skewed beyond allowable 5-minute window');
          err.statusCode = 401;
          err.code = 'WEBHOOK_TIMESTAMP_EXPIRED';
          throw err;
        }
      }

      // 3. Payload Parsing & Field Validation
      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        const err = new Error('Invalid JSON webhook body');
        err.statusCode = 400;
        err.code = 'INVALID_JSON';
        throw err;
      }

      const {
        redemption_id,
        transaction_reference,
        amount_paid,
        gateway_provider = 'youpi_pg',
        currency = 'INR',
        provider_status = 'captured',
        payment_authorized_at = new Date().toISOString(),
        provider_payload = {}
      } = payload;

      if (!redemption_id || !transaction_reference || amount_paid === undefined) {
        const err = new Error('Missing required webhook fields: redemption_id, transaction_reference, amount_paid');
        err.statusCode = 400;
        err.code = 'MISSING_REQUIRED_FIELDS';
        throw err;
      }

      // 4. Invoke Authoritative Database Settlement RPC via Service Role
      const { data, error } = await supabase.rpc('settle_coupon_payment', {
        p_redemption_id: redemption_id,
        p_transaction_reference: String(transaction_reference),
        p_gateway_provider: gateway_provider,
        p_amount_paid: Number(amount_paid),
        p_currency: currency,
        p_provider_payload: typeof provider_payload === 'object' ? provider_payload : { raw: provider_payload },
        p_payment_authorized_at: payment_authorized_at,
        p_provider_status: provider_status
      });

      if (error) {
        throw error;
      }

      // 5. Handle settlement outcome
      if (data && data.success === false) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data || { success: true, message: 'Payment settled successfully' }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }


  // ---------------------------------------------------------------------------
  // Route: Workspace Subscription Management Action (Upgrade, Downgrade, Overrides)
  // ---------------------------------------------------------------------------
  const wsSubManageMatch = url.pathname.match(/^\/api\/v1\/workspaces\/([0-9a-f-]{36})\/subscription$/i);
  if (wsSubManageMatch && req.method === 'POST') {
    try {
      const wsId = wsSubManageMatch[1];
      const { admin, sessionAal } = await authorizeAdmin(req, ['super_admin', 'billing_admin'], 'aal1');
      const rawBody = await readBoundedBody(req);
      const body = JSON.parse(rawBody || '{}');
      const {
        action,
        plan_id,
        billing_interval = 'monthly',
        custom_price_inr,
        override_reason,
        override_days = 365,
        extension_days = 14,
        coupon_code
      } = body;

      if (!action) {
        const err = new Error('Action is required for workspace subscription management');
        err.statusCode = 400;
        throw err;
      }

      // Fetch current workspace and subscription
      const { data: currentSub, error: subFetchErr } = await supabase
        .from('workspace_subscriptions')
        .select('*, subscription_plans(*)')
        .eq('workspace_id', wsId)
        .single();

      if (subFetchErr || !currentSub) {
        const err = new Error('No active subscription found for this workspace');
        err.statusCode = 404;
        throw err;
      }

      const updateData = { updated_at: new Date().toISOString() };
      let eventType = action;
      let reasonText = override_reason || `Administrative action: ${action}`;
      let prevPrice = currentSub.custom_price_inr || currentSub.subscription_plans?.price_monthly_inr;
      let newPrice = prevPrice;

      if (action === 'change_plan' || action === 'upgrade' || action === 'downgrade') {
        if (!plan_id) throw new Error('plan_id is required');
        const { data: targetPlan } = await supabase.from('subscription_plans').select('*').eq('id', plan_id).single();
        if (!targetPlan) throw new Error(`Target plan '${plan_id}' does not exist`);

        updateData.plan_id = plan_id;
        updateData.billing_interval = billing_interval;
        updateData.status = 'active';
        updateData.current_period_start = new Date().toISOString();
        const durationMonths = billing_interval === 'annual' ? 12 : 1;
        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + durationMonths);
        updateData.current_period_end = periodEnd.toISOString();
        newPrice = billing_interval === 'annual' ? targetPlan.price_annual_inr : targetPlan.price_monthly_inr;
      } else if (action === 'extend_trial') {
        const currentTrialEnd = new Date(currentSub.trial_end || Date.now());
        const newTrialEnd = new Date(currentTrialEnd.getTime() + (Number(extension_days || 14) * 86400000));
        updateData.trial_end = newTrialEnd.toISOString();
        updateData.current_period_end = newTrialEnd.toISOString();
        updateData.status = 'trialing';
      } else if (action === 'extend_expiry') {
        const currentEnd = new Date(currentSub.current_period_end || Date.now());
        const newEnd = new Date(currentEnd.getTime() + (Number(extension_days || 30) * 86400000));
        updateData.current_period_end = newEnd.toISOString();
      } else if (action === 'assign_custom_price') {
        if (custom_price_inr === undefined || custom_price_inr === null) {
          throw new Error('custom_price_inr is required for custom price override');
        }
        const expiry = new Date(Date.now() + (Number(override_days || 365) * 86400000));
        updateData.custom_price_inr = Number(custom_price_inr);
        updateData.override_reason = override_reason || 'Custom negotiated corporate pricing';
        updateData.override_admin_id = admin.id;
        updateData.override_expires_at = expiry.toISOString();
        updateData.original_plan_price_inr = currentSub.subscription_plans?.price_monthly_inr || 0;
        updateData.effective_price_inr = Number(custom_price_inr);
        updateData.pricing_model = 'custom_negotiated';
        newPrice = Number(custom_price_inr);
      } else if (action === 'cancel_at_period_end') {
        updateData.cancel_at_period_end = true;
      } else {
        throw new Error(`Unknown subscription action '${action}'`);
      }

      // Update workspace_subscriptions
      const { data: updatedSub, error: updateErr } = await supabase
        .from('workspace_subscriptions')
        .update(updateData)
        .eq('id', currentSub.id)
        .select('*, subscription_plans(*)')
        .single();

      if (updateErr) throw updateErr;

      // Insert into workspace_subscription_events
      await supabase.from('workspace_subscription_events').insert({
        workspace_id: wsId,
        event_type: eventType,
        old_plan_id: currentSub.plan_id,
        new_plan_id: updateData.plan_id || currentSub.plan_id,
        admin_id: admin.id,
        reason: reasonText,
        previous_price_inr: prevPrice ? Number(prevPrice) : null,
        new_price_inr: newPrice ? Number(newPrice) : null,
        metadata: { action, updateData, adminEmail: admin.email }
      });

      // Insert platform audit log
      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: `WORKSPACE_SUBSCRIPTION_${action.toUpperCase()}`,
        target_workspace_id: wsId,
        details: { action, old_plan: currentSub.plan_id, new_plan: updateData.plan_id, newPrice, reason: reasonText },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: `Subscription ${action} processed successfully`,
        data: updatedSub
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Subscription Plans Management (List, Create, Update, Archive)
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/plans' && req.method === 'GET') {
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent'], 'aal1');

      const { data: plans, error: planErr } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('price_monthly_inr', { ascending: true });

      if (planErr) throw planErr;

      // Count active subscribers for each plan
      const { data: subs } = await supabase
        .from('workspace_subscriptions')
        .select('plan_id, status, billing_interval');

      const activeCounts = {};
      const mrrMap = {};
      (subs || []).forEach(s => {
        if (s.status === 'active' || s.status === 'trialing') {
          activeCounts[s.plan_id] = (activeCounts[s.plan_id] || 0) + 1;
        }
      });

      const enrichedPlans = (plans || []).map(p => {
        const subCount = activeCounts[p.id] || 0;
        const estMrr = subCount * Number(p.price_monthly_inr || 0);
        return {
          ...p,
          priceMonthlyInr: Number(p.price_monthly_inr),
          priceAnnualInr: Number(p.price_annual_inr),
          activeSubscribers: subCount,
          estimatedMonthlyRevenueInr: estMrr,
          features: Array.isArray(p.features) ? p.features : [],
          usageLimits: p.usage_limits || {}
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: enrichedPlans
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  if (url.pathname === '/api/v1/plans' && req.method === 'POST') {
    try {
      const { admin } = await authorizeAdmin(req, ['super_admin'], 'aal1');
      const rawBody = await readBoundedBody(req);
      const body = JSON.parse(rawBody || '{}');
      const {
        id,
        name,
        tagline,
        price_monthly_inr,
        price_annual_inr,
        allowed_platforms = ['web'],
        max_users = 1,
        max_branches = 1,
        features = [],
        usage_limits = {},
        trial_days = 14,
        sort_order = 0
      } = body;

      if (!id || !name || price_monthly_inr === undefined || price_annual_inr === undefined) {
        const err = new Error('Plan id, name, price_monthly_inr, and price_annual_inr are required');
        err.statusCode = 400;
        throw err;
      }

      const planKey = id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

      const { data: newPlan, error } = await supabase
        .from('subscription_plans')
        .insert({
          id: planKey,
          name: name.trim(),
          tagline: tagline || null,
          price_monthly_inr: Number(price_monthly_inr),
          price_annual_inr: Number(price_annual_inr),
          allowed_platforms,
          max_users: Number(max_users || 1),
          max_branches: Number(max_branches || 1),
          features: Array.isArray(features) ? features : [],
          usage_limits: typeof usage_limits === 'object' ? usage_limits : {},
          trial_days: Number(trial_days || 14),
          sort_order: Number(sort_order || 0),
          is_active: true,
          is_archived: false
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'SUBSCRIPTION_PLAN_CREATED',
        details: { plan_id: planKey, name: newPlan.name, monthly: newPlan.price_monthly_inr, annual: newPlan.price_annual_inr },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Subscription plan created successfully',
        data: newPlan
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // Update Plan (PUT /api/v1/plans or /api/v1/plans/:id)
  const planUpdateMatch = url.pathname.match(/^\/api\/v1\/plans(?:\/([a-z0-9_]+))?$/i);
  if (planUpdateMatch && req.method === 'PUT') {
    try {
      const { admin } = await authorizeAdmin(req, ['super_admin'], 'aal1');
      const rawBody = await readBoundedBody(req);
      const body = JSON.parse(rawBody || '{}');
      const planId = planUpdateMatch[1] || body.id;

      if (!planId) throw new Error('Plan id is required for update');

      const updateFields = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) updateFields.name = body.name.trim();
      if (body.tagline !== undefined) updateFields.tagline = body.tagline;
      if (body.price_monthly_inr !== undefined) updateFields.price_monthly_inr = Number(body.price_monthly_inr);
      if (body.price_annual_inr !== undefined) updateFields.price_annual_inr = Number(body.price_annual_inr);
      if (body.allowed_platforms !== undefined) updateFields.allowed_platforms = body.allowed_platforms;
      if (body.max_users !== undefined) updateFields.max_users = Number(body.max_users);
      if (body.max_branches !== undefined) updateFields.max_branches = Number(body.max_branches);
      if (body.features !== undefined) updateFields.features = body.features;
      if (body.usage_limits !== undefined) updateFields.usage_limits = body.usage_limits;
      if (body.trial_days !== undefined) updateFields.trial_days = Number(body.trial_days);
      if (body.sort_order !== undefined) updateFields.sort_order = Number(body.sort_order);
      if (body.is_active !== undefined) updateFields.is_active = Boolean(body.is_active);

      const { data: updated, error } = await supabase
        .from('subscription_plans')
        .update(updateFields)
        .eq('id', planId)
        .select()
        .single();

      if (error) throw error;

      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'SUBSCRIPTION_PLAN_UPDATED',
        details: { plan_id: planId, updates: updateFields },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Plan updated successfully',
        data: updated
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // Archive Plan
  const planArchiveMatch = url.pathname.match(/^\/api\/v1\/plans\/([a-z0-9_]+)\/archive$/i);
  if (planArchiveMatch && req.method === 'POST') {
    try {
      const planId = planArchiveMatch[1];
      const { admin } = await authorizeAdmin(req, ['super_admin'], 'aal1');

      const { data: updated, error } = await supabase
        .from('subscription_plans')
        .update({ is_archived: true, is_active: false, updated_at: new Date().toISOString() })
        .eq('id', planId)
        .select()
        .single();

      if (error) throw error;

      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'SUBSCRIPTION_PLAN_ARCHIVED',
        details: { plan_id: planId },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: `Plan '${planId}' archived successfully`,
        data: updated
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Promotional Offers & Discounts Management
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/offers' && req.method === 'GET') {
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent'], 'aal1');

      const { data: offers, error } = await supabase
        .from('coupons')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch redemptions count
      const { data: redemptions } = await supabase
        .from('coupon_redemptions')
        .select('coupon_id, status');

      const redemptionCounts = {};
      (redemptions || []).forEach(r => {
        if (r.status === 'redeemed') {
          redemptionCounts[r.coupon_id] = (redemptionCounts[r.coupon_id] || 0) + 1;
        }
      });

      const enrichedOffers = (offers || []).map(o => ({
        ...o,
        redemptionCount: redemptionCounts[o.id] || 0,
        discountValue: Number(o.discount_value || 0),
        promotionalPriceInr: o.promotional_price_inr ? Number(o.promotional_price_inr) : null,
        maxDiscountAmount: o.max_discount_amount ? Number(o.max_discount_amount) : null,
        minPurchaseAmount: o.min_purchase_amount ? Number(o.min_purchase_amount) : 0,
        applicablePlans: o.applicable_plans || ['all'],
        applicableIntervals: o.applicable_intervals || ['all']
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: enrichedOffers
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  if (url.pathname === '/api/v1/offers' && req.method === 'POST') {
    try {
      const { admin } = await authorizeAdmin(req, ['super_admin', 'billing_admin'], 'aal1');
      const rawBody = await readBoundedBody(req);
      const body = JSON.parse(rawBody || '{}');
      const {
        code,
        name,
        description,
        discount_type,
        discount_value,
        promotional_price_inr,
        max_discount_amount,
        min_purchase_amount = 0,
        applicable_plans = ['all'],
        applicable_intervals = ['all'],
        customer_eligibility = 'all',
        valid_from = new Date().toISOString(),
        valid_until,
        max_total_redemptions,
        max_redemptions_per_workspace = 1,
        target_workspace_id = null,
        is_public = true,
        banner_text = null,
        priority = 0
      } = body;

      if (!code || !name || !discount_type) {
        const err = new Error('Offer code, name, and discount_type are required');
        err.statusCode = 400;
        throw err;
      }

      if (discount_type === 'percentage' && (Number(discount_value) <= 0 || Number(discount_value) > 100)) {
        throw new Error('Percentage discount must be between 1 and 100%');
      }

      const { data: newOffer, error } = await supabase
        .from('coupons')
        .insert({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          description: description || null,
          discount_type,
          discount_value: Number(discount_value || 0),
          promotional_price_inr: promotional_price_inr ? Number(promotional_price_inr) : null,
          max_discount_amount: max_discount_amount ? Number(max_discount_amount) : null,
          min_purchase_amount: Number(min_purchase_amount || 0),
          applicable_plans,
          applicable_intervals,
          customer_eligibility,
          valid_from,
          valid_until: valid_until || null,
          max_total_redemptions: max_total_redemptions ? Number(max_total_redemptions) : null,
          max_redemptions_per_workspace: Number(max_redemptions_per_workspace || 1),
          target_workspace_id: target_workspace_id || null,
          is_public: Boolean(is_public),
          banner_text: banner_text || null,
          priority: Number(priority || 0),
          is_active: true,
          created_by: admin.id
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'PROMOTIONAL_OFFER_CREATED',
        details: { code: newOffer.code, discount_type, discount_value },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Promotional offer created successfully',
        data: newOffer
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // Toggle Offer Active Status
  const offerToggleMatch = url.pathname.match(/^\/api\/v1\/offers\/([0-9a-f-]{36})\/toggle$/i);
  if (offerToggleMatch && req.method === 'POST') {
    try {
      const offerId = offerToggleMatch[1];
      const { admin } = await authorizeAdmin(req, ['super_admin', 'billing_admin'], 'aal1');

      const { data: existing } = await supabase.from('coupons').select('id, is_active, code').eq('id', offerId).single();
      if (!existing) throw new Error('Offer not found');

      const newStatus = !existing.is_active;
      const { data: updated, error } = await supabase
        .from('coupons')
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq('id', offerId)
        .select()
        .single();

      if (error) throw error;

      await supabase.from('platform_audit_logs').insert({
        admin_id: admin.id,
        admin_email: admin.email,
        admin_role: admin.role,
        action: 'PROMOTIONAL_OFFER_TOGGLED',
        details: { offerId, code: existing.code, is_active: newStatus },
        client_ip: req.socket.remoteAddress || '127.0.0.1'
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: `Offer '${existing.code}' is now ${newStatus ? 'active' : 'inactive'}`,
        data: updated
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // ---------------------------------------------------------------------------
  // Route: Authoritative Server-Side Pricing Engine Preview
  // ---------------------------------------------------------------------------
  if (url.pathname === '/api/v1/pricing/preview' && req.method === 'POST') {
    try {
      await authorizeAdmin(req, ['super_admin', 'billing_admin', 'support_agent'], 'aal1');
      const rawBody = await readBoundedBody(req);
      const body = JSON.parse(rawBody || '{}');
      const {
        plan_id,
        billing_cycle = 'monthly',
        workspace_id = null,
        coupon_code = null,
        custom_price_inr = null
      } = body;

      if (!plan_id) {
        throw new Error('plan_id is required for pricing preview');
      }

      // Fetch plan
      const { data: plan, error: planErr } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', plan_id)
        .single();

      if (planErr || !plan) {
        throw new Error(`Plan '${plan_id}' does not exist`);
      }

      // Fetch coupon if specified
      let coupon = null;
      if (coupon_code) {
        const { data: cData } = await supabase
          .from('coupons')
          .select('*')
          .eq('code', coupon_code.trim().toUpperCase())
          .single();

        if (cData) {
          const eligibility = validateOfferEligibility(cData, plan_id, billing_cycle, workspace_id);
          if (!eligibility.eligible) {
            throw new Error(eligibility.reason || 'Offer cannot be applied to this plan selection');
          }
          coupon = cData;
        } else {
          throw new Error(`Coupon code '${coupon_code}' is invalid`);
        }
      }

      // Check workspace override if workspace_id provided
      let workspaceOverride = null;
      if (custom_price_inr !== null && custom_price_inr !== undefined) {
        workspaceOverride = {
          custom_price_inr: Number(custom_price_inr),
          override_reason: 'Manual preview negotiated price'
        };
      } else if (workspace_id) {
        const { data: sub } = await supabase
          .from('workspace_subscriptions')
          .select('custom_price_inr, override_reason, override_expires_at')
          .eq('workspace_id', workspace_id)
          .single();

        if (sub && sub.custom_price_inr) {
          workspaceOverride = sub;
        }
      }

      const breakdown = calculateSubscriptionPrice({
        plan,
        billingCycle: billing_cycle,
        coupon,
        workspaceOverride,
        gstRatePercent: 18
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: breakdown
      }));
    } catch (err) {
      sendSafeError(res, err);
    }
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'NOT_FOUND', message: `Route ${req.method} ${url.pathname} not implemented in Phase 4.1 test harness` }));
});

// Start listening if run directly
if (process.argv[1] && process.argv[1].endsWith('gateway.mjs')) {
  server.listen(port, '0.0.0.0', () => {
    console.log(`[Gateway BFF] Successfully listening on port ${port} (Environment: ${nodeEnv}, Staging Ref: ${stagingProjectRef})`);
  });
}

// Graceful termination handlers
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
