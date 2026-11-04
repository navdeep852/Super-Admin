import React, { useState, useEffect, useRef } from 'react';
import {
  Sun,
  Moon,
  Bell,
  UserCheck,
  ChevronDown,
  Shield,
  Search,
  CheckCircle2,
  AlertTriangle,
  X,
  ExternalLink,
  LogOut,
  KeyRound,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { AdminRole, AdminUser } from '../../types';
import { NavigationModule } from './AdminSidebar';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  onSearch?: (query: string) => void;
  onNavigate?: (module: NavigationModule) => void;
}

const SEARCHABLE_MODULES: Array<{ id: NavigationModule; name: string; category: string }> = [
  { id: 'overview', name: 'Executive Overview & KPIs', category: 'Core' },
  { id: 'businesses', name: 'Business & Tenancy Management', category: 'Core' },
  { id: 'users', name: 'Tenant Users & Admin Staff', category: 'Core' },
  { id: 'subscriptions', name: 'Subscriptions & Renewals', category: 'Finance' },
  { id: 'payments', name: 'Payments & GST Reconciliation', category: 'Finance' },
  { id: 'coupons', name: 'Coupons & Promotional Offers', category: 'Finance' },
  { id: 'analytics', name: 'BI Reports & Cohort Analytics', category: 'Finance' },
  { id: 'support', name: 'Support Inquiries & Tickets', category: 'Platform' },
  { id: 'security', name: 'GCAP Audit Logs & Security Vault', category: 'Platform' },
  { id: 'system', name: 'System Telemetry & Health Probes', category: 'Platform' },
  { id: 'settings', name: 'Platform Settings & Governance', category: 'Platform' },
];

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  title,
  subtitle,
  onNavigate,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { currentAdmin, logout, sessionAal, hasPermission } = useAdminAuth();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchFocused(true);
      }
      if (e.key === 'Escape') {
        setSearchFocused(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredSearchModules = searchQuery.trim()
    ? SEARCHABLE_MODULES.filter((m) =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const getRoleBadge = (role: AdminRole) => {
    switch (role) {
      case 'super_admin':
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
      case 'billing_admin':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
      case 'support_agent':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    }
  };

  return (
    <header className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-20">
      {/* Title & Context */}
      <div>
        <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
            {subtitle}
          </p>
        )}
      </div>

      {/* Global Quick Actions & Profile */}
      <div className="flex items-center gap-3">
        {/* Quick Search */}
        <div className="relative hidden md:block w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            placeholder="Quick search (Ctrl+K)..."
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}

          {/* Quick Search Results Dropdown */}
          {searchFocused && filteredSearchModules.length > 0 && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSearchFocused(false)}
              />
              <div className="absolute left-0 right-0 mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-1.5 z-50 text-xs animate-in fade-in zoom-in-95">
                <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  Matching Modules:
                </div>
                {filteredSearchModules.map((item) => {
                  const allowed = hasPermission(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (allowed && onNavigate) {
                          onNavigate(item.id);
                          setSearchFocused(false);
                          setSearchQuery('');
                        }
                      }}
                      disabled={!allowed}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                        allowed
                          ? 'text-slate-800 dark:text-slate-200 cursor-pointer'
                          : 'text-slate-400/40 cursor-not-allowed'
                      }`}
                    >
                      <div>
                        <div className="font-semibold">{item.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">Module: {item.id}</div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {allowed ? 'Jump' : 'Restricted'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* System Notifications Bell & Popover */}
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            title="Platform Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
          </button>

          {notificationsOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setNotificationsOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 space-y-2">
                <div className="px-3 py-1 font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span>Security & Platform Alerts</span>
                  <span className="text-[10px] text-emerald-500 font-mono">Live</span>
                </div>
                <div className="px-3 space-y-2 max-h-64 overflow-y-auto">
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-emerald-700 dark:text-emerald-300">GCAP Assertions Active</div>
                      <div className="text-slate-500 dark:text-slate-400">Zero replay attacks detected in 24 hours.</div>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">Kaveri Provisions Suspended</div>
                      <div className="text-slate-500 dark:text-slate-400">2 user memberships snapshotted securely.</div>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] flex items-start gap-2">
                    <ExternalLink className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">Diwali Campaign Active</div>
                      <div className="text-slate-500 dark:text-slate-400">Code FESTIVE2500 has reached 34% quota.</div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Administrator Profile Pill */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200 dark:border-slate-800">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/30">
            {currentAdmin?.fullName
              ? currentAdmin.fullName
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
              : 'SA'}
          </div>
          <div className="hidden lg:block text-left">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-none">
              {currentAdmin?.fullName || 'Super Administrator'}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <span
                className={`text-[9px] font-semibold uppercase px-1.5 py-0.2 rounded border ${getRoleBadge(
                  currentAdmin?.role || 'super_admin'
                )}`}
              >
                {(currentAdmin?.role || 'super_admin').replace('_', ' ')}
              </span>
              <span className="text-[10px] text-emerald-500 flex items-center gap-0.5" title="MFA Session Assurance Level">
                <UserCheck className="w-3 h-3" />
                {sessionAal.toUpperCase()}
              </span>
            </div>
          </div>
          <button
            onClick={() => setChangePasswordOpen(true)}
            title="Change Administrator Password"
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors ml-1"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          <button
            onClick={logout}
            title="Sign out of administrative session"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors ml-1"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </header>
  );
};
