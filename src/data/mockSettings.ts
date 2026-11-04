export interface PricingPlanConfig {
  id: string;
  name: string;
  tagline: string;
  priceMonthlyInr: number;
  priceAnnualInr: number;
  maxUsers: number;
  maxBranches: number;
  allowedPlatforms: string[];
  isActive: boolean;
}

export const mockPricingPlans: PricingPlanConfig[] = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Cloud Web business management for single-terminal retail',
    priceMonthlyInr: 299,
    priceAnnualInr: 2499,
    maxUsers: 1,
    maxBranches: 1,
    allowedPlatforms: ['web'],
    isActive: true
  },
  {
    id: 'starter_mobile',
    name: 'Starter + Mobile Add-on',
    tagline: 'Web counter plus native Android APK for floor staff',
    priceMonthlyInr: 498,
    priceAnnualInr: 4498,
    maxUsers: 2,
    maxBranches: 1,
    allowedPlatforms: ['web', 'android'],
    isActive: true
  },
  {
    id: 'business',
    name: 'Business',
    tagline: 'High-throughput Windows Desktop software & multi-branch control',
    priceMonthlyInr: 699,
    priceAnnualInr: 5999,
    maxUsers: 5,
    maxBranches: 3,
    allowedPlatforms: ['web', 'desktop'],
    isActive: true
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'Enterprise all-platform operating system for retail chains',
    priceMonthlyInr: 1199,
    priceAnnualInr: 9999,
    maxUsers: 0, // unlimited
    maxBranches: 0, // unlimited
    allowedPlatforms: ['web', 'desktop', 'android'],
    isActive: true
  }
];

export const mockPlatformConfig = {
  platformName: 'VISTAAR Business OS',
  controlPlaneDomain: 'admin.vistaarone.com',
  tenantAppDomain: 'app.vistaarone.com',
  taxation: {
    gstEnabled: true,
    hsnCode: '998313',
    taxRatePercent: 18,
    statutoryRetentionYears: 8
  },
  securityPolicies: {
    enforceMfaAal2: true,
    gcapAssertionSkewSeconds: 30,
    sessionTimeoutMinutes: 60,
    maxLoginAttempts: 5,
    auditLogImmutabilityEnforced: true
  },
  paymentSettings: {
    activeProvider: 'youpi_pg',
    currency: 'INR',
    webhookTimeoutHours: 24,
    reservationTtlMinutes: 15
  }
};

