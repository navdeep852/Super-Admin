# VISTAAR Super Admin — UI/UX Frontend Architecture Specification
**Document Version:** 3.0.0  
**Phase:** 3 — Complete Dashboard UI/UX Design  
**Target Domain:** `admin.vistaarone.com`  
**Repository:** `navdeep852/Super-Admin` (Directory: `super_admin/`)  
**Companion Backend Project:** VISTAAR Production Business OS (`Vistaar/`) — Untouched  

---

## 1. Executive Summary & Design System

The VISTAAR Super Admin Control Plane is an independent, enterprise-grade React 19 single-page application engineered to provide platform operators with absolute governance over multi-tenant workspaces, subscription lifecycles, payment settlements, promotional campaigns, and cryptographic security audits.

### 1.1 Visual Identity & Foundation
- **Base Philosophy:** High-density, utilitarian enterprise control plane designed for extended operational shifts.
- **Dark Palette Foundation:** `#090d16` (Primary app background) transitioning into `#0f172a` (Card and panel surfaces) and `#1e293b` (Subtle borders and dividers).
- **Light Palette Support:** Clean slate `#f8fafc` background with crisp white surfaces (`#ffffff`) and slate `#e2e8f0` borders.
- **Emerald Accent Brand Language:** `#10b981` (Primary Emerald Accent) and `#059669` (Dark Emerald Accent) aligned with VISTAAR's core brand identity.
- **Typography:**
  - **Body & Headings:** `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, `sans-serif`.
  - **Financials, IDs & Cryptographic Nonces:** `JetBrains Mono`, `Consolas`, `monospace` for high readability of monetary figures, SHA hashes, and timestamps.
- **Micro-interactions:** 150ms-200ms ease transitions, backdrop blur modals (`backdrop-blur-xs`), slide-over inspection drawers, and responsive SVG charts.

---

## 2. Component Hierarchy & Structural Architecture

The component architecture follows modular atomic principles with clean separation between presentation, state orchestration, and mock data models.

```
super_admin/
├── src/
│   ├── components/
│   │   ├── charts/
│   │   │   ├── BarMetricsChart.tsx       # Dual/triple bar comparison chart (Collections vs GST)
│   │   │   ├── DistributionPieChart.tsx # Recharts donut visualization for subscription tiers
│   │   │   └── TrendChart.tsx           # Multi-area chart for revenue & registration trends
│   │   ├── common/
│   │   │   ├── DataTable.tsx            # Generic typed data table with sorting, search & pagination
│   │   │   ├── Drawer.tsx               # Slide-over inspection drawer for deep payloads
│   │   │   ├── EmptyState.tsx           # Fallback illustrated view for zero results
│   │   │   ├── Modal.tsx                # Accessible dialog modal with ESC & backdrop handlers
│   │   │   ├── PermissionDenied.tsx     # RBAC boundary enforcement card with role switcher
│   │   │   ├── SearchInput.tsx          # Real-time search filter with quick clear
│   │   │   ├── StatCard.tsx             # Metric KPI card with trend badges & theme variants
│   │   │   ├── StatusBadge.tsx          # Semantic status badge (Active, Suspended, Expired, etc.)
│   │   │   └── Tabs.tsx                 # Pill/underline subview navigation bar
│   │   └── layout/
│   │       ├── AdminHeader.tsx          # Top bar with role dropdown, theme toggle & search
│   │       ├── AdminSidebar.tsx         # 11-module navigation rail with collapsed mode & badges
│   │       ├── MockBanner.tsx           # Top simulation banner ensuring zero production confusion
│   │       └── PageContainer.tsx        # Standardized responsive page shell with action slots
│   ├── context/
│   │   ├── AdminAuthContext.tsx         # Active role simulation (super_admin, billing, support)
│   │   └── ThemeContext.tsx             # Dark / Light theme persistence via localStorage & CSS vars
│   ├── data/                            # Centralized typed mock datasets conforming to Phase 2.6
│   │   ├── mockAnalytics.ts
│   │   ├── mockAuditLogs.ts
│   │   ├── mockBusinesses.ts
│   │   ├── mockCoupons.ts
│   │   ├── mockOverview.ts
│   │   ├── mockPayments.ts
│   │   ├── mockSettings.ts
│   │   ├── mockSubscriptions.ts
│   │   ├── mockSupport.ts
│   │   ├── mockSystemHealth.ts
│   │   └── mockUsers.ts
│   ├── pages/                           # 11 Dedicated Navigation Module Page Views
│   │   ├── analytics/AnalyticsReportsPage.tsx
│   │   ├── businesses/BusinessManagementPage.tsx
│   │   ├── coupons/CouponsOffersPage.tsx
│   │   ├── overview/OverviewPage.tsx
│   │   ├── payments/PaymentsRevenuePage.tsx
│   │   ├── security/SecurityAuditLogsPage.tsx
│   │   ├── settings/PlatformSettingsPage.tsx
│   │   ├── subscriptions/SubscriptionManagementPage.tsx
│   │   ├── support/SupportManagementPage.tsx
│   │   ├── system/SystemHealthPage.tsx
│   │   └── users/UserManagementPage.tsx
│   ├── types/index.ts                   # Domain types, RBAC permissions, and status unions
│   ├── utils/index.ts                   # Currency formatters (INR), date helpers, class merger
│   ├── App.tsx                          # Root layout container with role permission gating
│   ├── index.css                        # Tailwind v4 import & CSS custom properties
│   └── main.tsx                         # React 19 root bootstrap with context providers
```

---

## 3. Navigation Modules & Functional Breakdown

The application implements all 11 required enterprise administration modules:

| # | Module Name | Navigation Route Key | Target Operational Domain | Primary Interactions & Features |
|---|---|---|---|---|
| 1 | **Overview** | `overview` | Executive Leadership & Operations | 10 KPI metric cards; strict segregation of Platform Subscription Revenue (₹48.25 L) vs Tenant Retail GMV (₹14.28 Cr); Recharts revenue trend; subscription donut; 7-day upcoming expirations table; recent audit feed. |
| 2 | **Business Management** | `businesses` | Tenant Operations & Compliance | Searchable multi-tenant directory; status filtering (Active / Suspended); plan filtering; slide-over inspection drawer with branch hierarchy; Phase 2.6 suspension modal with reason and snapshot metadata; reactivation flow. |
| 3 | **User Management** | `users` | Staff Governance & Access | Dual tabs for Tenant Staff vs Platform Administrators; search by name, email, workspace; role badges; password reset email dispatch modal; staff access suspension toggle; AAL2 MFA status badges. |
| 4 | **Subscriptions** | `subscriptions` | Billing Operations | Complete coverage of subscription states (Active, Trialing, Past Due, Expired, Cancelled); plan filtering; administrative plan override modal with grace period extension and audit justification preview. |
| 5 | **Payments & Revenue** | `payments` | Financial Reconciliation & Tax | Gateway transactions table (`verified_success`, `failed`, `refunded`); 18% GST statutory ledger summary strip; webhook failure reason inspector (`AMOUNT_MISMATCH`, late expiry); raw payload viewer drawer. |
| 6 | **Coupons & Offers** | `coupons` | Growth & Marketing | Promotional campaign card grid with real-time quota usage bars; campaign creation drawer (percentage vs fixed INR, caps, min purchase, plan eligibility); statutory redemption ledger table. |
| 7 | **Analytics & Reports** | `analytics` | Business Intelligence | 4 dedicated analytical views: Monthly Financial Collections vs 18% GST vs Net Revenue bar charts; Multi-plan tier adoption trajectory; Customer retention cohort matrix; Coupon ROI multiplier table. |
| 8 | **Support Management** | `support` | Customer Success & Triage | Ticket triage table with priority (Critical, High, Medium, Low) and status pills; slide-over conversation drawer with message exchange history; inline reply dispatch form; one-click resolution. |
| 9 | **Security & Audit Logs** | `security` | Governance, Risk & Compliance | Filterable immutable audit log explorer; Gateway Cryptographic Assertion Protocol (GCAP) single-use nonce indicators; client IP origin; detail drawer inspecting before/after state diffs. |
| 10 | **System Health** | `system` | DevOps & Reliability | Real-time health cards for 6 subsystems (Supabase Postgres, Gateway BFF, Webhook Receiver, GCAP Nonce Guard, Cloudflare WAF, Audit Engine); probe latency meters; incident post-mortem stream. |
| 11 | **Platform Settings** | `settings` | Platform Administration | 4 configuration tabs: Tier pricing and quotas (Starter, Mobile, Business, Growth); statutory 18% GST / SAC 998313 settings; security policies (AAL2 MFA enforcement, nonce skew window); gateway parameters. |

---

## 4. State Management, Role Switching & Security Architecture

### 4.1 Role-Based Access Control (RBAC) Simulation
The frontend includes an interactive role selector in `AdminHeader.tsx` allowing developers and evaluators to switch between 3 platform administrative roles:

1. **`super_admin` (Root Platform Administrator):**
   - Full unrestricted access across all 11 modules and actions.
2. **`billing_admin` (Priyanka Sen):**
   - Access to Overview, Businesses, Subscriptions, Payments, Coupons, Analytics, and Support.
   - Restricted from Security Audit Logs, System Health probes, and Platform Settings. Accessing restricted modules immediately displays `PermissionDenied.tsx`.
3. **`support_agent` (Karan Malhotra):**
   - Access to Overview, Businesses, Users, Support, and System Health.
   - Restricted from financial settings, subscription overrides, and platform configuration.

### 4.2 Financial Isolation Guarantee
Under no circumstances are tenant retail sales merged with platform revenues:
- **Platform Collected Revenue (`platformCollectedRevenueInr`):** Subscription fees paid by tenants to VISTAAR (`₹48,25,900.00`). Subject to statutory 18% GST component (`₹7,36,154.24`), refunds, and net platform earnings (`₹40,89,745.76`).
- **Tenant Retail Sales GMV (`tenantSalesGmvInr`):** Gross merchandise value processed by merchant shops through VISTAAR Business OS (`₹14,28,50,000.00`). Visualized strictly in purple accent cards with distinct labels to ensure complete accounting isolation.

---

## 5. Build & Performance Metrics

The application is built using Vite 8 with ESNext target:
- **CSS Bundle Size:** `61.65 kB` (gzip: `10.20 kB`) using modern Tailwind CSS v4 compiler.
- **JS Bundle Size:** `836.73 kB` (gzip: `232.83 kB`) including React 19, Lucide icons, and Recharts.
- **Build Time:** `1.40s` on Windows Node v24 environment.
- **Zero Warnings / Zero Type Errors:** Verified via `tsc -b && vite build`.

