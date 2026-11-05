import fs from 'fs';

let content = fs.readFileSync('src/services/adminGatewayClient.ts', 'utf8');

// 1. Add secureStorage import and dynamic GATEWAY_BASE_URL resolution
const topTarget = `const GATEWAY_BASE_URL = ((import.meta as any).env && (import.meta as any).env.VITE_GATEWAY_URL) || 'http://localhost:3002';`;
const topReplacement = `import { secureStorage } from '../platform/storage/secureStorage';

function resolveGatewayBaseUrl(): string {
  if ((import.meta as any).env && (import.meta as any).env.VITE_GATEWAY_URL) {
    return (import.meta as any).env.VITE_GATEWAY_URL;
  }
  if (typeof window !== 'undefined') {
    const ua = navigator.userAgent || '';
    const cap = (window as any).Capacitor;
    // Android emulator routes to host on 10.0.2.2
    if (cap?.isNativePlatform?.() && /Android/i.test(ua)) {
      return 'http://10.0.2.2:3002';
    }
    // Remote mobile testing over LAN
    if (window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return \`http://\${window.location.hostname}:3002\`;
    }
  }
  return 'http://localhost:3002';
}

const GATEWAY_BASE_URL = resolveGatewayBaseUrl();`;

content = content.replace(topTarget, topReplacement);

// 2. Add secureStorage sync to setAuthToken and constructor
const constructorTarget = `  constructor() {
    if (typeof window !== 'undefined' && window.localStorage) {
      this.token = window.localStorage.getItem('vistaar_admin_jwt');
    }
  }`;
const constructorReplacement = `  constructor() {
    if (typeof window !== 'undefined' && window.localStorage) {
      this.token = window.localStorage.getItem('vistaar_admin_jwt');
    }
    secureStorage.getItem('vistaar_admin_jwt').then(val => {
      if (val && !this.token) {
        this.token = val;
      }
    });
  }`;

content = content.replace(constructorTarget, constructorReplacement);

const setAuthTarget = `  public setAuthToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined' && window.localStorage) {
      if (token) {
        window.localStorage.setItem('vistaar_admin_jwt', token);
      } else {
        window.localStorage.removeItem('vistaar_admin_jwt');
      }
    }
  }`;
const setAuthReplacement = `  public setAuthToken(token: string | null) {
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
  }`;

content = content.replace(setAuthTarget, setAuthReplacement);

// 3. Add profile management methods before Health API
const healthTarget = `  // ---------------------------------------------------------------------------
  // Health API
  // ---------------------------------------------------------------------------`;
const profileMethods = `  // ---------------------------------------------------------------------------
  // Profile Photo & Administrator Profile Management API
  // ---------------------------------------------------------------------------

  /**
   * Upload and persist profile photo for authenticated administrator.
   */
  async uploadProfilePhoto(imageBase64: string): Promise<{ success: boolean; message: string; avatarUrl: string; admin: any }> {
    const res = await fetch(\`\${GATEWAY_BASE_URL}/api/v1/admins/me/avatar\`, {
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
    const res = await fetch(\`\${GATEWAY_BASE_URL}/api/v1/admins/me/avatar\`, {
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
    const res = await fetch(\`\${GATEWAY_BASE_URL}/api/v1/admins/me/profile\`, {
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
  // ---------------------------------------------------------------------------`;

content = content.replace(healthTarget, profileMethods);

fs.writeFileSync('src/services/adminGatewayClient.ts', content, 'utf8');
console.log('Successfully patched adminGatewayClient.ts cleanly.');
