import React, { createContext, useContext, useState, useEffect } from 'react';
import { AdminUser, PlatformRole } from '../types';
import { adminGatewayClient } from '../services/adminGatewayClient';

export type PlatformPermission =
  // Navigation Modules
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
  | 'settings'
  // Privileged Actions
  | 'suspend_workspace'
  | 'reactivate_workspace'
  | 'plan_override'
  | 'create_coupon'
  | 'toggle_coupon'
  | 'export_reports'
  | 'reconcile_payments'
  | 'reply_ticket'
  | 'view_details'
  | 'search_users'
  | 'settings_update';

/**
 * Authoritative RBAC permission matrix mapping platform roles to allowed
 * modules and privileged actions.
 */
const ROLE_PERMISSIONS: Record<PlatformRole, ReadonlySet<string>> = {
  super_admin: new Set<string>([
    // All 12 Modules
    'overview',
    'businesses',
    'users',
    'subscriptions',
    'plans',
    'payments',
    'coupons',
    'analytics',
    'support',
    'security',
    'system',
    'settings',
    // All Privileged Operations
    'suspend_workspace',
    'reactivate_workspace',
    'plan_override',
    'create_coupon',
    'toggle_coupon',
    'export_reports',
    'reconcile_payments',
    'reply_ticket',
    'view_details',
    'search_users',
    'settings_update',
  ]),
  billing_admin: new Set<string>([
    // Allowed Modules
    'overview',
    'businesses',
    'subscriptions',
    'plans',
    'payments',
    'coupons',
    'analytics',
    'support',
    // Allowed Operations
    'create_coupon',
    'toggle_coupon',
    'export_reports',
    'reconcile_payments',
    'view_details',
  ]),
  support_agent: new Set<string>([
    // Allowed Modules
    'overview',
    'businesses',
    'users',
    'support',
    'system',
    // Allowed Operations
    'reply_ticket',
    'view_details',
    'search_users',
  ]),
};

export interface AdminAuthContextType {
  currentAdmin: AdminUser | null;
  activeRole: PlatformRole;
  allMockAdmins: AdminUser[];
  switchRole: (role: PlatformRole) => void;
  hasPermission: (permissionOrModule: string) => boolean;
  canAccessModule: (module: string) => boolean;
  canPerformAction: (action: string) => boolean;
  isMfaVerified: boolean;
  isMfaRequired: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionAal: string;
  login: (email: string, password: string) => Promise<{ success: boolean; mfaRequired?: boolean; error?: string }>;
  verifyMfa: (code: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [sessionAal, setSessionAal] = useState<string>('aal1');
  const [isMfaRequired, setIsMfaRequired] = useState<boolean>(false);
  const [isMfaVerified, setIsMfaVerified] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Authenticate session on mount via Gateway /api/v1/admins/me
  useEffect(() => {
    let mounted = true;
    const verifyExistingSession = async () => {
      const token = adminGatewayClient.getAuthToken();
      if (!token) {
        if (mounted) setIsLoading(false);
        return;
      }

      try {
        const me = await adminGatewayClient.getMe();
        if (mounted && me) {
          const userObj: AdminUser = {
            id: me.id,
            email: me.email,
            fullName: me.fullName || 'Platform Administrator',
            role: me.role as PlatformRole,
            isActive: me.isActive ?? true,
            mfaEnabled: me.mfaEnrolled ?? false,
            lastLoginAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
          };
          setCurrentAdmin(userObj);
          setSessionAal(me.sessionAal || 'aal1');
          const mfaPending = !!me.mfaEnrolled && me.sessionAal !== 'aal2';
          setIsMfaRequired(mfaPending);
          setIsMfaVerified(me.sessionAal === 'aal2' || !me.mfaEnrolled);
        } else if (mounted) {
          adminGatewayClient.logout();
          setCurrentAdmin(null);
        }
      } catch {
        if (mounted) {
          adminGatewayClient.logout();
          setCurrentAdmin(null);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    verifyExistingSession();
    return () => { mounted = false; };
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; mfaRequired?: boolean; error?: string }> => {
    try {
      const res = await adminGatewayClient.login(email, password);
      if (!res.success) {
        return { success: false, error: res.message || 'Invalid administrator credentials' };
      }

      const adminData = res.admin;
      const userObj: AdminUser = {
        id: adminData.id,
        email: adminData.email,
        fullName: adminData.fullName || 'Platform Administrator',
        role: adminData.role as PlatformRole,
        isActive: adminData.isActive ?? true,
        mfaEnabled: adminData.mfaEnrolled ?? false,
        lastLoginAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      setCurrentAdmin(userObj);
      setSessionAal(adminData.sessionAal || 'aal1');

      if (res.mfaRequired) {
        setIsMfaRequired(true);
        setIsMfaVerified(false);
        return { success: true, mfaRequired: true };
      }

      setIsMfaRequired(false);
      setIsMfaVerified(true);
      return { success: true, mfaRequired: false };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network authentication error' };
    }
  };

  const verifyMfa = async (code: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await adminGatewayClient.verifyMfa(code);
      if (!res.success) {
        return { success: false, error: res.message || 'Invalid or expired MFA code' };
      }

      setSessionAal('aal2');
      setIsMfaRequired(false);
      setIsMfaVerified(true);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'MFA challenge verification failed' };
    }
  };

  const logout = () => {
    adminGatewayClient.logout();
    setCurrentAdmin(null);
    setSessionAal('aal1');
    setIsMfaRequired(false);
    setIsMfaVerified(false);
  };

  // Prevent client-side role switching: role is authoritative from verified database identity
  const switchRole = (_newRole: PlatformRole) => {
    console.warn('[Security Guard] Client-side role spoofing is strictly prohibited. Active role is authoritative.');
  };

  const activeRole: PlatformRole = currentAdmin?.role || 'super_admin';
  const isAuthenticated = !!currentAdmin && (!isMfaRequired || isMfaVerified);

  const hasPermission = (permissionOrModule: string): boolean => {
    if (!permissionOrModule || typeof permissionOrModule !== 'string') return false;
    if (!currentAdmin || !isAuthenticated) return false;
    const normalizedKey = permissionOrModule.trim().toLowerCase();
    return ROLE_PERMISSIONS[activeRole]?.has(normalizedKey) || false;
  };

  const canAccessModule = (moduleName: string): boolean => hasPermission(moduleName);
  const canPerformAction = (actionName: string): boolean => hasPermission(actionName);

  return (
    <AdminAuthContext.Provider
      value={{
        currentAdmin,
        activeRole,
        allMockAdmins: [],
        switchRole,
        hasPermission,
        canAccessModule,
        canPerformAction,
        isMfaVerified,
        isMfaRequired,
        isAuthenticated,
        isLoading,
        sessionAal,
        login,
        verifyMfa,
        logout,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = (): AdminAuthContextType => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};
