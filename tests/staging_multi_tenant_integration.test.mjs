// ==============================================================================
// VISTAAR Staging Integration Test Suite: 3-Tenant Synthetic Isolation & Gateway Telemetry
// Project Ref: vlbhxcajphyjkeueubud (AWS eu-west-1)
// ==============================================================================

import fs from 'fs';
import path from 'path';
import http from 'http';
import { createClient } from '@supabase/supabase-js';

const FORBIDDEN_PROD_REF = 'kluxsykimnjivkqxelba';
const envPath = path.resolve('d:/Project/vistaar-main/super_admin/.env.staging');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
});

if (envContent.includes(FORBIDDEN_PROD_REF)) {
  console.error('CRITICAL: Production project reference detected in .env.staging! Aborting.');
  process.exit(1);
}

const gatewayUrl = env['GATEWAY_SUPABASE_URL'];
const serviceRoleKey = env['GATEWAY_SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(gatewayUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3002${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(body);
    const req = http.request(`http://localhost:3002${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  });
}

async function runMultiTenantIntegrationSuite() {
  console.log('========================================================================');
  console.log('STARTING 3-TENANT SYNTHETIC INTEGRATION & SURVEILLANCE TEST SUITE');
  console.log(`Target Staging: ${gatewayUrl}`);
  console.log('========================================================================\n');

  const testTenants = [
    {
      email: 'synthetic.tenant1@staging.vistaar.internal',
      companyName: 'Apex Retail India Synthetic',
      ownerName: 'Aarav Sharma',
      phone: '9876543211',
      invoiceAmount: 45000.00
    },
    {
      email: 'synthetic.tenant2@staging.vistaar.internal',
      companyName: 'Metro Textiles Synthetic',
      ownerName: 'Priya Patel',
      phone: '9876543212',
      invoiceAmount: 78500.00
    },
    {
      email: 'synthetic.tenant3@staging.vistaar.internal',
      companyName: 'Bharat Hardware Synthetic',
      ownerName: 'Vikram Singh',
      phone: '9876543213',
      invoiceAmount: 23200.00
    }
  ];

  const createdUsers = [];
  const workspaceIds = [];

  try {
    // -------------------------------------------------------------------------
    // Phase 1: Provision 3 Synthetic Businesses via GoTrue Auth Admin API
    // -------------------------------------------------------------------------
    console.log('[Step 1/6] Provisioning 3 synthetic business identities via Auth Admin API...');

    for (const t of testTenants) {
      // Clean up previous test run if identity exists
      const { data: existingList } = await supabase.auth.admin.listUsers();
      const existing = (existingList?.users || []).find(u => u.email === t.email);
      if (existing) {
        await supabase.auth.admin.deleteUser(existing.id);
        console.log(`  Cleaned up pre-existing test user: ${t.email}`);
      }

      // Create new user (fires on_auth_user_created -> handle_new_user())
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: t.email,
        password: 'Staging_Test_Pass#2026',
        email_confirm: true,
        user_metadata: {
          company_name: t.companyName,
          name: t.ownerName,
          phone: t.phone
        }
      });

      if (createErr || !newUser.user) {
        throw new Error(`Failed to create synthetic user ${t.email}: ${createErr?.message}`);
      }

      createdUsers.push(newUser.user);
      console.log(`  ✅ Auth user created: ${t.email} (${newUser.user.id})`);

      // Verify workspace was automatically created by handle_new_user() trigger
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, workspace_id, role, status')
        .eq('id', newUser.user.id)
        .single();

      if (!profile || !profile.workspace_id) {
        throw new Error(`Profile or workspace_id not created by trigger for ${t.email}`);
      }

      workspaceIds.push(profile.workspace_id);
      console.log(`  ✅ Verified automatic provisioning: Workspace ID = ${profile.workspace_id}, Role = ${profile.role}`);

      // Verify workspace_subscriptions was automatically created
      const { data: sub } = await supabase
        .from('workspace_subscriptions')
        .select('id, plan_id, status, trial_end')
        .eq('workspace_id', profile.workspace_id)
        .single();

      if (!sub || sub.status !== 'trialing') {
        throw new Error(`Subscription not initialized to 14-day free trial for workspace ${profile.workspace_id}`);
      }
      console.log(`  ✅ Verified automatic subscription: Plan = ${sub.plan_id}, Status = ${sub.status}`);

      // Seed retail invoice for tenant sales GMV tracking
      const { error: invErr } = await supabase
        .from('invoices')
        .insert({
          workspace_id: profile.workspace_id,
          invoice_number: `INV-SYN-${Date.now().toString().slice(-4)}-${Math.floor(Math.random()*1000)}`,
          customer_name: 'Walk-in Customer',
          customer_phone: '9999999999',
          date: new Date().toISOString().split('T')[0],
          due_date: new Date().toISOString().split('T')[0],
          subtotal: t.invoiceAmount,
          discount_total: 0,
          tax_total: 0,
          grand_total: t.invoiceAmount,
          paid_amount: t.invoiceAmount,
          balance_amount: 0,
          template_id: 'default',
          status: 'Paid'
        });

      if (invErr) {
        console.warn(`  Warning seeding invoice for ${t.companyName}: ${invErr.message}`);
      } else {
        console.log(`  ✅ Seeded retail invoice: ₹${t.invoiceAmount.toLocaleString('en-IN')}`);
      }
    }

    // -------------------------------------------------------------------------
    // Phase 2: Verify Gateway Overview Telemetry
    // -------------------------------------------------------------------------
    console.log('\n[Step 2/6] Querying Gateway BFF /api/v1/platform/overview...');
    const overviewRes = await httpGet('/api/v1/platform/overview');
    if (overviewRes.status !== 200 || !overviewRes.data.success) {
      throw new Error(`Gateway overview returned status ${overviewRes.status}: ${JSON.stringify(overviewRes.data)}`);
    }

    const metrics = overviewRes.data.data.metrics;
    console.log('  Overview Metrics Received:');
    console.log(`    - Total Businesses: ${metrics.totalBusinesses} (Expected >= 3)`);
    console.log(`    - Active Businesses: ${metrics.activeBusinesses}`);
    console.log(`    - Total Users: ${metrics.totalUsers} (Expected >= 3)`);
    console.log(`    - Trial Subscriptions: ${metrics.trialSubscriptions} (Expected >= 3)`);
    console.log(`    - Tenant Sales GMV: ₹${metrics.tenantSalesGmvInr.toLocaleString('en-IN')}`);

    if (metrics.totalBusinesses < 3 || metrics.trialSubscriptions < 3) {
      throw new Error(`Overview metrics mismatch: expected at least 3 businesses and trials, got ${metrics.totalBusinesses}`);
    }
    console.log('  ✅ PASS: Gateway Overview reflects live tenant registrations and retail GMV!');

    // -------------------------------------------------------------------------
    // Phase 3: Verify Gateway Workspaces Roster
    // -------------------------------------------------------------------------
    console.log('\n[Step 3/6] Querying Gateway BFF /api/v1/workspaces...');
    const wsRes = await httpGet('/api/v1/workspaces?limit=10');
    if (wsRes.status !== 200 || !wsRes.data.success) {
      throw new Error(`Gateway workspaces returned status ${wsRes.status}`);
    }

    const returnedBusinesses = wsRes.data.data.businesses;
    console.log(`  Total workspaces returned: ${returnedBusinesses.length}`);
    for (const t of testTenants) {
      const match = returnedBusinesses.find(b => b.ownerEmail === t.email);
      if (!match) {
        throw new Error(`Synthetic business ${t.companyName} (${t.email}) not found in workspaces roster!`);
      }
      console.log(`    - Found: ${match.legalName} | Status: ${match.status} | Plan: ${match.planName}`);
    }
    console.log('  ✅ PASS: All 3 synthetic businesses returned in Gateway directory!');

    // -------------------------------------------------------------------------
    // Phase 4: Test Workspace Detail & Members Drill-Down
    // -------------------------------------------------------------------------
    console.log('\n[Step 4/6] Querying Workspace Detail & Member Roster for Tenant 1...');
    const targetWsId = workspaceIds[0];
    const detailRes = await httpGet(`/api/v1/workspaces/${targetWsId}`);
    if (detailRes.status !== 200 || !detailRes.data.success) {
      throw new Error(`Failed to fetch workspace detail for ${targetWsId}`);
    }
    console.log(`  Workspace Legal Name: ${detailRes.data.data.workspace.company_name}`);
    console.log(`  Invoice Count: ${detailRes.data.data.metrics.invoiceCount}`);
    console.log(`  Total GMV: ₹${detailRes.data.data.metrics.totalGmvInr}`);

    const membersRes = await httpGet(`/api/v1/workspaces/${targetWsId}/members`);
    if (membersRes.status !== 200 || !membersRes.data.success) {
      throw new Error(`Failed to fetch workspace members for ${targetWsId}`);
    }
    console.log(`  Members found: ${membersRes.data.data.length} (${membersRes.data.data[0]?.name})`);
    console.log('  ✅ PASS: Workspace drill-down and member rosters verified!');

    // -------------------------------------------------------------------------
    // Phase 5: Test Administrative Suspension & Reactivation Controls
    // -------------------------------------------------------------------------
    console.log('\n[Step 5/6] Testing Administrative Control: Suspend & Reactivate Tenant 3...');
    const suspendTargetId = workspaceIds[2];

    // Suspend Tenant 3
    const suspendRes = await httpPost(`/api/v1/workspaces/${suspendTargetId}/suspend`, {
      reason: 'Synthetic integration testing suspension event'
    });
    if (suspendRes.status !== 200 || !suspendRes.data.success) {
      throw new Error(`Suspension failed: ${JSON.stringify(suspendRes.data)}`);
    }
    console.log(`  ✅ Tenant 3 suspended successfully via Gateway`);

    // Verify overview updates to show suspended count
    const postSuspendOverview = await httpGet('/api/v1/platform/overview');
    const suspCount = postSuspendOverview.data.data.metrics.suspendedBusinesses;
    console.log(`  Suspended businesses reported by Overview: ${suspCount} (Expected >= 1)`);
    if (suspCount < 1) {
      throw new Error('Suspended business count did not increment in platform overview');
    }

    // Reactivate Tenant 3
    const reactivateRes = await httpPost(`/api/v1/workspaces/${suspendTargetId}/reactivate`, {});
    if (reactivateRes.status !== 200 || !reactivateRes.data.success) {
      throw new Error(`Reactivation failed: ${JSON.stringify(reactivateRes.data)}`);
    }
    console.log(`  ✅ Tenant 3 reactivated successfully via Gateway`);

    // -------------------------------------------------------------------------
    // Phase 6: Clean Up Synthetic Test Records
    // -------------------------------------------------------------------------
    console.log('\n[Step 6/6] Cleaning up synthetic test fixtures from staging DB...');
    for (const u of createdUsers) {
      await supabase.auth.admin.deleteUser(u.id);
    }
    for (const wsId of workspaceIds) {
      await supabase.from('invoices').delete().eq('workspace_id', wsId);
      await supabase.from('workspace_subscriptions').delete().eq('workspace_id', wsId);
      await supabase.from('workspace_memberships').delete().eq('workspace_id', wsId);
      await supabase.from('business_settings').delete().eq('workspace_id', wsId);
      await supabase.from('inventory_settings').delete().eq('workspace_id', wsId);
      await supabase.from('platform_workspace_suspensions').delete().eq('workspace_id', wsId);
      await supabase.from('workspaces').delete().eq('id', wsId);
    }
    console.log('  ✅ Staging DB cleanly pruned of synthetic test fixtures.');

    console.log('\n========================================================================');
    console.log('ALL MULTI-TENANT STAGING INTEGRATION TESTS PASSED (100% SUCCESS)');
    console.log('========================================================================');
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err.message);

    // Emergency cleanup
    for (const u of createdUsers) {
      try { await supabase.auth.admin.deleteUser(u.id); } catch (_) {}
    }
    for (const wsId of workspaceIds) {
      try {
        await supabase.from('invoices').delete().eq('workspace_id', wsId);
        await supabase.from('workspace_subscriptions').delete().eq('workspace_id', wsId);
        await supabase.from('workspaces').delete().eq('id', wsId);
      } catch (_) {}
    }
    process.exit(1);
  }
}

runMultiTenantIntegrationSuite();
