# VISTAAR SUPER ADMIN — BUILD AND RELEASE GUIDE

Complete reference guide for building, bundling, and releasing VISTAAR Super Admin across Web, Windows Desktop, Android, and iOS.

---

## 1. Prerequisites

- **Node.js:** v20.0+ (Tested on v24.19.0)
- **npm:** v10.0+ (Tested on v11.17.0)
- **Rust & Cargo:** v1.80+ (Tested on v1.99.0 with `x86_64-pc-windows-msvc`)
- **Android SDK:** Platform 34+, Build Tools 34.0.0, OpenJDK 21
- **iOS (macOS host only):** Xcode 15+, CocoaPods (for native iOS compilation)

---

## 2. Web Application

### Development
```powershell
# Terminal 1: Start Gateway BFF
node server/gateway.mjs

# Terminal 2: Start Vite Dev Server
npm run dev
# Accessible at http://localhost:3001/
```

### Production Build
```powershell
npm run build
# Compiles static bundle to dist/
```

---

## 3. Windows Desktop (Tauri 2)

### Development
```powershell
npm run tauri:dev
```

### Production Distribution (.msi / .exe)
```powershell
npm run tauri:build
# Generates installer in src-tauri/target/release/bundle/msi/
```

---

## 4. Android Mobile Application (Capacitor)

### Synchronize Assets
```powershell
npm run build
npx cap sync android
```

### Open in Android Studio
```powershell
npx cap open android
```

### Build APK via Command Line
```powershell
cd android
.\gradlew.bat assembleDebug
# Generated APK: android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 5. iOS Mobile Application (Capacitor)

### Synchronize Assets
```powershell
npm run build
npx cap sync ios
```

### Open in Xcode (macOS host)
```bash
npx cap open ios
```
*Note: Under Windows host environments, the Xcode workspace is fully configured and assets are synced. Compilation to IPA requires opening the project on macOS with Xcode.*

---

## 6. Authoritative Login Credentials

For logging into staging across all platforms:
- **Email:** `navdeep@vistaarone.com`
- **Password:** `VistaarAdmin2026!#`
- **Role:** `super_admin`
- **Staging Supabase Ref:** `vlbhxcajphyjkeueubud` (AWS `eu-west-1`)
