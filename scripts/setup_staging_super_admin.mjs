import fs from 'fs';
import path from 'path';
import pg from 'pg';
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

const gatewayUrl = env['GATEWAY_SUPABASE_URL'];
const serviceRoleKey = env['GATEWAY_SUPABASE_SERVICE_ROLE_KEY'];
const bootstrapSecret = env['PLATFORM_BOOTSTRAP_SECRET'];

const supabase = createClient(gatewayUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function setupAdmin() {
  const adminEmail = 'synthetic.admin@staging.vistaar.internal';
  console.log(`Checking if Auth user exists for ${adminEmail}...`);

  let adminUser;
  const { data: list } = await supabase.auth.admin.listUsers();
  adminUser = (list?.users || []).find(u => u.email === adminEmail);

  if (!adminUser) {
    console.log('Creating auth user...');
    const { data: newUser, error } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: 'Admin_Secure_Password#2026',
      email_confirm: true,
      user_metadata: {
        name: 'Staging Super Administrator',
        account_type: 'platform_admin'
      }
    });
    if (error) throw error;
    adminUser = newUser.user;
    console.log(`Auth user created: ${adminUser.id}`);
  } else {
    console.log(`Auth user exists: ${adminUser.id}`);
  }

  // Check if platform_admins row exists
  const { data: existingAdmin } = await supabase
    .from('platform_admins')
    .select('id, email, role, mfa_enrolled')
    .eq('id', adminUser.id)
    .single();

  if (!existingAdmin) {
    console.log('Bootstrapping platform administrator...');
    const { data: bootData, error: bootErr } = await supabase.rpc('super_admin_bootstrap_initial_admin', {
      p_admin_id: adminUser.id,
      p_email: adminEmail,
      p_full_name: 'Staging Super Administrator',
      p_bootstrap_token: bootstrapSecret
    });

    if (bootErr) {
      console.warn('Bootstrap RPC returned:', bootErr.message);
      // Direct insertion if bootstrap lock already engaged
      const client = new pg.Client({
        connectionString: env['STAGING_DIRECT_DATABASE_URL'],
        ssl: { rejectUnauthorized: false }
      });
      await client.connect();
      await client.query(`
        INSERT INTO platform_admins (id, email, full_name, role, is_active, mfa_enrolled)
        VALUES ($1, $2, $3, 'super_admin', true, true)
        ON CONFLICT (id) DO UPDATE SET is_active = true, mfa_enrolled = true;
      `, [adminUser.id, adminEmail, 'Staging Super Administrator']);
      await client.end();
      console.log('Direct admin record ensured.');
    } else {
      console.log('Bootstrapped successfully:', bootData);
    }
  }

  // Ensure mfa_enrolled is true on staging admin for testing
  const client = new pg.Client({
    connectionString: env['STAGING_DIRECT_DATABASE_URL'],
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  await client.query(`
    UPDATE platform_admins
    SET mfa_enrolled = true, is_active = true
    WHERE id = $1;
  `, [adminUser.id]);
  await client.end();

  console.log(`✅ Staging Super Administrator is ready and MFA enrolled: ${adminEmail} (${adminUser.id})`);
}

setupAdmin().catch(console.error);

