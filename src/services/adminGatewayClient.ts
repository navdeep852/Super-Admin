// ==============================================================================
// VISTAAR Super Admin — Gateway BFF API Client Service
// Integrates Super Admin UI with local Gateway BFF HTTP service (Port 3002)
// Version: 3.0.0 (Hardened with JWT Bearer auth & Web Crypto GCAP assertions)
// ==============================================================================

import { Business, OverviewMetrics, SubscriptionPlan } from '../types';
import { mockOverviewMetrics, mockPlanDistribution, mockRevenueTrends, mockUpcomingExpirations } from '../data/mockOverview';
import { mockBusinesses } from '../data/mockBusinesses';
import { mockTenantUsers } from '../data/mockUsers';
import { mockPayments } from '../data/mockPayments';

import { secureStorage } from '../platform/storage/secureStorage';

function resolveGatewayBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const ua = navigator.userAgent || '';
    const cap = (window as any).Capacitor;
    // Android emulator routes to host on 10.0.2.2
    if (cap?.isNativePlatform?.() && /Android/i.test(ua)) {
      return 'http://10.0.2.2:3002';
    }
    // Match window.location.hostname for localhost, 127.0.0.1, or LAN IP
    if (window.location.hostname) {
      return `${window.location.protocol}//${window.location.hostname}:3002`;
    }
  }
  if ((import.meta as any).env && (import.meta as any).env.VITE_GATEWAY_URL) {
    return (import.meta as any).env.VITE_GATEWAY_URL;
  }
  return 'http://localhost:3002';
}

const GATEWAY_BASE_URL = resolveGatewayBaseUrl();
const GATEWAY_ASSERTION_SECRET = ((import.meta as any).env && (import.meta as any).env.VITE_GATEWAY_ASSERTION_SECRET) || '';

export interface GatewayHealthStatus {
  status: 'operational' | 'degraded' | 'offline';
  timestamp?: string;
  environment?: string;
  stagingProjectRef?: string;
  services?: {
    database: { status: string; latencyMs: number };
    supabaseAuth: { status: string; latencyMs: number };
    gatewayBff: { status: string; uptimeSeconds: number; memoryMb: number };
  };
}

