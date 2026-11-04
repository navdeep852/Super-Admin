import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('d:/Project/vistaar-main/super_admin/.env.staging', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
});

const supabase = createClient(env['GATEWAY_SUPABASE_URL'], env['GATEWAY_SUPABASE_SERVICE_ROLE_KEY'], {
  auth: { persistSession: false, autoRefreshToken: false }
});

const sampleTenants = [
  {
    companyName: 'Apex Retail India Pvt Ltd',
    legalName: 'Apex Retail India Private Limited',
    gstin: '27AABCA1234F1Z5',
    city: 'Mumbai',
    state: 'Maharashtra',
    address: 'Andheri East Commercial Complex, Mumbai',
    ownerName: 'Aarav Sharma',
    ownerEmail: 'aarav.sharma@staging.vistaar.internal',
    ownerPhone: '9820011223',
    planId: 'growth',
    subStatus: 'active',
    shouldSuspend: false,
    employees: [
      { name: 'Kavita Joshi', email: 'kavita.joshi@staging.vistaar.internal', role: 'manager', designation: 'Store Manager', department: 'Operations', phone: '9820011224' },
      { name: 'Rohan Mehra', email: 'rohan.mehra@staging.vistaar.internal', role: 'accountant', designation: 'Chief Accountant', department: 'Finance', phone: '9820011225' },
      { name: 'Sunil Verma', email: 'sunil.verma@staging.vistaar.internal', role: 'cashier', designation: 'Head Cashier', department: 'Retail Sales', phone: '9820011226' }
    ],
    invoices: [
      { daysAgo: 0, amount: 45000, paid: 45000, status: 'Paid' },
      { daysAgo: 5, amount: 35000, paid: 35000, status: 'Paid' },
      { daysAgo: 18, amount: 45000, paid: 30000, status: 'Partially Paid' }
    ],
    saasPayments: [
      { ref: 'PAY-APX-2026-1', daysAgo: 20, amount: 9999, status: 'successful', planId: 'growth' }
    ]
  },
  {
    companyName: 'Metro Textiles Synthetic',
    legalName: 'Metro Textiles & Fabrics LLP',
    gstin: '24AAACM4567K1Z8',
    city: 'Surat',
    state: 'Gujarat',
    address: 'Ring Road Textile Market, Surat',
    ownerName: 'Priya Patel',
    ownerEmail: 'priya.patel@staging.vistaar.internal',
    ownerPhone: '9879022334',
    planId: 'business',
    subStatus: 'active',
    shouldSuspend: false,
    employees: [
      { name: 'Jigar Shah', email: 'jigar.shah@staging.vistaar.internal', role: 'manager', designation: 'Operations Manager', department: 'Operations', phone: '9879022335' },
      { name: 'Bhavin Mehta', email: 'bhavin.mehta@staging.vistaar.internal', role: 'accountant', designation: 'Senior Accountant', department: 'Finance', phone: '9879022336' }
    ],
    invoices: [
      { daysAgo: 1, amount: 52000, paid: 52000, status: 'Paid' },
      { daysAgo: 12, amount: 32500, paid: 32500, status: 'Paid' }
    ],
    saasPayments: [
      { ref: 'PAY-MTX-2026-1', daysAgo: 15, amount: 5999, status: 'successful', planId: 'business' }
    ]
  },
  {
    companyName: 'Zenith Electronics Staging',
    legalName: 'Zenith Electronics & Appliances',
    gstin: '29ABCDE6789P1Z2',
    city: 'Bengaluru',
    state: 'Karnataka',
    address: 'SP Road Electronics Hub, Bengaluru',
    ownerName: 'Rohit Verma',
    ownerEmail: 'rohit.verma@staging.vistaar.internal',
    ownerPhone: '9845033445',
    planId: 'starter_mobile',
    subStatus: 'active',
    shouldSuspend: true,
    suspensionReason: 'Subscription payment default and verification pending',
    employees: [
      { name: 'Anand Kumar', email: 'anand.kumar@staging.vistaar.internal', role: 'manager', designation: 'Branch Manager', department: 'Retail Sales', phone: '9845033446' }
    ],
    invoices: [
      { daysAgo: 10, amount: 40000, paid: 40000, status: 'Paid' },
      { daysAgo: 22, amount: 22000, paid: 0, status: 'Issued' }
    ],
    saasPayments: [
      { ref: 'PAY-ZEN-2026-1', daysAgo: 25, amount: 4498, status: 'successful', planId: 'starter_mobile' }
    ]
  },
  {
    companyName: 'Kalyan Kirana Stores',
    legalName: 'Kalyan General & Kirana Merchants',
    gstin: null,
    city: 'Pune',
    state: 'Maharashtra',
    address: 'FC Road, Deccan Gymkhana, Pune',
    ownerName: 'Rajesh Gupta',
    ownerEmail: 'rajesh.gupta@staging.vistaar.internal',
    ownerPhone: '9822044556',
    planId: 'free_trial',
    subStatus: 'trialing',
    shouldSuspend: false,
    employees: [
      { name: 'Sanjay Jadhav', email: 'sanjay.jadhav@staging.vistaar.internal', role: 'cashier', designation: 'Store Clerk', department: 'Retail Sales', phone: '9822044557' }
    ],
    invoices: [
      { daysAgo: 0, amount: 8500, paid: 8500, status: 'Paid' },
      { daysAgo: 2, amount: 6500, paid: 6500, status: 'Paid' }
    ],
    saasPayments: []
  },
  {
    companyName: 'Deccan Logistics & Supply',
    legalName: 'Deccan Logistics Freight Hub India',
    gstin: '36AAACD9876Q1Z4',
    city: 'Hyderabad',
    state: 'Telangana',
    address: 'Madhapur HITEC Hub, Hyderabad',
    ownerName: 'Suresh Reddy',
    ownerEmail: 'suresh.reddy@staging.vistaar.internal',
    ownerPhone: '9849055667',
    planId: 'growth',
    subStatus: 'active',
    shouldSuspend: false,
    employees: [
      { name: 'Venkat Rao', email: 'venkat.rao@staging.vistaar.internal', role: 'manager', designation: 'Fleet Controller', department: 'Operations', phone: '9849055668' },
      { name: 'Lakshmi Narayana', email: 'lakshmi.narayana@staging.vistaar.internal', role: 'accountant', designation: 'Finance Lead', department: 'Finance', phone: '9849055669' }
    ],
    invoices: [
      { daysAgo: 3, amount: 110000, paid: 110000, status: 'Paid' },
      { daysAgo: 9, amount: 85000, paid: 85000, status: 'Paid' },
      { daysAgo: 28, amount: 15000, paid: 0, status: 'Issued' }
    ],
    saasPayments: [
      { ref: 'PAY-DEC-2026-1', daysAgo: 35, amount: 9999, status: 'successful', planId: 'growth' },
      { ref: 'PAY-DEC-2026-REF', daysAgo: 8, amount: 1200, status: 'refunded', planId: 'growth' }
    ]
  },
  {
    companyName: 'Punjab Auto Spares & Tools',
    legalName: 'Punjab Auto Spares Proprietary',
    gstin: '03AABCP3456N1Z7',
    city: 'Ludhiana',
    state: 'Punjab',
    address: 'GT Road Industrial Area, Ludhiana',
    ownerName: 'Manpreet Singh',
    ownerEmail: 'manpreet.singh@staging.vistaar.internal',
    ownerPhone: '9814066778',
    planId: 'free_trial',
    subStatus: 'expired',
    shouldSuspend: false,
    employees: [],
    invoices: [
      { daysAgo: 16, amount: 28000, paid: 28000, status: 'Paid' },
      { daysAgo: 21, amount: 4000, paid: 0, status: 'Issued' }
    ],
    saasPayments: []
  },
  {
    companyName: 'Shree Ganesh Jewelers',
    legalName: 'Shree Ganesh Gems & Jewelry Pvt Ltd',
    gstin: '08AABCS7890M1Z3',
    city: 'Jaipur',
    state: 'Rajasthan',
    address: 'Johari Bazaar, Jaipur',
    ownerName: 'Dinesh Soni',
    ownerEmail: 'dinesh.soni@staging.vistaar.internal',
    ownerPhone: '9829077889',
    planId: 'growth',
    subStatus: 'active',
    shouldSuspend: false,
    employees: [
      { name: 'Ashok Soni', email: 'ashok.soni@staging.vistaar.internal', role: 'manager', designation: 'Showroom Manager', department: 'Retail Sales', phone: '9829077890' }
    ],
    invoices: [
      { daysAgo: 0, amount: 320000, paid: 320000, status: 'Paid' },
      { daysAgo: 6, amount: 220000, paid: 220000, status: 'Paid' }
    ],
    saasPayments: [
      { ref: 'PAY-SGJ-2026-1', daysAgo: 20, amount: 9999, status: 'successful', planId: 'growth' }
    ]
  },
  {
    companyName: 'Sunrise Chemist & Druggist',
    legalName: 'Sunrise Healthcare & Pharmacy',
    gstin: '19AABCS2345L1Z1',
    city: 'Kolkata',
    state: 'West Bengal',
    address: 'College Street Pharmacy Market, Kolkata',
    ownerName: 'Anita Desai',
    ownerEmail: 'anita.desai@staging.vistaar.internal',
    ownerPhone: '9830088990',
    planId: 'starter',
    subStatus: 'active',
    shouldSuspend: false,
    employees: [
      { name: 'Subhash Bose', email: 'subhash.bose@staging.vistaar.internal', role: 'pharmacist', designation: 'Senior Pharmacist', department: 'Pharmacy', phone: '9830088991' }
    ],
    invoices: [
      { daysAgo: 0, amount: 38000, paid: 38000, status: 'Paid' },
      { daysAgo: 4, amount: 30000, paid: 26000, status: 'Partially Paid' }
    ],
    saasPayments: [
      { ref: 'PAY-SCD-2026-1', daysAgo: 10, amount: 2499, status: 'successful', planId: 'starter' }
    ]
  }
];

