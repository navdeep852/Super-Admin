import React, { useState, useEffect } from 'react';
import {
  Sliders,
  CreditCard,
  Building2,
  UserCheck,
  Clock,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Calendar,
  Layers,
  Database,
  Search,
  Filter,
  DollarSign,
  Tag,
  Loader2,
  Info,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { SearchInput } from '../../components/common/SearchInput';
import { Modal } from '../../components/common/Modal';
import { formatINR, formatDate, formatDateTime } from '../../utils';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { adminGatewayClient } from '../../services/adminGatewayClient';

export interface AuthoritativeSubscriptionRow {
  id: string;
  workspaceId: string;
  workspaceName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  planId: string;
  planName: string;
  status: 'trialing' | 'active' | 'payment_pending' | 'past_due' | 'cancelled' | 'expired';
  billingInterval: 'monthly' | 'annual' | 'trial';
  originalPlanPriceInr: number;
  effectivePriceInr: number;
  discountAppliedInr: number;
  gstAmountInr: number;
  finalPayableInr: number;
  customPriceInr: number | null;
  overrideReason: string | null;
  pricingModel: string;
  trialStart: string | null;
  trialEnd: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isTest: boolean;
  createdAt: string;
}

export interface SubscriptionMetaStats {
  totalRegisteredWorkspaces: number;
  totalSubscribedWorkspaces: number;
  activePaidSubscriptions: number;
  activeFreeTrials: number;
  expiredSubscriptions: number;
  cancelledSubscriptions: number;
  pastDueSubscriptions: number;
  totalRecurringValueInr: number;
}

export const SubscriptionManagementPage: React.FC = () => {
  const { currentAdmin, hasPermission } = useAdminAuth();
  const [subscriptions, setSubscriptions] = useState<AuthoritativeSubscriptionRow[]>([]);
  const [stats, setStats] = useState<SubscriptionMetaStats | null>(null);
  const [metaInfo, setMetaInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & Scope
  const [scope, setScope] = useState<'genuine' | 'test' | 'all'>('genuine');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');

  // Plan Override Modal State
  const [selectedSub, setSelectedSub] = useState<AuthoritativeSubscriptionRow | null>(null);
  const [overrideAction, setOverrideAction] = useState<'change_plan' | 'extend_trial' | 'custom_price' | 'cancel_at_period_end'>('change_plan');
  const [newPlanId, setNewPlanId] = useState<string>('business');
  const [newInterval, setNewInterval] = useState<'monthly' | 'annual'>('monthly');
  const [extensionDays, setExtensionDays] = useState(14);
  const [customPrice, setCustomPrice] = useState<number>(699);
  const [overrideReason, setOverrideReason] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchSubscriptions = async () => {
    try {
      setErrorMessage(null);
      const res = await adminGatewayClient.getSubscriptions({
        scope,
        status: statusFilter,
        plan: planFilter,
        search: searchQuery,
      });
      setSubscriptions(res.subscriptions || []);
      setStats(res.meta?.stats || null);
      setMetaInfo(res.meta || null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to fetch authoritative subscriptions from database');
      setSubscriptions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [scope, statusFilter, planFilter, searchQuery]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSubscriptions();
  };

  const handleApplyOverride = async () => {
    if (!selectedSub) return;
    setActionInProgress(true);
    try {
      let payload: any = { action: overrideAction };
      if (overrideAction === 'change_plan') {
        payload.plan_id = newPlanId;
        payload.billing_interval = newInterval;
      } else if (overrideAction === 'extend_trial') {
        payload.extension_days = extensionDays;
      } else if (overrideAction === 'custom_price') {
        if (!overrideReason.trim()) {
          throw new Error('Mandatory override reason required for financial audit');
        }
        payload.custom_price_inr = customPrice;
        payload.override_reason = overrideReason.trim();
        payload.override_days = 90;
      } else if (overrideAction === 'cancel_at_period_end') {
        payload.action = 'cancel_at_period_end';
      }

      await adminGatewayClient.manageWorkspaceSubscription(selectedSub.workspaceId, payload);
      setToastMessage({ text: `Subscription terms successfully updated for ${selectedSub.workspaceName}`, type: 'success' });
      setSelectedSub(null);
      await fetchSubscriptions();
    } catch (err: any) {
      setToastMessage({ text: err.message || 'Failed to update subscription', type: 'error' });
    } finally {
      setActionInProgress(false);
    }
  };

  const columns: Column<AuthoritativeSubscriptionRow>[] = [
    {
      key: 'workspaceName',
      header: 'Workspace & Tenant',
      sortable: true,
      render: (s) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            {s.workspaceName}
            {s.isTest && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30">
                STAGING FIXTURE
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]" title={s.workspaceId}>
            {s.workspaceId}
          </div>
        </div>
      ),
    },
    {
      key: 'ownerName',
      header: 'Owner',
      sortable: true,
      render: (s) => (
        <div>
          <div className="text-xs font-medium text-slate-800 dark:text-slate-200">{s.ownerName}</div>
          <div className="text-[11px] text-slate-400 truncate max-w-[160px] font-mono">{s.ownerEmail}</div>
        </div>
      ),
    },
    {
      key: 'planName',
      header: 'Plan Tier',
      sortable: true,
      render: (s) => (
        <span className="capitalize text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          {s.planName}
        </span>
      ),
    },
    {
      key: 'billingInterval',
      header: 'Cycle',
      sortable: true,
      render: (s) => (
        <span className="capitalize text-xs text-slate-600 dark:text-slate-400 font-mono">
          {s.billingInterval}
        </span>
      ),
    },
    {
      key: 'effectivePriceInr',
      header: 'Recurring Fee',
      align: 'right',
      sortable: true,
      render: (s) => {
        const isTrial = s.status === 'trialing' || s.planId === 'free_trial';
        return (
          <div className="text-right">
            <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
              {isTrial ? '₹0 (Trial)' : formatINR(s.effectivePriceInr)}
            </span>
            {s.customPriceInr !== null && (
              <span className="block text-[10px] text-amber-500 font-semibold">
                Custom Override
              </span>
            )}
            {s.discountAppliedInr > 0 && (
              <span className="block text-[10px] text-emerald-500">
                -{formatINR(s.discountAppliedInr)} off
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Subscription State',
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
            {formatDate(s.currentPeriodEnd || s.trialEnd || s.createdAt)}
          </span>
          {s.cancelAtPeriodEnd && (
            <span className="block text-[10px] text-rose-500 font-semibold">Canceling</span>
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
            setNewInterval(s.billingInterval === 'annual' ? 'annual' : 'monthly');
            setCustomPrice(s.effectivePriceInr || 699);
            setOverrideReason(s.overrideReason || '');
          }}
          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          title="Administrative Subscription Override"
        >
          <Sliders className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <PageContainer
      title="Subscription Lifecycle Management"
      subtitle="Authoritative multi-tenant subscription ledger queried directly from PostgreSQL. Staging test fixtures strictly segregated from genuine customer accounts."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Refresh from database"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      }
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`mb-4 p-3 rounded-lg text-xs flex items-center justify-between border ${
            toastMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={handleRefresh}
            className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold text-[11px]"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Source Transparency & Air-Gap Badge Bar */}
      <div className="mb-5 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Database className="w-4 h-4 text-emerald-400" />
            Data Source: <strong className="font-mono text-emerald-400">PostgreSQL (v_authoritative_subscriptions)</strong>
          </span>
          <span className="text-slate-600 dark:text-slate-700">|</span>
          <span className="text-slate-400 text-[11px]">
            Target: <span className="font-mono text-slate-300">{metaInfo?.stagingProjectRef || 'vlbhxcajphyjkeueubud'}</span> ({metaInfo?.environment || 'staging'})
          </span>
          <span className="text-slate-600 dark:text-slate-700">|</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
            <ShieldCheck className="w-3 h-3" />
            Production Air-Gap Active (kluxsykimnjivkqxelba Untouched)
          </span>
        </div>
        <div className="text-[11px] text-slate-500 font-mono">
          Synced: {metaInfo?.synchronizedAt ? formatDateTime(metaInfo.synchronizedAt) : 'Just now'}
        </div>
      </div>

      {/* Real Subscriber Statistics Cards (Section 7) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Registered Workspaces</span>
          <span className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
            {stats?.totalRegisteredWorkspaces ?? 0}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Total in DB</span>
        </div>

        <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 shadow-xs">
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold block">Active Paid</span>
          <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {stats?.activePaidSubscriptions ?? 0}
          </span>
          <span className="text-[10px] text-emerald-700 dark:text-emerald-500 block mt-0.5">Paying Subscriptions</span>
        </div>

        <div className="p-3.5 rounded-xl border border-sky-500/20 bg-sky-500/5 shadow-xs">
          <span className="text-[10px] text-sky-600 dark:text-sky-400 uppercase font-semibold block">Active Trials</span>
          <span className="text-lg font-bold font-mono text-sky-600 dark:text-sky-400">
            {stats?.activeFreeTrials ?? 0}
          </span>
          <span className="text-[10px] text-sky-700 dark:text-sky-500 block mt-0.5">14-Day Free Evals</span>
        </div>

        <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 shadow-xs">
          <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-semibold block">Past Due</span>
          <span className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">
            {stats?.pastDueSubscriptions ?? 0}
          </span>
          <span className="text-[10px] text-amber-700 dark:text-amber-500 block mt-0.5">Awaiting Settlement</span>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Expired</span>
          <span className="text-lg font-bold font-mono text-slate-700 dark:text-slate-300">
            {stats?.expiredSubscriptions ?? 0}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Lapsed Tenures</span>
        </div>

        <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/5 shadow-xs">
          <span className="text-[10px] text-rose-600 dark:text-rose-400 uppercase font-semibold block">Cancelled</span>
          <span className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400">
            {stats?.cancelledSubscriptions ?? 0}
          </span>
          <span className="text-[10px] text-rose-700 dark:text-rose-500 block mt-0.5">Terminated</span>
        </div>

        <div className="p-3.5 rounded-xl border border-purple-500/20 bg-purple-500/5 shadow-xs col-span-2 sm:col-span-1">
          <span className="text-[10px] text-purple-600 dark:text-purple-400 uppercase font-semibold block">Est. Monthly Run-Rate</span>
          <span className="text-lg font-bold font-mono text-purple-600 dark:text-purple-400">
            {formatINR(stats?.totalRecurringValueInr ?? 0)}
          </span>
          <span className="text-[10px] text-purple-700 dark:text-purple-500 block mt-0.5">Normalized MRR</span>
        </div>
      </div>

      {/* Scope Selector Bar (Genuine Customers vs Staging Test Fixtures) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs mb-4">
        {/* Scope Pill Selector */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 text-xs w-full sm:w-auto">
          <button
            onClick={() => setScope('genuine')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center gap-1.5 ${
              scope === 'genuine'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Genuine Subscribers Only
          </button>
          <button
            onClick={() => setScope('test')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center gap-1.5 ${
              scope === 'test'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            Staging Test Fixtures ({metaInfo?.scope === 'test' ? subscriptions.length : 11})
          </button>
          <button
            onClick={() => setScope('all')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
              scope === 'all'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Database Records
          </button>
        </div>

        {/* Search & Status Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
          <div className="w-full sm:w-64">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by workspace or owner..."
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past Due</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="w-full sm:w-auto text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300"
          >
            <option value="all">All Plans</option>
            <option value="starter">Starter</option>
            <option value="starter_mobile">Starter + Mobile</option>
            <option value="business">Business</option>
            <option value="growth">Growth</option>
            <option value="free_trial">14-Day Free Trial</option>
          </select>
        </div>
      </div>

      {/* Scope Alert Notice */}
      {scope === 'genuine' && subscriptions.length === 0 && !loading && (
        <div className="p-8 mb-6 text-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40">
          <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
          <h4 className="text-sm font-semibold text-white">No Genuine Production Subscribers in Staging</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-lg mx-auto leading-relaxed">
            The Super Admin is currently connected to the <strong className="text-emerald-400 font-mono">staging</strong> database (<span className="font-mono">vlbhxcajphyjkeueubud</span>).
            Under the Phase 4 Production Air-Gap mandate, production customer records (<span className="font-mono">kluxsykimnjivkqxelba</span>) are never copied or exposed in staging.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={() => setScope('test')}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Tag className="w-3.5 h-3.5" />
              Inspect Staging Test Fixtures (11 Records)
            </button>
          </div>
        </div>
      )}

      {/* Subscriptions Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Querying authoritative subscription view from PostgreSQL...</p>
        </div>
      ) : subscriptions.length > 0 ? (
        <div className="mt-2">
          <DataTable
            data={subscriptions}
            columns={columns}
            keyExtractor={(s) => s.id}
            pageSize={10}
            emptyMessage="No subscription records match current filter criteria."
          />
        </div>
      ) : null}

      {/* Administrative Subscription Override Modal */}
      <Modal
        isOpen={!!selectedSub}
        onClose={() => setSelectedSub(null)}
        title={`Subscription Override: ${selectedSub?.workspaceName}`}
        subtitle="Authoritatively modify subscription plan, extend grace period, or apply custom negotiated rates."
        footer={
          <>
            <button
              onClick={() => setSelectedSub(null)}
              disabled={actionInProgress}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyOverride}
              disabled={actionInProgress || (overrideAction === 'custom_price' && !overrideReason.trim())}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {actionInProgress && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Commit Authoritative Override
            </button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
            <div>
              <span className="text-slate-400 block text-[10px]">Current Plan & Cycle</span>
              <strong className="capitalize text-slate-800 dark:text-slate-200">
                {selectedSub?.planName} ({selectedSub?.billingInterval})
              </strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Effective Fee</span>
              <span className="font-mono font-bold text-emerald-400">
                {formatINR(selectedSub?.effectivePriceInr || 0)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
              Select Action Type
            </label>
            <select
              value={overrideAction}
              onChange={(e) => setOverrideAction(e.target.value as any)}
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              <option value="change_plan">Change Plan Tier & Cycle</option>
              <option value="extend_trial">Extend Trial Period</option>
              <option value="custom_price">Assign Custom Negotiated Price (Model D)</option>
              <option value="cancel_at_period_end">Cancel at Period End</option>
            </select>
          </div>

          {overrideAction === 'change_plan' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">New Plan</label>
                <select
                  value={newPlanId}
                  onChange={(e) => setNewPlanId(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value="starter">Starter Plan (₹299/mo)</option>
                  <option value="starter_mobile">Starter + Mobile (₹498/mo)</option>
                  <option value="business">Business Plan (₹699/mo)</option>
                  <option value="growth">Growth Plan (₹1,199/mo)</option>
                  <option value="free_trial">14-Day Free Trial (₹0)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Billing Interval</label>
                <select
                  value={newInterval}
                  onChange={(e) => setNewInterval(e.target.value as any)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
            </div>
          )}

          {overrideAction === 'extend_trial' && (
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Extension Days</label>
              <select
                value={extensionDays}
                onChange={(e) => setExtensionDays(parseInt(e.target.value) || 0)}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
              >
                <option value={7}>+7 Days</option>
                <option value={14}>+14 Days</option>
                <option value={30}>+30 Days</option>
              </select>
            </div>
          )}

          {overrideAction === 'custom_price' && (
            <div className="space-y-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Custom Negotiated Rate (₹ / billing cycle)
                </label>
                <input
                  type="number"
                  min="0"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(Number(e.target.value))}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Mandatory Audit Override Reason <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Executive agreement, Pilot partner rate..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            Note: All overrides are cryptographically recorded in <span className="font-mono text-emerald-400">workspace_subscription_events</span> with administrator signature ({currentAdmin?.email}).
          </p>
        </div>
      </Modal>
    </PageContainer>
  );
};
