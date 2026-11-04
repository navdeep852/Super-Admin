import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';

interface PermissionDeniedProps {
  moduleName?: string;
  requiredRole?: string;
}

export const PermissionDenied: React.FC<PermissionDeniedProps> = ({
  moduleName = 'this section',
  requiredRole = 'Super Administrator',
}) => {
  const { currentAdmin } = useAdminAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="p-4 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 mb-4 animate-in zoom-in-90">
        <ShieldAlert className="w-12 h-12" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
        Access Restricted
      </h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-md">
        Your current active role (<span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">{currentAdmin?.role ? currentAdmin.role.replace('_', ' ') : 'Unassigned'}</span>)
        does not have permission to view or manage {moduleName}.
      </p>
      <div className="mt-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 max-w-sm text-left">
        <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
          Role-Based Access Control (RBAC) Enforcement:
        </div>
        <div>
          This module requires <span className="font-semibold text-emerald-600 dark:text-emerald-400">{requiredRole}</span> privileges. Access is enforced by the authoritative Gateway BFF.
        </div>
      </div>
    </div>
  );
};

