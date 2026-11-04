import fs from 'fs';
import pg from 'pg';
import crypto from 'crypto';

const envContent = fs.readFileSync('d:/Project/vistaar-main/super_admin/.env.staging', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
});

const pool = new pg.Pool({
  connectionString: env['STAGING_DIRECT_DATABASE_URL'],
  ssl: { rejectUnauthorized: false }
});

const sampleBusinesses = [
  {
    companyName: 'Apex Retail India Pvt Ltd',
    legalName: 'Apex Retail India Private Limited',
    gstin: '27AABCA1234F1Z5',
    city: 'Mumbai',
    state: 'Maharashtra',
    address: 'Andheri East Commercial Complex, Mumbai',
    ownerName: 'Aarav Sharma',
    ownerEmail: 'aarav.sharma@apexretail.staging',
    ownerPhone: '9820011223',
    planId: 'growth',
    subStatus: 'active',
    isActive: true,
    createdDaysAgo: 45,
    employees: [
      { name: 'Kavita Joshi', email: 'kavita@apexretail.staging', role: 'manager', designation: 'Store Manager', phone: '9820011224' },
      { name: 'Rohan Mehra', email: 'rohan@apexretail.staging', role: 'accountant', designation: 'Chief Accountant', phone: '9820011225' },
      { name: 'Sunil Verma', email: 'sunil@apexretail.staging', role: 'cashier', designation: 'Head Cashier', phone: '9820011226' },
      { name: 'Pooja Nair', email: 'pooja@apexretail.staging', role: 'sales', designation: 'Sales Executive', phone: '9820011227' }
    ],
    invoices: [
      { num: 'INV-APX-001', daysAgo: 2, amount: 45000, paid: 45000, status: 'Paid' },
      { num: 'INV-APX-002', daysAgo: 10, amount: 35000, paid: 35000, status: 'Paid' },
      { num: 'INV-APX-003', daysAgo: 25, amount: 45000, paid: 30000, status: 'Partially Paid' }
    ],
    saasPayments: [
      { ref: 'PAY-APX-2026-1', daysAgo: 45, amount: 9999, status: 'successful', planId: 'growth' }
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
    ownerEmail: 'priya.patel@metrotex.staging',
    ownerPhone: '9879022334',
    planId: 'business',
    subStatus: 'active',
    isActive: true,
    createdDaysAgo: 30,
    employees: [
      { name: 'Jigar Shah', email: 'jigar@metrotex.staging', role: 'manager', designation: 'Operations Manager', phone: '9879022335' },
      { name: 'Bhavin Mehta', email: 'bhavin@metrotex.staging', role: 'accountant', designation: 'Accountant', phone: '9879022336' },
      { name: 'Chirag Desai', email: 'chirag@metrotex.staging', role: 'sales', designation: 'Fabric Consultant', phone: '9879022337' }
    ],
    invoices: [
      { num: 'INV-MTX-101', daysAgo: 1, amount: 52000, paid: 52000, status: 'Paid' },
      { num: 'INV-MTX-102', daysAgo: 15, amount: 32500, paid: 32500, status: 'Paid' }
    ],
    saasPayments: [
      { ref: 'PAY-MTX-2026-1', daysAgo: 30, amount: 5999, status: 'successful', planId: 'business' }
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
    ownerEmail: 'rohit.verma@zenith.staging',
    ownerPhone: '9845033445',
    planId: 'starter_mobile',
    subStatus: 'active',
    isActive: false, // Suspended!
    createdDaysAgo: 60,
    suspensionReason: 'Overdue subscription renewal and suspected terms violation',
    employees: [
      { name: 'Anand Kumar', email: 'anand@zenith.staging', role: 'manager', designation: 'Branch Manager', phone: '9845033446' },
      { name: 'Divya Rao', email: 'divya@zenith.staging', role: 'cashier', designation: 'Billing Clerk', phone: '9845033447' }
    ],
    invoices: [
      { num: 'INV-ZEN-201', daysAgo: 20, amount: 40000, paid: 40000, status: 'Paid' },
      { num: 'INV-ZEN-202', daysAgo: 35, amount: 22000, paid: 0, status: 'Issued' }
    ],
    saasPayments: [
      { ref: 'PAY-ZEN-2026-1', daysAgo: 60, amount: 4498, status: 'successful', planId: 'starter_mobile' }
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
    ownerEmail: 'rajesh.gupta@kalyan.staging',
    ownerPhone: '9822044556',
    planId: 'free_trial',
    subStatus: 'trialing',
    isActive: true,
    createdDaysAgo: 5,
    employees: [
      { name: 'Sanjay Jadhav', email: 'sanjay@kalyan.staging', role: 'cashier', designation: 'Store Clerk', phone: '9822044557' }
    ],
    invoices: [
      { num: 'INV-KLN-301', daysAgo: 0, amount: 8500, paid: 8500, status: 'Paid' },
      { num: 'INV-KLN-302', daysAgo: 2, amount: 6500, paid: 6500, status: 'Paid' }
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
    ownerEmail: 'suresh.reddy@deccan.staging',
    ownerPhone: '9849055667',
    planId: 'growth',
    subStatus: 'active',
    isActive: true,
    createdDaysAgo: 90,
    employees: [
      { name: 'Venkat Rao', email: 'venkat@deccan.staging', role: 'manager', designation: 'Fleet Controller', phone: '9849055668' },
      { name: 'Lakshmi Narayana', email: 'lakshmi@deccan.staging', role: 'accountant', designation: 'Finance Lead', phone: '9849055669' },
      { name: 'Naresh Goud', email: 'naresh@deccan.staging', role: 'sales', designation: 'Key Accounts', phone: '9849055670' }
    ],
    invoices: [
      { num: 'INV-DEC-401', daysAgo: 3, amount: 110000, paid: 110000, status: 'Paid' },
      { num: 'INV-DEC-402', daysAgo: 12, amount: 85000, paid: 85000, status: 'Paid' },
      { num: 'INV-DEC-403', daysAgo: 40, amount: 15000, paid: 0, status: 'Issued' }
    ],
    saasPayments: [
      { ref: 'PAY-DEC-2026-1', daysAgo: 90, amount: 9999, status: 'successful', planId: 'growth' },
      { ref: 'PAY-DEC-2026-REF', daysAgo: 15, amount: 1200, status: 'refunded', planId: 'growth' }
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
    ownerEmail: 'manpreet.singh@punjabauto.staging',
    ownerPhone: '9814066778',
    planId: 'free_trial',
    subStatus: 'expired',
    isActive: true,
    createdDaysAgo: 25,
    employees: [
      { name: 'Gurpreet Singh', email: 'gurpreet@punjabauto.staging', role: 'cashier', designation: 'Billing Clerk', phone: '9814066779' }
    ],
    invoices: [
      { num: 'INV-PAS-501', daysAgo: 18, amount: 28000, paid: 28000, status: 'Paid' },
      { num: 'INV-PAS-502', daysAgo: 22, amount: 4000, paid: 0, status: 'Issued' }
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
    ownerEmail: 'dinesh.soni@ganeshjewels.staging',
    ownerPhone: '9829077889',
    planId: 'growth',
    subStatus: 'active',
    isActive: true,
    createdDaysAgo: 75,
    employees: [
      { name: 'Ashok Soni', email: 'ashok@ganeshjewels.staging', role: 'manager', designation: 'Showroom Manager', phone: '9829077890' },
      { name: 'Praveen Sharma', email: 'praveen@ganeshjewels.staging', role: 'accountant', designation: 'Chartered Accountant', phone: '9829077891' },
      { name: 'Deepak Verma', email: 'deepak@ganeshjewels.staging', role: 'cashier', designation: 'Vault Cashier', phone: '9829077892' }
    ],
    invoices: [
      { num: 'INV-SGJ-601', daysAgo: 1, amount: 320000, paid: 320000, status: 'Paid' },
      { num: 'INV-SGJ-602', daysAgo: 8, amount: 220000, paid: 220000, status: 'Paid' }
    ],
    saasPayments: [
      { ref: 'PAY-SGJ-2026-1', daysAgo: 75, amount: 9999, status: 'successful', planId: 'growth' }
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
    ownerEmail: 'anita.desai@sunrisechem.staging',
    ownerPhone: '9830088990',
    planId: 'starter',
    subStatus: 'active',
    isActive: true,
    createdDaysAgo: 14,
    employees: [
      { name: 'Subhash Bose', email: 'subhash@sunrisechem.staging', role: 'pharmacist', designation: 'Senior Pharmacist', phone: '9830088991' },
      { name: 'Debashish Roy', email: 'debashish@sunrisechem.staging', role: 'cashier', designation: 'Counter Billing', phone: '9830088992' }
    ],
    invoices: [
      { num: 'INV-SCD-701', daysAgo: 0, amount: 38000, paid: 38000, status: 'Paid' },
      { num: 'INV-SCD-702', daysAgo: 5, amount: 30000, paid: 26000, status: 'Partially Paid' }
    ],
    saasPayments: [
      { ref: 'PAY-SCD-2026-1', daysAgo: 14, amount: 2499, status: 'successful', planId: 'starter' }
    ]
  }
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding comprehensive staging data across 8 distinct business organizations...');
    
    // Get super admin ID for suspension FK
    const adminRes = await client.query('SELECT id, email FROM public.platform_admins LIMIT 1');
    const adminId = adminRes.rows[0]?.id || 'a638f1fb-984e-48b0-96c3-a6a7f42c2c18';

    for (const b of sampleBusinesses) {
      // Check if workspace with company_name exists
      const checkWs = await client.query('SELECT id FROM public.workspaces WHERE company_name = $1', [b.companyName]);
      let wsId;
      const createdDate = new Date(Date.now() - b.createdDaysAgo * 24 * 3600 * 1000);

      if (checkWs.rowCount > 0) {
        wsId = checkWs.rows[0].id;
        console.log(`  Updating existing workspace: ${b.companyName} (${wsId})`);
        await client.query(`
          UPDATE public.workspaces
          SET owner_name = $1, owner_email = $2, owner_phone = $3, is_active = $4,
              suspension_reason = $5, suspended_at = $6, suspended_by = $7
          WHERE id = $8
        `, [
          b.ownerName,
          b.ownerEmail,
          b.ownerPhone,
          b.isActive,
          b.isActive ? null : (b.suspensionReason || 'Administrative suspension'),
          b.isActive ? null : new Date(Date.now() - 5 * 24 * 3600 * 1000),
          b.isActive ? null : adminId,
          wsId
        ]);
      } else {
        wsId = crypto.randomUUID();
        console.log(`  Inserting new workspace: ${b.companyName} (${wsId})`);
        await client.query(`
          INSERT INTO public.workspaces (
            id, company_name, owner_name, owner_email, owner_phone, is_active,
            branch_name, branch_code, is_main_branch, suspension_reason,
            suspended_at, suspended_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          wsId,
          b.companyName,
          b.ownerName,
          b.ownerEmail,
          b.ownerPhone,
          b.isActive,
          'Main Branch',
          'MAIN-01',
          true,
          b.isActive ? null : (b.suspensionReason || 'Administrative suspension'),
          b.isActive ? null : new Date(Date.now() - 5 * 24 * 3600 * 1000),
          b.isActive ? null : adminId,
          createdDate,
          createdDate
        ]);
      }

      // 2. Business Settings
      await client.query(`
        INSERT INTO public.business_settings (
          workspace_id, legal_name, phone, email, gstin, address, city, state, pincode, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (workspace_id) DO UPDATE SET
          legal_name = EXCLUDED.legal_name,
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          gstin = EXCLUDED.gstin,
          address = EXCLUDED.address,
          city = EXCLUDED.city,
          state = EXCLUDED.state
      `, [
        wsId,
        b.legalName,
        b.ownerPhone,
        b.ownerEmail,
        b.gstin,
        b.address,
        b.city,
        b.state,
        '400001',
        createdDate,
        createdDate
      ]);

      // 3. Owner Profile
      const ownerProfileId = crypto.randomUUID();
      await client.query(`
        INSERT INTO public.profiles (
          id, workspace_id, employee_id, name, email, phone, role, designation, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO NOTHING
      `, [
        ownerProfileId,
        wsId,
        'EMP-001',
        b.ownerName,
        b.ownerEmail,
        b.ownerPhone,
        'owner',
        'Proprietor / Managing Director',
        b.isActive ? 'Active' : 'Suspended',
        createdDate,
        createdDate
      ]);

      // 4. Employee Profiles
      let empNum = 2;
      for (const emp of b.employees) {
        const empId = crypto.randomUUID();
        const empCode = `EMP-00${empNum++}`;
        await client.query(`
          INSERT INTO public.profiles (
            id, workspace_id, employee_id, name, email, phone, role, designation, department, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO NOTHING
        `, [
          empId,
          wsId,
          empCode,
          emp.name,
          emp.email,
          emp.phone,
          emp.role,
          emp.designation,
          emp.role === 'manager' ? 'Operations' : (emp.role === 'accountant' ? 'Finance' : 'Retail Sales'),
          b.isActive ? 'Active' : 'Suspended',
          createdDate,
          createdDate
        ]);
      }

      // 5. Workspace Subscription
      const trialDays = b.planId === 'free_trial' ? 14 : 0;
      const trialEnd = new Date(createdDate.getTime() + 14 * 24 * 3600 * 1000);
      const periodEnd = new Date(createdDate.getTime() + 365 * 24 * 3600 * 1000);

      await client.query(`
        INSERT INTO public.workspace_subscriptions (
          workspace_id, plan_id, status, trial_start, trial_end, current_period_start, current_period_end,
          billing_interval, cancel_at_period_end, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (workspace_id) DO UPDATE SET
          plan_id = EXCLUDED.plan_id,
          status = EXCLUDED.status,
          trial_end = EXCLUDED.trial_end,
          current_period_end = EXCLUDED.current_period_end
      `, [
        wsId,
        b.planId,
        b.subStatus,
        createdDate,
        trialEnd,
        createdDate,
        periodEnd,
        'annual',
        false,
        createdDate,
        createdDate
      ]);

      // 6. Invoices
      for (const inv of b.invoices) {
        const invDate = new Date(Date.now() - inv.daysAgo * 24 * 3600 * 1000);
        const invId = crypto.randomUUID();
        const bal = inv.amount - inv.paid;
        await client.query(`
          INSERT INTO public.invoices (
            id, workspace_id, invoice_number, customer_name, customer_phone,
            date, due_date, subtotal, discount_total, tax_total, grand_total,
            paid_amount, balance_amount, template_id, status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (id) DO NOTHING
        `, [
          invId,
          wsId,
          inv.num,
          'Corporate / Retail Customer',
          '9988776655',
          invDate.toISOString().split('T')[0],
          invDate.toISOString().split('T')[0],
          inv.amount,
          0,
          0,
          inv.amount,
          inv.paid,
          bal,
          'default',
          inv.status,
          invDate,
          invDate
        ]);
      }

      // 7. SaaS Payment Transactions
      for (const pay of b.saasPayments) {
        const payDate = new Date(Date.now() - pay.daysAgo * 24 * 3600 * 1000);
        const payId = crypto.randomUUID();
        await client.query(`
          INSERT INTO public.payment_transactions (
            id, workspace_id, transaction_reference, provider, amount_inr,
            currency, plan_id, status, verified_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO NOTHING
        `, [
          payId,
          wsId,
          pay.ref,
          'youpi_pg',
          pay.amount,
          'INR',
          pay.planId,
          pay.status,
          payDate,
          payDate
        ]);
      }

      // 8. If Suspended, insert suspension record and audit log
      if (!b.isActive) {
        await client.query(`
          INSERT INTO public.platform_workspace_suspensions (
            workspace_id, admin_id, reason, suspended_membership_user_ids,
            suspended_profile_user_ids, is_active_suspension, suspended_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          wsId,
          adminId,
          b.suspensionReason || 'Administrative suspension',
          [],
          [],
          true,
          new Date(Date.now() - 5 * 24 * 3600 * 1000)
        ]);

        await client.query(`
          INSERT INTO public.platform_audit_logs (
            admin_id, admin_email, admin_role, action, target_workspace_id, details, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          adminId,
          'synthetic.admin@staging.vistaar.internal',
          'super_admin',
          'WORKSPACE_SUSPENDED',
          wsId,
          { reason: b.suspensionReason || 'Administrative suspension' },
          new Date(Date.now() - 5 * 24 * 3600 * 1000)
        ]);
      }
    }

    console.log('✅ Successfully seeded comprehensive staging showcase data!');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
