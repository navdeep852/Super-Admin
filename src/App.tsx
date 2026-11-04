import React, { useState, useEffect } from 'react';
import { MockBanner } from './components/layout/MockBanner';
import { AdminSidebar, NavigationModule } from './components/layout/AdminSidebar';
import { AdminHeader } from './components/layout/AdminHeader';
import { PermissionDenied } from './components/common/PermissionDenied';
import { AdminLoginPage } from './components/auth/AdminLoginPage';
import { useAdminAuth } from './context/AdminAuthContext';

// Page Views
import { OverviewPage } from './pages/overview/OverviewPage';
import { BusinessManagementPage } from './pages/businesses/BusinessManagementPage';
import { UserManagementPage } from './pages/users/UserManagementPage';
import { SubscriptionManagementPage } from './pages/subscriptions/SubscriptionManagementPage';
import { PaymentsRevenuePage } from './pages/payments/PaymentsRevenuePage';
import { CouponsOffersPage } from './pages/coupons/CouponsOffersPage';
import { AnalyticsReportsPage } from './pages/analytics/AnalyticsReportsPage';
import { SupportManagementPage } from './pages/support/SupportManagementPage';
import { SecurityAuditLogsPage } from './pages/security/SecurityAuditLogsPage';
import { SystemHealthPage } from './pages/system/SystemHealthPage';
import { PlatformSettingsPage } from './pages/settings/PlatformSettingsPage';

const VALID_MODULES: NavigationModule[] = [
  'overview',
  'businesses',
  'users',
  'subscriptions',
  'payments',
  'coupons',
  'analytics',
  'support',
  'security',
  'system',
  'settings',
];

function getModuleFromLocation(): NavigationModule {
  if (typeof window === 'undefined') return 'overview';
  const hash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  if (VALID_MODULES.includes(hash as NavigationModule)) {
    return hash as NavigationModule;
  }
  const path = window.location.pathname.replace(/^\//, '').trim().toLowerCase();
  if (VALID_MODULES.includes(path as NavigationModule)) {
    return path as NavigationModule;
  }
  return 'overview';
}

export const App: React.FC = () => {
  const [currentModule, setCurrentModuleState] = useState<NavigationModule>(getModuleFromLocation);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { hasPermission, isAuthenticated, isLoading } = useAdminAuth();

  const handleSelectModule = (mod: NavigationModule) => {
    setCurrentModuleState(mod);
    window.location.hash = `#/${mod}`;
  };

  useEffect(() => {
    const handleLocationChange = () => {
      const mod = getModuleFromLocation();
      setCurrentModuleState(mod);
    };

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);

    // Ensure initial URL carries explicit module hash
    if (!window.location.hash) {
      window.location.hash = `#/${currentModule}`;
    }

    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, [currentModule]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Verifying administrative session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLoginPage />;
  }

  const getModuleTitle = (mod: NavigationModule): { title: string; subtitle?: string } => {
    switch (mod) {
      case 'overview':
        return { title: 'Executive Overview', subtitle: 'Platform KPI command center' };
      case 'businesses':
        return { title: 'Business Management', subtitle: 'Workspace directory and branch hierarchies' };
      case 'users':
        return { title: 'User Management', subtitle: 'Tenant memberships and platform administrators' };
      case 'subscriptions':
        return { title: 'Subscription Management', subtitle: 'Plan tiers and renewal lifecycles' };
      case 'payments':
        return { title: 'Payments & Revenue', subtitle: 'Verified transactions and 18% GST ledger' };
      case 'coupons':
        return { title: 'Coupons & Promotional Offers', subtitle: 'Campaign incentives and statutory quotas' };
      case 'analytics':
        return { title: 'Analytics & Reports', subtitle: 'Business intelligence and financial charts' };
      case 'support':
        return { title: 'Support Management', subtitle: 'Merchant tickets and inquiry triage' };
      case 'security':
        return { title: 'Security & Audit Logs', subtitle: 'Immutable GCAP assertion stream' };
      case 'system':
        return { title: 'System Health', subtitle: 'Infrastructure clusters and telemetry probes' };
      case 'settings':
        return { title: 'Platform Settings', subtitle: 'Global configurations and governance' };
    }
  };

  const renderCurrentPage = () => {
    if (!hasPermission(currentModule)) {
      return (
        <PermissionDenied
          moduleName={currentModule.replace('_', ' ')}
          requiredRole={currentModule === 'settings' ? 'Super Administrator' : 'Administrator'}
        />
      );
    }

    switch (currentModule) {
      case 'overview':
        return <OverviewPage onNavigate={handleSelectModule} />;
      case 'businesses':
        return <BusinessManagementPage />;
      case 'users':
        return <UserManagementPage />;
      case 'subscriptions':
        return <SubscriptionManagementPage />;
      case 'payments':
        return <PaymentsRevenuePage />;
      case 'coupons':
        return <CouponsOffersPage />;
      case 'analytics':
        return <AnalyticsReportsPage />;
      case 'support':
        return <SupportManagementPage />;
      case 'security':
        return <SecurityAuditLogsPage />;
      case 'system':
        return <SystemHealthPage />;
      case 'settings':
        return <PlatformSettingsPage />;
      default:
        return <OverviewPage onNavigate={handleSelectModule} />;
    }
  };

  const headerInfo = getModuleTitle(currentModule);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col antialiased">
      {/* Mock Simulation Top Banner */}
      <MockBanner />

      {/* Main App Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <AdminSidebar
          currentModule={currentModule}
          onSelectModule={handleSelectModule}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Content Shell */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          {/* Header */}
          <AdminHeader
            title={headerInfo.title}
            subtitle={headerInfo.subtitle}
            onNavigate={handleSelectModule}
          />

          {/* Active Page View */}
          <main className="flex-1 pb-16">
            {renderCurrentPage()}
          </main>
        </div>
      </div>
    </div>
  );
};

export default App;
