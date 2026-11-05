import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  CreditCard,
  Building2,
  Users,
  ShieldCheck,
  Receipt,
  ShoppingCart,
  Calendar,
  FileText,
  DollarSign,
  ArrowUpRight,
  RefreshCw,
  Clock,
  Filter,
  AlertTriangle,
  UserCheck
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { StatCard } from '../../components/common/StatCard';
import { TrendChart } from '../../components/charts/TrendChart';
import { BarMetricsChart } from '../../components/charts/BarMetricsChart';
import { DistributionPieChart } from '../../components/charts/DistributionPieChart';
import {
  mockOverviewMetrics,
  mockRevenueTrends,
  mockPlanDistribution,
  mockUpcomingExpirations,
} from '../../data/mockOverview';
import { formatINR, formatDate } from '../../utils';
import { adminGatewayClient } from '../../services/adminGatewayClient';
import { OverviewMetrics } from '../../types';

interface OverviewPageProps {
  onNavigate: (module: any) => void;
}

type TimeframeOption = 'today' | 'this_week' | 'this_month' | 'last_month' | 'all_time' | 'custom';
type ScopeOption = 'all' | 'genuine' | 'test';

const initialMetrics: OverviewMetrics = {
  totalBusinesses: 0,
  activeBusinesses: 0,
  suspendedBusinesses: 0,
  totalUsers: 0,
  totalEmployees: 0,
  activeSubscriptions: 0,
  trialSubscriptions: 0,
  expiredSubscriptions: 0,
  pendingRenewals: 0,
  failedPaymentsCount: 0,
  newRegistrations: 0,
  platformCollectedRevenueInr: 0,
  gstComponentInr: 0,
  netPlatformRevenueInr: 0,
  outstandingAmountsInr: 0,
  totalRefundsInr: 0,
  tenantSalesGmvInr: 0,
  tenantCollectedInr: 0,
  mrrInr: 0,
  arrInr: 0
};

