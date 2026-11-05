// ==============================================================================
// VISTAAR Super Admin — Unified Cross-Platform Notification Service
// Works across Web (Notification API), Desktop (Tauri), and Mobile (Capacitor)
// ==============================================================================

import { platform } from '../index';

export type NotificationCategory =
  | 'security'
  | 'business'
  | 'subscription'
  | 'payment'
  | 'support'
  | 'system';

export interface AdminNotificationOptions {
  title: string;
  body: string;
  category?: NotificationCategory;
  isSensitive?: boolean;
  data?: Record<string, any>;
}

class UnifiedNotificationService {
  private hasPermissionCached: boolean | null = null;

  public async requestPermission(): Promise<boolean> {
    try {
      // 1. Mobile (Capacitor Local Notifications)
      if (platform.isMobile()) {
        const cap = (window as any).Capacitor;
        if (cap?.Plugins?.LocalNotifications) {
          const status = await cap.Plugins.LocalNotifications.requestPermissions();
          this.hasPermissionCached = status.display === 'granted';
          return this.hasPermissionCached;
        }
      }

      // 2. Desktop (Tauri)
      if (platform.isDesktop()) {
        const tauri = (window as any).__TAURI__;
        if (tauri?.notification?.requestPermission) {
          const res = await tauri.notification.requestPermission();
          this.hasPermissionCached = res === 'granted';
          return this.hasPermissionCached;
        }
        this.hasPermissionCached = true;
        return true;
      }

      // 3. Web Notification API
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          this.hasPermissionCached = true;
          return true;
        }
        if (Notification.permission !== 'denied') {
          const res = await Notification.requestPermission();
          this.hasPermissionCached = res === 'granted';
          return this.hasPermissionCached;
        }
      }
    } catch (err) {
      console.warn('[UnifiedNotification] Permission request failed:', err);
    }

    return false;
  }

  public async sendNotification(options: AdminNotificationOptions): Promise<void> {
    const { title, body, isSensitive = false } = options;

    // Redact sensitive payload if marked as sensitive
    const sanitizedBody = isSensitive
      ? 'New administrative alert requires your attention in VISTAAR Super Admin.'
      : body;

    try {
      // 1. Mobile (Capacitor)
      if (platform.isMobile()) {
        const cap = (window as any).Capacitor;
        if (cap?.Plugins?.LocalNotifications) {
          await cap.Plugins.LocalNotifications.schedule({
            notifications: [
              {
                title,
                body: sanitizedBody,
                id: Math.floor(Math.random() * 100000),
                schedule: { at: new Date(Date.now() + 100) },
                extra: options.data || null,
              },
            ],
          });
          return;
        }
      }

      // 2. Desktop (Tauri)
      if (platform.isDesktop()) {
        const tauri = (window as any).__TAURI__;
        if (tauri?.notification?.sendNotification) {
          tauri.notification.sendNotification({
            title,
            body: sanitizedBody,
          });
          return;
        }
      }

      // 3. Web Notification API
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(title, {
            body: sanitizedBody,
            icon: '/favicon.ico',
          });
        }
      }
    } catch (err) {
      console.warn('[UnifiedNotification] Send error:', err);
    }
  }
}

export const unifiedNotifications = new UnifiedNotificationService();
