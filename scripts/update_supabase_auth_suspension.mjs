import fs from 'fs';

const filePath = 'd:/Project/vistaar-main/vistaar-main/src/services/supabaseAuth.ts';
let code = fs.readFileSync(filePath, 'utf8');

const target1 = ".select('id, workspace_id, employee_id, name, email, phone, department, designation, role, status, avatar_url, must_change_password, workspaces!inner(id, company_name)')";
const replacement1 = ".select('id, workspace_id, employee_id, name, email, phone, department, designation, role, status, avatar_url, must_change_password, workspaces!inner(id, company_name, is_active, suspension_reason)')";

const target2 = "if (profile.status && profile.status !== 'Active') {";
const replacement2 = `if (workspaceRecord && (workspaceRecord as any).is_active === false) {
        await supabase.auth.signOut().catch(() => {});
        this.currentProfile = null;
        this.saveSessionToStorage(null);
        this.notify();
        throw new Error(\`[WORKSPACE_STATUS_SUSPENDED] Workspace has been suspended by administration. Reason: \${(workspaceRecord as any).suspension_reason || 'Administrative action'}. Access denied.\`);
      }

      if (profile.status && profile.status !== 'Active') {`;

if (code.includes(target1) && code.includes(target2)) {
  code = code.replace(target1, replacement1);
  code = code.replace(target2, replacement2);
  fs.writeFileSync(filePath, code, 'utf8');
  console.log('✅ Updated supabaseAuth.ts successfully.');
} else {
  console.error('Target strings not found in supabaseAuth.ts');
}

