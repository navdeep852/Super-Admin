// ==============================================================================
// VISTAAR Super Admin — Cross-Platform Network Status Monitor
// Monitors online/offline connectivity on Web, Tauri Desktop, and Capacitor Mobile
// ==============================================================================

import { platform } from '../index';

class NetworkStatusMonitor {
  private listeners = new Set<(online: boolean) => void>();
  private isOnlineStatus: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleStatusChange(true));
      window.addEventListener('offline', () => this.handleStatusChange(false));

      // Capacitor Network Plugin listener if present
      const cap = (window as any).Capacitor;
      if (cap?.Plugins?.Network) {
        cap.Plugins.Network.addListener('networkStatusChange', (status: { connected: boolean }) => {
          this.handleStatusChange(status.connected);
        });
      }
    }
  }

  private handleStatusChange(online: boolean) {
    this.isOnlineStatus = online;
    this.listeners.forEach(cb => {
      try {
        cb(online);
      } catch (err) {
        console.error('[NetworkStatus] Listener error:', err);
      }
    });
  }

  public isOnline(): boolean {
    return this.isOnlineStatus;
  }

  public subscribe(callback: (online: boolean) => void): () => void {
    this.listeners.add(callback);
    callback(this.isOnlineStatus);
    return () => {
      this.listeners.delete(callback);
    };
  }
}

export const networkStatus = new NetworkStatusMonitor();

