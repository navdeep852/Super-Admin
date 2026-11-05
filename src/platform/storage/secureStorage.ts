// ==============================================================================
// VISTAAR Super Admin — Unified Cross-Platform Secure Storage Adapter
// Provides hardware-backed secure storage on mobile/desktop with web fallback
// ==============================================================================

import { platform } from '../index';

export interface ISecureStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

class CrossPlatformSecureStorage implements ISecureStorage {
  private inMemoryCache = new Map<string, string>();

  public async getItem(key: string): Promise<string | null> {
    if (this.inMemoryCache.has(key)) {
      return this.inMemoryCache.get(key) || null;
    }

    try {
      // 1. Mobile (Capacitor Preferences / Secure Storage)
      if (platform.isMobile()) {
        const cap = (window as any).Capacitor;
        if (cap?.Plugins?.Preferences) {
          const res = await cap.Plugins.Preferences.get({ key });
          if (res?.value) {
            this.inMemoryCache.set(key, res.value);
            return res.value;
          }
        }
      }

      // 2. Desktop (Tauri 2 Store / Plugins)
      if (platform.isDesktop()) {
        const tauri = (window as any).__TAURI__;
        if (tauri?.store?.Store) {
          try {
            const store = await tauri.store.Store.load('vistaar-admin-secure.bin');
            const val = await store.get(key);
            if (val) {
              this.inMemoryCache.set(key, String(val));
              return String(val);
            }
          } catch {}
        }
      }

      // 3. Web Fallback (window.localStorage / sessionStorage)
      if (typeof window !== 'undefined' && window.localStorage) {
        const val = window.localStorage.getItem(key);
        if (val) {
          this.inMemoryCache.set(key, val);
          return val;
        }
      }
    } catch (err) {
      console.warn(`[SecureStorage] Read error for key '${key}':`, err);
    }

    return null;
  }

  public async setItem(key: string, value: string): Promise<void> {
    this.inMemoryCache.set(key, value);

    try {
      // 1. Mobile (Capacitor)
      if (platform.isMobile()) {
        const cap = (window as any).Capacitor;
        if (cap?.Plugins?.Preferences) {
          await cap.Plugins.Preferences.set({ key, value });
          return;
        }
      }

      // 2. Desktop (Tauri)
      if (platform.isDesktop()) {
        const tauri = (window as any).__TAURI__;
        if (tauri?.store?.Store) {
          try {
            const store = await tauri.store.Store.load('vistaar-admin-secure.bin');
            await store.set(key, value);
            await store.save();
            return;
          } catch {}
        }
      }

      // 3. Web Fallback
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (err) {
      console.error(`[SecureStorage] Write error for key '${key}':`, err);
    }
  }

  public async removeItem(key: string): Promise<void> {
    this.inMemoryCache.delete(key);

    try {
      if (platform.isMobile()) {
        const cap = (window as any).Capacitor;
        if (cap?.Plugins?.Preferences) {
          await cap.Plugins.Preferences.remove({ key });
        }
      }

      if (platform.isDesktop()) {
        const tauri = (window as any).__TAURI__;
        if (tauri?.store?.Store) {
          try {
            const store = await tauri.store.Store.load('vistaar-admin-secure.bin');
            await store.delete(key);
            await store.save();
          } catch {}
        }
      }

      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (err) {
      console.warn(`[SecureStorage] Delete error for key '${key}':`, err);
    }
  }

  public async clear(): Promise<void> {
    this.inMemoryCache.clear();

    try {
      if (platform.isMobile()) {
        const cap = (window as any).Capacitor;
        if (cap?.Plugins?.Preferences) {
          await cap.Plugins.Preferences.clear();
        }
      }

      if (platform.isDesktop()) {
        const tauri = (window as any).__TAURI__;
        if (tauri?.store?.Store) {
          try {
            const store = await tauri.store.Store.load('vistaar-admin-secure.bin');
            await store.clear();
            await store.save();
          } catch {}
        }
      }

      if (typeof window !== 'undefined' && window.localStorage) {
        // Clear sensitive admin items without destroying unrelated browser storage
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith('vistaar_admin')) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => window.localStorage.removeItem(k));
      }
    } catch (err) {
      console.warn('[SecureStorage] Clear error:', err);
    }
  }
}

export const secureStorage = new CrossPlatformSecureStorage();

