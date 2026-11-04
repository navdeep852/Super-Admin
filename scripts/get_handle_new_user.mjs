import fs from 'fs';
import pg from 'pg';

const env = fs.readFileSync('d:/Project/vistaar-main/super_admin/.env.staging', 'utf8')
  .split('\n')
  .reduce((acc, l) => {
    const [k, ...v] = l.trim().split('=');
    if (k && !k.startsWith('#')) acc[k] = v.join('=');
    return acc;
  }, {});

async function getFn() {
  const client = new pg.Client({
    connectionString: env['STAGING_DIRECT_DATABASE_URL'],
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const res = await client.query("SELECT pg_get_functiondef('public.handle_new_user'::regproc);");
  console.log(res.rows[0].pg_get_functiondef);
  await client.end();
}

getFn().catch(console.error);

