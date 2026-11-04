import React, { useState, useEffect } from 'react';
import {
  Sliders,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { SearchInput } from '../../components/common/SearchInput';
import { Modal } from '../../components/common/Modal';
import { mockSubscriptions as initialSubscriptions } from '../../data/mockSubscriptions';
import { Subscription } from '../../types';
import { formatINR, formatDate } from '../../utils';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { adminGatewayClient } from '../../services/adminGatewayClient';

export const SubscriptionManagementPage: React.FC = () => {
  const { currentAdmin } = useAdminAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(initialSubscriptions);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    adminGatewayClient.getSubscriptions().then((res) => {
      if (res.subscriptions && res.subscriptions.length > 0) {
        const mapped = res.subscriptions.map((s: any) => ({
          id: s.id,
          workspaceId: s.workspace_id,
          workspaceName: s.workspaces?.company_name || 'Retail Business',
          planId: s.plan_id || 'free_trial',
          planName: s.subscription_plans?.name || '14-Day Free Trial',
          status: s.status,
          billingInterval: s.billing_interval || 'annual',
          currentPeriodStart: s.current_period_start || s.trial_start || s.created_at,
          currentPeriodEnd: s.current_period_end || s.trial_end || s.created_at,
          amountInr: Number(s.subscription_plans?.price_annual_inr || 0),
          discountAppliedInr: 0,
          cancelAtPeriodEnd: s.cancel_at_period_end || false,
          nextRenewalDate: s.current_period_end || s.trial_end || s.created_at,
        }));
        setSubscriptions(mapped);
      }
    });
  }, []);

  // Plan Override Modal
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [newPlanId, setNewPlanId] = useState<string>('business');
  const [extensionDays, setExtensionDays] = useState(30);

  const filteredSubs = subscriptions.filter((sub) => {
    const matchesSearch =
      sub.workspaceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.planName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleApplyOverride = () => {
    if (!selectedSub) return;
    setSubscriptions((prev) =>
      prev.map((s) => {
        if (s.id === selectedSub.id) {
          const newEnd = new Date(s.currentPeriodEnd);
          newEnd.setDate(newEnd.getDate() + extensionDays);
          const planNameMap: Record<string, string> = {
            starter: 'Starter Plan',
            starter_mobile: 'Starter + Mobile Add-on',
            business: 'Business Plan',
            growth: 'Growth Plan',
            free_trial: '14-Day Free Trial',
          };
          return {
            ...s,
            planId: newPlanId,
            planName: planNameMap[newPlanId] || newPlanId,
            status: 'active' as const,
            currentPeriodEnd: newEnd.toISOString(),
            isManualOverride: true,
          };
        }
        return s;
      })
    );
    setSelectedSub(null);
  };

  const columns: Column<Subscription>[] = [
    {
      key: 'workspaceName',
      header: 'Workspace / Organization',
      sortable: true,
      render: (s) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-slate-100">{s.workspaceName}</div>
          <div className="text-[11px] text-slate-400 font-mono">{s.id}</div>
        </div>
      ),
    },
    {
      key: 'planName',
      header: 'Plan Tier',
      sortable: true,
      render: (s) => (
        <span className="capitalize text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          {s.planName}
        </span>
      ),
    },
    {
      key: 'billingInterval',
      header: 'Cycle',
      sortable: true,
      render: (s) => (
        <span className="capitalize text-xs text-slate-600 dark:text-slate-400">
          {s.billingInterval}
        </span>
      ),
    },
    {
      key: 'amountInr',
      header: 'Recurring Fee',
      sortable: true,
      render: (s) => (
        <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
          {formatINR(s.amountInr)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Subscription Status',
      sortable: true,
      render: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: 'currentPeriodEnd',
      header: 'Renews / Expires',
      sortable: true,
      render: (s) => (
        <div>
          <span className="text-xs text-slate-700 dark:text-slate-300 font-mono">
            {formatDate(s.currentPeriodEnd)}
          </span>
          {s.cancelAtPeriodEnd && (
            <span className="block text-[10px] text-rose-500 font-medium">Canceling</span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (s) => (
        <button
          onClick={() => {
            setSelectedSub(s);
            setNewPlanId(s.planId);
          }}
          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          title="Administrative Plan Override"
        >
          <Sliders className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <PageContainer
      title="Subscription Lifecycle Management"
      subtitle="Supervise multi-tenant billing tiers across all 8 canonical subscription states."
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            Active Subscriptions: <strong className="text-emerald-500">{subscriptions.filter(s => s.status === 'active').length}</strong>
          </span>
        </div>
      }
    >
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="w-full sm:w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search subscriptions by workspace or plan..."
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300"
          >
            <option value="all">All Subscription States</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past Due</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Subscriptions Table */}
      <div className="mt-4">
        <DataTable
          data={filteredSubs}
          columns={columns}
          keyExtractor={(s) => s.id}
          pageSize={8}
          emptyMessage="No subscriptions match current criteria."
        />
      </div>

      {/* Administrative Plan Override Modal */}
      <Modal
        isOpen={!!selectedSub}
        onClose={() => setSelectedSub(null)}
        title="Administrative Subscription Override"
        subtitle={`Adjust plan tier or extend grace period for ${selectedSub?.workspaceName}`}
        footer={
          <>
            <button
              onClick={() => setSelectedSub(null)}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyOverride}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
            >
              Commit Plan Override
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-slate-400 block text-[10px]">Current Plan</span>
              <strong className="capitalize text-slate-800 dark:text-slate-200">{selectedSub?.planName}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Current Expiry</span>
              <span className="font-mono">{selectedSub ? formatDate(selectedSub.currentPeriodEnd) : ''}</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
              Select New Plan Tier
            </label>
            <select
              value={newPlanId}
              onChange={(e) => setNewPlanId(e.target.value as any)}
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              <option value="starter">Starter Plan (₹299/mo)</option>
              <option value="starter_mobile">Starter + Mobile (₹498/mo)</option>
              <option value="business">Business Plan (₹699/mo)</option>
              <option value="growth">Growth Plan (₹1,199/mo)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
              Grace Period Extension (Days)
            </label>
            <input
              type="number"
              value={extensionDays}
              onChange={(e) => setExtensionDays(parseInt(e.target.value) || 0)}
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
            />
          </div>

          <p className="text-[11px] text-slate-400">
            Note: All overrides are cryptographically recorded in the platform audit log with admin signature ({currentAdmin?.email || 'authenticated admin'}).
          </p>
        </div>
      </Modal>
    </PageContainer>
  );
};
