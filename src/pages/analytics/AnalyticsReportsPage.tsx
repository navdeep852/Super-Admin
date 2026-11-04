import React, { useState } from 'react';
import {
  TrendingUp,
  CreditCard,
  Download,
  Percent,
  Layers,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Tabs } from '../../components/common/Tabs';
import { BarMetricsChart } from '../../components/charts/BarMetricsChart';
import {
  mockPlanGrowthData,
  mockFinancialAnalytics,
  mockRetentionCohorts,
  mockCouponAnalytics,
} from '../../data/mockAnalytics';
import { formatINR } from '../../utils';

export const AnalyticsReportsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'financial' | 'plans' | 'retention' | 'coupons'>('financial');

  const handleExport = () => {
    alert('Generating platform analytics export bundle (CSV / PDF)...');
  };

  return (
    <PageContainer
      title="Platform Analytics & Business Intelligence"
      subtitle="Financial performance, statutory tax segregation, retention dynamics, and promotional conversion rates."
      actions={
        <button
          onClick={handleExport}
          className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-xs transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export BI Report
        </button>
      }
    >
      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'financial', label: 'Financial Collections & GST', icon: CreditCard },
          { id: 'plans', label: 'Subscription Plan Growth', icon: TrendingUp },
          { id: 'retention', label: 'Customer Cohorts & Retention', icon: Layers },
          { id: 'coupons', label: 'Coupon Conversion ROI', icon: Percent },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {/* Tab 1: Financial Collections */}
      {activeTab === 'financial' && (
        <div className="space-y-6 mt-6">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Gross Collections vs 18% GST vs Net Revenue (Monthly)
                </h3>
                <p className="text-xs text-slate-500">
                  Statutory audit view of subscription revenues
                </p>
              </div>
            </div>
            <BarMetricsChart
              data={mockFinancialAnalytics}
              xKey="month"
              bars={[
                { key: 'grossCollected', label: 'Gross Collections', color: '#10b981' },
                { key: 'gstComponent', label: 'GST (18%) Component', color: '#f59e0b' },
                { key: 'netCollected', label: 'Net Platform Earnings', color: '#06b6d4' },
              ]}
              height={320}
              formatValue={(v) => formatINR(v)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
              <span className="text-[10px] uppercase font-bold text-slate-400">Total Fiscal Gross</span>
              <div className="text-xl font-bold font-mono text-emerald-600 mt-1">
                {formatINR(mockFinancialAnalytics.reduce((acc, f) => acc + f.grossCollected, 0))}
              </div>
              <span className="text-[11px] text-slate-500">Gross collections over last 6 months</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
              <span className="text-[10px] uppercase font-bold text-slate-400">Total GST Remitted</span>
              <div className="text-xl font-bold font-mono text-amber-600 mt-1">
                {formatINR(mockFinancialAnalytics.reduce((acc, f) => acc + f.gstComponent, 0))}
              </div>
              <span className="text-[11px] text-slate-500">Statutory 18% GST tax liability</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
              <span className="text-[10px] uppercase font-bold text-slate-400">Cumulative Net Retained</span>
              <div className="text-xl font-bold font-mono text-cyan-600 mt-1">
                {formatINR(mockFinancialAnalytics.reduce((acc, f) => acc + f.netCollected, 0))}
              </div>
              <span className="text-[11px] text-slate-500">Net platform cash flow</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Subscription Plan Growth */}
      {activeTab === 'plans' && (
        <div className="space-y-6 mt-6">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Active Tenant Plan Trajectory (Last 6 Months)
              </h3>
              <p className="text-xs text-slate-500">
                Tier expansion showing growth across Starter, Mobile, Business, and Growth tiers
              </p>
            </div>
            <BarMetricsChart
              data={mockPlanGrowthData}
              xKey="month"
              bars={[
                { key: 'starter', label: 'Starter Tier', color: '#38bdf8' },
                { key: 'starterMobile', label: 'Starter + Mobile', color: '#818cf8' },
                { key: 'business', label: 'Business Tier', color: '#10b981' },
                { key: 'growth', label: 'Growth Tier', color: '#f59e0b' },
              ]}
              height={320}
              formatValue={(v) => `${v} tenants`}
            />
          </div>
        </div>
      )}

      {/* Tab 3: Retention & Churn Cohorts */}
      {activeTab === 'retention' && (
        <div className="mt-6 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Quarterly Customer Retention Cohorts (%)
            </h3>
            <p className="text-xs text-slate-500">
              Percentage of acquired workspaces active across subsequent retention periods
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold uppercase">
                  <th className="pb-3 px-3">Cohort</th>
                  <th className="pb-3 px-3">Tenants</th>
                  <th className="pb-3 px-3">Month 1</th>
                  <th className="pb-3 px-3">Month 3</th>
                  <th className="pb-3 px-3">Month 6</th>
                  <th className="pb-3 px-3">Month 12</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {mockRetentionCohorts.map((row) => (
                  <tr key={row.cohort} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">{row.cohort}</td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{row.initialSignups}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">
                        {row.m1}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">
                        {row.m3}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">
                        {row.m6}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">
                        {row.m12}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Coupon Performance & ROI */}
      {activeTab === 'coupons' && (
        <div className="mt-6 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Promotional Campaign ROI & Incremental Revenue
            </h3>
            <p className="text-xs text-slate-500">
              Gross subscription revenue catalyzed versus discount capital conceded
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold uppercase">
                  <th className="pb-3 px-3">Coupon Code</th>
                  <th className="pb-3 px-3 text-right">Redemptions</th>
                  <th className="pb-3 px-3 text-right">Discount Given</th>
                  <th className="pb-3 px-3 text-right">Revenue Catalyzed</th>
                  <th className="pb-3 px-3 text-right">Conversion Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {mockCouponAnalytics.map((c) => (
                  <tr key={c.code} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-3 font-semibold text-emerald-600 dark:text-emerald-400">{c.code}</td>
                    <td className="py-3 px-3 text-right text-slate-700 dark:text-slate-300">{c.redemptions}</td>
                    <td className="py-3 px-3 text-right text-rose-600">-{formatINR(c.discountGrantedInr)}</td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900 dark:text-slate-100">{formatINR(c.revenueGeneratedInr)}</td>
                    <td className="py-3 px-3 text-right">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">
                        {c.conversionRate}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
