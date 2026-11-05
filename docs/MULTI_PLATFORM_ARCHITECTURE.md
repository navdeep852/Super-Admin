# VISTAAR SUPER ADMIN — MULTI-PLATFORM UNIFIED ARCHITECTURE

**Authoritative System:** VISTAAR Super Admin Control Plane  
**Environment Target:** Staging (`vlbhxcajphyjkeueubud`, AWS `eu-west-1`)  
**Strict Air-Gap:** Production (`kluxsykimnjivkqxelba`) Untouched  
**Platforms Supported:** Web Browser, Windows Desktop (Tauri 2), Android (Capacitor), iOS (Capacitor)

---

## 1. Architectural Overview

VISTAAR Super Admin has been transformed from a single-target React web app into a unified multi-platform application across Web, Desktop, and Mobile platforms.

```
                      +------------------------------------------+
                      |      VISTAAR Super Admin Frontend        |
                      |   (React 19 + TypeScript + Vite + Tailwind)|
                      +------------------------------------------+
                                           |
                   +-----------------------+-----------------------+
                   |                       |                       |
            +-------------+         +-------------+         +-------------+
            | Web Browser |         | Tauri 2     |         | Capacitor   |
            | (Vite SPA)  |         | (Windows)   |         | (Android/iOS|
            +-------------+         +-------------+         +-------------+
                   \                       |                       /
                    \                      |                      /
                     +---------------------+---------------------+
                                           |
                                [Platform Abstraction Layer]
                                 - Secure Storage Adapter
                                 - Unified Notifications
                                 - Native File Downloader/Share
                                 - Network Telemetry Probes
                                           |
                                  HTTP / JSON (REST)
                                           |
                      +------------------------------------------+
                      |            Gateway BFF Service           |
                      |          (Node.js REST on :3002)         |
                      +------------------------------------------+
                                           |
                      +------------------------------------------+
                      |       Supabase Cloud Staging DB          |
                      |     (Project: vlbhxcajphyjkeueubud)       |
                      |       PostgreSQL + GoTrue Auth           |
                      +------------------------------------------+
```

---

## 2. Platform Abstraction Layer (`src/platform/`)

The platform abstraction layer isolates runtime variations and presents a uniform API to all UI components:

1. **Runtime & Breakpoint Detection (`src/platform/index.ts`):**
   - Automatically identifies Web, Tauri Desktop, or Capacitor Mobile environments.
   - Monitors window dimensions with mobile (`< 768px`), tablet (`768px - 1024px`), and desktop (`>= 1024px`) breakpoints.

2. **Hardware-Backed Secure Storage (`src/platform/storage/secureStorage.ts`):**
   - **Mobile (Android/iOS):** `@capacitor/preferences` storing authentication tokens in encrypted native shared preferences / iOS Keychain.
   - **Desktop (Windows):** Tauri secure file store backend fallback to memory cache.
   - **Web:** Standard `localStorage` with in-memory caching.

3. **Unified Notifications (`src/platform/notifications/unifiedNotifications.ts`):**
   - **Mobile:** `@capacitor/local-notifications` triggering native system banners.
   - **Desktop:** `@tauri-apps/plugin-notification` sending Windows Action Center alerts.
   - **Web:** HTML5 Notification API.
   - **Privacy Guard:** Sensitive administrative tokens and credentials are automatically stripped prior to dispatch.

4. **Native File Download & Share (`src/platform/filesystem/fileExport.ts`):**
   - **Desktop:** `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs` prompting native file-save dialogs.
   - **Mobile:** `@capacitor/share` opening native OS share sheet for CSV and report exports.
   - **Web:** Blob-based anchor download.

---

## 3. Responsive Shell & Navigation Parity

- **Desktop Shell (`>= 1024px`):** Collapsible 12-module sidebar with full administrative hierarchy and search bar.
- **Mobile Shell (`< 1024px`):** Fixed 5-tab bottom navigation (`MobileNav.tsx`) with instant access to:
  1. *Dashboard* (KPI overview)
  2. *Businesses* (Workspaces directory & suspensions)
  3. *Subscriptions* (Plan tiers & custom price negotiations)
  4. *Finance Popover* (Payments & Coupons)
  5. *More Drawer* (Security logs, System health, Support tickets, Platform settings)
- **Responsive Data Presentation (`DataTable.tsx`):** Converts complex wide tables on desktop into touch-friendly cards on screens `< 640px` with complete action menus.
