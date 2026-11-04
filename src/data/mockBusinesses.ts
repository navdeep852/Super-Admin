import { Business } from '../types';

export const mockBusinesses: Business[] = [
  {
    id: 'ws-101',
    legalName: 'Apex Retail India Pvt Ltd',
    organizationId: 'org-01',
    ownerName: 'Rajesh Sharma',
    ownerEmail: 'rajesh.sharma@apexretail.in',
    ownerPhone: '+91 98201 44521',
    status: 'Active',
    planId: 'business',
    planName: 'Business Annual',
    billingInterval: 'annual',
    subscriptionStatus: 'active',
    periodEnd: '2026-11-04T23:59:59Z',
    totalBranches: 4,
    branches: [
      { id: 'br-101-1', branchName: 'Apex Flagship (Andheri West)', branchCode: 'MUM-01', isMainBranch: true, isActive: true, userCount: 8 },
      { id: 'br-101-2', branchName: 'Apex Outlet (Bandra)', branchCode: 'MUM-02', isMainBranch: false, isActive: true, userCount: 4 },
      { id: 'br-101-3', branchName: 'Apex Express (Thane)', branchCode: 'THN-01', isMainBranch: false, isActive: true, userCount: 3 },
      { id: 'br-101-4', branchName: 'Apex Warehouse (Bhiwandi)', branchCode: 'BHW-01', isMainBranch: false, isActive: true, userCount: 2 }
    ],
    monthlyGmvInr: 2840000.00,
    totalCollectedRevenueInr: 49980.00,
    registeredAt: '2025-11-04T10:15:00Z',
    lastActiveAt: '2026-11-01T15:20:00Z'
  },
  {
    id: 'ws-102',
    legalName: 'Zenith Hypermarkets LLP',
    organizationId: 'org-02',
    ownerName: 'Priya Nambiar',
    ownerEmail: 'priya@zenithhyper.com',
    ownerPhone: '+91 98450 11234',
    status: 'Active',
    planId: 'growth',
    planName: 'Growth Annual',
    billingInterval: 'annual',
    subscriptionStatus: 'active',
    periodEnd: '2027-03-15T23:59:59Z',
    totalBranches: 6,
    branches: [
      { id: 'br-102-1', branchName: 'Zenith Super Center (Indiranagar)', branchCode: 'BLR-01', isMainBranch: true, isActive: true, userCount: 12 },
      { id: 'br-102-2', branchName: 'Zenith Express (Koramangala)', branchCode: 'BLR-02', isMainBranch: false, isActive: true, userCount: 6 },
      { id: 'br-102-3', branchName: 'Zenith Mart (Whitefield)', branchCode: 'BLR-03', isMainBranch: false, isActive: true, userCount: 5 }
    ],
    monthlyGmvInr: 6850000.00,
    totalCollectedRevenueInr: 79990.00,
    registeredAt: '2026-03-15T11:00:00Z',
    lastActiveAt: '2026-11-01T16:45:00Z'
  },
  {
    id: 'ws-103',
    legalName: 'Kaveri Provisions & FMCG',
    organizationId: 'org-03',
    ownerName: 'M. K. Ramanathan',
    ownerEmail: 'ramanathan@kaveriprovisions.in',
    ownerPhone: '+91 94440 88219',
    status: 'Suspended',
    planId: 'starter',
    planName: 'Starter Monthly',
    billingInterval: 'monthly',
    subscriptionStatus: 'past_due',
    periodEnd: '2026-10-18T23:59:59Z',
    totalBranches: 1,
    branches: [
      { id: 'br-103-1', branchName: 'Kaveri Provisions (T. Nagar)', branchCode: 'CHN-01', isMainBranch: true, isActive: false, userCount: 2 }
    ],
    monthlyGmvInr: 420000.00,
    totalCollectedRevenueInr: 5994.00,
    registeredAt: '2026-04-18T09:30:00Z',
    lastActiveAt: '2026-10-20T12:10:00Z',
    suspensionDetails: {
      suspendedAt: '2026-10-22T14:30:00Z',
      suspendedBy: 'admin@vistaarone.com (Root Platform Administrator)',
      reason: 'Repeated billing charge failures & non-response to compliance verification notice',
      suspendedMembershipsCount: 2,
      suspendedProfilesCount: 2
    }
  },
  {
    id: 'ws-104',
    legalName: 'Shanti Textiles LLP',
    organizationId: 'org-04',
    ownerName: 'Vikram Singhania',
    ownerEmail: 'vikram@shantitextiles.com',
    ownerPhone: '+91 98112 55901',
    status: 'Active',
    planId: 'starter',
    planName: 'Starter Monthly',
    billingInterval: 'monthly',
    subscriptionStatus: 'active',
    periodEnd: '2026-11-06T23:59:59Z',
    totalBranches: 2,
    branches: [
      { id: 'br-104-1', branchName: 'Shanti Showroom (Chandni Chowk)', branchCode: 'DEL-01', isMainBranch: true, isActive: true, userCount: 3 },
      { id: 'br-104-2', branchName: 'Shanti Godown (Karol Bagh)', branchCode: 'DEL-02', isMainBranch: false, isActive: true, userCount: 2 }
    ],
    monthlyGmvInr: 950000.00,
    totalCollectedRevenueInr: 11988.00,
    registeredAt: '2025-11-06T14:20:00Z',
    lastActiveAt: '2026-11-01T14:15:00Z'
  },
  {
    id: 'ws-105',
    legalName: 'BlueSky Hardware Supplies',
    organizationId: 'org-05',
    ownerName: 'Amitabh Joshi',
    ownerEmail: 'amitabh@blueskyhardware.com',
    ownerPhone: '+91 97230 44910',
    status: 'Active',
    planId: 'starter_mobile',
    planName: 'Starter + Mobile Add-on',
    billingInterval: 'monthly',
    subscriptionStatus: 'trialing',
    periodEnd: '2026-11-12T23:59:59Z',
    totalBranches: 1,
    branches: [
      { id: 'br-105-1', branchName: 'BlueSky Yard (Naroda)', branchCode: 'AHM-01', isMainBranch: true, isActive: true, userCount: 2 }
    ],
    monthlyGmvInr: 610000.00,
    totalCollectedRevenueInr: 0.00,
    registeredAt: '2026-10-29T16:00:00Z',
    lastActiveAt: '2026-11-01T17:05:00Z'
  },
  {
    id: 'ws-106',
    legalName: 'Royal Sweets & Savouries',
    organizationId: 'org-06',
    ownerName: 'Harpreet Singh Sethi',
    ownerEmail: 'harpreet@royalsweets.in',
    ownerPhone: '+91 98720 33812',
    status: 'Active',
    planId: 'business',
    planName: 'Business Annual',
    billingInterval: 'annual',
    subscriptionStatus: 'active',
    periodEnd: '2027-02-18T23:59:59Z',
    totalBranches: 3,
    branches: [
      { id: 'br-106-1', branchName: 'Royal Main Branch (Sector 17)', branchCode: 'CHD-01', isMainBranch: true, isActive: true, userCount: 6 },
      { id: 'br-106-2', branchName: 'Royal Sweet Kiosk (Elante Mall)', branchCode: 'CHD-02', isMainBranch: false, isActive: true, userCount: 3 }
    ],
    monthlyGmvInr: 1850000.00,
    totalCollectedRevenueInr: 24990.00,
    registeredAt: '2026-02-18T08:45:00Z',
    lastActiveAt: '2026-11-01T13:30:00Z'
  },
  {
    id: 'ws-107',
    legalName: 'Omkar Pharma & Surgical Distributors',
    organizationId: 'org-07',
    ownerName: 'Dr. Ramesh Patel',
    ownerEmail: 'ramesh.patel@omkarpharma.com',
    ownerPhone: '+91 98250 99432',
    status: 'Suspended',
    planId: 'business',
    planName: 'Business Annual',
    billingInterval: 'annual',
    subscriptionStatus: 'cancelled',
    periodEnd: '2026-09-30T23:59:59Z',
    totalBranches: 2,
    branches: [
      { id: 'br-107-1', branchName: 'Omkar Depot (Surat)', branchCode: 'SUR-01', isMainBranch: true, isActive: false, userCount: 4 }
    ],
    monthlyGmvInr: 1400000.00,
    totalCollectedRevenueInr: 24990.00,
    registeredAt: '2025-09-30T10:00:00Z',
    lastActiveAt: '2026-09-28T18:00:00Z',
    suspensionDetails: {
      suspendedAt: '2026-10-02T11:00:00Z',
      suspendedBy: 'admin@vistaarone.com',
      reason: 'Terms of Service violation: Unverified pharma wholesale license submission',
      suspendedMembershipsCount: 4,
      suspendedProfilesCount: 3
    }
  },
  {
    id: 'ws-108',
    legalName: 'Deccan Organics Hub',
    organizationId: 'org-08',
    ownerName: 'Anita Rao',
    ownerEmail: 'anita.rao@deccanorganics.co.in',
    ownerPhone: '+91 98490 22718',
    status: 'Active',
    planId: 'business',
    planName: 'Business Monthly',
    billingInterval: 'monthly',
    subscriptionStatus: 'active',
    periodEnd: '2026-11-08T23:59:59Z',
    totalBranches: 2,
    branches: [
      { id: 'br-108-1', branchName: 'Deccan Flagship (Banjara Hills)', branchCode: 'HYD-01', isMainBranch: true, isActive: true, userCount: 5 },
      { id: 'br-108-2', branchName: 'Deccan Mart (Madhapur)', branchCode: 'HYD-02', isMainBranch: false, isActive: true, userCount: 4 }
    ],
    monthlyGmvInr: 1250000.00,
    totalCollectedRevenueInr: 29988.00,
    registeredAt: '2025-11-08T12:00:00Z',
    lastActiveAt: '2026-11-01T15:50:00Z'
  }
];

