import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Edit2,
  Archive,
  CheckCircle2,
  XCircle,
  Users,
  Building2,
  Smartphone,
  Monitor,
  Globe,
  Clock,
  Sparkles,
  Layers,
  ArrowRight,
  Shield,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Modal } from '../../components/common/Modal';
import { Tabs } from '../../components/common/Tabs';
import { adminGatewayClient } from '../../services/adminGatewayClient';
import { SubscriptionPlan } from '../../types';
import { formatINR } from '../../utils';

export const SubscriptionPlansPage: React.FC = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'grid' | 'comparison'>('grid');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Form Fields
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formTagline, setFormTagline] = useState('');
  const [formMonthlyPrice, setFormMonthlyPrice] = useState('499');
  const [formAnnualPrice, setFormAnnualPrice] = useState('4999');
  const [formTrialDays, setFormTrialDays] = useState('14');
  const [formMaxUsers, setFormMaxUsers] = useState('2');
  const [formMaxBranches, setFormMaxBranches] = useState('1');
  const [formPlatforms, setFormPlatforms] = useState<string[]>(['web']);
  const [formFeatures, setFormFeatures] = useState<string[]>([]);
  const [newFeatureText, setNewFeatureText] = useState('');

  const loadPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminGatewayClient.getPlans();
      setPlans(res.plans);
    } catch (err: any) {
      setError(err.message || 'Failed to load subscription plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const openCreateModal = () => {
    setEditingPlan(null);
    setFormId('');
    setFormName('');
    setFormTagline('');
    setFormMonthlyPrice('499');
    setFormAnnualPrice('4999');
    setFormTrialDays('14');
    setFormMaxUsers('2');
    setFormMaxBranches('1');
    setFormPlatforms(['web']);
    setFormFeatures([
      'Cloud Web Dashboard',
      'Point-of-Sale Billing',
      'Inventory Stock Ledger',
      'Customer Ledger & Invoicing',
    ]);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setFormId(plan.id);
    setFormName(plan.name);
    setFormTagline(plan.tagline || '');
    setFormMonthlyPrice(String(plan.priceMonthlyInr));
    setFormAnnualPrice(String(plan.priceAnnualInr));
    setFormTrialDays(String(plan.trial_days || 14));
    setFormMaxUsers(String(plan.max_users));
    setFormMaxBranches(String(plan.max_branches));
    setFormPlatforms(plan.allowed_platforms || ['web']);
    setFormFeatures(plan.features || []);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleAddFeature = () => {
    if (newFeatureText.trim()) {
      setFormFeatures([...formFeatures, newFeatureText.trim()]);
      setNewFeatureText('');
    }
  };

  const handleRemoveFeature = (idx: number) => {
    setFormFeatures(formFeatures.filter((_, i) => i !== idx));
  };

  const togglePlatform = (p: string) => {
    if (formPlatforms.includes(p)) {
      if (formPlatforms.length > 1) {
        setFormPlatforms(formPlatforms.filter((item) => item !== p));
      }
    } else {
      setFormPlatforms([...formPlatforms, p]);
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);

    try {
      const payload: Partial<SubscriptionPlan> = {
        name: formName.trim(),
        tagline: formTagline.trim(),
        priceMonthlyInr: Number(formMonthlyPrice),
        priceAnnualInr: Number(formAnnualPrice),
        trial_days: Number(formTrialDays),
        max_users: Number(formMaxUsers),
        max_branches: Number(formMaxBranches),
        allowed_platforms: formPlatforms,
        features: formFeatures,
      };

      if (editingPlan) {
        await adminGatewayClient.updatePlan(editingPlan.id, payload);
        setSuccessToast(`Plan '${editingPlan.name}' updated successfully.`);
      } else {
        payload.id = formId.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        await adminGatewayClient.createPlan(payload);
        setSuccessToast(`New plan '${formName}' created successfully.`);
      }

      setIsModalOpen(false);
      await loadPlans();
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      setModalError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchivePlan = async (plan: SubscriptionPlan) => {
    if (window.confirm(`Are you sure you want to archive plan '${plan.name}'? Existing subscribers will remain active, but new subscriptions will be prevented.`)) {
      try {
        await adminGatewayClient.archivePlan(plan.id);
        setSuccessToast(`Plan '${plan.name}' archived.`);
        await loadPlans();
        setTimeout(() => setSuccessToast(null), 3000);
      } catch (err: any) {
        alert(err.message || 'Failed to archive plan');
      }
    }
  };

  const renderPlatformIcons = (platforms: string[]) => {
    return (
      <div className="flex items-center gap-1.5">
        {platforms.includes('web') && (
          <span title="Cloud Web" className="p-1 rounded bg-blue-500/10 text-blue-400">
            <Globe className="w-3.5 h-3.5" />
          </span>
        )}
        {platforms.includes('desktop') && (
          <span title="Windows Desktop POS" className="p-1 rounded bg-emerald-500/10 text-emerald-400">
            <Monitor className="w-3.5 h-3.5" />
          </span>
        )}
        {platforms.includes('android') && (
          <span title="Native Android APK" className="p-1 rounded bg-amber-500/10 text-amber-400">
            <Smartphone className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    );
  };

  return (
    <PageContainer
      title="Subscription Plans & Pricing Tiers"
      subtitle="Authoritative catalog of VISTAAR Business OS SaaS tiers, device entitlements, usage bounds, and trial durations."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={loadPlans}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
            title="Refresh Plans"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openCreateModal}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Create Plan
          </button>
        </div>
      }
    >
      {/* Success Toast */}
      {successToast && (
        <div className="mb-6 p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'grid', label: 'Plans Catalog & Governance', icon: Layers },
          { id: 'comparison', label: 'Feature & Limits Comparison Matrix', icon: CreditCard },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <p className="text-xs font-mono">Loading authoritative subscription plans...</p>
        </div>
      ) : activeTab === 'grid' ? (
        /* Plans Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {plans.map((p) => {
            const annualSavings = p.priceMonthlyInr > 0
              ? Math.round(((p.priceMonthlyInr * 12 - p.priceAnnualInr) / (p.priceMonthlyInr * 12)) * 100)
              : 0;
            const effectiveMonthlyAnnual = p.priceAnnualInr > 0
              ? Math.round(p.priceAnnualInr / 12)
              : 0;

            return (
              <div
                key={p.id}
                className={`rounded-2xl border p-5 flex flex-col justify-between transition-all backdrop-blur-xs relative overflow-hidden ${
                  p.is_archived
                    ? 'border-slate-800 bg-slate-900/40 opacity-75'
                    : p.id === 'growth'
                    ? 'border-emerald-500/40 bg-gradient-to-b from-emerald-500/5 to-slate-900/80 shadow-lg shadow-emerald-500/5'
                    : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
                }`}
              >
                {/* Header Badge */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white tracking-tight">{p.name}</h3>
                      {p.id === 'growth' && (
                        <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-emerald-400" />
                          Enterprise
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400">
                      {p.id}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 min-h-[32px] line-clamp-2 mb-4">
                    {p.tagline || 'Standard commercial retail operating system license.'}
                  </p>

                  {/* Pricing Box */}
                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 mb-4">
                    <div className="flex items-baseline justify-between mb-1">
                      <div>
                        <span className="text-2xl font-black text-white">{formatINR(p.priceMonthlyInr)}</span>
                        <span className="text-xs text-slate-500"> / month</span>
                      </div>
                      {annualSavings > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          Save {annualSavings}%
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center justify-between border-t border-slate-800/60 pt-2 mt-2">
                      <span>Annual Billing:</span>
                      <span className="font-mono text-white font-semibold">{formatINR(p.priceAnnualInr)} / year</span>
                    </div>
                    {effectiveMonthlyAnnual > 0 && (
                      <div className="text-[10px] text-slate-500 text-right mt-0.5 font-mono">
                        (Effective {formatINR(effectiveMonthlyAnnual)}/mo)
                      </div>
                    )}
                  </div>

                  {/* Core Limits & Entitlements */}
                  <div className="space-y-2 mb-4 text-xs">
                    <div className="flex items-center justify-between text-slate-300 py-1 border-b border-slate-800/40">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        Staff Users:
                      </span>
                      <span className="font-semibold text-white">
                        {p.max_users === -1 || p.max_users === 0 ? 'Unlimited' : `${p.max_users} included`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300 py-1 border-b border-slate-800/40">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Building2 className="w-3.5 h-3.5 text-slate-500" />
                        Branch Outlets:
                      </span>
                      <span className="font-semibold text-white">
                        {p.max_branches === -1 || p.max_branches === 0 ? 'Unlimited' : `${p.max_branches} branch`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300 py-1 border-b border-slate-800/40">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        Trial Period:
                      </span>
                      <span className="font-semibold text-white">{p.trial_days || 14} days</span>
                    </div>

                    <div className="flex items-center justify-between text-slate-300 py-1">
                      <span className="text-slate-400">Allowed Devices:</span>
                      {renderPlatformIcons(p.allowed_platforms || ['web'])}
                    </div>
                  </div>

                  {/* Feature Checklist */}
                  <div className="space-y-1.5 mb-5 pt-2 border-t border-slate-800/60">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Included Capabilities:
                    </div>
                    {(p.features || []).slice(0, 5).map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">{f}</span>
                      </div>
                    ))}
                    {(p.features || []).length > 5 && (
                      <div className="text-[11px] text-slate-500 pl-5">
                        + {(p.features || []).length - 5} more capabilities...
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer KPI & Actions */}
                <div className="pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-3 text-xs">
                    <span className="text-slate-500">Active Subscribers:</span>
                    <span className="font-bold text-emerald-400 font-mono text-sm">
                      {p.activeSubscribers || 0} organizations
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(p)}
                      className="flex-1 py-1.5 px-3 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-700/80 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit Plan
                    </button>
                    {!p.is_archived && p.id !== 'free_trial' && (
                      <button
                        onClick={() => handleArchivePlan(p)}
                        className="p-1.5 rounded-lg border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Archive Plan"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Plan Comparison Matrix */
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80">
                  <th className="py-4 px-6 text-slate-400 font-semibold w-1/4">Feature & Entitlement</th>
                  {plans.map((p) => (
                    <th key={p.id} className="py-4 px-4 text-center">
                      <div className="font-bold text-sm text-white">{p.name}</div>
                      <div className="text-[11px] text-emerald-400 font-mono mt-0.5">{formatINR(p.priceMonthlyInr)}/mo</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                <tr>
                  <td className="py-3 px-6 font-medium text-slate-400">Annual Price (INR)</td>
                  {plans.map((p) => (
                    <td key={p.id} className="py-3 px-4 text-center font-mono font-semibold text-white">
                      {formatINR(p.priceAnnualInr)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-6 font-medium text-slate-400">Effective Monthly on Annual</td>
                  {plans.map((p) => (
                    <td key={p.id} className="py-3 px-4 text-center font-mono text-emerald-400">
                      {formatINR(Math.round(p.priceAnnualInr / 12))}/mo
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-6 font-medium text-slate-400">Staff User Limits</td>
                  {plans.map((p) => (
                    <td key={p.id} className="py-3 px-4 text-center font-semibold">
                      {p.max_users === -1 || p.max_users === 0 ? 'Unlimited' : p.max_users}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-6 font-medium text-slate-400">Branch Outlet Limits</td>
                  {plans.map((p) => (
                    <td key={p.id} className="py-3 px-4 text-center font-semibold">
                      {p.max_branches === -1 || p.max_branches === 0 ? 'Unlimited' : p.max_branches}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-6 font-medium text-slate-400">Supported Devices</td>
                  {plans.map((p) => (
                    <td key={p.id} className="py-3 px-4 text-center">
                      <div className="flex justify-center">{renderPlatformIcons(p.allowed_platforms || ['web'])}</div>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-6 font-medium text-slate-400">Free Trial Duration</td>
                  {plans.map((p) => (
                    <td key={p.id} className="py-3 px-4 text-center font-mono">
                      {p.trial_days || 14} Days
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-3 px-6 font-medium text-slate-400">Active Subscribers</td>
                  {plans.map((p) => (
                    <td key={p.id} className="py-3 px-4 text-center font-bold text-white font-mono">
                      {p.activeSubscribers || 0}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Plan Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPlan ? `Edit Subscription Plan: ${editingPlan.name}` : 'Create New Subscription Plan'}
        subtitle="Historical subscriber invoices remain strictly immutable when adjusting plan properties."
        maxWidth="lg"
      >
        <form onSubmit={handleSavePlan} className="space-y-4 text-xs">
          {modalError && (
            <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Plan Identifier (Slug)</label>
              <input
                type="text"
                required
                disabled={!!editingPlan}
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                placeholder="e.g. enterprise_plus"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Plan Display Name</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Enterprise Plus"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Tagline / Description</label>
            <input
              type="text"
              value={formTagline}
              onChange={(e) => setFormTagline(e.target.value)}
              placeholder="e.g. High-throughput retail chain operating system"
              className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Monthly Price (₹)</label>
              <input
                type="number"
                required
                value={formMonthlyPrice}
                onChange={(e) => setFormMonthlyPrice(e.target.value)}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Annual Price (₹)</label>
              <input
                type="number"
                required
                value={formAnnualPrice}
                onChange={(e) => setFormAnnualPrice(e.target.value)}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Trial Days</label>
              <input
                type="number"
                required
                value={formTrialDays}
                onChange={(e) => setFormTrialDays(e.target.value)}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Max Staff Users (-1 = Unlimited)</label>
              <input
                type="number"
                required
                value={formMaxUsers}
                onChange={(e) => setFormMaxUsers(e.target.value)}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Max Branches (-1 = Unlimited)</label>
              <input
                type="number"
                required
                value={formMaxBranches}
                onChange={(e) => setFormMaxBranches(e.target.value)}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
              />
            </div>
          </div>

          {/* Platform Toggles */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">Allowed Platforms</label>
            <div className="flex items-center gap-3">
              {[
                { id: 'web', label: 'Cloud Web', icon: Globe },
                { id: 'desktop', label: 'Windows POS', icon: Monitor },
                { id: 'android', label: 'Android Mobile', icon: Smartphone },
              ].map((plat) => {
                const Icon = plat.icon;
                const active = formPlatforms.includes(plat.id);
                return (
                  <button
                    key={plat.id}
                    type="button"
                    onClick={() => togglePlatform(plat.id)}
                    className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-colors ${
                      active
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-800 bg-slate-950 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {plat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Features Editor */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Plan Features & Entitlements</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newFeatureText}
                onChange={(e) => setNewFeatureText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddFeature(); } }}
                placeholder="Add a new feature entitlement..."
                className="flex-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs"
              />
              <button
                type="button"
                onClick={handleAddFeature}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-950/60 border border-slate-800 rounded-lg">
              {formFeatures.map((f, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[11px] flex items-center gap-1.5"
                >
                  {f}
                  <button
                    type="button"
                    onClick={() => handleRemoveFeature(idx)}
                    className="text-slate-500 hover:text-rose-400"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving Plan...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Save Plan
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
};
