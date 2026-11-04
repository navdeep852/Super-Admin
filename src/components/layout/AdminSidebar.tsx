import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  Receipt,
  Tag,
  BarChart3,
  LifeBuoy,
  ShieldCheck,
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Layers,
} from 'lucide-react';
import { cn } from '../../utils';
import { useAdminAuth } from '../../context/AdminAuthContext';

export type NavigationModule =
  | 'overview'
  | 'businesses'
  | 'users'
  | 'subscriptions'
  | 'plans'
  | 'payments'
  | 'coupons'
  | 'analytics'
  | 'support'
  | 'security'
  | 'system'
  | 'settings';

interface AdminSidebarProps {
  currentModule: NavigationModule;
  onSelectModule: (module: NavigationModule) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  id: NavigationModule;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  badgeVariant?: 'emerald' | 'amber' | 'blue' | 'rose';
  group?: 'core' | 'operations' | 'platform';
}

const NAV_ITEMS: NavItem[] = [
  // Core Modules
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'core' },
  { id: 'businesses', label: 'Business Management', icon: Building2, group: 'core' },
  { id: 'users', label: 'User Management', icon: Users, group: 'core' },

  // Financial & Commerce
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard, group: 'operations' },
  { id: 'plans', label: 'Subscription Plans', icon: Layers, group: 'operations' },
  { id: 'payments', label: 'Payments & Revenue', icon: Receipt, group: 'operations' },
  { id: 'coupons', label: 'Offers & Discounts', icon: Tag, group: 'operations' },
  { id: 'analytics', label: 'Analytics & Reports', icon: BarChart3, group: 'operations' },

  // Governance & Platform
  { id: 'support', label: 'Support & Tickets', icon: LifeBuoy, badge: '5', badgeVariant: 'amber', group: 'platform' },
  { id: 'security', label: 'Security & Audit Logs', icon: ShieldAlert, group: 'platform' },
  { id: 'system', label: 'System Health', icon: Activity, badge: 'All OK', badgeVariant: 'emerald', group: 'platform' },
  { id: 'settings', label: 'Platform Settings', icon: Settings, group: 'platform' },
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentModule,
  onSelectModule,
  collapsed,
  onToggleCollapse,
}) => {
  const { hasPermission } = useAdminAuth();

  const renderNavGroup = (title: string, items: NavItem[]) => (
    <div className="py-2">
      {!collapsed && (
        <div className="px-4 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {title}
        </div>
      )}
      <div className="space-y-0.5 px-2">
        {items.map((item) => {
          const isActive = currentModule === item.id;
          const allowed = hasPermission(item.id);
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => onSelectModule(item.id)}
              disabled={!allowed}
              title={collapsed ? item.label : undefined}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all group relative',
                isActive
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs'
                  : allowed
                  ? 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                  : 'text-slate-400/40 dark:text-slate-600/40 cursor-not-allowed opacity-50',
                collapsed && 'justify-center px-2'
              )}
            >
              <Icon
                className={cn(
                  'w-4 h-4 shrink-0 transition-transform group-hover:scale-105',
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                )}
              />

              {!collapsed && (
                <>
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {item.badge && (
                    <span
                      className={cn(
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded-full font-mono',
                        item.badgeVariant === 'amber'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : item.badgeVariant === 'emerald'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}

              {/* Active Emerald Indicator Bar */}
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-emerald-500 rounded-r-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <aside
      className={cn(
        'relative flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 transition-all duration-300 z-30 shrink-0 select-none backdrop-blur-xs',
        collapsed ? 'w-18' : 'w-64'
      )}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-200 dark:border-slate-800">
        {!collapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-black shadow-md shadow-emerald-500/20 text-sm">
              V
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                VISTAAR
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Control Plane
                </span>
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                admin.vistaarone.com
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-sm shadow-md shadow-emerald-500/20">
            V
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto py-2 divide-y divide-slate-100 dark:divide-slate-800/40">
        {renderNavGroup('Core Administration', NAV_ITEMS.filter((i) => i.group === 'core'))}
        {renderNavGroup('Finance & Operations', NAV_ITEMS.filter((i) => i.group === 'operations'))}
        {renderNavGroup('Governance & System', NAV_ITEMS.filter((i) => i.group === 'platform'))}
      </div>

      {/* Footer System Spec Pill */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60">
        {!collapsed ? (
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Phase 2.6 Contract</span>
            </span>
            <span className="font-mono text-[10px] bg-slate-200/60 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
              v2.6.0-ui
            </span>
          </div>
        ) : (
          <div className="flex justify-center text-emerald-500" title="Security Spec v2.6.0">
            <ShieldCheck className="w-4 h-4" />
          </div>
        )}
      </div>
    </aside>
  );
};

