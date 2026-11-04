import fs from 'fs';
import pg from 'pg';

const env = fs.readFileSync('d:/Project/vistaar-main/super_admin/.env.staging', 'utf8')
  .split('\n')
  .reduce((acc, l) => {
    const [k, ...v] = l.trim().split('=');
    if (k && !k.startsWith('#')) acc[k] = v.join('=');
    return acc;
  }, {});

async function check() {
  const client = new pg.Client({
    connectionString: env['STAGING_DIRECT_DATABASE_URL'],
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const trigs = await client.query(`
    SELECT trigger_name, event_manipulation, event_object_table, action_statement
    FROM information_schema.triggers
    ORDER BY event_object_table, trigger_name;
  `);
  console.log('Triggers found:', trigs.rows);

  const fns = await client.query(`
    SELECT routine_name FROM information_schema.routines
    WHERE routine_schema = 'public'
    ORDER BY routine_name;
  `);
  console.log('Functions in public:', fns.rows.map(r => r.routine_name));

  await client.end();
}

check().catch(console.error);

