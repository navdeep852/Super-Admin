import React, { useState, useEffect } from 'react';
import {
  Tag,
  Plus,
  FileText,
  Calculator,
  RefreshCw,
  Sparkles,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Copy,
  TrendingDown,
  Layers,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Tabs } from '../../components/common/Tabs';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Drawer } from '../../components/common/Drawer';
import { adminGatewayClient } from '../../services/adminGatewayClient';
import { Coupon, CouponRedemption } from '../../types';
import { formatINR, formatDate, formatDateTime } from '../../utils';
import { useAdminAuth } from '../../context/AdminAuthContext';

export const CouponsOffersPage: React.FC = () => {
  const { hasPermission } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<'campaigns' | 'redemptions'>('campaigns');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [redemptions, setRedemptions] = useState<CouponRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Campaign Drawer
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed' | 'promotional_price'>('percentage');
  const [discountValue, setDiscountValue] = useState(20);
  const [promotionalPrice, setPromotionalPrice] = useState(699);
  const [maxDiscountCap, setMaxDiscountCap] = useState(1000);
  const [minPurchase, setMinPurchase] = useState(0);
  const [maxRedemptions, setMaxRedemptions] = useState(100);
  const [applicablePlan, setApplicablePlan] = useState('all');
  const [applicableInterval, setApplicableInterval] = useState<'all' | 'monthly' | 'annual'>('all');
  const [validDays, setValidDays] = useState(30);
  const [priority, setPriority] = useState(0);
  const [bannerText, setBannerText] = useState('');
  const [targetWorkspaceId, setTargetWorkspaceId] = useState('');

  // Pricing Engine Preview Simulator Modal
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simPlanId, setSimPlanId] = useState('business');
  const [simBillingCycle, setSimBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [simCouponCode, setSimCouponCode] = useState('');
  const [simCustomPrice, setSimCustomPrice] = useState<string>('');
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadOffers = async () => {
    try {
      setErrorMessage(null);
      const res = await adminGatewayClient.getOffers();
      setCoupons(res.offers || []);
      setIsLive(res.isLive);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load promotional offers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOffers();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadOffers();
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim()) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const now = new Date();
      const validUntil = new Date(now.getTime() + validDays * 86400000);

      const payload = {
        code: newCode.toUpperCase().trim(),
        name: newName.trim() || `${newCode.toUpperCase()} Special Offer`,
        description: newDescription.trim() || 'Platform promotional offer',
        discount_type: discountType,
        discount_value: discountType === 'promotional_price' ? 0 : discountValue,
        promotional_price_inr: discountType === 'promotional_price' ? promotionalPrice : null,
        max_discount_cap_inr: discountType === 'percentage' && maxDiscountCap > 0 ? maxDiscountCap : null,
        min_purchase_amount_inr: minPurchase > 0 ? minPurchase : 0,
        applicable_plans: applicablePlan === 'all' ? ['all'] : [applicablePlan],
        applicable_interval: applicableInterval,
        customer_targeting: targetWorkspaceId ? 'custom' : 'all',
        target_workspace_id: targetWorkspaceId.trim() || null,
        valid_from: now.toISOString(),
        valid_until: validUntil.toISOString(),
        max_total_redemptions: maxRedemptions > 0 ? maxRedemptions : null,
        max_redemptions_per_workspace: 1,
        priority: priority || 0,
        banner_text: bannerText.trim() || null,
        is_active: true,
      };

      await adminGatewayClient.createOffer(payload);
      await loadOffers();
      setCreateDrawerOpen(false);

      // Reset form
      setNewCode('');
      setNewName('');
      setNewDescription('');
      setDiscountType('percentage');
      setDiscountValue(20);
      setPromotionalPrice(699);
      setMaxDiscountCap(1000);
      setMinPurchase(0);
      setMaxRedemptions(100);
      setApplicablePlan('all');
      setApplicableInterval('all');
      setValidDays(30);
      setPriority(0);
      setBannerText('');
      setTargetWorkspaceId('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create campaign');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      // Optimistic update
      setCoupons((prev) =>
        prev.map((c) => (c.id === coupon.id ? { ...c, isActive: !c.isActive } : c))
      );
      await adminGatewayClient.toggleOffer(coupon.id);
    } catch (err: any) {
      // Rollback
      await loadOffers();
      setErrorMessage(err.message || 'Failed to update campaign status');
    }
  };

  const handleRunSimulator = async () => {
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await adminGatewayClient.previewPricing({
        plan_id: simPlanId,
        billing_cycle: simBillingCycle,
        coupon_code: simCouponCode.trim() || undefined,
        custom_price_inr: simCustomPrice ? parseFloat(simCustomPrice) : undefined,
      });
      setSimResult(res.preview);
    } catch (err: any) {
      setErrorMessage(err.message || 'Pricing preview calculation failed');
    } finally {
      setSimLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
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
          {r.workspaceName || r.workspaceId}
        </span>
      ),
    },
    {
      key: 'discountAmountInr',
      header: 'Discount Granted',
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
      header: 'Final Settled',
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
      title="Promotional Offers & Discounts"
      subtitle="Configure statutory discount campaigns, percentage/fixed tiers, custom negotiated prices, and simulate real-time integer-paise pricing."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSimulatorOpen(true);
              handleRunSimulator();
            }}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Calculator className="w-4 h-4 text-emerald-400" />
            Pricing Simulator
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Refresh offers"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
          {hasPermission('create_coupon') && (
            <button
              onClick={() => setCreateDrawerOpen(true)}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Create Offer
            </button>
          )}
        </div>
      }
    >
      {/* Alert Banner if Error */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'campaigns', label: 'Active Promotional Offers', badge: coupons.length, icon: Tag },
          { id: 'redemptions', label: 'Redemption Audit Ledger', badge: redemptions.length, icon: FileText },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Loading live promotional campaigns from Gateway...</p>
        </div>
      ) : activeTab === 'campaigns' ? (
        coupons.length === 0 ? (
          <div className="mt-8 p-12 text-center rounded-xl border border-dashed border-slate-700 bg-slate-900/40">
            <Tag className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-200">No Promotional Offers Configured</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Create a new promotional campaign or discount offer to incentivize workspace subscriptions.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {coupons.map((coupon) => {
              const max = coupon.maxTotalRedemptions || 100;
              const current = coupon.currentRedemptions || 0;
              const usagePercent = Math.min(100, Math.round((current / max) * 100));

              return (
                <div
                  key={coupon.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition-all"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-100 tracking-wider">
                            {coupon.code}
                          </span>
                          <button
                            onClick={() => copyToClipboard(coupon.code)}
                            className="text-slate-400 hover:text-slate-200 p-1"
                            title="Copy code"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          {copiedCode === coupon.code && (
                            <span className="text-[10px] text-emerald-400 font-mono">Copied!</span>
                          )}
                        </div>
                        <h4 className="text-xs font-semibold text-slate-400 mt-0.5">{coupon.name}</h4>
                      </div>

                      <button
                        onClick={() => handleToggleActive(coupon)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
                          coupon.isActive
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {coupon.isActive ? 'Active' : 'Disabled'}
                      </button>
                    </div>

                    {/* Model Value Badge */}
                    <div className="mt-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] text-slate-400">Offer Model:</span>
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {coupon.discountType === 'percentage' && `${coupon.discountValue}% Off`}
                          {coupon.discountType === 'fixed' && `Flat ${formatINR(coupon.discountValue)} Off`}
                          {coupon.discountType === 'promotional_price' && `Special Price: ${formatINR((coupon as any).promotionalPriceInr || 0)}`}
                        </span>
                      </div>

                      {coupon.discountType === 'percentage' && coupon.maxDiscountCapInr && (
                        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                          <span>Max Discount Cap:</span>
                          <span className="font-mono text-slate-300">{formatINR(coupon.maxDiscountCapInr)}</span>
                        </div>
                      )}

                      {coupon.minPurchaseAmountInr > 0 && (
                        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                          <span>Min Spend:</span>
                          <span className="font-mono text-slate-300">{formatINR(coupon.minPurchaseAmountInr)}</span>
                        </div>
                      )}

                      {(coupon as any).bannerText && (
                        <div className="mt-2 text-[10px] text-amber-400/90 italic border-t border-slate-800/60 pt-1.5 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>{(coupon as any).bannerText}</span>
                        </div>
                      )}
                    </div>

                    {/* Restrictions Info */}
                    <div className="mt-3 space-y-1 text-[11px] text-slate-400">
                      <div className="flex items-center justify-between">
                        <span>Target:</span>
                        <span className="text-slate-300 font-medium">
                          {(coupon as any).targetWorkspaceId ? 'Specific Workspace' : 'All Workspaces'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Interval:</span>
                        <span className="text-slate-300 uppercase font-mono text-[10px]">
                          {coupon.applicableInterval || 'all'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Validity:</span>
                        <span className="text-slate-400 font-mono text-[10px]">
                          {formatDate(coupon.validFrom || '')} — {formatDate(coupon.validUntil || '')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Redemptions Progress */}
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-500 font-medium">Redemptions</span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {current} / {max}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          usagePercent > 85 ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="mt-6">
          <DataTable
            columns={redemptionColumns}
            data={redemptions}
            emptyMessage="No coupon redemptions recorded in audit ledger yet."
            keyExtractor={(r) => r.id}
          />
        </div>
      )}

      {/* Create Offer Drawer */}
      <Drawer
        isOpen={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        title="Create Promotional Offer"
      >
        <form onSubmit={handleCreateCoupon} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Offer Code <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="e.g. FESTIVE30, VISTAAR999"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Campaign Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Diwali Merchant Accelerator"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Offer Pricing Model</label>
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="percentage">Model A — Percentage Discount (% off)</option>
              <option value="fixed">Model B — Fixed Amount Discount (₹ off)</option>
              <option value="promotional_price">Model C — Promotional Price (Fixed ₹ Plan Rate)</option>
            </select>
          </div>

          {discountType === 'percentage' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Discount %</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Max Cap (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={maxDiscountCap}
                  onChange={(e) => setMaxDiscountCap(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono"
                />
              </div>
            </div>
          )}

          {discountType === 'fixed' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Discount Amount (₹)</label>
              <input
                type="number"
                min="1"
                value={discountValue}
                onChange={(e) => setDiscountValue(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono"
              />
            </div>
          )}

          {discountType === 'promotional_price' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Fixed Promotional Rate (₹ / cycle)
              </label>
              <input
                type="number"
                min="0"
                value={promotionalPrice}
                onChange={(e) => setPromotionalPrice(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Workspaces applying this offer will be charged exactly this base price.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Applicable Interval</label>
              <select
                value={applicableInterval}
                onChange={(e) => setApplicableInterval(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white"
              >
                <option value="all">Monthly & Annual</option>
                <option value="monthly">Monthly Only</option>
                <option value="annual">Annual Only</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Max Redemptions</label>
              <input
                type="number"
                min="1"
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Valid Days from Today</label>
            <input
              type="number"
              min="1"
              value={validDays}
              onChange={(e) => setValidDays(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Target Workspace ID (Optional Model D Lock)
            </label>
            <input
              type="text"
              value={targetWorkspaceId}
              onChange={(e) => setTargetWorkspaceId(e.target.value)}
              placeholder="UUID or leave blank for all"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Banner Announcement Text</label>
            <input
              type="text"
              value={bannerText}
              onChange={(e) => setBannerText(e.target.value)}
              placeholder="e.g. Save ₹500 on your next annual billing cycle!"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white text-xs"
            />
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateDrawerOpen(false)}
              className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Offer
            </button>
          </div>
        </form>
      </Drawer>

      {/* Pricing Simulator Modal */}
      {simulatorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Server-Side Pricing Engine Simulator</h3>
              </div>
              <button
                onClick={() => setSimulatorOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-semibold"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Plan Tier</label>
                <select
                  value={simPlanId}
                  onChange={(e) => setSimPlanId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white"
                >
                  <option value="starter">Starter (₹499/mo, ₹4,990/yr)</option>
                  <option value="starter_mobile">Starter Mobile (₹399/mo, ₹3,990/yr)</option>
                  <option value="business">Business (₹999/mo, ₹9,990/yr)</option>
                  <option value="growth">Growth (₹1,999/mo, ₹19,990/yr)</option>
                  <option value="free_trial">Free Trial (₹0)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Billing Interval</label>
                <select
                  value={simBillingCycle}
                  onChange={(e) => setSimBillingCycle(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white"
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual (Includes 2-Month Waiver)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Coupon Code (Optional)</label>
                <input
                  type="text"
                  value={simCouponCode}
                  onChange={(e) => setSimCouponCode(e.target.value.toUpperCase())}
                  placeholder="e.g. VISTAAR20, SPECIAL699"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Custom Negotiated Price (Model D)
                </label>
                <input
                  type="number"
                  value={simCustomPrice}
                  onChange={(e) => setSimCustomPrice(e.target.value)}
                  placeholder="Leave empty for standard"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleRunSimulator}
                disabled={simLoading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                {simLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Calculate Integer-Paise Preview
              </button>
            </div>

            {simResult && (
              <div className="mt-5 p-4 rounded-xl bg-slate-950 border border-emerald-500/30">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <span className="text-xs font-semibold text-emerald-400">Pricing Engine Breakdown</span>
                  <span className="text-[11px] font-mono text-slate-400">
                    Engine: Exact Integer-Paise (0-Floating Drift)
                  </span>
                </div>

                <div className="space-y-2 mt-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Original Plan Base Price:</span>
                    <span className="font-mono text-slate-200">{formatINR(simResult.original_plan_price_inr)}</span>
                  </div>

                  {simResult.discount_amount_inr > 0 && (
                    <div className="flex justify-between text-rose-400">
                      <span>Promotional Discount Granted ({simResult.offer_code || 'Override'}):</span>
                      <span className="font-mono font-semibold">-{formatINR(simResult.discount_amount_inr)}</span>
                    </div>
                  )}

                  <div className="flex justify-between font-medium">
                    <span className="text-slate-300">Taxable Net Amount:</span>
                    <span className="font-mono text-slate-100">{formatINR(simResult.taxable_amount_inr)}</span>
                  </div>

                  <div className="flex justify-between text-amber-400/90">
                    <span>18% Statutory GST:</span>
                    <span className="font-mono">{formatINR(simResult.gst_amount_inr)}</span>
                  </div>

                  <div className="flex justify-between pt-3 border-t border-slate-800 text-sm font-bold">
                    <span className="text-white">Final Settled Payable (INR):</span>
                    <span className="font-mono text-emerald-400 text-base">
                      {formatINR(simResult.final_payable_inr)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
};
