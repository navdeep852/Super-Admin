import { AuditLogEntry } from '../types';

export const mockAuditLogs: AuditLogEntry[] = [
  {
    id: 'aud-8891',
    timestamp: '2026-11-01T14:30:12Z',
    adminId: 'adm-001',
    adminEmail: 'admin@vistaarone.com',
    adminRole: 'super_admin',
    action: 'COUPON_CREATE',
    targetResource: 'public.coupons',
    targetId: 'cpn-002',
    reason: 'Provisioned Diwali Special ₹2,500 festive campaign code FESTIVE2500',
    clientIp: '103.211.54.18',
    assertionNonce: 'e4b9c1d0-7a32-4e89-9821-bc190348a011',
    status: 'SUCCESS',
    details: {
      couponCode: 'FESTIVE2500',
      discountType: 'fixed',
      discountValue: 2500,
      quota: 200,
      minPurchaseInr: 20000
    }
  },
  {
    id: 'aud-8890',
    timestamp: '2026-10-31T11:15:00Z',
    adminId: 'adm-001',
    adminEmail: 'admin@vistaarone.com',
    adminRole: 'super_admin',
    action: 'PLAN_OVERRIDE',
    targetResource: 'public.workspace_subscriptions',
    targetId: 'sub-208',
    reason: 'Approved 6-month enterprise pilot extension for Deccan Organics Hub per MoU',
    clientIp: '103.211.54.18',
    assertionNonce: '3f920da1-81ce-4277-a841-f09238e12903',
    status: 'SUCCESS',
    details: {
      workspaceId: 'ws-108',
      planId: 'business',
      originalPeriodEnd: '2026-11-08T23:59:59Z',
      extendedPeriodEnd: '2027-04-08T23:59:59Z',
      isManualOverride: true
    }
  },
  {
    id: 'aud-8889',
    timestamp: '2026-10-22T14:30:00Z',
    adminId: 'adm-001',
    adminEmail: 'admin@vistaarone.com',
    adminRole: 'super_admin',
    action: 'SUSPEND_WORKSPACE',
    targetResource: 'public.workspaces',
    targetId: 'ws-103',
    reason: 'Repeated billing charge failures & non-response to compliance verification notice',
    clientIp: '103.211.54.18',
    assertionNonce: '7b201f94-4d82-4910-b993-19940293da88',
    status: 'SUCCESS',
    details: {
      workspaceName: 'Kaveri Provisions & FMCG',
      suspendedMembershipsCount: 2,
      suspendedProfilesCount: 2,
      snapshotTable: 'platform_workspace_suspensions',
      suspensionId: 'susp-9041'
    }
  },
  {
    id: 'aud-8888',
    timestamp: '2026-10-20T09:40:22Z',
    adminId: 'adm-002',
    adminEmail: 'priyanka.billing@vistaarone.com',
    adminRole: 'billing_admin',
    action: 'SETTINGS_UPDATE',
    targetResource: 'public.platform_system_settings',
    targetId: 'tax_configuration',
    reason: 'Annual audit update: Verified 18% HSN 998313 SaaS GST tax configuration',
    clientIp: '49.207.181.92',
    assertionNonce: '01cf92da-6612-4029-a1b9-883901a88491',
    status: 'SUCCESS',
    details: {
      gstRate: 0.18,
      hsnCode: '998313',
      taxName: 'GST (CGST 9% + SGST 9% / IGST 18%)'
    }
  },
  {
    id: 'aud-8887',
    timestamp: '2026-10-02T11:00:00Z',
    adminId: 'adm-001',
    adminEmail: 'admin@vistaarone.com',
    adminRole: 'super_admin',
    action: 'SUSPEND_WORKSPACE',
    targetResource: 'public.workspaces',
    targetId: 'ws-107',
    reason: 'Terms of Service violation: Unverified pharma wholesale license submission',
    clientIp: '103.211.54.18',
    assertionNonce: '88394012-3b10-4491-b441-992014849182',
    status: 'SUCCESS',
    details: {
      workspaceName: 'Omkar Pharma & Surgical Distributors',
      suspendedMembershipsCount: 4,
      suspendedProfilesCount: 3,
      snapshotTable: 'platform_workspace_suspensions',
      suspensionId: 'susp-9012'
    }
  }
];