export const OverviewPage: React.FC<OverviewPageProps> = ({ onNavigate }) => {
  const [timeframe, setTimeframe] = useState<TimeframeOption>('all_time');
  const [scope, setScope] = useState<ScopeOption>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustomRange, setShowCustomRange] = useState(false);

  const [data, setData] = useState<{
    metrics: OverviewMetrics;
    planDistribution: any[];
    businessStatusDistribution: any[];
    subscriptionDistribution: any[];
    registrationGrowth: any[];
    revenueTrends: any[];
    upcomingExpirations: any[];
    dataSource?: any;
    isLive: boolean;
  }>({
    metrics: initialMetrics,
    planDistribution: [],
    businessStatusDistribution: [],
    subscriptionDistribution: [],
    registrationGrowth: [],
    revenueTrends: [],
    upcomingExpirations: [],
    dataSource: null,
    isLive: false,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (selectedTimeframe: TimeframeOption = timeframe, selectedScope: ScopeOption = scope, start?: string, end?: string) => {
    try {
      const res = await adminGatewayClient.getOverview({
        timeframe: selectedTimeframe,
        scope: selectedScope,
        startDate: start,
        endDate: end
      });
      setData({
        metrics: res.metrics,
        planDistribution: res.planDistribution || [],
        businessStatusDistribution: res.businessStatusDistribution || [],
        subscriptionDistribution: res.subscriptionDistribution || [],
        registrationGrowth: res.registrationGrowth || [],
        revenueTrends: res.revenueTrends || [],
        upcomingExpirations: res.upcomingExpirations || [],
        dataSource: res.dataSource || null,
        isLive: res.isLive
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(timeframe, scope, customStartDate, customEndDate);
  }, [timeframe, scope]);

  useEffect(() => {
    loadData();
  }, [timeframe]);

  const handleTimeframeChange = (newTf: TimeframeOption) => {
    setTimeframe(newTf);
    if (newTf === 'custom') {
      setShowCustomRange(true);
    } else {
      setShowCustomRange(false);
      loadData(newTf);
    }
  };

  const handleApplyCustomRange = (e: React.FormEvent) => {
    e.preventDefault();
    if (customStartDate) {
      loadData('custom', scope, customStartDate, customEndDate);
    }
  };

  const { metrics, planDistribution, businessStatusDistribution, subscriptionDistribution, registrationGrowth, revenueTrends, upcomingExpirations } = data;

  return (
    <PageContainer
      title="Platform Executive Overview"
      subtitle="Real-time multi-tenant health, distinct platform SaaS collections, and retail tenant throughput."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRefreshing(true); loadData(); }}
            disabled={refreshing}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
            title="Refresh Metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => onNavigate('payments')}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Receipt className="w-3.5 h-3.5" />
            Financial Ledger
          </button>
          <button
            onClick={() => onNavigate('businesses')}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors"
          >
            <Building2 className="w-3.5 h-3.5" />
            Directory
          </button>
        </div>
      }
    >
      {/* Data Source Transparency Banner */}
      <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-emerald-400">STAGING DATA — NOT PRODUCTION CUSTOMERS</span>
          <span className="text-slate-400 font-mono text-[11px] hidden md:inline">
            Authoritative source: Supabase Staging (`vlbhxcajphyjkeueubud`)
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
          <span>Air-Gap: <strong className="text-emerald-400 font-normal">kluxsykimnjivkqxelba untouched</strong></span>
        </div>
      </div>

      {/* TIMEFRAME & DATA SCOPE FILTER BAR */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs mb-6 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-emerald-500" />
            <span>Timeframe:</span>
            <div className="flex flex-wrap items-center gap-1">
              {[
                { id: 'today', label: 'Today' },
                { id: 'this_week', label: 'This Week' },
                { id: 'this_month', label: 'This Month' },
                { id: 'last_month', label: 'Last Month' },
                { id: 'all_time', label: 'All Time' },
                { id: 'custom', label: 'Custom Range' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleTimeframeChange(opt.id as TimeframeOption)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    timeframe === opt.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scope Selector */}
          <div className="flex items-center gap-2 self-start lg:self-auto bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
            <span className="text-[11px] text-slate-500 px-1 font-medium">Scope:</span>
            <button
              onClick={() => setScope('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                scope === 'all'
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              All Records
            </button>
            <button
              onClick={() => setScope('genuine')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                scope === 'genuine'
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Genuine Customers
            </button>
            <button
              onClick={() => setScope('test')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                scope === 'test'
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              Staging Test Fixtures
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            <span>Live Data Sync</span>
          </div>
        </div>

        {/* Custom Range Picker Drawer / Form */}
        {showCustomRange && (
          <form onSubmit={handleApplyCustomRange} className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">From:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs"
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors shadow-xs"
            >
              Apply Filter
            </button>
          </form>
        )}
      </div>

      {/* STRICT ACCOUNTING ISOLATION BANNER */}
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Strict Accounting Isolation
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                Phase 2.6 Mandate
              </span>
            </div>
            <div className="text-slate-600 dark:text-slate-400 mt-0.5">
              Platform Collected Revenue reflects SaaS subscription fees. Tenant Sales GMV represents isolated retail operations conducted by merchant tenants.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <div className="text-[10px] uppercase text-slate-400 font-semibold">SaaS Collections</div>
            <div className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
              {formatINR(metrics.platformCollectedRevenueInr)}
            </div>
          </div>
          <div className="border-l border-slate-200 dark:border-slate-700 pl-4">
            <div className="text-[10px] uppercase text-slate-400 font-semibold">Merchant GMV Processed</div>
            <div className="font-mono font-bold text-sm text-cyan-600 dark:text-cyan-400">
              {formatINR(metrics.tenantSalesGmvInr)}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1: PRIMARY FINANCIAL & COMMERCIAL KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard
          title="Platform Collected Revenue"
          value={formatINR(metrics.platformCollectedRevenueInr)}
          subtitle={`Net: ${formatINR(metrics.netPlatformRevenueInr)} (GST: ${formatINR(metrics.gstComponentInr)})`}
          icon={Receipt}
          variant="emerald"
          badge="SaaS Fees"
        />
        <StatCard
          title="Tenant Receivables (Outstanding)"
          value={formatINR(metrics.outstandingAmountsInr || 0)}
          subtitle="Uncollected customer balances"
          icon={CreditCard}
          variant="blue"
          badge="Receivables"
        />
        <StatCard
          title="Total Refunds Issued"
          value={formatINR(metrics.totalRefundsInr || 0)}
          subtitle="SaaS subscription reversals"
          icon={AlertTriangle}
          variant="purple"
        />
        <StatCard
          title="Tenant Retail GMV"
          value={formatINR(metrics.tenantSalesGmvInr)}
          subtitle={`Collected: ${formatINR(metrics.tenantCollectedInr || 0)}`}
          icon={ShoppingCart}
          variant="purple"
          badge="Merchant Vol"
        />
      </div>

      {/* SECTION 2: WORKSPACE & TENANT HEALTH KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Businesses"
          value={metrics.totalBusinesses}
          subtitle={`${metrics.activeBusinesses} Active • ${metrics.suspendedBusinesses} Suspended`}
          icon={Building2}
        />
        <StatCard
          title="Total Registered Users"
          value={metrics.totalUsers}
          subtitle={`${metrics.totalEmployees || 0} Staff Employees`}
          icon={Users}
        />
        <StatCard
          title="Active Subscriptions"
          value={metrics.activeSubscriptions}
          subtitle={`${metrics.trialSubscriptions} Trialing • ${metrics.expiredSubscriptions} Expired`}
          icon={CreditCard}
        />
        <StatCard
          title="New Registrations"
          value={metrics.newRegistrations ?? metrics.totalBusinesses}
          subtitle={`In selected timeframe (${timeframe.replace('_', ' ')})`}
          icon={UserCheck}
          variant="emerald"
        />
      </div>

      {/* SECTION 3: REVENUE & DISTRIBUTION CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Revenue Trends Chart (Left 2 cols) */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Platform SaaS Collections vs Tenant GMV (₹)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Monthly historical throughput showing strict SaaS revenue vs merchant volume
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                SaaS Revenue
              </span>
              <span className="inline-flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
                Merchant GMV
              </span>
            </div>
          </div>
          <BarMetricsChart
            data={revenueTrends}
            xKey="month"
            bars={[
              { key: 'platformRevenue', label: 'Platform SaaS Revenue', color: '#10b981' },
              { key: 'tenantGmv', label: 'Tenant GMV', color: '#06b6d4' }
            ]}
            height={280}
            formatValue={(v) => formatINR(v)}
          />
        </div>

        {/* Subscription Plan Distribution (Right 1 col) */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 shadow-xs">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Subscription Plan Distribution
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Active workspace distribution by plan tier
            </p>
          </div>
          <DistributionPieChart
            data={planDistribution.map((d) => ({
              name: d.name,
              value: d.count,
              color: d.color,
            }))}
            height={220}
            formatValue={(v) => `${v} tenants`}
          />
          <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            {planDistribution.map((d) => (
              <div key={d.name} className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400 truncate pr-1">{d.name}</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                  {d.revenuePercent || 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 4: SECONDARY CHARTS (3-COLUMN ROW) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Business Status Distribution */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 shadow-xs">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Business Status Distribution
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Operational vs suspended workspaces
            </p>
          </div>
          <DistributionPieChart
            data={businessStatusDistribution.map((d) => ({
              name: d.name,
              value: d.count,
              color: d.color,
            }))}
            height={180}
            innerRadius={45}
            outerRadius={70}
            formatValue={(v) => `${v} orgs`}
          />
          <div className="flex items-center justify-around mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            {businessStatusDistribution.map((d) => (
              <div key={d.name} className="text-center">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">{d.name}</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono text-sm">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Subscription Status Distribution */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 shadow-xs">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Subscription Statuses
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Active, trialing, and expired breakdown
            </p>
          </div>
          <DistributionPieChart
            data={subscriptionDistribution.map((d) => ({
              name: d.name,
              value: d.count,
              color: d.color,
            }))}
            height={180}
            innerRadius={45}
            outerRadius={70}
            formatValue={(v) => `${v} subscriptions`}
          />
          <div className="flex items-center justify-around mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            {subscriptionDistribution.map((d) => (
              <div key={d.name} className="text-center">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold truncate max-w-[80px]">{d.name}</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono text-sm">{d.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Business Registration Growth */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 shadow-xs">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Registration Trajectory
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              New business onboardings over time
            </p>
          </div>
          {registrationGrowth.length > 0 ? (
            <TrendChart
              data={registrationGrowth.map(r => ({ date: r.date, value: r.count }))}
              valueKey="value"
              valueLabel="New Orgs"
              height={180}
              formatValue={(v) => `${v}`}
            />
          ) : (
            <div className="h-[180px] flex items-center justify-center text-xs text-slate-400">
              No registration events in selected timeframe
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500">Cumulative Organizations:</span>
            <span className="font-bold font-mono text-slate-800 dark:text-slate-200">{metrics.totalBusinesses}</span>
          </div>
        </div>
      </div>

      {/* SECTION 5: TABLES ROW (EXPIRATIONS & RECENT ACTIONS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Subscription Expirations */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Upcoming Subscription Expirations
              </h3>
            </div>
            <button
              onClick={() => onNavigate('subscriptions')}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              View all
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase">
                  <th className="pb-2">Workspace</th>
                  <th className="pb-2">Plan</th>
                  <th className="pb-2">Expiry</th>
                  <th className="pb-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                {upcomingExpirations.length > 0 ? upcomingExpirations.map((exp) => (
                  <tr key={exp.workspaceId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 font-medium text-slate-900 dark:text-slate-100">
                      {exp.businessName}
                    </td>
                    <td className="py-2.5 text-slate-600 dark:text-slate-400">
                      {exp.planName}
                    </td>
                    <td className="py-2.5 font-mono text-slate-500 dark:text-slate-400">
                      {formatDate(exp.expiryDate)}
                    </td>
                    <td className="py-2.5 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {formatINR(exp.amountInr)}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400">
                      No upcoming expirations in the next 30 days.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Operational Directory Shortcut */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Quick Tenant Roster
              </h3>
            </div>
            <button
              onClick={() => onNavigate('businesses')}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
            >
              Full directory
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-900 dark:text-slate-100 block">Total Active Organizations</span>
                <span className="text-[11px] text-slate-400">Currently processing sales without restriction</span>
              </div>
              <span className="font-mono font-bold text-base text-emerald-600 dark:text-emerald-400">
                {metrics.activeBusinesses}
              </span>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-900 dark:text-slate-100 block">Suspended Workspaces</span>
                <span className="text-[11px] text-slate-400">Access denied across sessions and database</span>
              </div>
              <span className="font-mono font-bold text-base text-rose-600 dark:text-rose-400">
                {metrics.suspendedBusinesses}
              </span>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-900 dark:text-slate-100 block">Total Staff Under Management</span>
                <span className="text-[11px] text-slate-400">Employees linked to organization accounts</span>
              </div>
              <span className="font-mono font-bold text-base text-cyan-600 dark:text-cyan-400">
                {metrics.totalEmployees || 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};
