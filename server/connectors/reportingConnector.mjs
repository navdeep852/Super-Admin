// ==============================================================================
// VISTAAR Super Admin — Reporting Connector Abstraction & Release Safeguards
// Version: 1.0.0 (Phase 4.3 Production Read-Only Architecture)
// ==============================================================================

import { createClient } from '@supabase/supabase-js';

// Environment Allow-List
export const ALLOWED_ENVIRONMENTS = Object.freeze(['staging', 'production']);

// Fail-Closed Production Activation Safeguard Gates
export const REQUIRED_PRODUCTION_SAFEGUARDS = Object.freeze([
  'auditApproved',
  'sqlReviewed',
  'roleReviewed',
  'credentialsProvisioned',
  'ownerAuthorized',
  'configChecked'
]);

/**
 * Evaluates the 6 mandatory production activation gates.
 * Production connection remains FAIL-CLOSED unless every gate evaluates to TRUE.
 */
export function evaluateProductionSafeguards(env = process.env) {
  const gates = {
    auditApproved: env.PROD_AUDIT_APPROVED === 'true',
    sqlReviewed: env.PROD_SQL_REVIEWED === 'true',
    roleReviewed: env.PROD_ROLE_REVIEWED === 'true',
    credentialsProvisioned: Boolean(
      env.PROD_READONLY_DATABASE_URL || 
      (env.PROD_SUPABASE_URL && env.PROD_READONLY_KEY)
    ),
    ownerAuthorized: env.PROD_OWNER_AUTHORIZED === 'true' && 
      typeof env.PROD_OWNER_AUTH_HASH === 'string' && 
      env.PROD_OWNER_AUTH_HASH.length === 64,
    configChecked: env.PROD_CONFIG_INDEPENDENTLY_CHECKED === 'true'
  };

  const missingGates = Object.entries(gates)
    .filter(([_, passed]) => !passed)
    .map(([gate]) => gate);

  return {
    isAllowed: missingGates.length === 0,
    gates,
    missingGates,
    evaluatedAt: new Date().toISOString()
  };
}

/**
 * Base Abstract Reporting Connector Interface
 */
export class BaseReportingConnector {
  constructor(environment) {
    if (!ALLOWED_ENVIRONMENTS.includes(environment)) {
      const err = new Error(`Invalid connector environment '${environment}'. Must be one of: ${ALLOWED_ENVIRONMENTS.join(', ')}`);
      err.code = 'INVALID_ENVIRONMENT';
      err.statusCode = 500;
      throw err;
    }
    this.environment = environment;
    this.lastSuccessfulSyncTimestamp = null;
    this.queryTimeoutMs = 8000;
  }

  getLastSyncTimestamp() {
    return this.lastSuccessfulSyncTimestamp;
  }

  recordSyncSuccess() {
    this.lastSuccessfulSyncTimestamp = new Date().toISOString();
  }

  // Wrap query with strict timeout to prevent connection pool exhaustion
  async withTimeout(promise, operationName = 'Query') {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`${operationName} timed out after ${this.queryTimeoutMs}ms`);
        err.code = 'DB_TIMEOUT';
        err.statusCode = 504;
        reject(err);
      }, this.queryTimeoutMs);
    });

    try {
      const res = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timer);
      this.recordSyncSuccess();
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  assertReadOnly() {
    // Overridden by production connector to block mutations
  }
}

/**
 * Concrete Staging Reporting Connector
 * Connects to Staging Supabase (vlbhxcajphyjkeueubud)
 */
export class StagingReportingConnector extends BaseReportingConnector {
  constructor(client) {
    super('staging');
    if (!client) {
      const err = new Error('Staging client instance is required');
      err.code = 'MISSING_CLIENT';
      throw err;
    }
    this.client = client;
    this.projectRef = 'vlbhxcajphyjkeueubud';
    this.isReadOnly = false; // Staging allows administrative management
  }

  async getHealth() {
    const start = Date.now();
    try {
      const { count, error } = await this.client
        .from('workspaces')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;

      return {
        status: 'operational',
        environment: 'staging',
        projectRef: this.projectRef,
        isReadOnly: this.isReadOnly,
        latencyMs: Date.now() - start,
        lastSuccessfulSync: this.lastSuccessfulSyncTimestamp,
        healthy: true
      };
    } catch (err) {
      return {
        status: 'degraded',
        environment: 'staging',
        projectRef: this.projectRef,
        isReadOnly: this.isReadOnly,
        latencyMs: Date.now() - start,
        error: err.message,
        healthy: false
      };
    }
  }

