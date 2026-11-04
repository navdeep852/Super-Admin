import React, { useState } from 'react';
import {
  Tag,
  Plus,
  FileText,
  Copy,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Tabs } from '../../components/common/Tabs';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Drawer } from '../../components/common/Drawer';
import { mockCoupons, mockRedemptions } from '../../data/mockCoupons';
import { Coupon, CouponRedemption } from '../../types';
import { formatINR, formatDate, formatDateTime } from '../../utils';
import { useAdminAuth } from '../../context/AdminAuthContext';

export const CouponsOffersPage: React.FC = () => {
  const { hasPermission } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<'campaigns' | 'redemptions'>('campaigns');
  const [coupons, setCoupons] = useState<Coupon[]>(mockCoupons);
  const [redemptions] = useState<CouponRedemption[]>(mockRedemptions);

  // New Campaign Drawer
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState(20);
  const [maxDiscountCap, setMaxDiscountCap] = useState(1000);
  const [minPurchase, setMinPurchase] = useState(999);
  const [maxRedemptions, setMaxRedemptions] = useState(100);
  const [applicablePlan, setApplicablePlan] = useState('all');

  const handleCreateCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim()) return;

    const newCoupon: Coupon = {
      id: `cpn-${Date.now()}`,
      code: newCode.toUpperCase().trim(),
      name: newName || `${newCode.toUpperCase()} Promotion`,
      description: 'Platform promotional campaign',
      discountType,
      discountValue,
      maxDiscountCapInr: discountType === 'percentage' ? maxDiscountCap : undefined,
      minPurchaseAmountInr: minPurchase,
      applicablePlans: applicablePlan === 'all' ? ['all'] : [applicablePlan],
      applicableInterval: 'all',
      customerTargeting: 'all',
      firstSubscriptionOnly: false,
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
      maxTotalRedemptions: maxRedemptions,
      currentRedemptions: 0,
      maxRedemptionsPerWorkspace: 1,
      isActive: true,
      totalDiscountGrantedInr: 0,
      createdAt: new Date().toISOString(),
    };

    setCoupons([newCoupon, ...coupons]);
    setCreateDrawerOpen(false);
    setNewCode('');
    setNewName('');
  };

  const handleToggleCouponActive = (id: string) => {
    setCoupons((prev) =>
      prev.map((c) => {
        if (c.id === id) return { ...c, isActive: !c.isActive };
        return c;
      })
    );
  };

  const redemptionColumns: Column<CouponRedemption>[] = [
    {
      key: 'couponCode',
      header: 'Coupon Code',
      sortable: true,
      render: (r) => (
        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          {r.couponCode}
        </span>
      ),
    },
    {
      key: 'workspaceName',
      header: 'Workspace',
      sortable: true,
      render: (r) => (
        <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
          {r.workspaceName}
        </span>
      ),
    },
    {
      key: 'discountAmountInr',
      header: 'Discount Given',
      align: 'right',
      sortable: true,
      render: (r) => (
        <span className="font-mono text-xs text-rose-600 dark:text-rose-400 font-semibold">
          -{formatINR(r.discountAmountInr)}
        </span>
      ),
    },
    {
      key: 'finalPayableInr',
      header: 'Net Settled',
      align: 'right',
      sortable: true,
      render: (r) => (
        <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
          {formatINR(r.finalPayableInr)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Redemption State',
      sortable: true,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'reservedAt',
      header: 'Timestamp',
      sortable: true,
      render: (r) => (
        <span className="text-xs text-slate-400 font-mono">
          {r.redeemedAt ? formatDateTime(r.redeemedAt) : formatDateTime(r.reservedAt)}
        </span>
      ),
    },
  ];

  return (
    <PageContainer
      title="Coupons & Promotional Campaigns"
      subtitle="Create targeted promotional incentives with reservation quotas, fraud constraints, and statutory audit tracking."
      actions={
        hasPermission('coupons') && (
          <button
            onClick={() => setCreateDrawerOpen(true)}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Create Campaign
          </button>
        )
      }
    >
      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'campaigns', label: 'Active Promotional Campaigns', badge: coupons.length, icon: Tag },
          { id: 'redemptions', label: 'Redemption Audit Ledger', badge: redemptions.length, icon: FileText },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {/* Campaigns Grid */}
      {activeTab === 'campaigns' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {coupons.map((coupon) => {
            const max = coupon.maxTotalRedemptions || 100;
            const usagePercent = Math.min(
              100,
              Math.round((coupon.currentRedemptions / max) * 100)
            );
            return (
              <div
                key={coupon.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-100 tracking-wide">
                          {coupon.code}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            coupon.isActive
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {coupon.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {coupon.discountType === 'percentage'
                          ? `${coupon.discountValue}% off (Cap: ${formatINR(coupon.maxDiscountCapInr || 0)})`
                          : `Flat ${formatINR(coupon.discountValue)} off`}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <Tag className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Quota Progress */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>Redemption Quota</span>
                      <span className="font-mono font-medium">
                        {coupon.currentRedemptions} / {max} ({usagePercent}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all"
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Eligibility Rules */}
                  <div className="mt-3 space-y-1 text-[11px] text-slate-400">
                    <div>Min Purchase: <strong className="text-slate-700 dark:text-slate-300">{formatINR(coupon.minPurchaseAmountInr)}</strong></div>
                    <div>Applicable: <strong className="text-slate-700 dark:text-slate-300 capitalize">{coupon.applicablePlans.join(', ')}</strong></div>
                    <div>Expires: <strong className="font-mono text-slate-700 dark:text-slate-300">{coupon.validUntil ? formatDate(coupon.validUntil) : 'No Expiry'}</strong></div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => handleToggleCouponActive(coupon.id)}
                    className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  >
                    {coupon.isActive ? 'Disable Offer' : 'Enable Offer'}
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(coupon.code);
                      alert(`Copied ${coupon.code} to clipboard`);
                    }}
                    className="p-1 rounded text-slate-400 hover:text-emerald-500"
                    title="Copy Code"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6">
          <DataTable
            data={redemptions}
            columns={redemptionColumns}
            keyExtractor={(r) => r.id}
            pageSize={8}
            emptyMessage="No redemptions recorded."
          />
        </div>
      )}

      {/* CREATE CAMPAIGN DRAWER */}
      <Drawer
        isOpen={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        title="Launch Promotional Campaign"
        subtitle="Configure reservation bounds and fraud prevention constraints."
        width="lg"
      >
        <form onSubmit={handleCreateCoupon} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Coupon Code <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="e.g. FESTIVE2026, SUMMER50"
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono font-bold uppercase tracking-wider"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Campaign Display Title
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Summer Festival Special 20% Off"
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Discount Mode
              </label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as any)}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="percentage">Percentage Discount (%)</option>
                <option value="fixed">Fixed INR (₹)</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Value ({discountType === 'percentage' ? '%' : '₹'})
              </label>
              <input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(Number(e.target.value))}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
              />
            </div>
          </div>

          {discountType === 'percentage' && (
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Maximum Discount Cap (₹)
              </label>
              <input
                type="number"
                value={maxDiscountCap}
                onChange={(e) => setMaxDiscountCap(Number(e.target.value))}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Minimum Cart (₹)
              </label>
              <input
                type="number"
                value={minPurchase}
                onChange={(e) => setMinPurchase(Number(e.target.value))}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Redemption Quota
              </label>
              <input
                type="number"
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(Number(e.target.value))}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Applicable Subscription Tier
            </label>
            <select
              value={applicablePlan}
              onChange={(e) => setApplicablePlan(e.target.value)}
              className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              <option value="all">All Plans (Starter, Business, Growth)</option>
              <option value="business">Business Tier Only</option>
              <option value="growth">Growth Tier Only</option>
            </select>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateDrawerOpen(false)}
              className="px-3.5 py-2 text-xs text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
            >
              Publish Campaign
            </button>
          </div>
        </form>
      </Drawer>
    </PageContainer>
  );
};
