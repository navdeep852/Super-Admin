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

async function testPipeline() {
  const client = new pg.Client({
    connectionString: env['STAGING_DIRECT_DATABASE_URL'],
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  console.log('Testing each migration individually in isolated transactions...');

  const results = [];

  for (const f of files) {
    if (f === '001_initial_schema.sql') {
      results.push({ file: f, status: 'ALREADY_APPLIED' });
      continue;
    }
    if (f === '003_seed_initial_data.sql' || f === '005_phase3b_live_import.sql' || f === '006_post_migration_audit.sql') {
      results.push({ file: f, status: 'SKIPPED_SEED' });
      continue;
    }

    const sql = fs.readFileSync(path.join(dir, f), 'utf8');

    // Run each in an isolated transaction that rolls back immediately
    try {
      await client.query('BEGIN;');
      await client.query(sql);
      await client.query('ROLLBACK;');
      results.push({ file: f, status: 'PASS_ISOLATED' });
      console.log(`[PASS] ${f}`);
    } catch (err) {
      await client.query('ROLLBACK;');
      results.push({ file: f, status: 'FAIL', error: err.message });
      console.log(`[FAIL] ${f} -> ${err.message}`);
    }
  }

  await client.end();
  fs.writeFileSync('d:/Project/vistaar-main/super_admin/scripts/pipeline_test_report.json', JSON.stringify(results, null, 2));
  console.log('Done testing isolated migrations.');
}

testPipeline().catch(console.error);

