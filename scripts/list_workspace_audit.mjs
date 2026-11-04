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

const supabase = createClient(env.GATEWAY_SUPABASE_URL, env.GATEWAY_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: workspaces } = await supabase.from('workspaces').select('id, company_name, owner_email, is_test, created_at');
  const { data: subs } = await supabase.from('workspace_subscriptions').select('id, workspace_id, plan_id, status, is_test, created_at');

  console.log(`Workspaces count: ${workspaces.length}`);
  for (const w of workspaces) {
    const sub = subs.find(s => s.workspace_id === w.id);
    console.log(`- ${w.company_name} | ID: ${w.id} | Email: ${w.owner_email} | is_test: ${w.is_test} | Sub: ${sub ? sub.plan_id + ' (' + sub.status + ')' : 'NONE'}`);
  }
}

main().catch(console.error);
