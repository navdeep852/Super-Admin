import React, { useState } from 'react';
import {
  CreditCard,
  Shield,
  Percent,
  Save,
  CheckCircle2,
  Zap,
  KeyRound,
  Lock,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Tabs } from '../../components/common/Tabs';
import { mockPricingPlans, mockPlatformConfig, PricingPlanConfig } from '../../data/mockSettings';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { PermissionDenied } from '../../components/common/PermissionDenied';
import { ChangePasswordModal } from '../../components/auth/ChangePasswordModal';

export const PlatformSettingsPage: React.FC = () => {
  const { hasPermission, currentAdmin } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<'plans' | 'tax' | 'security' | 'gateway'>('plans');
  const [plans, setPlans] = useState<PricingPlanConfig[]>(mockPricingPlans);
  const [tax, setTax] = useState(mockPlatformConfig.taxation);
  const [security, setSecurity] = useState(mockPlatformConfig.securityPolicies);
  const [gateway, setGateway] = useState(mockPlatformConfig.paymentSettings);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  // If role doesn't have settings permission (e.g. support_agent or billing_admin)
  if (!hasPermission('settings')) {
    return <PermissionDenied moduleName="Platform Settings" requiredRole="Super Administrator" />;
  }

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <PageContainer
      title="Platform Settings & Governance"
      subtitle="Configure SaaS subscription plans, statutory GST rates, cryptographic policy bounds, and gateway parameters."
      actions={
        <button
          onClick={handleSaveSettings}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors shadow-xs"
        >
          {savedSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Settings Saved
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Configuration
            </>
          )}
        </button>
      }
    >
      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'plans', label: 'Subscription Plans & Tiers', icon: CreditCard },
          { id: 'tax', label: 'Statutory Taxation & GST', icon: Percent },
          { id: 'security', label: 'Security & Nonce Policies', icon: Shield },
          { id: 'gateway', label: 'Payment Gateway Integration', icon: Zap },
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {/* Plan Settings */}
      {activeTab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
          {plans.map((p, idx) => (
            <div
              key={p.id}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">{p.name}</h4>
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                    {p.id}
                  </span>
                </div>

                <p className="text-xs text-slate-500 min-h-[32px]">{p.tagline}</p>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Monthly Price (₹)</label>
                    <input
                      type="number"
                      value={p.priceMonthlyInr}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setPlans((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, priceMonthlyInr: val } : item))
                        );
                      }}
                      className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Annual Price (₹)</label>
                    <input
                      type="number"
                      value={p.priceAnnualInr}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setPlans((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, priceAnnualInr: val } : item))
                        );
                      }}
                      className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono font-bold"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1">Max Staff</label>
                      <input
                        type="number"
                        value={p.maxUsers}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setPlans((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, maxUsers: val } : item
                            )
                          );
                        }}
                        className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1">Max Branches</label>
                      <input
                        type="number"
                        value={p.maxBranches}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setPlans((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, maxBranches: val } : item
                            )
                          );
                        }}
                        className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                Platforms: <span className="font-semibold text-slate-700 dark:text-slate-300 uppercase">{p.allowedPlatforms.join(', ')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Taxation Settings */}
      {activeTab === 'tax' && (
        <div className="max-w-xl mt-6 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs space-y-4 text-xs">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Goods and Services Tax (GST) Compliance
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">
                Standard GST Rate (%)
              </label>
              <input
                type="number"
                value={tax.taxRatePercent}
                onChange={(e) => setTax({ ...tax, taxRatePercent: Number(e.target.value) })}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">
                SAC / HSN Classification Code
              </label>
              <input
                type="text"
                value={tax.hsnCode}
                onChange={(e) => setTax({ ...tax, hsnCode: e.target.value })}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">
                Statutory Financial Retention (Years)
              </label>
              <input
                type="number"
                value={tax.statutoryRetentionYears}
                onChange={(e) => setTax({ ...tax, statutoryRetentionYears: Number(e.target.value) })}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {/* Security Policies */}
      {activeTab === 'security' && (
        <div className="max-w-xl mt-6 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs space-y-4 text-xs">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Phase 2.6 Cryptographic & Session Hardening
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Enforce AAL2 Hardware MFA
                </div>
                <div className="text-[11px] text-slate-500">
                  Mandatory WebAuthn / TOTP for all platform administrators
                </div>
              </div>
              <input
                type="checkbox"
                checked={security.enforceMfaAal2}
                onChange={(e) => setSecurity({ ...security, enforceMfaAal2: e.target.checked })}
                className="w-4 h-4 accent-emerald-500 rounded"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">
                GCAP Anti-Replay Nonce Skew Window (Seconds)
              </label>
              <input
                type="number"
                value={security.gcapAssertionSkewSeconds}
                onChange={(e) =>
                  setSecurity({
                    ...security,
                    gcapAssertionSkewSeconds: Number(e.target.value),
                  })
                }
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                RFC 6749 compliant nonce window to reject delayed and replay requests.
              </span>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">
                Administrator Session Timeout (Minutes)
              </label>
              <input
                type="number"
                value={security.sessionTimeoutMinutes}
                onChange={(e) =>
                  setSecurity({
                    ...security,
                    sessionTimeoutMinutes: Number(e.target.value),
                  })
                }
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono"
              />
            </div>

            {/* Administrator Password & Credentials Section */}
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-emerald-500" />
                    Administrator Credentials & Password
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Active Account: <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">{currentAdmin?.email || 'navdeep@vistaarone.com'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setChangePasswordOpen(true)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors shadow-xs shrink-0"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Change Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gateway Settings */}
      {activeTab === 'gateway' && (
        <div className="max-w-xl mt-6 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs space-y-4 text-xs">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Payment Gateway Parameters
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">
                Active Provider
              </label>
              <input
                type="text"
                value={gateway.activeProvider}
                disabled
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 font-mono text-slate-500 uppercase"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">
                Settlement Currency
              </label>
              <input
                type="text"
                value={gateway.currency}
                disabled
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 font-mono text-slate-500 uppercase"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">
                Reservation TTL (Minutes)
              </label>
              <input
                type="number"
                value={gateway.reservationTtlMinutes}
                onChange={(e) =>
                  setGateway({
                    ...gateway,
                    reservationTtlMinutes: Number(e.target.value),
                  })
                }
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono"
              />
            </div>
          </div>
        </div>
      )}

      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </PageContainer>
  );
};
