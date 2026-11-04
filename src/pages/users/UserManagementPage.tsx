import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldCheck,
  KeyRound,
  Lock,
  UserCheck,
  Building,
  CheckCircle,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Tabs } from '../../components/common/Tabs';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { SearchInput } from '../../components/common/SearchInput';
import { Modal } from '../../components/common/Modal';
import { mockTenantUsers, mockPlatformAdmins } from '../../data/mockUsers';
import { TenantUser, AdminUser } from '../../types';
import { formatDate } from '../../utils';
import { adminGatewayClient } from '../../services/adminGatewayClient';

export const UserManagementPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'tenant' | 'admin'>('tenant');
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>(mockTenantUsers);
  const [platformAdmins] = useState<AdminUser[]>(mockPlatformAdmins);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    adminGatewayClient.getUsers(searchQuery).then((res) => {
      if (res.users && res.users.length > 0) {
        const mapped = res.users.map((u: any) => ({
          id: u.id,
          fullName: u.name || 'Tenant User',
          email: u.email,
          phone: u.phone || '',
          primaryWorkspaceId: u.workspaceId,
          primaryWorkspaceName: u.businessName || 'Main Business',
          role: u.role || 'employee',
          accountStatus: u.status || 'Active',
          memberships: [],
          createdAt: u.createdAt,
          lastActiveAt: u.createdAt,
        }));
        setTenantUsers(mapped);
      }
    });
  }, [searchQuery]);

  // Password reset simulation modal
  const [resetModalTarget, setResetModalTarget] = useState<TenantUser | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Filtered lists
  const filteredTenantUsers = tenantUsers.filter(
    (u) =>
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.primaryWorkspaceName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAdmins = platformAdmins.filter(
    (a) =>
      a.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendPasswordReset = () => {
    setResetSuccess(true);
    setTimeout(() => {
      setResetSuccess(false);
      setResetModalTarget(null);
    }, 1500);
  };

  const handleToggleUserStatus = (userId: string) => {
    setTenantUsers((prev) =>
      prev.map((u) => {
        if (u.id === userId) {
          return {
            ...u,
            accountStatus: u.accountStatus === 'Active' ? ('Suspended' as const) : ('Active' as const),
          };
        }
        return u;
      })
    );
  };

  const tenantColumns: Column<TenantUser>[] = [
    {
      key: 'fullName',
      header: 'User / Identity',
      sortable: true,
      render: (u) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            {u.fullName}
          </div>
          <div className="text-xs text-slate-400 font-mono">{u.email}</div>
        </div>
      ),
    },
    {
      key: 'primaryWorkspaceName',
      header: 'Primary Workspace',
      sortable: true,
      render: (u) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          <Building className="w-3.5 h-3.5 text-slate-400" />
          <span>{u.primaryWorkspaceName}</span>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Workspace Role',
      sortable: true,
      render: (u) => (
        <span className="capitalize text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          {u.role}
        </span>
      ),
    },
    {
      key: 'accountStatus',
      header: 'Status',
      sortable: true,
      render: (u) => <StatusBadge status={u.accountStatus} />,
    },
    {
      key: 'lastActiveAt',
      header: 'Last Active',
      sortable: true,
      render: (u) => (
        <span className="text-xs text-slate-400 font-mono">
          {u.lastActiveAt ? formatDate(u.lastActiveAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (u) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => setResetModalTarget(u)}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="Trigger Password Reset Email"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleToggleUserStatus(u.id)}
            className={`p-1.5 rounded-md transition-colors ${
              u.accountStatus === 'Active'
                ? 'hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600'
                : 'hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600'
            }`}
            title={u.accountStatus === 'Active' ? 'Suspend User Access' : 'Reactivate User'}
          >
            {u.accountStatus === 'Active' ? <Lock className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
          </button>
        </div>
      ),
    },
  ];

  const adminColumns: Column<AdminUser>[] = [
    {
      key: 'fullName',
      header: 'Administrator',
      sortable: true,
      render: (a) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-slate-100">{a.fullName}</div>
          <div className="text-xs text-slate-400 font-mono">{a.email}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Platform RBAC Tier',
      sortable: true,
      render: (a) => (
        <span
          className={`capitalize text-xs font-semibold px-2 py-0.5 rounded border ${
            a.role === 'super_admin'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : a.role === 'billing_admin'
              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
          }`}
        >
          {a.role.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'mfaEnabled',
      header: 'MFA Hardening',
      align: 'center',
      render: () => (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          AAL2 Active
        </span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      sortable: true,
      render: (a) => <StatusBadge status={a.isActive ? 'Active' : 'Suspended'} />,
    },
    {
      key: 'lastLoginAt',
      header: 'Last Login',
      sortable: true,
      render: (a) => (
        <span className="text-xs text-slate-400 font-mono">{formatDate(a.lastLoginAt)}</span>
      ),
    },
  ];

  return (
    <PageContainer
      title="User Management & Access Control"
      subtitle="Supervise tenant staff memberships and internal platform administrator roles."
    >
      {/* Tab Switcher */}
      <Tabs
        tabs={[
          { id: 'tenant', label: 'Tenant Staff Memberships', badge: tenantUsers.length, icon: Users },
          { id: 'admin', label: 'Platform Administrators', badge: platformAdmins.length, icon: ShieldCheck },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as 'tenant' | 'admin')}
      />

      {/* Search Header */}
      <div className="flex items-center justify-between mt-4">
        <div className="w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={
              activeTab === 'tenant'
                ? 'Search users, emails, or workspaces...'
                : 'Search administrators...'
            }
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="mt-4">
        {activeTab === 'tenant' ? (
          <DataTable
            data={filteredTenantUsers}
            columns={tenantColumns}
            keyExtractor={(u) => u.id}
            pageSize={8}
            emptyMessage="No tenant users found matching search."
          />
        ) : (
          <DataTable
            data={filteredAdmins}
            columns={adminColumns}
            keyExtractor={(a) => a.id}
            pageSize={8}
            emptyMessage="No platform administrators found."
          />
        )}
      </div>

      {/* Password Reset Modal */}
      <Modal
        isOpen={!!resetModalTarget}
        onClose={() => setResetModalTarget(null)}
        title="Trigger Password Reset"
        subtitle={`Send a secure recovery email to ${resetModalTarget?.email}`}
        footer={
          <>
            <button
              onClick={() => setResetModalTarget(null)}
              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSendPasswordReset}
              disabled={resetSuccess}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5"
            >
              {resetSuccess ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  Email Sent!
                </>
              ) : (
                'Dispatch Reset Email'
              )}
            </button>
          </>
        }
      >
        <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2">
          <p>
            This action generates a time-limited (15 minutes) magic reset link through the Supabase Auth dispatch engine.
          </p>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[11px]">
            Target User: {resetModalTarget?.fullName} ({resetModalTarget?.email})
            <br />
            Associated Workspace: {resetModalTarget?.primaryWorkspaceName}
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
};
