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
    console.log('Upgrading current_user_workspace_id and user_has_workspace_access with active suspension checks...');

    await client.query(`
      CREATE OR REPLACE FUNCTION public.current_user_workspace_id()
      RETURNS UUID
      LANGUAGE plpgsql
      STABLE SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $$
      DECLARE
          v_workspace_id UUID;
          v_is_active BOOLEAN;
      BEGIN
          -- 1. Check authoritative lookup from public.profiles bound to auth.uid()
          SELECT p.workspace_id, w.is_active 
          INTO v_workspace_id, v_is_active
          FROM public.profiles p
          JOIN public.workspaces w ON p.workspace_id = w.id
          WHERE p.id = auth.uid() AND p.status = 'Active';

          -- If workspace is suspended or user is not active, return NULL so RLS blocks access
          IF v_is_active IS NOT TRUE THEN
              RETURN NULL;
          END IF;
          
          RETURN v_workspace_id;
      END;
      $$;
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION public.user_has_workspace_access(p_workspace_id UUID)
      RETURNS BOOLEAN
      LANGUAGE plpgsql
      STABLE SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $$
      DECLARE
          v_user_id UUID := auth.uid();
          v_ws_active BOOLEAN;
      BEGIN
          IF v_user_id IS NULL OR p_workspace_id IS NULL THEN
              RETURN FALSE;
          END IF;

          -- Check if workspace is active
          SELECT is_active INTO v_ws_active FROM public.workspaces WHERE id = p_workspace_id;
          IF v_ws_active IS NOT TRUE THEN
              RETURN FALSE;
          END IF;

          -- Check if user is active in profiles
          IF EXISTS (
              SELECT 1 FROM public.profiles 
              WHERE id = v_user_id AND workspace_id = p_workspace_id AND status = 'Active'
          ) THEN
              RETURN TRUE;
          END IF;

          -- Check active membership
          IF EXISTS (
              SELECT 1 FROM public.workspace_memberships 
              WHERE user_id = v_user_id AND workspace_id = p_workspace_id AND LOWER(status) = 'active'
          ) THEN
              RETURN TRUE;
          END IF;

          RETURN FALSE;
      END;
      $$;
    `);

    console.log('✅ RLS suspension enforcement functions deployed to staging successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

