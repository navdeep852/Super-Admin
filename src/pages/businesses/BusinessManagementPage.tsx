import React, { useState, useEffect } from 'react';
import {
  Building2,
  GitBranch,
  ShieldAlert,
  Search,
  Eye,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  MapPin,
  Phone,
  Mail,
  User,
  Users,
  CreditCard,
  Receipt,
  FileText,
  Clock,
  History,
  Calendar,
  DollarSign,
  ArrowUpDown,
  Filter,
  CheckCircle,
  XCircle,
  RefreshCw
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Modal } from '../../components/common/Modal';
import { Drawer } from '../../components/common/Drawer';
import { SearchInput } from '../../components/common/SearchInput';
import { Business } from '../../types';
import { formatDate, formatDateTime, formatINR } from '../../utils';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { adminGatewayClient } from '../../services/adminGatewayClient';

export const BusinessManagementPage: React.FC = () => {
  const { currentAdmin, hasPermission } = useAdminAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [subStatusFilter, setSubStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Selected Business & Deep-Dive Detail State
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<{
    workspace: any;
    businessSettings: any;
    subscription: any;
    employees: any[];
    recentInvoices: any[];
    suspensions: any[];
    auditLogs: any[];
    metrics: any;
  } | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [activeDrawerTab, setActiveDrawerTab] = useState<'overview' | 'employees' | 'subscription' | 'activity' | 'history'>('overview');

  // Suspension / Reactivation Modals State
  const [suspensionModalTarget, setSuspensionModalTarget] = useState<Business | null>(null);
  const [suspensionReason, setSuspensionReason] = useState('');
  const [reactivationModalTarget, setReactivationModalTarget] = useState<Business | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Manage Subscription Modal State (Part A & Part C)
  const [manageSubTarget, setManageSubTarget] = useState<Business | null>(null);
  const [manageSubAction, setManageSubAction] = useState<'change_plan' | 'extend_trial' | 'custom_price' | 'apply_coupon' | 'cancel_at_period_end'>('change_plan');
  const [subPlanId, setSubPlanId] = useState<string>('business');
  const [subInterval, setSubInterval] = useState<'monthly' | 'annual'>('monthly');
  const [subExtensionDays, setSubExtensionDays] = useState<number>(14);
  const [subCustomPrice, setSubCustomPrice] = useState<number>(699);
  const [subOverrideReason, setSubOverrideReason] = useState<string>('');
  const [subOverrideDays, setSubOverrideDays] = useState<number>(365);
  const [subCouponCode, setSubCouponCode] = useState<string>('');

  const fetchBusinesses = async () => {
    setLoading(true);
    try {
      const res = await adminGatewayClient.getWorkspaces({
        page: currentPage,
        limit: pageSize,
        search: searchQuery,
        status: statusFilter,
        plan: planFilter,
        sortBy,
        sortOrder
      });
      setBusinesses(res.businesses);
      setTotalCount(res.total);
      setIsLive(res.isLive);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBusinesses();
  }, [searchQuery, statusFilter, planFilter, sortBy, sortOrder, currentPage, pageSize]);

  // When drawer opens for a business, fetch deep-dive data
  const handleOpenDrawer = async (b: Business) => {
    setSelectedBusiness(b);
    setDrawerLoading(true);
    setActiveDrawerTab('overview');
    try {
      const detail = await adminGatewayClient.getWorkspaceDetail(b.id);
      setDrawerDetail(detail);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleConfirmSuspension = async () => {
    if (!suspensionModalTarget || !suspensionReason.trim()) return;
    setActionInProgress(true);
    try {
      const res = await adminGatewayClient.suspendWorkspace(suspensionModalTarget.id, suspensionReason);
      if (res.success) {
        setToastMessage({ text: `Workspace "${suspensionModalTarget.legalName}" suspended successfully. Access blocked across sessions and database.`, type: 'success' });
        await fetchBusinesses();
        if (selectedBusiness?.id === suspensionModalTarget.id) {
          const detail = await adminGatewayClient.getWorkspaceDetail(suspensionModalTarget.id);
          setDrawerDetail(detail);
          setSelectedBusiness(prev => prev ? { ...prev, status: 'Suspended' } : null);
        }
      } else {
        setToastMessage({ text: res.message || 'Suspension failed', type: 'error' });
      }
    } catch (err: any) {
      setToastMessage({ text: err.message, type: 'error' });
    } finally {
      setActionInProgress(false);
      setSuspensionModalTarget(null);
      setSuspensionReason('');
    }
  };

  const handleConfirmReactivation = async () => {
    if (!reactivationModalTarget) return;
    setActionInProgress(true);
    try {
      const res = await adminGatewayClient.reactivateWorkspace(reactivationModalTarget.id);
      if (res.success) {
        setToastMessage({ text: `Workspace "${reactivationModalTarget.legalName}" reactivated successfully. Access restored.`, type: 'success' });
        await fetchBusinesses();
        if (selectedBusiness?.id === reactivationModalTarget.id) {
          const detail = await adminGatewayClient.getWorkspaceDetail(reactivationModalTarget.id);
          setDrawerDetail(detail);
          setSelectedBusiness(prev => prev ? { ...prev, status: 'Active' } : null);
        }
      } else {
        setToastMessage({ text: res.message || 'Reactivation failed', type: 'error' });
      }
    } catch (err: any) {
      setToastMessage({ text: err.message, type: 'error' });
    } finally {
      setActionInProgress(false);
      setReactivationModalTarget(null);
    }
  };

  const handleOpenManageSubscription = (b: Business) => {
    setManageSubTarget(b);
    setManageSubAction('change_plan');
    setSubPlanId(b.planName.toLowerCase().replace(/\s+/g, '_') || 'business');
    setSubInterval((b.billingInterval as any) || 'monthly');
    setSubOverrideReason('');
  };

  const handleConfirmManageSubscription = async () => {
    if (!manageSubTarget) return;
    setActionInProgress(true);
    try {
      let payload: any = { action: manageSubAction };

      if (manageSubAction === 'change_plan') {
        payload.plan_id = subPlanId;
        payload.billing_interval = subInterval;
      } else if (manageSubAction === 'extend_trial') {
        payload.extension_days = subExtensionDays;
      } else if (manageSubAction === 'custom_price') {
        if (!subOverrideReason.trim()) {
          throw new Error('Override reason is strictly mandatory for audit compliance');
        }
        payload.custom_price_inr = subCustomPrice;
        payload.override_reason = subOverrideReason.trim();
        payload.override_days = subOverrideDays;
      } else if (manageSubAction === 'apply_coupon') {
        if (!subCouponCode.trim()) {
          throw new Error('Promotional coupon code is required');
        }
        payload.coupon_code = subCouponCode.toUpperCase().trim();
      }

      await adminGatewayClient.manageWorkspaceSubscription(manageSubTarget.id, payload);
      setToastMessage({ text: `Subscription terms updated successfully for ${manageSubTarget.legalName}`, type: 'success' });
      await fetchBusinesses();

      if (selectedBusiness?.id === manageSubTarget.id) {
        const detail = await adminGatewayClient.getWorkspaceDetail(manageSubTarget.id);
        setDrawerDetail(detail);
      }
      setManageSubTarget(null);
    } catch (err: any) {
      setToastMessage({ text: err.message || 'Failed to update subscription', type: 'error' });
    } finally {
      setActionInProgress(false);
    }
  };

  // Client-side sub-status filter
  const displayedBusinesses = businesses.filter(b => {
    if (subStatusFilter === 'all') return true;
    return b.subscriptionStatus.toLowerCase() === subStatusFilter.toLowerCase();
  });

  const columns: Column<Business>[] = [
    {
      key: 'legalName',
      header: 'Business Name',
      sortable: true,
      render: (b) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            {b.legalName}
          </div>
          <div className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]" title={b.id}>
            {b.id}
          </div>
        </div>
      ),
    },
    {
      key: 'ownerName',
      header: 'Owner',
      sortable: true,
      render: (b) => (
        <div>
          <div className="text-xs font-medium text-slate-800 dark:text-slate-200">{b.ownerName}</div>
          <div className="text-[11px] text-slate-400 truncate max-w-[160px]">{b.ownerEmail}</div>
        </div>
      ),
    },
    {
      key: 'ownerPhone',
      header: 'Phone',
      render: (b) => (
        <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
          {b.ownerPhone || '—'}
        </span>
      ),
    },
    {
      key: 'registeredAt',
      header: 'Registration Date',
      sortable: true,
      render: (b) => (
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          {formatDate(b.registeredAt)}
        </span>
      ),
    },
    {
      key: 'activeStaffCount',
      header: 'Employees',
      align: 'center',
      sortable: true,
      render: (b) => (
        <span className="inline-flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
          <Users className="w-3 h-3 text-slate-400" />
          {b.activeStaffCount || 1}
        </span>
      ),
    },
    {
      key: 'planName',
      header: 'Subscription Plan',
      sortable: true,
      render: (b) => (
        <span className="capitalize text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          {b.planName}
        </span>
      ),
    },
    {
      key: 'subscriptionStatus',
      header: 'Sub Status',
      render: (b) => {
        const isTrial = b.subscriptionStatus.toLowerCase() === 'trialing';
        const isExp = ['expired', 'cancelled', 'past_due'].includes(b.subscriptionStatus.toLowerCase());
        return (
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${
              isTrial
                ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                : isExp
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
            }`}
          >
            {b.subscriptionStatus}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Workspace Status',
      sortable: true,
      render: (b) => <StatusBadge status={b.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (b) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleOpenDrawer(b)}
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="Inspect Workspace Deep-Dive"
          >
            <Eye className="w-4 h-4" />
          </button>
          {hasPermission('subscriptions') && (
            <button
              onClick={() => handleOpenManageSubscription(b)}
              className="p-1.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 transition-colors"
              title="Manage Subscription & Price Overrides"
            >
              <CreditCard className="w-4 h-4" />
            </button>
          )}
          {hasPermission('businesses') && b.status === 'Active' && (
            <button
              onClick={() => setSuspensionModalTarget(b)}
              className="p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors"
              title="Suspend Workspace"
            >
              <ShieldAlert className="w-4 h-4" />
            </button>
          )}
          {hasPermission('businesses') && b.status === 'Suspended' && (
            <button
              onClick={() => setReactivationModalTarget(b)}
              className="p-1.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 transition-colors"
              title="Reactivate Workspace"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageContainer
      title="Business Directory & Tenancy Isolation"
      subtitle="Complete view of all onboarded organizations, branch hierarchies, and Phase 2.6 compliant suspension controls."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRefreshing(true); fetchBusinesses(); }}
            disabled={refreshing}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
            title="Refresh Directory"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Total Tenants: <strong className="text-slate-900 dark:text-slate-100">{totalCount || displayedBusinesses.length}</strong>
          </span>
        </div>
      }
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`p-3 rounded-xl border mb-4 text-xs flex items-center justify-between ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-600">
            &times;
          </button>
        </div>
      )}

      {/* SEARCH & ADVANCED FILTER BAR */}
      <div className="bg-white dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs mb-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-80">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by legal name, ID, owner email, or phone..."
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Workspace Statuses</option>
              <option value="active">Active Only</option>
              <option value="suspended">Suspended Only</option>
            </select>

            {/* Plan Tier Filter */}
            <select
              value={planFilter}
              onChange={(e) => { setPlanFilter(e.target.value); setCurrentPage(1); }}
              className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Plans</option>
              <option value="free_trial">14-Day Free Trial</option>
              <option value="starter">Starter</option>
              <option value="starter_mobile">Starter + Mobile</option>
              <option value="business">Business</option>
              <option value="growth">Growth</option>
            </select>

            {/* Subscription Status Filter */}
            <select
              value={subStatusFilter}
              onChange={(e) => { setSubStatusFilter(e.target.value); }}
              className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Sub Statuses</option>
              <option value="active">Active Subscriptions</option>
              <option value="trialing">Trialing Subscriptions</option>
              <option value="expired">Expired Subscriptions</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [sb, so] = e.target.value.split(':');
                setSortBy(sb);
                setSortOrder(so as 'asc' | 'desc');
              }}
              className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="created_at:desc">Newest Registered</option>
              <option value="created_at:asc">Oldest Registered</option>
              <option value="name:asc">Name (A-Z)</option>
              <option value="name:desc">Name (Z-A)</option>
              <option value="employees:desc">Most Employees</option>
              <option value="employees:asc">Fewest Employees</option>
              <option value="status:asc">Status (Active first)</option>
            </select>
          </div>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <DataTable
          data={displayedBusinesses}
          columns={columns}
          keyExtractor={(b) => b.id}
          onRowClick={(b) => handleOpenDrawer(b)}
          pageSize={pageSize}
          emptyMessage="No businesses match the current search and filter criteria."
        />

        {/* PAGINATION CONTROLS */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span>Showing {displayedBusinesses.length} of {totalCount || displayedBusinesses.length}</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Previous
            </button>
            <span className="px-2 font-mono font-medium text-slate-800 dark:text-slate-200">
              Page {currentPage} of {Math.ceil((totalCount || 1) / pageSize) || 1}
            </span>
            <button
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={currentPage >= Math.ceil((totalCount || 1) / pageSize)}
              className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* BUSINESS PROFILE DRAWER (TASK 4: SECTIONS 1 - 7) */}
      <Drawer
        isOpen={!!selectedBusiness}
        onClose={() => { setSelectedBusiness(null); setDrawerDetail(null); }}
        title={selectedBusiness?.legalName || 'Business Profile'}
        subtitle={`Tenant ID: ${selectedBusiness?.id}`}
        width="xl"
      >
        {selectedBusiness && (
          <div className="space-y-6">
            {/* Drawer Navigation Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs">
              {[
                { id: 'overview', label: '1. Overview' },
                { id: 'employees', label: `3. Employees (${drawerDetail?.employees?.length || selectedBusiness.activeStaffCount || 0})` },
                { id: 'subscription', label: '4. Subscription' },
                { id: 'activity', label: '5. Invoices & GMV' },
                { id: 'history', label: '7. Admin History' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveDrawerTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    activeDrawerTab === tab.id
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB 1: BUSINESS OVERVIEW & OWNER INFORMATION */}
            {activeDrawerTab === 'overview' && (
              <div className="space-y-6">
                {/* SECTION 1: Business Overview */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">1. Business Overview</span>
                    <StatusBadge status={selectedBusiness.status} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs pt-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Trade / Company Name</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedBusiness.legalName}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">GSTIN</span>
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{selectedBusiness.gstin || 'Unregistered / None'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Location / City</span>
                      <span className="text-slate-800 dark:text-slate-200">{selectedBusiness.city}, {selectedBusiness.state}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Registered Address</span>
                      <span className="text-slate-800 dark:text-slate-200 truncate block">{selectedBusiness.address}</span>
                    </div>
                  </div>
                </div>

                {/* Suspension Banner if Suspended */}
                {selectedBusiness.status === 'Suspended' && selectedBusiness.suspensionDetails && (
                  <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-2">
                    <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold text-xs">
                      <ShieldAlert className="w-4 h-4" />
                      Workspace Suspension Snapshot (Phase 2.6 Enforced)
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      <span className="font-medium text-slate-800 dark:text-slate-200">Reason: </span>
                      {selectedBusiness.suspensionDetails.reason}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-rose-500/10 text-slate-500 dark:text-slate-400">
                      <div>Suspended By: <strong className="text-slate-700 dark:text-slate-300">{selectedBusiness.suspensionDetails.suspendedBy}</strong></div>
                      <div>Timestamp: <strong className="font-mono">{formatDateTime(selectedBusiness.suspensionDetails.suspendedAt)}</strong></div>
                    </div>
                  </div>
                )}

                {/* SECTION 2: Owner Information */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    2. Owner Information
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-emerald-500 shrink-0" />
                        <div>
                          <span className="text-[10px] text-slate-400 block">Owner Full Name</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedBusiness.ownerName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-blue-500 shrink-0" />
                        <div className="truncate">
                          <span className="text-[10px] text-slate-400 block">Owner Email</span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate block">{selectedBusiness.ownerEmail}</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-amber-500 shrink-0" />
                        <div>
                          <span className="text-[10px] text-slate-400 block">Owner Phone</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200">{selectedBusiness.ownerPhone || '—'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                        <div>
                          <span className="text-[10px] text-slate-400 block">Main Branch Code</span>
                          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">MAIN-01</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 6: Registration Details */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-2 text-xs">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    6. Registration Details & Hierarchy
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                    <div>Created At: <strong className="font-mono">{formatDateTime(selectedBusiness.registeredAt)}</strong></div>
                    <div>Last Active: <strong className="font-mono">{formatDateTime(selectedBusiness.lastActiveAt)}</strong></div>
                    <div>Workspace UUID: <strong className="font-mono text-[10px]">{selectedBusiness.id}</strong></div>
                    <div>Source: <strong className="text-emerald-600">Business OS Web Onboarding</strong></div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: EMPLOYEES & STAFF ROSTER (SECTION 3) */}
            {activeDrawerTab === 'employees' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    3. Employees & Staff Members ({drawerDetail?.employees?.length || 0})
                  </h4>
                  <span className="text-[11px] text-slate-500">Live Auth Profiles</span>
                </div>
                {drawerDetail?.employees && drawerDetail.employees.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5">Staff Name</th>
                          <th className="p-2.5">Email</th>
                          <th className="p-2.5">Role</th>
                          <th className="p-2.5">Department</th>
                          <th className="p-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {drawerDetail.employees.map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <td className="p-2.5 font-medium text-slate-900 dark:text-slate-100">
                              {emp.name}
                              <span className="block text-[10px] text-slate-400 font-mono">{emp.employee_id || emp.id.slice(0, 8)}</span>
                            </td>
                            <td className="p-2.5 text-slate-600 dark:text-slate-400 truncate max-w-[140px]">{emp.email}</td>
                            <td className="p-2.5">
                              <span className="capitalize px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {emp.role}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-500">{emp.department || emp.designation || 'General'}</td>
                            <td className="p-2.5">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                emp.status === 'Active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
                              }`}>
                                {emp.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                    No additional staff profiles found for this workspace. Only owner registered.
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SUBSCRIPTION DETAILS (SECTION 4) */}
            {activeDrawerTab === 'subscription' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    4. Subscription Tier & Commercial Terms
                  </h4>
                  {hasPermission('subscriptions') && (
                    <button
                      onClick={() => handleOpenManageSubscription(selectedBusiness)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Manage Subscription
                    </button>
                  )}
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 space-y-3 text-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase font-semibold">Current Plan Tier</span>
                      <span className="text-base font-bold text-slate-900 dark:text-slate-100 capitalize">{selectedBusiness.planName}</span>
                    </div>
                    <span className="capitalize text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      {selectedBusiness.subscriptionStatus}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Billing Interval</span>
                      <span className="capitalize font-semibold text-slate-800 dark:text-slate-200">{selectedBusiness.billingInterval}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">MRR Contribution</span>
                      <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatINR(selectedBusiness.mrrContributionInr || 2499)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Period / Trial End</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200">{formatDate(selectedBusiness.periodEnd)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Next Renewal</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200">{formatDate(selectedBusiness.periodEnd)}</span>
                    </div>
                  </div>

                  {/* Negotiated Override Details if present */}
                  {drawerDetail?.subscription?.custom_price_inr && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
                      <div className="flex items-center justify-between text-amber-500 font-semibold mb-1">
                        <span>Custom Negotiated Override Active</span>
                        <span className="font-mono text-sm">{formatINR(drawerDetail.subscription.custom_price_inr)} / cycle</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        <span>Reason: </span>
                        <span className="text-slate-200">{drawerDetail.subscription.override_reason || 'Administrative arrangement'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: COMMERCIAL ACTIVITY & INVOICES (SECTION 5) */}
            {activeDrawerTab === 'activity' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    5. Tenant Invoices & Retail Throughput
                  </h4>
                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                    Total GMV: {formatINR(selectedBusiness.monthlyGmvInr)}
                  </span>
                </div>

                {drawerDetail?.recentInvoices && drawerDetail.recentInvoices.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5">Invoice #</th>
                          <th className="p-2.5">Date</th>
                          <th className="p-2.5">Grand Total</th>
                          <th className="p-2.5">Paid</th>
                          <th className="p-2.5">Balance</th>
                          <th className="p-2.5">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {drawerDetail.recentInvoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <td className="p-2.5 font-mono font-medium text-slate-900 dark:text-slate-100">{inv.invoice_number}</td>
                            <td className="p-2.5 font-mono text-slate-500">{formatDate(inv.date || inv.created_at)}</td>
                            <td className="p-2.5 font-mono font-semibold text-slate-900 dark:text-slate-100">{formatINR(inv.grand_total)}</td>
                            <td className="p-2.5 font-mono text-emerald-600">{formatINR(inv.paid_amount)}</td>
                            <td className="p-2.5 font-mono text-rose-500">{formatINR(inv.balance_amount)}</td>
                            <td className="p-2.5">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                inv.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
                              }`}>
                                {inv.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                    No retail invoices found for this tenant organization.
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: ADMIN ACTION HISTORY (SECTION 7) */}
            {activeDrawerTab === 'history' && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  7. Administrative Action History & Audit Log
                </h4>
                {drawerDetail?.suspensions && drawerDetail.suspensions.length > 0 ? (
                  <div className="space-y-3">
                    {drawerDetail.suspensions.map((s) => (
                      <div key={s.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                            s.is_active_suspension ? 'bg-rose-500/10 text-rose-600' : 'bg-emerald-500/10 text-emerald-600'
                          }`}>
                            {s.is_active_suspension ? 'SUSPENSION ENFORCED' : 'RESOLVED / REACTIVATED'}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">{formatDateTime(s.suspended_at)}</span>
                        </div>
                        <div className="text-slate-700 dark:text-slate-300">
                          <strong className="text-slate-900 dark:text-slate-100">Reason: </strong>{s.reason}
                        </div>
                        {s.reactivated_at && (
                          <div className="text-[11px] text-emerald-600 pt-1 border-t border-slate-100 dark:border-slate-800">
                            Reactivated at {formatDateTime(s.reactivated_at)}: {s.reactivation_reason || 'Administrative action'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                    No disciplinary or suspension history recorded for this workspace. Clean operational standing.
                  </div>
                )}
              </div>
            )}

            {/* QUICK ACTIONS INSIDE DRAWER */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              {selectedBusiness.status === 'Active' ? (
                <button
                  onClick={() => setSuspensionModalTarget(selectedBusiness)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <ShieldAlert className="w-4 h-4" />
                  Suspend Workspace
                </button>
              ) : (
                <button
                  onClick={() => setReactivationModalTarget(selectedBusiness)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reactivate Workspace
                </button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* SUSPENSION MODAL (TASK 5) */}
      <Modal
        isOpen={!!suspensionModalTarget}
        onClose={() => setSuspensionModalTarget(null)}
        title="Suspend Tenant Workspace"
        subtitle="Enforces immediate isolation while snapshotting active user memberships."
        footer={
          <>
            <button
              onClick={() => setSuspensionModalTarget(null)}
              disabled={actionInProgress}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSuspension}
              disabled={!suspensionReason.trim() || actionInProgress}
              className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
            >
              {actionInProgress ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
              Execute Suspension Snapshot
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-semibold">Immediate Effect:</strong>
              All staff sessions will be revoked. In PostgreSQL, RLS policies will return zero rows for this workspace. A cryptographic snapshot of active staff memberships will be preserved for selective restoration.
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Required Suspension Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={suspensionReason}
              onChange={(e) => setSuspensionReason(e.target.value)}
              placeholder="e.g. Non-payment of subscription, Terms of Service violation, Fraudulent activity..."
              rows={3}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>
        </div>
      </Modal>

      {/* REACTIVATION MODAL (TASK 5) */}
      <Modal
        isOpen={!!reactivationModalTarget}
        onClose={() => setReactivationModalTarget(null)}
        title="Reactivate Tenant Workspace"
        subtitle="Restores complete database access and staff login privileges."
        footer={
          <>
            <button
              onClick={() => setReactivationModalTarget(null)}
              disabled={actionInProgress}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmReactivation}
              disabled={actionInProgress}
              className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
            >
              {actionInProgress ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
              Confirm Reactivation
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs flex gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-semibold">Access Restoration:</strong>
              Workspace status will return to Active. Staff profiles and memberships previously snapshotted will be restored, and database queries will resume executing.
            </div>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Are you sure you want to reactivate <strong className="text-slate-900 dark:text-slate-100">{reactivationModalTarget?.legalName}</strong>?
          </p>
        </div>
      </Modal>

      {/* MANAGE SUBSCRIPTION MODAL (PART A & PART C) */}
      <Modal
        isOpen={!!manageSubTarget}
        onClose={() => setManageSubTarget(null)}
        title={`Manage Subscription: ${manageSubTarget?.legalName}`}
        subtitle="Upgrade/downgrade tiers, extend trial days, assign custom negotiated prices, or apply promotional offers."
        footer={
          <>
            <button
              onClick={() => setManageSubTarget(null)}
              disabled={actionInProgress}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmManageSubscription}
              disabled={actionInProgress || (manageSubAction === 'custom_price' && !subOverrideReason.trim())}
              className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
            >
              {actionInProgress ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
              Submit Subscription Update
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Select Administrative Action
            </label>
            <select
              value={manageSubAction}
              onChange={(e) => setManageSubAction(e.target.value as any)}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="change_plan">Change Plan Tier & Billing Interval</option>
              <option value="extend_trial">Extend Trial Period (+Days)</option>
              <option value="custom_price">Assign Custom Negotiated Price (Model D)</option>
              <option value="apply_coupon">Apply Promotional Coupon Code</option>
              <option value="cancel_at_period_end">Cancel Subscription at Period End</option>
            </select>
          </div>

          {manageSubAction === 'change_plan' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">New Plan Tier</label>
                  <select
                    value={subPlanId}
                    onChange={(e) => setSubPlanId(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    <option value="starter">Starter (₹499/mo)</option>
                    <option value="starter_mobile">Starter Mobile (₹399/mo)</option>
                    <option value="business">Business (₹999/mo)</option>
                    <option value="growth">Growth (₹1,999/mo)</option>
                    <option value="free_trial">Free Trial (₹0)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Billing Interval</label>
                  <select
                    value={subInterval}
                    onChange={(e) => setSubInterval(e.target.value as any)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual (2-Mo Free)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {manageSubAction === 'extend_trial' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Extension Days</label>
              <select
                value={subExtensionDays}
                onChange={(e) => setSubExtensionDays(Number(e.target.value))}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value={7}>+7 Days</option>
                <option value={14}>+14 Days</option>
                <option value={30}>+30 Days</option>
                <option value={60}>+60 Days</option>
              </select>
            </div>
          )}

          {manageSubAction === 'custom_price' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Custom Negotiated Price (₹ / cycle)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={subCustomPrice}
                    onChange={(e) => setSubCustomPrice(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Override Validity
                  </label>
                  <select
                    value={subOverrideDays}
                    onChange={(e) => setSubOverrideDays(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    <option value={30}>30 Days</option>
                    <option value={90}>90 Days</option>
                    <option value={180}>180 Days</option>
                    <option value={365}>1 Year (365 Days)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Mandatory Audit Override Reason <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={subOverrideReason}
                  onChange={(e) => setSubOverrideReason(e.target.value)}
                  placeholder="e.g. Key partner agreed rate, Early adopter concession..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          {manageSubAction === 'apply_coupon' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Promotional Coupon Code
              </label>
              <input
                type="text"
                required
                value={subCouponCode}
                onChange={(e) => setSubCouponCode(e.target.value.toUpperCase())}
                placeholder="e.g. VISTAAR20, SPECIAL699"
                className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono uppercase"
              />
            </div>
          )}

          {manageSubAction === 'cancel_at_period_end' && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs">
              Subscription will remain active until the end of the current billing cycle, then transition to expired status automatically.
            </div>
          )}
        </div>
      </Modal>
    </PageContainer>
  );
};