class AdminGatewayClient {
  private isOnlineCache: boolean | null = null;
  private lastCheckTime = 0;
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined' && window.localStorage) {
      this.token = window.localStorage.getItem('vistaar_admin_jwt');
    }
    secureStorage.getItem('vistaar_admin_jwt').then(val => {
      if (val && !this.token) {
        this.token = val;
      }
    });
  }

  public setAuthToken(token: string | null) {
    this.token = token;
    if (token) {
      secureStorage.setItem('vistaar_admin_jwt', token).catch(() => {});
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('vistaar_admin_jwt', token);
      }
    } else {
      secureStorage.removeItem('vistaar_admin_jwt').catch(() => {});
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('vistaar_admin_jwt');
      }
    }
  }

  public getAuthToken(): string | null {
    if (!this.token && typeof window !== 'undefined' && window.localStorage) {
      this.token = window.localStorage.getItem('vistaar_admin_jwt');
    }
    return this.token;
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...extraHeaders
    };
    const t = this.getAuthToken();
    if (t) {
      headers['Authorization'] = `Bearer ${t}`;
    }
    return headers;
  }

  /**
   * Browser-compatible Web Crypto HMAC-SHA256 signer for GCAP assertions
   */
  private async computeGcapHeaders(canonicalString: string): Promise<{ signature: string; timestamp: string; nonce: string }> {
    const nonce = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000';
    const timestampEpoch = Math.floor(Date.now() / 1000);

    const secret = GATEWAY_ASSERTION_SECRET || '08f88a93048fb6c3ae8a9de8f83070b348e3d86683de5163cdde651a5bcf1399';
    const enc = new TextEncoder();
    const key = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sigBuffer = await window.crypto.subtle.sign('HMAC', key, enc.encode(canonicalString));
    const signature = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return { signature, timestamp: String(timestampEpoch), nonce };
  }

  // ---------------------------------------------------------------------------
  // Authentication API
  // ---------------------------------------------------------------------------

  async login(email: string, password: string): Promise<any> {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const json = await res.json();
    if (json.success && json.session?.access_token) {
      this.setAuthToken(json.session.access_token);
    }
    return json;
  }

  async verifyMfa(code: string, factorId?: string, challengeId?: string): Promise<any> {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/auth/mfa/verify`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ code, factor_id: factorId, challenge_id: challengeId })
    });
    const json = await res.json();
    if (json.success && json.session?.access_token) {
      this.setAuthToken(json.session.access_token);
    }
    return json;
  }

  async getMe(): Promise<any> {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/admins/me`, {
      method: 'GET',
      headers: this.getHeaders()
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        this.setAuthToken(null);
      }
      return null;
    }
    const json = await res.json();
    return json.data;
  }

  logout() {
    this.setAuthToken(null);
  }

  // ---------------------------------------------------------------------------
  // Password Management & Recovery API
  // ---------------------------------------------------------------------------

  /**
   * Change password for the currently authenticated administrator.
   */
  async changePassword(newPassword: string, currentPassword?: string): Promise<{ success: boolean; message: string }> {
    const payload: { new_password: string; current_password?: string } = {
      new_password: newPassword,
    };
    if (currentPassword) {
      payload.current_password = currentPassword;
    }

    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/auth/password/change`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      if (res.status === 401 && json.code !== 'INVALID_CURRENT_PASSWORD') {
        throw new Error('Authentication session expired or invalid. Please sign in again.');
      }
      throw new Error(json.message || 'Failed to update administrator password');
    }
    return json;
  }

  /**
   * Request password reset instructions / recovery link for an administrator.
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string; recoveryToken?: string; recoveryLink?: string }> {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/auth/password/reset-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to request password reset');
    }
    return json;
  }

  /**
   * Complete password reset using a recovery access token or JWT.
   */
  async confirmPasswordReset(newPassword: string, token?: string): Promise<{ success: boolean; message: string }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/auth/password/reset-confirm`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ new_password: newPassword, access_token: token })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to reset password');
    }
    return json;
  }

  // ---------------------------------------------------------------------------
  // Profile Photo & Administrator Profile Management API
  // ---------------------------------------------------------------------------

  /**
   * Upload and persist profile photo for authenticated administrator.
   */
  async uploadProfilePhoto(imageBase64: string): Promise<{ success: boolean; message: string; avatarUrl: string; admin: any }> {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/admins/me/avatar`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ image: imageBase64 })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to upload profile photo');
    }
    return json;
  }

  /**
   * Remove profile photo for authenticated administrator.
   */
  async removeProfilePhoto(): Promise<{ success: boolean; message: string; avatarUrl: null; admin: any }> {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/admins/me/avatar`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to remove profile photo');
    }
    return json;
  }

  /**
   * Update permitted profile fields (display name, phone number) for administrator.
   */
  async updateProfile(data: { fullName?: string; phoneNumber?: string }): Promise<{ success: boolean; message: string; data: any }> {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/admins/me/profile`, {
      method: 'PUT',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to update administrator profile');
    }
    return json;
  }

  // ---------------------------------------------------------------------------
  // Health API
  // ---------------------------------------------------------------------------

  async checkHealth(): Promise<GatewayHealthStatus> {
    try {
      const res = await fetch(`${GATEWAY_BASE_URL}/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const json = await res.json();
        this.isOnlineCache = true;
        this.lastCheckTime = Date.now();
        return json;
      }
      this.isOnlineCache = false;
      return { status: 'offline' };
    } catch {
      this.isOnlineCache = false;
      return { status: 'offline' };
    }
  }

  async isGatewayReachable(): Promise<boolean> {
    if (this.isOnlineCache !== null && Date.now() - this.lastCheckTime < 15000) {
      return this.isOnlineCache;
    }
    const health = await this.checkHealth();
    return health.status === 'operational' || health.status === 'degraded' || (health as any).ok === true || (health as any).status === 'ok';
  }

  // ---------------------------------------------------------------------------
  // Operational Metrics & Workspaces API
  // ---------------------------------------------------------------------------

  async getOverview(params: {
    timeframe?: string;
    scope?: 'genuine' | 'test' | 'all';
    startDate?: string;
    endDate?: string;
  } = {}): Promise<{
    metrics: OverviewMetrics;
    planDistribution: any[];
    businessStatusDistribution?: any[];
    subscriptionDistribution?: any[];
    registrationGrowth?: any[];
    revenueTrends: any[];
    upcomingExpirations: any[];
    dataSource?: any;
    isLive: boolean;
    error?: string;
  }> {
    try {
      const q = new URLSearchParams();
      if (params.timeframe) q.set('timeframe', params.timeframe);
      if (params.scope) q.set('scope', params.scope);
      if (params.startDate) q.set('start_date', params.startDate);
      if (params.endDate) q.set('end_date', params.endDate);

      const res = await fetch(`${resolveGatewayBaseUrl()}/api/v1/platform/overview?${q.toString()}`, {
        headers: this.getHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const liveMetrics = json.data.metrics;
          return {
            metrics: liveMetrics,
            planDistribution: json.data.planDistribution || [],
            businessStatusDistribution: json.data.charts?.businessStatusDistribution || [
              { name: 'Active', count: liveMetrics.activeBusinesses, color: '#10b981' },
              { name: 'Suspended', count: liveMetrics.suspendedBusinesses, color: '#f43f5e' }
            ],
            subscriptionDistribution: json.data.charts?.subscriptionDistribution || [
              { name: 'Active', count: liveMetrics.activeSubscriptions, color: '#10b981' },
              { name: 'Trialing', count: liveMetrics.trialSubscriptions, color: '#38bdf8' },
              { name: 'Expired', count: liveMetrics.expiredSubscriptions, color: '#f59e0b' }
            ],
            registrationGrowth: json.data.charts?.registrationGrowth || [],
            revenueTrends: json.data.revenueTrends || [],
            upcomingExpirations: json.data.upcomingExpirations || [],
            dataSource: json.data.dataSource || null,
            isLive: true
          };
        }
      }
    } catch (err: any) {
      console.warn('[AdminGatewayClient] Gateway overview unreachable:', err?.message);
    }

    // Zero-state rather than fabricated dummy metrics to preserve strict audit integrity
    return {
      metrics: {
        totalBusinesses: 0,
        activeBusinesses: 0,
        suspendedBusinesses: 0,
        totalUsers: 0,
        totalEmployees: 0,
        activeSubscriptions: 0,
        trialSubscriptions: 0,
        expiredSubscriptions: 0,
        pendingRenewals: 0,
        failedPaymentsCount: 0,
        newRegistrations: 0,
        platformCollectedRevenueInr: 0,
        gstComponentInr: 0,
        netPlatformRevenueInr: 0,
        outstandingAmountsInr: 0,
        totalRefundsInr: 0,
        tenantSalesGmvInr: 0,
        tenantCollectedInr: 0,
        mrrInr: 0,
        arrInr: 0
      },
      planDistribution: [],
      revenueTrends: [],
      upcomingExpirations: [],
      dataSource: null,
      isLive: false,
      error: 'Gateway BFF unreachable on port 3002'
    };
  }

  async getWorkspaces(params: {
    page?: number;
    limit?: number;
    search?: string;
    scope?: 'genuine' | 'test' | 'all';
    status?: string;
    plan?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{
    businesses: Business[];
    total: number;
    page: number;
    limit: number;
    dataSource?: any;
    isLive: boolean;
    error?: string;
  }> {
    try {
      const query = new URLSearchParams();
      if (params.page) query.set('page', String(params.page));
      if (params.limit) query.set('limit', String(params.limit));
      if (params.search) query.set('search', params.search);
      if (params.scope) query.set('scope', params.scope);
      if (params.status) query.set('status', params.status);
      if (params.plan) query.set('plan', params.plan);
      if (params.sortBy) query.set('sort_by', params.sortBy);
      if (params.sortOrder) query.set('sort_order', params.sortOrder);

      const res = await fetch(`${resolveGatewayBaseUrl()}/api/v1/workspaces?${query.toString()}`, {
        headers: this.getHeaders()
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const list = json.data.businesses || [];
          return {
            businesses: list,
            total: json.data.pagination?.total ?? list.length,
            page: json.data.pagination?.page ?? 1,
            limit: json.data.pagination?.limit ?? 20,
            dataSource: json.data.dataSource || null,
            isLive: true
          };
        }
      }
    } catch (err: any) {
      console.warn('[AdminGatewayClient] Gateway workspaces unreachable:', err?.message);
    }

    return {
      businesses: [],
      total: 0,
      page: params.page || 1,
      limit: params.limit || 20,
      isLive: false,
      error: 'Gateway BFF unreachable on port 3002'
    };
  }

  async getWorkspaceDetail(id: string): Promise<any> {
    try {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/workspaces/${id}`, {
        headers: this.getHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        return json.data;
      }
    } catch (err) {
      console.warn(`[AdminGatewayClient] Detail fetch failed for ${id}:`, err);
    }
    return null;
  }

  async getWorkspaceMembers(id: string): Promise<any[]> {
    try {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/workspaces/${id}/members`, {
        headers: this.getHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        return json.data || [];
      }
    } catch (err) {
      console.warn(`[AdminGatewayClient] Members fetch failed for ${id}:`, err);
    }
    return [];
  }

  async getWorkspaceActivity(id: string): Promise<any> {
    try {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/workspaces/${id}/activity`, {
        headers: this.getHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        return json.data;
      }
    } catch (err) {
      console.warn(`[AdminGatewayClient] Activity fetch failed for ${id}:`, err);
    }
    return { recentInvoices: [], customerCount: 0, productCount: 0 };
  }

  // ---------------------------------------------------------------------------
  // Privileged Mutations (With GCAP Cryptographic HMAC Assertions)
  // ---------------------------------------------------------------------------

  async suspendWorkspace(
    id: string,
    reason: string,
    adminId = 'a638f1fb-984e-48b0-96c3-a6a7f42c2c18',
    sessionAal = 'aal2'
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const timestampEpoch = Math.floor(Date.now() / 1000);
      const nonce = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000';
      const canonicalString = `${adminId}:SUSPEND_WORKSPACE:${id}:NONE:${sessionAal}:${timestampEpoch}:${nonce}`;

      const secret = GATEWAY_ASSERTION_SECRET || '08f88a93048fb6c3ae8a9de8f83070b348e3d86683de5163cdde651a5bcf1399';
      const enc = new TextEncoder();
      const key = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuffer = await window.crypto.subtle.sign('HMAC', key, enc.encode(canonicalString));
      const sig = Array.from(new Uint8Array(sigBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/workspaces/${id}/suspend`, {
        method: 'POST',
        headers: this.getHeaders({
          'Content-Type': 'application/json',
          'X-GCAP-Signature': sig,
          'X-GCAP-Timestamp': String(timestampEpoch),
          'X-GCAP-Nonce': nonce
        }),
        body: JSON.stringify({ reason })
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  async reactivateWorkspace(
    id: string,
    reason = 'Administrative reactivation',
    adminId = 'a638f1fb-984e-48b0-96c3-a6a7f42c2c18',
    sessionAal = 'aal2'
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const timestampEpoch = Math.floor(Date.now() / 1000);
      const nonce = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000';
      const canonicalString = `${adminId}:REACTIVATE_WORKSPACE:${id}:NONE:${sessionAal}:${timestampEpoch}:${nonce}`;

      const secret = GATEWAY_ASSERTION_SECRET || '08f88a93048fb6c3ae8a9de8f83070b348e3d86683de5163cdde651a5bcf1399';
      const enc = new TextEncoder();
      const key = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuffer = await window.crypto.subtle.sign('HMAC', key, enc.encode(canonicalString));
      const sig = Array.from(new Uint8Array(sigBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/workspaces/${id}/reactivate`, {
        method: 'POST',
        headers: this.getHeaders({
          'Content-Type': 'application/json',
          'X-GCAP-Signature': sig,
          'X-GCAP-Timestamp': String(timestampEpoch),
          'X-GCAP-Nonce': nonce
        }),
        body: JSON.stringify({ reason })
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  async getUsers(params: { search?: string; scope?: 'genuine' | 'test' | 'all' } | string = ''): Promise<{ users: any[]; isLive: boolean; error?: string }> {
    try {
      const search = typeof params === 'string' ? params : (params.search || '');
      const scope = typeof params === 'object' && params.scope ? params.scope : 'all';

      const q = new URLSearchParams();
      if (search) q.set('search', search);
      if (scope) q.set('scope', scope);

      const res = await fetch(`${resolveGatewayBaseUrl()}/api/v1/users?${q.toString()}`, {
        headers: this.getHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return { users: json.data, isLive: true };
        }
      }
    } catch (err: any) {
      console.warn('[AdminGatewayClient] Gateway users unreachable:', err?.message);
    }
    return { users: [], isLive: false, error: 'Gateway BFF unreachable' };
  }

  async getAdmins(): Promise<{ admins: any[]; isLive: boolean; error?: string }> {
    try {
      const res = await fetch(`${resolveGatewayBaseUrl()}/api/v1/admins`, {
        headers: this.getHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return { admins: json.data, isLive: true };
        }
      }
    } catch (err: any) {
      console.warn('[AdminGatewayClient] Gateway admins unreachable:', err?.message);
    }
    return { admins: [], isLive: false, error: 'Gateway BFF unreachable' };
  }

  async getSubscriptions(params: {
    scope?: 'genuine' | 'test' | 'all';
    status?: string;
    plan?: string;
    search?: string;
  } = {}): Promise<{
    subscriptions: any[];
    meta?: any;
    isLive: boolean;
    error?: string;
  }> {
    const q = new URLSearchParams();
    if (params.scope) q.set('scope', params.scope);
    if (params.status && params.status !== 'all') q.set('status', params.status);
    if (params.plan && params.plan !== 'all') q.set('plan', params.plan);
    if (params.search) q.set('search', params.search);

    const res = await fetch(`${resolveGatewayBaseUrl()}/api/v1/subscriptions?${q.toString()}`, {
      headers: this.getHeaders()
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to fetch subscriptions (HTTP ${res.status})`);
    }

    const json = await res.json();
    return {
      subscriptions: json.data || [],
      meta: json.meta || null,
      isLive: true
    };
  }

  async getPayments(params: { scope?: 'genuine' | 'test' | 'all' } = {}): Promise<{ payments: any[]; isLive: boolean; error?: string }> {
    try {
      const q = new URLSearchParams();
      if (params.scope) q.set('scope', params.scope);

      const res = await fetch(`${resolveGatewayBaseUrl()}/api/v1/payments?${q.toString()}`, {
        headers: this.getHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return { payments: json.data, isLive: true };
        }
      }
    } catch (err: any) {
      console.warn('[AdminGatewayClient] Gateway payments unreachable:', err?.message);
    }
    return { payments: [], isLive: false, error: 'Gateway BFF unreachable' };
  }

  async getCoupons(): Promise<any[]> {
    try {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/coupons`, {
        headers: this.getHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        return json.data || [];
      }
    } catch (err) {
      console.warn('[AdminGatewayClient] Coupon fetch error:', err);
    }
    return [];
  }

  async createCoupon(
    data: any,
    adminId = 'a638f1fb-984e-48b0-96c3-a6a7f42c2c18',
    sessionAal = 'aal2'
  ): Promise<any> {
    try {
      const timestampEpoch = Math.floor(Date.now() / 1000);
      const nonce = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000';
      const code = (data.code || '').toUpperCase().trim();
      const val = Number(data.discount_value || 0);
      const canonicalString = `${adminId}:CREATE_COUPON:${code}:${val}:${sessionAal}:${timestampEpoch}:${nonce}`;

      const secret = GATEWAY_ASSERTION_SECRET || '08f88a93048fb6c3ae8a9de8f83070b348e3d86683de5163cdde651a5bcf1399';
      const enc = new TextEncoder();
      const key = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuffer = await window.crypto.subtle.sign('HMAC', key, enc.encode(canonicalString));
      const sig = Array.from(new Uint8Array(sigBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/coupons`, {
        method: 'POST',
        headers: this.getHeaders({
          'Content-Type': 'application/json',
          'X-GCAP-Signature': sig,
          'X-GCAP-Timestamp': String(timestampEpoch),
          'X-GCAP-Nonce': nonce
        }),
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  // ---------------------------------------------------------------------------
  // Subscription Plans Management API
  // ---------------------------------------------------------------------------

  async getPlans(): Promise<{ plans: SubscriptionPlan[]; isLive: boolean }> {
    try {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/plans`, {
        headers: this.getHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return { plans: json.data, isLive: true };
        }
      }
    } catch (err) {
      console.warn('[AdminGatewayClient] Plans fetch error:', err);
    }
    return { plans: [], isLive: false };
  }

  async createPlan(planData: Partial<SubscriptionPlan>): Promise<any> {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/plans`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(planData)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to create subscription plan');
    }
    return json.data;
  }

  async updatePlan(planId: string, planData: Partial<SubscriptionPlan>): Promise<any> {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/plans/${planId}`, {
      method: 'PUT',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(planData)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to update subscription plan');
    }
    return json.data;
  }

  async archivePlan(planId: string): Promise<any> {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/plans/${planId}/archive`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to archive subscription plan');
    }
    return json;
  }

  // ---------------------------------------------------------------------------
  // Offers & Promotional Discounts API
  // ---------------------------------------------------------------------------

  async getOffers(): Promise<{ offers: any[]; isLive: boolean }> {
    try {
      const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/offers`, {
        headers: this.getHeaders()
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          return { offers: json.data, isLive: true };
        }
      }
    } catch (err) {
      console.warn('[AdminGatewayClient] Offers fetch error:', err);
    }
    return { offers: [], isLive: false };
  }

  async createOffer(offerData: any): Promise<any> {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/offers`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(offerData)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to create promotional offer');
    }
    return json.data;
  }

  async toggleOffer(offerId: string): Promise<any> {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/offers/${offerId}/toggle`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to toggle offer status');
    }
    return json;
  }

  // ---------------------------------------------------------------------------
  // Authoritative Pricing Calculation Engine Preview API
  // ---------------------------------------------------------------------------

  async previewPricing(params: {
    plan_id: string;
    billing_cycle?: 'monthly' | 'annual';
    workspace_id?: string;
    coupon_code?: string;
    custom_price_inr?: number;
  }): Promise<any> {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/pricing/preview`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(params)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to calculate pricing preview');
    }
    return json.data;
  }

  // ---------------------------------------------------------------------------
  // Workspace Subscription Control API (Manage Subscription)
  // ---------------------------------------------------------------------------

  async manageWorkspaceSubscription(workspaceId: string, payload: {
    action: 'change_plan' | 'upgrade' | 'downgrade' | 'extend_trial' | 'extend_expiry' | 'assign_custom_price' | 'apply_discount' | 'cancel_at_period_end';
    plan_id?: string;
    billing_interval?: 'monthly' | 'annual';
    custom_price_inr?: number;
    override_reason?: string;
    override_days?: number;
    extension_days?: number;
    coupon_code?: string;
  }): Promise<any> {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/workspaces/${workspaceId}/subscription`, {
      method: 'POST',
      headers: this.getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Failed to update workspace subscription');
    }
    return json.data;
  }
}

export const adminGatewayClient = new AdminGatewayClient();
