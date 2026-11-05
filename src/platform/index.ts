// ==============================================================================
// VISTAAR Super Admin — Platform Detection & Capability Detection Engine
// Unifies Web, Desktop (Tauri 2), and Mobile (Capacitor) runtime environments
// ==============================================================================

export type PlatformType = 'web' | 'desktop' | 'mobile';
export type OperatingSystem = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';

export interface DeviceInfo {
  platform: PlatformType;
  os: OperatingSystem;
  isNative: boolean;
  userAgent: string;
  appVersion: string;
  screen: {
    width: number;
    height: number;
    isMobileBreakpoint: boolean;
    isTabletBreakpoint: boolean;
    isDesktopBreakpoint: boolean;
  };
}

class PlatformEngine {
  private cachedType: PlatformType | null = null;
  private cachedOS: OperatingSystem | null = null;

  /**
   * Detects whether running inside desktop (Tauri), mobile (Capacitor), or standard Web
   */
  public getPlatformType(): PlatformType {
    if (this.cachedType) return this.cachedType;

    if (typeof window !== 'undefined') {
      // Tauri 2 injection detection
      if (
        '__TAURI_INTERNALS__' in window ||
        '__TAURI__' in window ||
        (window as any).__TAURI_METADATA__
      ) {
        this.cachedType = 'desktop';
        return 'desktop';
      }

      // Capacitor injection detection
      const cap = (window as any).Capacitor;
      if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
        this.cachedType = 'mobile';
        return 'mobile';
      }

      // Mobile User-Agent fallback when testing in mobile web view or simulated app
      const ua = navigator.userAgent || '';
      if (/Android/i.test(ua) || /iPhone|iPad|iPod/i.test(ua)) {
        // If loaded via file:// or capacitor://, consider mobile native
        if (window.location.protocol === 'capacitor:' || window.location.protocol === 'file:') {
          this.cachedType = 'mobile';
          return 'mobile';
        }
      }
    }

    this.cachedType = 'web';
    return 'web';
  }

  /**
   * Detects underlying operating system
   */
  public getOperatingSystem(): OperatingSystem {
    if (this.cachedOS) return this.cachedOS;

    if (typeof window === 'undefined') {
      this.cachedOS = 'unknown';
      return 'unknown';
    }

    const cap = (window as any).Capacitor;
    if (cap && typeof cap.getPlatform === 'function') {
      const p = cap.getPlatform();
      if (p === 'android') {
        this.cachedOS = 'android';
        return 'android';
      }
      if (p === 'ios') {
        this.cachedOS = 'ios';
        return 'ios';
      }
    }

    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) {
      this.cachedOS = 'android';
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      this.cachedOS = 'ios';
    } else if (/Windows/i.test(ua) || /Win32|Win64/i.test(ua)) {
      this.cachedOS = 'windows';
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      this.cachedOS = 'macos';
    } else if (/Linux/i.test(ua)) {
      this.cachedOS = 'linux';
    } else {
      this.cachedOS = 'unknown';
    }

    return this.cachedOS;
  }

  public isDesktop(): boolean {
    return this.getPlatformType() === 'desktop';
  }

  public isMobile(): boolean {
    return this.getPlatformType() === 'mobile';
  }

  public isWeb(): boolean {
    return this.getPlatformType() === 'web';
  }

  public isNative(): boolean {
    return this.isDesktop() || this.isMobile();
  }

  public getDeviceInfo(): DeviceInfo {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const height = typeof window !== 'undefined' ? window.innerHeight : 800;

    return {
      platform: this.getPlatformType(),
      os: this.getOperatingSystem(),
      isNative: this.isNative(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      appVersion: '3.1.0',
      screen: {
        width,
        height,
        isMobileBreakpoint: width < 768,
        isTabletBreakpoint: width >= 768 && width < 1024,
        isDesktopBreakpoint: width >= 1024,
      },
    };
  }
}

export const platform = new PlatformEngine();
