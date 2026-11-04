import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve('d:/Project/vistaar-main/super_admin/.env.staging');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
});

const supabaseUrl = env['GATEWAY_SUPABASE_URL'] || env['SUPABASE_URL'];
const serviceRoleKey = env['GATEWAY_SUPABASE_SERVICE_ROLE_KEY'] || env['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function main() {
  console.log('=== INSPECTING CURRENT OPERATIONAL STATE ===');
  console.log('Supabase URL:', supabaseUrl);

  // 1. Workspaces
  const { data: workspaces, error: wsErr } = await supabase
    .from('workspaces')
    .select('id, name, created_at, is_active, owner_id');
  console.log('\n--- Workspaces (Total:', workspaces?.length || 0, ') ---');
  if (workspaces) {
    workspaces.forEach(w => console.log(`  - [${w.id}] ${w.name} (Active: ${w.is_active}, Created: ${w.created_at})`));
  } else if (wsErr) {
    console.error('Workspaces error:', wsErr.message);
  }

  // 2. Profiles (Users & Employees)
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, workspace_id, status, created_at');
  console.log('\n--- Profiles (Total:', profiles?.length || 0, ') ---');
  if (profiles) {
    profiles.forEach(p => console.log(`  - [${p.id}] ${p.email} | Name: ${p.full_name} | Role: ${p.role} | Workspace: ${p.workspace_id} | Status: ${p.status}`));
  }

  // 3. Workspace Subscriptions
  const { data: subs, error: subErr } = await supabase
    .from('workspace_subscriptions')
    .select('id, workspace_id, plan_id, status, trial_start, trial_end, current_period_start, current_period_end');
  console.log('\n--- Subscriptions (Total:', subs?.length || 0, ') ---');
  if (subs) {
    subs.forEach(s => console.log(`  - Workspace: ${s.workspace_id} | Plan: ${s.plan_id} | Status: ${s.status} | TrialEnd: ${s.trial_end}`));
  }

  // 4. Invoices vs Payments (Collected Revenue vs GMV)
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, workspace_id, invoice_number, grand_total, paid_amount, balance_amount, status, created_at');
  console.log('\n--- Invoices (Total:', invoices?.length || 0, ') ---');
  let totalInvoiceGMV = 0;
  let totalInvoicePaid = 0;
  if (invoices) {
    invoices.forEach(i => {
      totalInvoiceGMV += Number(i.grand_total || 0);
      totalInvoicePaid += Number(i.paid_amount || 0);
    });
    console.log(`  Sum Grand Total (GMV): ₹${totalInvoiceGMV}`);
    console.log(`  Sum Paid Amount: ₹${totalInvoicePaid}`);
  }

  // 5. Subscription Payments / Direct Platform Payments
  const { data: payments, error: payErr } = await supabase
    .from('payments')
    .select('*')
    .limit(20);
  console.log('\n--- Payments Table (Total:', payments?.length || 0, ') ---');
  if (payments && payments.length > 0) {
    payments.forEach(pay => console.log('  Payment:', pay));
  } else {
    console.log('  No payment records in `payments` table or error:', payErr?.message);
  }

  // 6. Suspensions
  const { data: suspensions, error: suspErr } = await supabase
    .from('platform_workspace_suspensions')
    .select('*');
  console.log('\n--- Suspensions (Total:', suspensions?.length || 0, ') ---');
  if (suspensions) {
    suspensions.forEach(s => console.log('  Suspension:', s));
  }

  // 7. Platform Admins
  const { data: admins, error: admErr } = await supabase
    .from('platform_admins')
    .select('id, name, email, role, is_active, mfa_enrolled');
  console.log('\n--- Platform Admins (Total:', admins?.length || 0, ') ---');
  if (admins) {
    admins.forEach(a => console.log(`  - [${a.id}] ${a.email} (${a.name}) | Role: ${a.role} | Active: ${a.is_active} | MFA: ${a.mfa_enrolled}`));
  }
}

main().catch(console.error);

