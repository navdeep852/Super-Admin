import assert from 'assert';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import {
  evaluateProductionSafeguards,
  getReportingConnector,
  StagingReportingConnector,
  ProductionReportingConnector,
  ALLOWED_ENVIRONMENTS
} from '../server/connectors/reportingConnector.mjs';

const env = fs.readFileSync('.env.staging', 'utf8');
const getVar = (k) => { 
  const m = env.match(new RegExp(`^${k}\\s*=\\s*(.+)`, 'm')); 
  return m ? m[1].trim() : ''; 
};

const STAGING_URL = getVar('GATEWAY_SUPABASE_URL');
const STAGING_KEY = getVar('GATEWAY_SUPABASE_SERVICE_ROLE_KEY');

const stagingClient = createClient(STAGING_URL, STAGING_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runTests() {
  console.log('================================================================');
  console.log(' VISTAAR SUPER ADMIN — REPORTING CONNECTOR & SAFEGUARD TESTS');
  console.log('================================================================');

  // Test 1: Allowed Environments
  console.log('\n[TEST 1] Testing Environment Allow-List Enforcement...');
  assert.deepStrictEqual(ALLOWED_ENVIRONMENTS, ['staging', 'production']);
  assert.throws(() => {
    getReportingConnector({ environment: 'development', stagingClient });
  }, /Invalid connector environment 'development'/);
  console.log('  ✓ Only staging and production environments permitted');

  // Test 2: Fail-Closed Production Safeguards Evaluation
  console.log('\n[TEST 2] Testing Fail-Closed Safeguards Evaluation...');
  // Default process.env (should have missing gates)
  const defaultSafeguards = evaluateProductionSafeguards({});
  assert.strictEqual(defaultSafeguards.isAllowed, false);
  assert.strictEqual(defaultSafeguards.missingGates.length, 6);
  assert.ok(defaultSafeguards.missingGates.includes('auditApproved'));
  assert.ok(defaultSafeguards.missingGates.includes('ownerAuthorized'));
  console.log('  ✓ Default environment fails closed (6 of 6 gates missing)');

  // Partial gates
  const partialSafeguards = evaluateProductionSafeguards({
    PROD_AUDIT_APPROVED: 'true',
    PROD_SQL_REVIEWED: 'true'
  });
  assert.strictEqual(partialSafeguards.isAllowed, false);
  assert.strictEqual(partialSafeguards.missingGates.length, 4);
  console.log('  ✓ Partial safeguards fail closed (4 gates missing)');

  // Test 3: Production Connector Activation Blocking
  console.log('\n[TEST 3] Testing Production Connector Activation Blocking...');
  assert.throws(() => {
    getReportingConnector({
      environment: 'production',
      stagingClient,
      env: {}
    });
  }, (err) => {
    assert.strictEqual(err.code, 'PRODUCTION_ACTIVATION_BLOCKED');
    assert.ok(err.missingGates.length > 0);
    return true;
  });
  console.log('  ✓ Factory refuses production activation when safeguards are unfulfilled');

  // Test 4: Production Read-Only Mutation Interception
  console.log('\n[TEST 4] Testing Production Read-Only Mutation Interception...');
  // Mock full safeguards to test instance methods
  const mockApprovedSafeguards = {
    isAllowed: true,
    missingGates: []
  };
  const mockProdClient = { from: () => ({ select: () => Promise.resolve({ data: [], count: 0 }) }) };
  const prodConnector = new ProductionReportingConnector(mockProdClient, mockApprovedSafeguards);
  assert.strictEqual(prodConnector.isReadOnly, true);

  await assert.rejects(async () => {
    await prodConnector.insert();
  }, /Permission Denied: Write operation 'INSERT' is strictly prohibited/);

  await assert.rejects(async () => {
    await prodConnector.update();
  }, /Permission Denied: Write operation 'UPDATE' is strictly prohibited/);

  await assert.rejects(async () => {
    await prodConnector.delete();
  }, /Permission Denied: Write operation 'DELETE' is strictly prohibited/);

  await assert.rejects(async () => {
    await prodConnector.upsert();
  }, /Permission Denied: Write operation 'UPSERT' is strictly prohibited/);
  console.log('  ✓ All write operations (INSERT, UPDATE, DELETE, UPSERT) strictly rejected');

  // Test 5: Staging Connector Health Check
  console.log('\n[TEST 5] Testing Staging Connector Health & Connectivity...');
  const stagingConnector = getReportingConnector({ environment: 'staging', stagingClient });
  const health = await stagingConnector.getHealth();
  assert.strictEqual(health.status, 'operational');
  assert.strictEqual(health.projectRef, 'vlbhxcajphyjkeueubud');
  assert.strictEqual(health.environment, 'staging');
  assert.strictEqual(health.isReadOnly, false);
  assert.strictEqual(health.healthy, true);
  console.log(`  ✓ Staging health operational (${health.latencyMs}ms latency, Ref: ${health.projectRef})`);

  // Test 6: Staging Connector Pagination & Scoping
  console.log('\n[TEST 6] Testing Staging Connector Workspace Queries...');
  const resAll = await stagingConnector.getWorkspaces({ page: 1, limit: 10, scope: 'all' });
  assert.strictEqual(resAll.records.length, 10);
  assert.strictEqual(resAll.total, 11);
  assert.strictEqual(resAll.environment, 'staging');

  const resGen = await stagingConnector.getWorkspaces({ page: 1, limit: 10, scope: 'genuine' });
  assert.strictEqual(resGen.records.length, 0);
  assert.strictEqual(resGen.total, 0);

  const resTest = await stagingConnector.getWorkspaces({ page: 1, limit: 20, scope: 'test' });
  assert.strictEqual(resTest.records.length, 11);
  assert.strictEqual(resTest.total, 11);
  console.log('  ✓ Staging connector respects pagination and scope boundaries (genuine: 0, test: 11)');

  // Test 7: Query Timeout Verification
  console.log('\n[TEST 7] Testing Query Timeout Abstraction...');
  stagingConnector.queryTimeoutMs = 50; // Set low timeout for testing
  const slowPromise = new Promise(resolve => setTimeout(resolve, 200));
  await assert.rejects(async () => {
    await stagingConnector.withTimeout(slowPromise, 'SlowOperation');
  }, (err) => {
    assert.strictEqual(err.code, 'DB_TIMEOUT');
    assert.strictEqual(err.statusCode, 504);
    return true;
  });
  console.log('  ✓ Query timeout cleanly aborts slow queries with HTTP 504 DB_TIMEOUT');

  // Test 8: Sync Timestamp Tracking
  console.log('\n[TEST 8] Testing Synchronization Timestamp Tracking...');
  stagingConnector.queryTimeoutMs = 8000;
  await stagingConnector.getWorkspaces({ page: 1, limit: 1 });
  const syncTime = stagingConnector.getLastSyncTimestamp();
  assert.ok(syncTime !== null);
  assert.ok(new Date(syncTime).getTime() <= Date.now());
  console.log(`  ✓ Successful query recorded sync timestamp: ${syncTime}`);

  console.log('\n================================================================');
  console.log(' 🎉 ALL REPORTING CONNECTOR & SAFEGUARD TESTS PASSED (8/8)');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