  async getWorkspaces({ page = 1, limit = 20, scope = 'all', search = '', status = 'all', sortBy = 'created_at', sortOrder = 'desc' } = {}) {
    const safePage = Math.max(1, parseInt(page, 10));
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const from = (safePage - 1) * safeLimit;
    const to = from + safeLimit - 1;

    let query = this.client
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
        created_at,
        updated_at,
        business_settings (legal_name, gstin, address, city, state),
        workspace_subscriptions (id, plan_id, status, trial_end, current_period_end, billing_interval, subscription_plans (*))
      `, { count: 'exact' })
      .is('deleted_at', null);

    if (scope === 'genuine') {
      query = query.eq('is_test', false);
    } else if (scope === 'test') {
      query = query.eq('is_test', true);
    }

    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'suspended') {
      query = query.eq('is_active', false);
    }

    if (search && search.trim()) {
      const clean = search.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
      if (isUuid) {
        query = query.or(`id.eq.${clean},company_name.ilike.%${clean}%,owner_name.ilike.%${clean}%,owner_email.ilike.%${clean}%`);
      } else {
        query = query.or(`company_name.ilike.%${clean}%,owner_name.ilike.%${clean}%,owner_email.ilike.%${clean}%`);
      }
    }

    query = query.order(sortBy === 'name' ? 'company_name' : 'created_at', { ascending: sortOrder === 'asc' });
    query = query.range(from, to);

    const { data, count, error } = await this.withTimeout(query, 'getWorkspaces');
    if (error) throw error;

    return {
      records: data || [],
      total: count || 0,
      page: safePage,
      limit: safeLimit,
      scope,
      environment: 'staging'
    };
  }
}

/**
 * Concrete Production Reporting Connector (Fail-Closed, Read-Only)
 * Target: kluxsykimnjivkqxelba via dedicated v_super_admin_reporting role
 */
export class ProductionReportingConnector extends BaseReportingConnector {
  constructor(readOnlyClient, safeguards) {
    super('production');
    
    // Strict Guard: Verify all safeguards prior to instantiation
    if (!safeguards || !safeguards.isAllowed) {
      const missing = safeguards?.missingGates?.join(', ') || 'ALL_GATES';
      const err = new Error(`Production Reporting Connector activation blocked: Unresolved security safeguards [${missing}]`);
      err.code = 'PRODUCTION_ACTIVATION_BLOCKED';
      err.statusCode = 403;
      err.missingGates = safeguards?.missingGates;
      throw err;
    }

    if (!readOnlyClient) {
      const err = new Error('Production read-only client connection is required');
      err.code = 'MISSING_PROD_CLIENT';
      throw err;
    }

    this.client = readOnlyClient;
    this.projectRef = 'kluxsykimnjivkqxelba';
    this.isReadOnly = true;
  }

  // Strict Read-Only Mutation Interceptor
  assertReadOnly(operationName = 'Operation') {
    const err = new Error(`Permission Denied: Write operation '${operationName}' is strictly prohibited on production reporting connector`);
    err.code = 'READ_ONLY_VIOLATION';
    err.statusCode = 403;
    throw err;
  }

  // Mutation methods strictly disabled
  async insert() { this.assertReadOnly('INSERT'); }
  async update() { this.assertReadOnly('UPDATE'); }
  async delete() { this.assertReadOnly('DELETE'); }
  async upsert() { this.assertReadOnly('UPSERT'); }

  async getHealth() {
    const start = Date.now();
    try {
      // Queries exclusively approved reporting view
      const { count, error } = await this.client
        .from('v_report_platform_kpi_aggregates')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;

      return {
        status: 'operational',
        environment: 'production',
        projectRef: this.projectRef,
        isReadOnly: true,
        latencyMs: Date.now() - start,
        lastSuccessfulSync: this.lastSuccessfulSyncTimestamp,
        healthy: true
      };
    } catch (err) {
      return {
        status: 'degraded',
        environment: 'production',
        projectRef: this.projectRef,
        isReadOnly: true,
        latencyMs: Date.now() - start,
        error: err.message,
        healthy: false
      };
    }
  }

  async getWorkspaces({ page = 1, limit = 20, search = '', status = 'all' } = {}) {
    const safePage = Math.max(1, parseInt(page, 10));
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const from = (safePage - 1) * safeLimit;
    const to = from + safeLimit - 1;

    // Queries sanitized reporting view
    let query = this.client
      .from('v_report_workspace_directory')
      .select('*', { count: 'exact' });

    if (status === 'active') {
      query = query.eq('is_active', true);
    } else if (status === 'suspended') {
      query = query.eq('is_active', false);
    }

    if (search && search.trim()) {
      const clean = search.trim();
      query = query.or(`company_name.ilike.%${clean}%,owner_name.ilike.%${clean}%,owner_email.ilike.%${clean}%`);
    }

    query = query.range(from, to);

    const { data, count, error } = await this.withTimeout(query, 'getProductionWorkspaces');
    if (error) throw error;

    return {
      records: data || [],
      total: count || 0,
      page: safePage,
      limit: safeLimit,
      environment: 'production',
      isReadOnly: true
    };
  }
}

/**
 * Connector Factory: Returns active connector based on environment and safeguards
 */
export function getReportingConnector({ environment = 'staging', stagingClient, prodClient, env = process.env } = {}) {
  if (!ALLOWED_ENVIRONMENTS.includes(environment)) {
    const err = new Error(`Invalid connector environment '${environment}'. Must be one of: ${ALLOWED_ENVIRONMENTS.join(', ')}`);
    err.code = 'INVALID_ENVIRONMENT';
    err.statusCode = 500;
    throw err;
  }

  const safeguards = evaluateProductionSafeguards(env);

  if (environment === 'production') {
    if (!safeguards.isAllowed) {
      const err = new Error(`Cannot activate production connector. Unresolved security gates: ${safeguards.missingGates.join(', ')}`);
      err.code = 'PRODUCTION_ACTIVATION_BLOCKED';
      err.missingGates = safeguards.missingGates;
      throw err;
    }
    return new ProductionReportingConnector(prodClient, safeguards);
  }

  // Default Staging Connector
  return new StagingReportingConnector(stagingClient);
}
