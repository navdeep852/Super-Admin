import fs from 'fs';
import pg from 'pg';

const env = fs.readFileSync('d:/Project/vistaar-main/super_admin/.env.staging', 'utf8')
  .split('\n')
  .reduce((acc, l) => {
    const [k, ...v] = l.trim().split('=');
    if (k && !k.startsWith('#')) acc[k] = v.join('=');
    return acc;
  }, {});

const updateSql = `
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_is_employee BOOLEAN := FALSE;
    v_target_ws_id UUID;
    v_meta_ws TEXT;
    v_role public.user_role;
    v_emp_id TEXT;
    v_must_change_pwd BOOLEAN;
    v_existing_ws UUID;
    v_company_name TEXT;
    v_owner_name TEXT;
    v_phone TEXT;
BEGIN
    -- Check if metadata explicitly denotes employee provisioning
    IF (NEW.raw_user_meta_data->>'account_type' = 'employee') OR
       (NEW.raw_user_meta_data->>'role' = 'employee') OR
       (NEW.raw_user_meta_data->>'role' IN ('staff', 'manager')) THEN
        v_is_employee := TRUE;
    END IF;

    v_meta_ws := NULLIF(TRIM(NEW.raw_user_meta_data->>'workspace_id'), '');
    IF v_meta_ws IS NOT NULL THEN
        BEGIN
            v_target_ws_id := v_meta_ws::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_target_ws_id := NULL;
        END;
    END IF;

    -- =========================================================================
    -- BRANCH A: EMPLOYEE PROVISIONING
    -- =========================================================================
    IF v_is_employee OR (v_target_ws_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_target_ws_id)) THEN
        IF v_target_ws_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_target_ws_id) THEN
            SELECT id INTO v_target_ws_id FROM public.workspaces LIMIT 1;
        END IF;

        v_role := COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), '')::public.user_role,
            'employee'::public.user_role
        );

        v_emp_id := COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'employee_id'), ''),
            public.generate_next_employee_id(v_target_ws_id)
        );

        v_must_change_pwd := COALESCE(
            (NEW.raw_user_meta_data->>'must_change_password')::BOOLEAN,
            TRUE
        );

        INSERT INTO public.profiles (
            id,
            workspace_id,
            employee_id,
            name,
            email,
            phone,
            department,
            designation,
            role,
            status,
            must_change_password,
            created_at,
            updated_at
        ) VALUES (
            NEW.id,
            v_target_ws_id,
            v_emp_id,
            COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''), 'Employee'),
            LOWER(NEW.email),
            COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''), ''),
            NULLIF(TRIM(NEW.raw_user_meta_data->>'department'), ''),
            NULLIF(TRIM(NEW.raw_user_meta_data->>'designation'), ''),
            v_role,
            'Active',
            v_must_change_pwd,
            NOW(),
            NOW()
        ) ON CONFLICT (id) DO UPDATE SET
            workspace_id = COALESCE(EXCLUDED.workspace_id, public.profiles.workspace_id),
            employee_id = COALESCE(EXCLUDED.employee_id, public.profiles.employee_id),
            name = COALESCE(EXCLUDED.name, public.profiles.name),
            email = EXCLUDED.email,
            phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
            department = COALESCE(EXCLUDED.department, public.profiles.department),
            designation = COALESCE(EXCLUDED.designation, public.profiles.designation),
            role = EXCLUDED.role,
            status = 'Active',
            must_change_password = EXCLUDED.must_change_password,
            updated_at = NOW();

        -- Provision workspace membership
        INSERT INTO public.workspace_memberships (
            workspace_id, user_id, role, status
        ) VALUES (
            v_target_ws_id, NEW.id, v_role::text, 'Active'
        ) ON CONFLICT (user_id, workspace_id) DO UPDATE SET
            role = EXCLUDED.role,
            status = 'Active';

        -- Return immediately! Never create workspace or owner settings for employees!
        RETURN NEW;
    END IF;

    -- =========================================================================
    -- BRANCH B: STANDARD OWNER REGISTRATION WORKFLOW
    -- =========================================================================
    v_existing_ws := extensions.uuid_generate_v4();

    v_company_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'company_name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), '') || '''s Business',
        'My Business'
    );

    v_owner_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
        'Owner'
    );

    v_phone := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), ''),
        ''
    );

    -- 1. Create or retrieve unique Workspace based on owner_email
    INSERT INTO public.workspaces (id, company_name, owner_name, owner_email, owner_phone)
    VALUES (v_existing_ws, v_company_name, v_owner_name, NEW.email, v_phone)
    ON CONFLICT (owner_email) DO NOTHING
    RETURNING id INTO v_existing_ws;

    IF v_existing_ws IS NULL THEN
        SELECT id INTO v_existing_ws
        FROM public.workspaces
        WHERE owner_email = NEW.email;
    END IF;

    -- 2. Create User Profile linked to auth.users.id and workspace_id
    INSERT INTO public.profiles (
        id, workspace_id, employee_id, name, email, phone, role, status, must_change_password
    ) VALUES (
        NEW.id, v_existing_ws, 'VST-EMP-001', v_owner_name, NEW.email, v_phone, 'owner', 'Active', FALSE
    ) ON CONFLICT (id) DO UPDATE SET
        workspace_id = EXCLUDED.workspace_id,
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        updated_at = NOW();

    -- 3. Create default Business Settings for workspace
    INSERT INTO public.business_settings (
        workspace_id, legal_name, owner_name, phone, email, address, city, state, pincode, currency
    ) VALUES (
        v_existing_ws, v_company_name, v_owner_name, v_phone, NEW.email, 'Business Address', 'City', 'State', '000000', '₹'
    ) ON CONFLICT (workspace_id) DO NOTHING;

    -- 4. Create default Inventory Settings for workspace
    INSERT INTO public.inventory_settings (
        workspace_id, uses_part_number
    ) VALUES (
        v_existing_ws, true
    ) ON CONFLICT (workspace_id) DO NOTHING;

    -- 5. Create default 14-day Free Trial Subscription
    INSERT INTO public.workspace_subscriptions (
        workspace_id, plan_id, status, trial_start, trial_end, current_period_start, current_period_end
    ) VALUES (
        v_existing_ws, 'free_trial', 'trialing', NOW(), NOW() + INTERVAL '14 days', NOW(), NOW() + INTERVAL '14 days'
    ) ON CONFLICT (workspace_id) DO NOTHING;

    -- 6. Create Workspace Membership for Owner
    INSERT INTO public.workspace_memberships (
        workspace_id, user_id, role, status
    ) VALUES (
        v_existing_ws, NEW.id, 'owner', 'Active'
    ) ON CONFLICT (user_id, workspace_id) DO NOTHING;

    RETURN NEW;
END;
$function$;
`;

async function applyTriggerUpdate() {
  const client = new pg.Client({
    connectionString: env['STAGING_DIRECT_DATABASE_URL'],
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  await client.query(updateSql);
  console.log('Successfully updated handle_new_user() with automatic subscription and membership provisioning!');
  await client.end();
}

applyTriggerUpdate().catch(console.error);

