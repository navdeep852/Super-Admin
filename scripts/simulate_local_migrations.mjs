import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import fs from 'node:fs';
import path from 'node:path';

async function runSimulation() {
  console.log('=== STARTING LOCAL POSTGRESQL SIMULATION (PGLite WASM) ===');
  
  // Initialize PGlite with pgcrypto and uuid-ossp contrib extensions
  const db = new PGlite({
    extensions: {
      pgcrypto,
      uuid_ossp
    }
  });

  // 1. Setup Supabase mock environment (auth schema, auth.users table, auth.role() function, auth.uid() function, standard roles)
  console.log('1. Setting up mock Supabase auth schema and functions...');
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS extensions;
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
      )::text;
    $$;

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid;
    $$;

    -- Provision mock users in auth.users (simulating GoTrue Auth Admin API provisioning)
    INSERT INTO auth.users (id, email) VALUES 
      ('11111111-1111-1111-1111-111111111111'::UUID, 'synthetic.admin@staging.vistaar.internal'),
      ('99999999-9999-9999-9999-999999999999'::UUID, 'synthetic.unrelated@staging.vistaar.internal'),
      ('33333333-3333-3333-3333-333333333333'::UUID, 'synthetic.conflict.admin@staging.vistaar.internal'),
      ('88888888-8888-8888-8888-888888888888'::UUID, 'root.superadmin@staging.vistaar.internal'),
      ('77777777-7777-7777-7777-777777777777'::UUID, 'unauthorized@gmail.com')
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

    -- Set session test GUC parameters
    SELECT set_config('test.root_admin_user_id', '88888888-8888-8888-8888-888888888888', false);
    SELECT set_config('test.auth_admin_user_id', '11111111-1111-1111-1111-111111111111', false);
    SELECT set_config('test.unrelated_user_id', '99999999-9999-9999-9999-999999999999', false);
    SELECT set_config('test.conflict_admin_user_id', '33333333-3333-3333-3333-333333333333', false);
    SELECT set_config('app.settings.gateway_assertion_secret', 'test_gcap_secret_key_32_bytes_super_secure', false);
    SELECT set_config('app.settings.platform_bootstrap_secret', 'test_bootstrap_secret_key_32_bytes_super_secure', false);
  `);

  // 2. Read migration files
  const baselineSql = fs.readFileSync(path.resolve('migrations/000_baseline_schema_snapshot.sql'), 'utf-8');
  const mig077Sql = fs.readFileSync(path.resolve('migrations/077_super_admin_infrastructure.sql'), 'utf-8');
  const mig078Sql = fs.readFileSync(path.resolve('migrations/078_coupon_and_promotional_campaign_system.sql'), 'utf-8');
  const testSuiteSql = fs.readFileSync(path.resolve('tests/staging_test_suite.sql'), 'utf-8');

  // Test 000
  console.log('\n2. Executing 000_baseline_schema_snapshot.sql...');
  try {
    await db.exec(baselineSql);
    console.log('   -> 000_baseline_schema_snapshot.sql executed SUCCESSFULLY.');
  } catch (err) {
    console.error('   -> ERROR in 000_baseline_schema_snapshot.sql:', err.message);
    process.exit(1);
  }

  // Test 077
  console.log('\n3. Executing 077_super_admin_infrastructure.sql...');
  try {
    await db.exec(mig077Sql);
    console.log('   -> 077_super_admin_infrastructure.sql executed SUCCESSFULLY.');
  } catch (err) {
    console.error('   -> ERROR in 077_super_admin_infrastructure.sql:', err.message);
    process.exit(1);
  }

  // Test 078
  console.log('\n4. Executing 078_coupon_and_promotional_campaign_system.sql...');
  try {
    await db.exec(mig078Sql);
    console.log('   -> 078_coupon_and_promotional_campaign_system.sql executed SUCCESSFULLY.');
  } catch (err) {
    console.error('   -> ERROR in 078_coupon_and_promotional_campaign_system.sql:', err.message);
    process.exit(1);
  }

  // 5. Inspect Created Public Tables & RLS Status
  console.log('\n5. Inspecting Created Public Tables & RLS Status...');
  const tables = await db.query(`
    SELECT c.relname as table_name, c.relrowsecurity as rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname;
  `);
  console.log('   Public tables count:', tables.rows.length);
  for (const t of tables.rows) {
    console.log(`   - ${t.table_name} (RLS enabled: ${t.rls_enabled})`);
  }

  // 6. Inspect Function Privileges and search_path Settings
  console.log('\n6. Inspecting Function Privileges & search_path Settings...');
  const privs = await db.query(`
    SELECT 
        p.proname,
        p.prosecdef AS is_security_definer,
        p.proconfig AS function_settings,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
        has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
      AND p.proname IN (
        'cleanup_expired_gcap_nonces',
        'enforce_platform_audit_immutability',
        'super_admin_get_platform_metrics',
        'super_admin_suspend_workspace',
        'super_admin_reactivate_workspace',
        'validate_and_reserve_coupon',
        'activate_zero_payable_subscription',
        'settle_coupon_payment',
        'super_admin_provision_platform_admin',
        'super_admin_bootstrap_initial_admin',
        'super_admin_create_admin_invitation',
        'super_admin_enroll_mfa',
        'super_admin_revoke_mfa'
      )
    ORDER BY p.proname;
  `);
  for (const r of privs.rows) {
    console.log(`   - ${r.proname}:`);
    console.log(`     security_definer: ${r.is_security_definer}, settings: ${JSON.stringify(r.function_settings)}`);
    console.log(`     anon: ${r.anon_execute}, authenticated: ${r.authenticated_execute}, service_role: ${r.service_role_execute}, public: ${r.public_execute}`);
  }

  // 7. Test staging_test_suite.sql directly from disk
  console.log('\n7. Executing tests/staging_test_suite.sql directly from disk...');
  const cleanTestSuite = testSuiteSql.replace(/\\set[^\n]*/g, '');
  await db.exec(cleanTestSuite);
  console.log('   -> tests/staging_test_suite.sql executed ALL 16 TESTS SUCCESSFULLY in single transaction.');

  console.log('\n=== SIMULATION PASSED: ALL 16 TESTS & 3 MIGRATIONS VERIFIED ===');
  process.exit(0);
}

runSimulation().catch(e => {
  console.error('Fatal simulation error:', e);
  process.exit(1);
});
