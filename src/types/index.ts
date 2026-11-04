export type PlatformRole = 'super_admin' | 'billing_admin' | 'support_agent';
export type AdminRole = PlatformRole;

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: PlatformRole;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string;
  createdAt: string;
}

export type BusinessStatus = 'Active' | 'Suspended';

export interface Branch {
  id: string;
  branchName: string;
  branchCode: string;
  isMainBranch: boolean;
  isActive: boolean;
  userCount: number;
}

export interface Business {
  id: string;
  legalName: string;
  organizationId: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  status: BusinessStatus;
  planId: 'starter' | 'starter_mobile' | 'business' | 'growth' | 'free_trial' | string;
  planName: string;
  billingInterval: 'monthly' | 'annual';
  subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'expired' | 'cancelled' | string;
  periodEnd: string;
  totalBranches: number;
  branches: Branch[];
  monthlyGmvInr: number;
  totalCollectedRevenueInr: number;
  registeredAt: string;
  lastActiveAt: string;
  activeStaffCount?: number;
  gstin?: string | null;
  city?: string;
  state?: string;
  address?: string;
  mrrContributionInr?: number;
  suspensionDetails?: {
    suspendedAt: string;
    suspendedBy: string;
    reason: string;
    suspendedMembershipsCount: number;
    suspendedProfilesCount: number;
  };
}

export interface UserMembership {
  workspaceId: string;
  workspaceName: string;
  role: 'owner' | 'admin' | 'manager' | 'employee';
  status: 'Active' | 'Suspended' | 'Inactive';
}

export interface TenantUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  primaryWorkspaceId: string;
  primaryWorkspaceName: string;
  role: 'owner' | 'admin' | 'manager' | 'employee';
  accountStatus: 'Active' | 'Suspended' | 'Inactive';
  memberships: UserMembership[];
  createdAt: string;
  lastActiveAt: string;
}

export interface Subscription {
  id: string;
  workspaceId: string;
  workspaceName: string;
  planId: 'starter' | 'starter_mobile' | 'business' | 'growth';
  planName: string;
  status: 'active' | 'trialing' | 'past_due' | 'expired' | 'cancelled';
  billingInterval: 'monthly' | 'annual';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  amountInr: number;
  discountAppliedInr: number;
  couponCode?: string;
  cancelAtPeriodEnd: boolean;
  lastRenewedAt?: string;
  nextRenewalDate: string;
  isManualOverride?: boolean;
}

export interface PaymentTransaction {
  id: string;
  transactionReference: string;
  workspaceId: string;
  workspaceName: string;
  customerEmail: string;
  amountInr: number;
  currency: 'INR';
  provider: 'youpi_pg';
  status: 'verified_success' | 'failed' | 'refunded' | 'pending';
  planId: string;
  couponRedemptionId?: string;
  couponCode?: string;
  verifiedAt?: string;
  createdAt: string;
  errorMessage?: string;
  supportReviewRequired?: boolean;
}

export interface Coupon {
  id: string;
  code: string;
  name: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxDiscountCapInr?: number;
  minPurchaseAmountInr: number;
  applicablePlans: string[]; // ['all'] or explicit
  applicableInterval: 'all' | 'monthly' | 'annual';
  customerTargeting: 'all' | 'new_customers_only' | 'existing_customers_only';
  firstSubscriptionOnly: boolean;
  validFrom: string;
  validUntil?: string;
  maxTotalRedemptions?: number;
  currentRedemptions: number;
  maxRedemptionsPerWorkspace: number;
  isActive: boolean;
  totalDiscountGrantedInr: number;
  createdAt: string;
}

export interface CouponRedemption {
  id: string;
  couponId: string;
  couponCode: string;
  workspaceId: string;
  workspaceName: string;
  customerEmail: string;
  planId: string;
  billingInterval: string;
  originalAmountInr: number;
  discountAmountInr: number;
  finalPayableInr: number;
  paymentTransactionRef?: string;
  status: 'applied' | 'reserved' | 'failed' | 'refunded';
  redeemedAt?: string;
  reservedAt: string;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  workspaceId: string;
  workspaceName: string;
  contactName: string;
  contactEmail: string;
  subject: string;
  category: 'Billing' | 'Subscription' | 'Technical' | 'Access' | 'Data';
  priority: 'High' | 'Medium' | 'Low' | 'Critical';
  status: 'Open' | 'In Progress' | 'Resolved' | 'Waiting on Customer';
  createdAt: string;
  updatedAt: string;
  assignedTo?: string;
  lastMessageSnippet: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  adminId: string;
  adminEmail: string;
  adminRole: PlatformRole;
  action: 'SUSPEND_WORKSPACE' | 'REACTIVATE_WORKSPACE' | 'PLAN_OVERRIDE' | 'COUPON_CREATE' | 'ADMIN_ROLE_CHANGE' | 'SETTINGS_UPDATE';
  targetResource: string;
  targetId: string;
  reason: string;
  clientIp: string;
  assertionNonce: string;
  status: 'SUCCESS' | 'REJECTED' | 'FAILED';
  details: Record<string, any>;
}

export interface SystemServiceHealth {
  name: string;
  status: 'Healthy' | 'Degraded' | 'Down';
  latencyMs: number;
  uptime99: number;
  lastChecked: string;
  details: string;
}

export interface OverviewMetrics {
  totalBusinesses: number;
  activeBusinesses: number;
  suspendedBusinesses: number;
  totalUsers: number;
  totalEmployees?: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  expiredSubscriptions: number;
  pendingRenewals: number;
  newRegistrations?: number;
  platformCollectedRevenueInr: number;
  gstComponentInr: number;
  netPlatformRevenueInr: number;
  outstandingAmountsInr?: number;
  failedPaymentsCount: number;
  totalRefundsInr: number;
  mrrInr: number;
  arrInr: number;
  tenantSalesGmvInr: number; // Tenant retail sales (distinct from platform revenue!)
  tenantCollectedInr?: number;
}

