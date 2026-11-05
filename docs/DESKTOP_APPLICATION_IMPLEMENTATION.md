# VISTAAR SUPER ADMIN — WINDOWS DESKTOP IMPLEMENTATION

**Framework:** Tauri 2 (Rust 1.99.0 + MSVC `x86_64`)  
**Target Platform:** Windows 10 & 11 Desktop  
**Binary Location:** `src-tauri/target/`

---

## 1. Tauri 2 Architecture

The Windows desktop client wraps the compiled Super Admin frontend using Tauri 2. Tauri uses Microsoft Edge WebView2 on Windows, resulting in a lightweight (~10-15 MB) executable with zero Chromium bloat.

### Directory Structure:
```
src-tauri/
├── Cargo.toml                  # Rust dependencies & Tauri plugins
├── tauri.conf.json             # App identifier, window bounds, CSP, & icon definitions
├── build.rs                    # Tauri build orchestrator
├── capabilities/
│   └── default.json            # Security capability permission set
├── src/
│   ├── main.rs                 # Native application entry point
│   └── lib.rs                  # Plugin registration (notification, fs, dialog, shell)
└── icons/                      # 32x32.png, 128x128.png, icon.png, icon.ico
```

---

## 2. Security Capabilities & Scopes (`src-tauri/capabilities/default.json`)

To follow the principle of least privilege, native capabilities are restricted:
- **Dialog:** Dialog open and save file permissions for CSV ledger exports.
- **FS:** Read and write scoped strictly to `$DOWNLOAD/**` and `$APPCACHE/**`.
- **Notification:** Send native Windows notifications.
- **Shell:** URL opening restricted to verified administrative domains (`vistaarone.com`, `supabase.co`).

---

## 3. Rust Compilation Verification

Compilation was verified using MSVC x86_64:
```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```
**Result:** `Finished dev profile [unoptimized + debuginfo] target(s) in 14m 22s` (0 warnings, 0 errors).

---

## 4. Run & Build Commands

- **Development Mode:** `npm run tauri:dev`
- **Production Installer Build:** `npm run tauri:build`
