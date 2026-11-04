import fs from 'fs';
import path from 'path';
import pg from 'pg';

const envPath = 'd:/Project/vistaar-main/super_admin/.env.staging';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
});

const dir = 'd:/Project/vistaar-main/vistaar-main/supabase/migrations';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

async function runAudit() {
  const client = new pg.Client({
    connectionString: env['STAGING_DIRECT_DATABASE_URL'],
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log('Connected to Staging PostgreSQL directly.');

  // Always run within an outer transaction so staging DB is 100% untouched and clean!
  await client.query('BEGIN;');

  const results = [];
  let simulatedFixes = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (f === '003_seed_initial_data.sql' || f === '005_phase3b_live_import.sql' || f === '006_post_migration_audit.sql') {
      results.push({ file: f, status: 'SKIPPED_SEED' });
      continue;
    }

    const sql = fs.readFileSync(path.join(dir, f), 'utf8');

    // Create a savepoint for this migration
    const sp = `sp_${i}`;
    await client.query(`SAVEPOINT ${sp};`);
    try {
      await client.query(sql);
      await client.query(`RELEASE SAVEPOINT ${sp};`);
      results.push({ file: f, status: 'PASS' });
      console.log(`[PASS] ${f}`);
    } catch (err) {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp};`);
      results.push({ file: f, status: 'FAIL', error: err.message });
      console.log(`[FAIL] ${f} -> ${err.message}`);

      // Check if it's a known drift fixable by prerequisite column
      if (err.message.includes('column p.current_stock does not exist') || err.message.includes('current_stock')) {
        console.log('Attempting fix: adding current_stock to products...');
        try {
          await client.query('ALTER TABLE public.products ADD COLUMN IF NOT EXISTS current_stock NUMERIC(12,2) DEFAULT 0;');
          simulatedFixes.push('ALTER TABLE public.products ADD COLUMN IF NOT EXISTS current_stock NUMERIC(12,2) DEFAULT 0;');
          // retry
          await client.query(sql);
          console.log(`[PASS AFTER PREREQ] ${f}`);
          results[results.length - 1].status = 'PASS_AFTER_FIX';
          results[results.length - 1].fix = 'Added current_stock to products';
        } catch (retryErr) {
          console.log(`[STILL FAILED] ${f} -> ${retryErr.message}`);
          await client.query(`ROLLBACK TO SAVEPOINT ${sp};`);
        }
      }
    }
  }

  // Rollback everything so database remains pristine
  await client.query('ROLLBACK;');
  console.log('\n--- AUDIT COMPLETE: ALL TRANSACTIONS ROLLED BACK ---');
  await client.end();

  const summary = {
    totalMigrations: files.length,
    passed: results.filter(r => r.status === 'PASS' || r.status === 'PASS_AFTER_FIX').length,
    failed: results.filter(r => r.status === 'FAIL').length,
    skippedSeed: results.filter(r => r.status === 'SKIPPED_SEED').length,
    simulatedFixes,
    details: results
  };

  fs.writeFileSync('d:/Project/vistaar-main/super_admin/scripts/migration_audit_results.json', JSON.stringify(summary, null, 2));
  console.log(`Saved audit results to scripts/migration_audit_results.json`);
}

runAudit().catch(err => {
  console.error('Audit crashed:', err);
  process.exit(1);
});

