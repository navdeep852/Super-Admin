import { OverviewMetrics } from '../types';

export const mockOverviewMetrics: OverviewMetrics = {
  totalBusinesses: 1248,
  activeBusinesses: 1184,
  suspendedBusinesses: 64,
  totalUsers: 4892,
  activeSubscriptions: 1112,
  trialSubscriptions: 92,
  expiredSubscriptions: 44,
  pendingRenewals: 78,
  platformCollectedRevenueInr: 4825900.00,
  gstComponentInr: 736154.24, // 18% GST component
  netPlatformRevenueInr: 4089745.76,
  failedPaymentsCount: 19,
  totalRefundsInr: 34990.00,
  mrrInr: 428500.00,
  arrInr: 5142000.00,
  tenantSalesGmvInr: 142850000.00 // Tenant Business Sales GMV: ~₹14.28 Crore (strictly distinct from platform revenue!)
};

export const mockRevenueTrends = [
  { month: 'Jun 2026', platformRevenue: 342000, netRevenue: 289830, gmvInCrores: 9.8 },
  { month: 'Jul 2026', platformRevenue: 368000, netRevenue: 311864, gmvInCrores: 10.4 },
  { month: 'Aug 2026', platformRevenue: 405000, netRevenue: 343220, gmvInCrores: 11.9 },
  { month: 'Sep 2026', platformRevenue: 432000, netRevenue: 366101, gmvInCrores: 12.8 },
  { month: 'Oct 2026', platformRevenue: 461000, netRevenue: 390677, gmvInCrores: 13.7 },
  { month: 'Nov 2026', platformRevenue: 482590, netRevenue: 408974, gmvInCrores: 14.3 }
];

export const mockRegistrationTrends = [
  { month: 'Jun 2026', newBusinesses: 68, activeUsers: 240 },
  { month: 'Jul 2026', newBusinesses: 84, activeUsers: 310 },
  { month: 'Aug 2026', newBusinesses: 102, activeUsers: 420 },
  { month: 'Sep 2026', newBusinesses: 118, activeUsers: 490 },
  { month: 'Oct 2026', newBusinesses: 134, activeUsers: 560 },
  { month: 'Nov 2026', newBusinesses: 145, activeUsers: 620 }
];

export const mockPlanDistribution = [
  { name: 'Starter', count: 420, revenuePercent: 22, color: '#38bdf8' },
  { name: 'Starter + Mobile', count: 284, revenuePercent: 24, color: '#818cf8' },
  { name: 'Business', count: 342, revenuePercent: 36, color: '#10b981' },
  { name: 'Growth', count: 66, revenuePercent: 18, color: '#f59e0b' }
];

export const mockUpcomingExpirations = [
  {
    workspaceId: 'ws-101',
    businessName: 'Apex Retail India Pvt Ltd',
    planName: 'Business Annual',
    expiresInDays: 3,
    expiryDate: '2026-11-04',
    amountInr: 24990.00,
    ownerEmail: 'rajesh.sharma@apexretail.in'
  },
  {
    workspaceId: 'ws-104',
    businessName: 'Shanti Textiles LLP',
    planName: 'Starter Monthly',
    expiresInDays: 5,
    expiryDate: '2026-11-06',
    amountInr: 999.00,
    ownerEmail: 'vikram@shantitextiles.com'
  },
  {
    workspaceId: 'ws-108',
    businessName: 'Deccan Organics Hub',
    planName: 'Business Monthly',
    expiresInDays: 7,
    expiryDate: '2026-11-08',
    amountInr: 2499.00,
    ownerEmail: 'anita.rao@deccanorganics.co.in'
  },
  {
    workspaceId: 'ws-112',
    businessName: 'Navya Electronics Store',
    planName: 'Growth Annual',
    expiresInDays: 11,
    expiryDate: '2026-11-12',
    amountInr: 79990.00,
    ownerEmail: 'suresh@navyaelectronics.in'
  }
];