async function main() {
  console.log('=== PROVISIONING STAGING TENANTS VIA SUPABASE AUTH ===');
  
  // 1. Get existing auth users
  const { data: userList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
  const existingUsers = userList?.users || [];

  for (const tenant of sampleTenants) {
    console.log(`\nProcessing: ${tenant.companyName} (${tenant.ownerEmail})`);
    
    // Check if owner user exists
    let ownerUser = existingUsers.find(u => u.email === tenant.ownerEmail);
    if (!ownerUser) {
      console.log(`  Creating Auth Owner: ${tenant.ownerEmail}`);
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: tenant.ownerEmail,
        password: 'Staging_Pass#2026',
        email_confirm: true,
        user_metadata: {
          company_name: tenant.companyName,
          name: tenant.ownerName,
          phone: tenant.ownerPhone
        }
      });
      if (error) {
        console.error(`  Error creating user: ${error.message}`);
        continue;
      }
      ownerUser = created.user;
    } else {
      console.log(`  Owner user already exists: ${ownerUser.id}`);
    }

    // Lookup profile to get workspace_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, workspace_id')
      .eq('id', ownerUser.id)
      .maybeSingle();

    if (!profile || !profile.workspace_id) {
      console.warn(`  Workspace profile not found for ${tenant.ownerEmail}, skipping details.`);
      continue;
    }

    const wsId = profile.workspace_id;
    console.log(`  Workspace ID: ${wsId}`);

    // Update Business Settings
    await supabase.from('business_settings').upsert({
      workspace_id: wsId,
      legal_name: tenant.legalName,
      phone: tenant.ownerPhone,
      email: tenant.ownerEmail,
      gstin: tenant.gstin,
      address: tenant.address,
      city: tenant.city,
      state: tenant.state,
      pincode: '400001'
    });

    // Update Workspace Subscription
    await supabase.from('workspace_subscriptions').upsert({
      workspace_id: wsId,
      plan_id: tenant.planId,
      status: tenant.subStatus,
      billing_interval: 'annual',
      cancel_at_period_end: false,
      current_period_start: new Date(Date.now() - 30 * 86400000).toISOString(),
      current_period_end: new Date(Date.now() + 335 * 86400000).toISOString(),
      trial_start: new Date(Date.now() - 30 * 86400000).toISOString(),
      trial_end: tenant.subStatus === 'expired' 
        ? new Date(Date.now() - 5 * 86400000).toISOString() 
        : new Date(Date.now() + 10 * 86400000).toISOString()
    });

    // Provision Employees
    let empIndex = 2;
    for (const emp of tenant.employees) {
      let empUser = existingUsers.find(u => u.email === emp.email);
      if (!empUser) {
        console.log(`    Creating employee: ${emp.name} (${emp.email})`);
        const { data: createdEmp } = await supabase.auth.admin.createUser({
          email: emp.email,
          password: 'Employee_Pass#2026',
          email_confirm: true,
          user_metadata: { name: emp.name, phone: emp.phone }
        });
        empUser = createdEmp?.user;
      }

      if (empUser) {
        // Link profile to this workspace
        await supabase.from('profiles').upsert({
          id: empUser.id,
          workspace_id: wsId,
          employee_id: `EMP-00${empIndex++}`,
          name: emp.name,
          email: emp.email,
          phone: emp.phone,
          role: emp.role,
          designation: emp.designation,
          department: emp.department,
          status: 'Active'
        });

        await supabase.from('workspace_memberships').upsert({
          workspace_id: wsId,
          user_id: empUser.id,
          role: emp.role,
          status: 'active'
        }, { onConflict: 'workspace_id,user_id' });
      }
    }

    // Seed Invoices
    for (const inv of tenant.invoices) {
      const invDate = new Date(Date.now() - inv.daysAgo * 86400000).toISOString().split('T')[0];
      const invNum = `INV-${tenant.companyName.slice(0, 3).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
      const bal = inv.amount - inv.paid;

      await supabase.from('invoices').insert({
        workspace_id: wsId,
        invoice_number: invNum,
        customer_name: 'Retail / Corporate Customer',
        customer_phone: '9988776655',
        date: invDate,
        due_date: invDate,
        subtotal: inv.amount,
        discount_total: 0,
        tax_total: 0,
        grand_total: inv.amount,
        paid_amount: inv.paid,
        balance_amount: bal,
        template_id: 'default',
        status: inv.status
      });
    }

    // Seed SaaS Payments
    for (const pay of tenant.saasPayments) {
      const payDate = new Date(Date.now() - pay.daysAgo * 86400000).toISOString();
      await supabase.from('payment_transactions').insert({
        workspace_id: wsId,
        transaction_reference: pay.ref,
        provider: 'youpi_pg',
        amount_inr: pay.amount,
        currency: 'INR',
        plan_id: pay.planId,
        status: pay.status,
        verified_at: payDate,
        created_at: payDate
      });
    }

    // If designated for suspension, execute suspension
    if (tenant.shouldSuspend) {
      console.log(`    Applying suspension on ${tenant.companyName}...`);
      await supabase.from('workspaces').update({
        is_active: false,
        suspension_reason: tenant.suspensionReason,
        suspended_at: new Date().toISOString()
      }).eq('id', wsId);

      await supabase.from('profiles').update({
        status: 'Suspended'
      }).eq('workspace_id', wsId);

      await supabase.from('workspace_memberships').update({
        status: 'suspended'
      }).eq('workspace_id', wsId);

      const { data: defaultAdmin } = await supabase.from('platform_admins').select('id').limit(1).single();
      const adminId = defaultAdmin?.id || 'a638f1fb-984e-48b0-96c3-a6a7f42c2c18';

      await supabase.from('platform_workspace_suspensions').insert({
        workspace_id: wsId,
        admin_id: adminId,
        reason: tenant.suspensionReason,
        suspended_membership_user_ids: [],
        suspended_profile_user_ids: [],
        is_active_suspension: true,
        suspended_at: new Date().toISOString()
      });

      await supabase.from('platform_audit_logs').insert({
        admin_id: adminId,
        admin_email: 'synthetic.admin@staging.vistaar.internal',
        admin_role: 'super_admin',
        action: 'WORKSPACE_SUSPENDED',
        target_workspace_id: wsId,
        details: { reason: tenant.suspensionReason }
      });
    }
  }

  console.log('\n✅ All staging tenants provisioned and initialized successfully!');
}

main().catch(console.error);

