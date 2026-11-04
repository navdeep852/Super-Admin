import { TenantUser, AdminUser } from '../types';

export const mockPlatformAdmins: AdminUser[] = [
  {
    id: 'adm-001',
    email: 'admin@vistaarone.com',
    fullName: 'Root Platform Administrator',
    role: 'super_admin',
    isActive: true,
    mfaEnabled: true,
    lastLoginAt: '2026-11-01T17:15:00Z',
    createdAt: '2025-01-01T00:00:00Z'
  },
  {
    id: 'adm-002',
    email: 'priyanka.billing@vistaarone.com',
    fullName: 'Priyanka Sen',
    role: 'billing_admin',
    isActive: true,
    mfaEnabled: true,
    lastLoginAt: '2026-11-01T14:40:00Z',
    createdAt: '2025-04-12T10:00:00Z'
  },
  {
    id: 'adm-003',
    email: 'karan.support@vistaarone.com',
    fullName: 'Karan Malhotra',
    role: 'support_agent',
    isActive: true,
    mfaEnabled: true,
    lastLoginAt: '2026-11-01T16:20:00Z',
    createdAt: '2025-06-20T11:30:00Z'
  },
  {
    id: 'adm-004',
    email: 'rohit.security@vistaarone.com',
    fullName: 'Rohit Verma',
    role: 'super_admin',
    isActive: true,
    mfaEnabled: true,
    lastLoginAt: '2026-10-31T09:15:00Z',
    createdAt: '2025-03-01T08:00:00Z'
  }
];

export const mockTenantUsers: TenantUser[] = [
  {
    id: 'usr-1001',
    fullName: 'Rajesh Sharma',
    email: 'rajesh.sharma@apexretail.in',
    phone: '+91 98201 44521',
    primaryWorkspaceId: 'ws-101',
    primaryWorkspaceName: 'Apex Retail India Pvt Ltd',
    role: 'owner',
    accountStatus: 'Active',
    memberships: [
      { workspaceId: 'ws-101', workspaceName: 'Apex Retail India (Main)', role: 'owner', status: 'Active' },
      { workspaceId: 'ws-101-2', workspaceName: 'Apex Bandra Branch', role: 'owner', status: 'Active' }
    ],
    createdAt: '2025-11-04T10:15:00Z',
    lastActiveAt: '2026-11-01T15:20:00Z'
  },
  {
    id: 'usr-1002',
    fullName: 'Sunil Deshmukh',
    email: 'sunil.manager@apexretail.in',
    phone: '+91 98202 88411',
    primaryWorkspaceId: 'ws-101',
    primaryWorkspaceName: 'Apex Retail India Pvt Ltd',
    role: 'manager',
    accountStatus: 'Active',
    memberships: [
      { workspaceId: 'ws-101', workspaceName: 'Apex Retail India (Main)', role: 'manager', status: 'Active' }
    ],
    createdAt: '2025-11-05T11:00:00Z',
    lastActiveAt: '2026-11-01T14:50:00Z'
  },
  {
    id: 'usr-1003',
    fullName: 'Priya Nambiar',
    email: 'priya@zenithhyper.com',
    phone: '+91 98450 11234',
    primaryWorkspaceId: 'ws-102',
    primaryWorkspaceName: 'Zenith Hypermarkets LLP',
    role: 'owner',
    accountStatus: 'Active',
    memberships: [
      { workspaceId: 'ws-102', workspaceName: 'Zenith Super Center', role: 'owner', status: 'Active' }
    ],
    createdAt: '2026-03-15T11:00:00Z',
    lastActiveAt: '2026-11-01T16:45:00Z'
  },
  {
    id: 'usr-1004',
    fullName: 'M. K. Ramanathan',
    email: 'ramanathan@kaveriprovisions.in',
    phone: '+91 94440 88219',
    primaryWorkspaceId: 'ws-103',
    primaryWorkspaceName: 'Kaveri Provisions & FMCG',
    role: 'owner',
    accountStatus: 'Suspended',
    memberships: [
      { workspaceId: 'ws-103', workspaceName: 'Kaveri Provisions (T. Nagar)', role: 'owner', status: 'Suspended' }
    ],
    createdAt: '2026-04-18T09:30:00Z',
    lastActiveAt: '2026-10-20T12:10:00Z'
  },
  {
    id: 'usr-1005',
    fullName: 'Vikram Singhania',
    email: 'vikram@shantitextiles.com',
    phone: '+91 98112 55901',
    primaryWorkspaceId: 'ws-104',
    primaryWorkspaceName: 'Shanti Textiles LLP',
    role: 'owner',
    accountStatus: 'Active',
    memberships: [
      { workspaceId: 'ws-104', workspaceName: 'Shanti Showroom (Chandni Chowk)', role: 'owner', status: 'Active' }
    ],
    createdAt: '2025-11-06T14:20:00Z',
    lastActiveAt: '2026-11-01T14:15:00Z'
  },
  {
    id: 'usr-1006',
    fullName: 'Kavita Menon',
    email: 'kavita.accountant@zenithhyper.com',
    phone: '+91 98453 66712',
    primaryWorkspaceId: 'ws-102',
    primaryWorkspaceName: 'Zenith Hypermarkets LLP',
    role: 'employee',
    accountStatus: 'Active',
    memberships: [
      { workspaceId: 'ws-102', workspaceName: 'Zenith Super Center', role: 'employee', status: 'Active' }
    ],
    createdAt: '2026-03-20T14:00:00Z',
    lastActiveAt: '2026-11-01T11:25:00Z'
  },
  {
    id: 'usr-1007',
    fullName: 'Anita Rao',
    email: 'anita.rao@deccanorganics.co.in',
    phone: '+91 98490 22718',
    primaryWorkspaceId: 'ws-108',
    primaryWorkspaceName: 'Deccan Organics Hub',
    role: 'owner',
    accountStatus: 'Active',
    memberships: [
      { workspaceId: 'ws-108', workspaceName: 'Deccan Flagship (Banjara Hills)', role: 'owner', status: 'Active' },
      { workspaceId: 'ws-108-2', workspaceName: 'Deccan Mart (Madhapur)', role: 'owner', status: 'Active' }
    ],
    createdAt: '2025-11-08T12:00:00Z',
    lastActiveAt: '2026-11-01T15:50:00Z'
  }
];

