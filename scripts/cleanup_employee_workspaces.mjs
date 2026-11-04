import fs from 'fs';
import pg from 'pg';

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

async function main() {
  const client = await pool.connect();
  try {
    console.log('Cleaning up orphaned employee auto-created workspaces...');
    
    // Find workspaces that have company_name like "%'s Business" where owner_email belongs to an employee
    const res = await client.query(`
      SELECT w.id, w.company_name, w.owner_email
      FROM public.workspaces w
      WHERE w.company_name LIKE '%''s Business'
        AND w.owner_email != 'synthetic.admin@staging.vistaar.internal'
    `);

    console.log(`Found ${res.rowCount} employee placeholder workspaces to remove:`);
    for (const r of res.rows) {
      console.log(`  Deleting workspace: ${r.company_name} (${r.id})`);
      await client.query('DELETE FROM public.workspace_subscriptions WHERE workspace_id = $1', [r.id]);
      await client.query('DELETE FROM public.business_settings WHERE workspace_id = $1', [r.id]);
      await client.query('DELETE FROM public.inventory_settings WHERE workspace_id = $1', [r.id]);
      await client.query('DELETE FROM public.workspace_memberships WHERE workspace_id = $1', [r.id]);
      await client.query('DELETE FROM public.workspaces WHERE id = $1', [r.id]);
    }

    const remaining = await client.query('SELECT count(*) FROM public.workspaces');
    console.log(`✅ Cleaned up! Remaining active business workspaces: ${remaining.rows[0].count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

