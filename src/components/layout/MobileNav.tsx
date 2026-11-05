import React, { useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Receipt,
  Menu,
  X,
  Layers,
  Tag,
  BarChart3,
  Users,
  LifeBuoy,
  ShieldAlert,
  Activity,
  Settings,
  User,
  KeyRound,
  LogOut,
  Camera,
  ChevronRight,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { NavigationModule } from './AdminSidebar';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { AdminProfileModal } from '../profile/AdminProfileModal';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';

interface MobileNavProps {
  currentModule: NavigationModule;
  onSelectModule: (module: NavigationModule) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  currentModule,
  onSelectModule,
}) => {
  const { currentAdmin, logout, sessionAal, hasPermission } = useAdminAuth();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [financeMenuOpen, setFinanceMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileModalTab, setProfileModalTab] = useState<'profile' | 'photo'>('profile');
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  const isFinanceActive = ['payments', 'plans', 'coupons', 'analytics'].includes(currentModule);
  const isMoreActive = ['users', 'support', 'security', 'system', 'settings'].includes(currentModule);

  const getInitials = (name?: string) => {
    if (!name) return 'SA';
    return name
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const handleNavigate = (mod: NavigationModule) => {
    onSelectModule(mod);
    setDrawerOpen(false);
    setFinanceMenuOpen(false);
  };

  return (
    <>
      {/* =========================================================================
          1. BOTTOM NAVIGATION BAR (Visible on Mobile & Tablet, Hidden on Desktop)
      ========================================================================== */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 py-1.5 flex items-center justify-around shadow-lg pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))]"
        role="navigation"
        aria-label="Mobile Navigation"
      >
        {/* Tab 1: Dashboard */}
        <button
          onClick={() => handleNavigate('overview')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-xl transition-colors flex-1 ${
            currentModule === 'overview'
              ? 'text-emerald-500 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">Dashboard</span>
        </button>

        {/* Tab 2: Businesses */}
        <button
          onClick={() => handleNavigate('businesses')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-xl transition-colors flex-1 ${
            currentModule === 'businesses'
              ? 'text-emerald-500 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Building2 className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">Businesses</span>
        </button>

        {/* Tab 3: Subscriptions */}
        <button
          onClick={() => handleNavigate('subscriptions')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-xl transition-colors flex-1 ${
            currentModule === 'subscriptions'
              ? 'text-emerald-500 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <CreditCard className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">Subscriptions</span>
        </button>

        {/* Tab 4: Finance (Popover trigger) */}
        <button
          onClick={() => setFinanceMenuOpen(!financeMenuOpen)}
          className={`flex flex-col items-center justify-center p-1.5 rounded-xl transition-colors flex-1 relative ${
            isFinanceActive || financeMenuOpen
              ? 'text-emerald-500 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Receipt className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">Finance</span>
          {isFinanceActive && (
            <span className="absolute top-1 right-5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
          )}
        </button>

        {/* Tab 5: More (Full Drawer trigger) */}
        <button
          onClick={() => setDrawerOpen(true)}
          className={`flex flex-col items-center justify-center p-1.5 rounded-xl transition-colors flex-1 relative ${
            isMoreActive || drawerOpen
              ? 'text-emerald-500 font-semibold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-tight">More</span>
        </button>
      </nav>

      {/* =========================================================================
          2. FINANCE POPOVER MENU (Quick access to financial sub-modules)
      ========================================================================== */}
      {financeMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden"
            onClick={() => setFinanceMenuOpen(false)}
          />
          <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-50 lg:hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-3 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100">
              <span>Financial & Commerce Modules</span>
              <button
                onClick={() => setFinanceMenuOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => handleNavigate('payments')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  currentModule === 'payments'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <Receipt className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Payments & GST</span>
                <span className="text-[10px] text-slate-500">Reconciliation ledger</span>
              </button>

              <button
                onClick={() => handleNavigate('plans')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  currentModule === 'plans'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <Layers className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Plans Catalog</span>
                <span className="text-[10px] text-slate-500">Tiered pricing & quotas</span>
              </button>

              <button
                onClick={() => handleNavigate('coupons')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  currentModule === 'coupons'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <Tag className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Discounts & Offers</span>
                <span className="text-[10px] text-slate-500">Campaigns & coupons</span>
              </button>

              <button
                onClick={() => handleNavigate('analytics')}
                className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                  currentModule === 'analytics'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <BarChart3 className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">BI Analytics</span>
                <span className="text-[10px] text-slate-500">Cohort & MRR reports</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* =========================================================================
          3. COMPREHENSIVE MOBILE NAVIGATION DRAWER
      ========================================================================== */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 w-80 max-w-[85vw] z-50 lg:hidden bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-emerald-500/40 bg-slate-800 flex items-center justify-center font-bold text-sm text-emerald-400 shrink-0">
                  {currentAdmin?.avatarUrl ? (
                    <img
                      src={currentAdmin.avatarUrl}
                      alt={currentAdmin.fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    getInitials(currentAdmin?.fullName)
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                    {currentAdmin?.fullName || 'Super Administrator'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                    {currentAdmin?.email}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {(currentAdmin?.role || 'super_admin').replace('_', ' ')}
                    </span>
                    <span className="text-[10px] text-sky-400 font-mono">
                      {sessionAal.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Navigation List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* Core Administration */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-2">
                  Core Administration
                </div>
                <div className="space-y-1">
                  <button
                    onClick={() => handleNavigate('overview')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors ${
                      currentModule === 'overview'
                        ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <LayoutDashboard className="w-4 h-4 text-slate-400" />
                      <span>Executive Overview</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                  </button>

                  <button
                    onClick={() => handleNavigate('businesses')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors ${
                      currentModule === 'businesses'
                        ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="w-4 h-4 text-slate-400" />
                      <span>Business Management</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                  </button>

                  <button
                    onClick={() => handleNavigate('users')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors ${
                      currentModule === 'users'
                        ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span>User Management</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                  </button>
                </div>
              </div>

              {/* Finance & Commerce */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-2">
                  Finance & Commerce
                </div>
                <div className="space-y-1">
                  <button
                    onClick={() => handleNavigate('subscriptions')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors ${
                      currentModule === 'subscriptions'
                        ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-4 h-4 text-slate-400" />
                      <span>Subscriptions</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                  </button>

                  <button
                    onClick={() => handleNavigate('plans')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors ${
                      currentModule === 'plans'
                        ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Layers className="w-4 h-4 text-slate-400" />
                      <span>Subscription Plans</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                  </button>

                  <button
                    onClick={() => handleNavigate('payments')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors ${
                      currentModule === 'payments'
                        ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Receipt className="w-4 h-4 text-slate-400" />
                      <span>Payments & Revenue</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                  </button>

                  <button
                    onClick={() => handleNavigate('coupons')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors ${
                      currentModule === 'coupons'
                        ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Tag className="w-4 h-4 text-slate-400" />
                      <span>Offers & Discounts</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                  </button>

                  <button
                    onClick={() => handleNavigate('analytics')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors ${
                      currentModule === 'analytics'
                        ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <BarChart3 className="w-4 h-4 text-slate-400" />
                      <span>Analytics & Reports</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                  </button>
                </div>
              </div>

              {/* Platform & Governance */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-2">
                  Governance & System
                </div>
                <div className="space-y-1">
                  <button
                    onClick={() => handleNavigate('support')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors ${
                      currentModule === 'support'
                        ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <LifeBuoy className="w-4 h-4 text-slate-400" />
                      <span>Support & Tickets</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500">
                      5
                    </span>
                  </button>

                  <button
                    onClick={() => handleNavigate('security')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors ${
                      currentModule === 'security'
                        ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="w-4 h-4 text-slate-400" />
                      <span>Security & Audit Logs</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                  </button>

                  <button
                    onClick={() => handleNavigate('system')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors ${
                      currentModule === 'system'
                        ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Activity className="w-4 h-4 text-slate-400" />
                      <span>System Health</span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500">
                      OK
                    </span>
                  </button>

                  <button
                    onClick={() => handleNavigate('settings')}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors ${
                      currentModule === 'settings'
                        ? 'bg-emerald-500/15 text-emerald-400 font-bold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Settings className="w-4 h-4 text-slate-400" />
                      <span>Platform Settings</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                  </button>
                </div>
              </div>

              {/* Personal Identity & Profile Actions */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-2">
                  Administrator Account
                </div>
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      setProfileModalTab('profile');
                      setProfileModalOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    <span>View & Edit Profile</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileModalTab('photo');
                      setProfileModalOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-emerald-600 dark:text-emerald-400 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Camera className="w-4 h-4 text-emerald-500" />
                    <span>Change Profile Photo</span>
                  </button>

                  <button
                    onClick={() => setPasswordModalOpen(true)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <KeyRound className="w-4 h-4 text-slate-400" />
                    <span>Change Password</span>
                  </button>

                  <button
                    onClick={() => {
                      setDrawerOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-rose-500 font-semibold hover:bg-rose-500/10"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Profile & Password Modals */}
      <AdminProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        initialTab={profileModalTab}
        onOpenChangePassword={() => setPasswordModalOpen(true)}
      />

      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
      />
    </>
  );
};

