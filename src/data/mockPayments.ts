import { PaymentTransaction } from '../types';

export const mockPayments: PaymentTransaction[] = [
  {
    id: 'tx-301',
    transactionReference: 'YOUPI_TX_20261101_882910',
    workspaceId: 'ws-101',
    workspaceName: 'Apex Retail India Pvt Ltd',
    customerEmail: 'rajesh.sharma@apexretail.in',
    amountInr: 22491.00, // 24990 - 2499 (ANNUAL10 coupon)
    currency: 'INR',
    provider: 'youpi_pg',
    status: 'verified_success',
    planId: 'business',
    couponRedemptionId: 'red-401',
    couponCode: 'ANNUAL10',
    verifiedAt: '2026-11-01T10:15:32Z',
    createdAt: '2026-11-01T10:14:45Z'
  },
  {
    id: 'tx-302',
    transactionReference: 'YOUPI_TX_20261101_774102',
    workspaceId: 'ws-104',
    workspaceName: 'Shanti Textiles LLP',
    customerEmail: 'vikram@shantitextiles.com',
    amountInr: 899.00, // 999 - 100 (SAVE100)
    currency: 'INR',
    provider: 'youpi_pg',
    status: 'verified_success',
    planId: 'starter',
    couponRedemptionId: 'red-402',
    couponCode: 'SAVE100',
    verifiedAt: '2026-11-01T11:22:15Z',
    createdAt: '2026-11-01T11:21:50Z'
  },
  {
    id: 'tx-303',
    transactionReference: 'YOUPI_TX_20261101_663919',
    workspaceId: 'ws-103',
    workspaceName: 'Kaveri Provisions & FMCG',
    customerEmail: 'ramanathan@kaveriprovisions.in',
    amountInr: 999.00,
    currency: 'INR',
    provider: 'youpi_pg',
    status: 'failed',
    planId: 'starter',
    errorMessage: 'Card issuer decline: Insufficient balance on corporate debit card',
    createdAt: '2026-11-01T08:30:10Z'
  },
  {
    id: 'tx-304',
    transactionReference: 'YOUPI_TX_20261031_552194',
    workspaceId: 'ws-106',
    workspaceName: 'Royal Sweets & Savouries',
    customerEmail: 'harpreet@royalsweets.in',
    amountInr: 22490.00, // 24990 - 2500 (FESTIVE2500)
    currency: 'INR',
    provider: 'youpi_pg',
    status: 'verified_success',
    planId: 'business',
    couponRedemptionId: 'red-403',
    couponCode: 'FESTIVE2500',
    verifiedAt: '2026-10-31T14:40:12Z',
    createdAt: '2026-10-31T14:39:20Z'
  },
  {
    id: 'tx-305',
    transactionReference: 'YOUPI_TX_20261030_441092',
    workspaceId: 'ws-108',
    workspaceName: 'Deccan Organics Hub',
    customerEmail: 'anita.rao@deccanorganics.co.in',
    amountInr: 2499.00,
    currency: 'INR',
    provider: 'youpi_pg',
    status: 'verified_success',
    planId: 'business',
    verifiedAt: '2026-10-30T16:10:05Z',
    createdAt: '2026-10-30T16:09:15Z'
  },
  {
    id: 'tx-306',
    transactionReference: 'YOUPI_TX_20261029_332190',
    workspaceId: 'ws-102',
    workspaceName: 'Zenith Hypermarkets LLP',
    customerEmail: 'priya@zenithhyper.com',
    amountInr: 79990.00,
    currency: 'INR',
    provider: 'youpi_pg',
    status: 'verified_success',
    planId: 'growth',
    verifiedAt: '2026-10-29T12:00:22Z',
    createdAt: '2026-10-29T11:59:45Z'
  },
  {
    id: 'tx-307',
    transactionReference: 'YOUPI_TX_20261028_221084',
    workspaceId: 'ws-107',
    workspaceName: 'Omkar Pharma & Surgical Distributors',
    customerEmail: 'ramesh.patel@omkarpharma.com',
    amountInr: 24990.00,
    currency: 'INR',
    provider: 'youpi_pg',
    status: 'refunded',
    planId: 'business',
    errorMessage: 'Statutory refund issued following administrative license revocation',
    verifiedAt: '2026-09-30T10:05:00Z',
    createdAt: '2026-09-30T10:00:00Z'
  },
  {
    id: 'tx-308',
    transactionReference: 'YOUPI_TX_20261027_119034',
    workspaceId: 'ws-103',
    workspaceName: 'Kaveri Provisions & FMCG',
    customerEmail: 'ramanathan@kaveriprovisions.in',
    amountInr: 450.00, // Intentional amount mismatch test record
    currency: 'INR',
    provider: 'youpi_pg',
    status: 'failed',
    planId: 'starter',
    errorMessage: 'AMOUNT_MISMATCH: Paid amount ₹450.00 does not match final payable ₹999.00',
    createdAt: '2026-10-27T15:20:11Z'
  },
  {
    id: 'tx-309',
    transactionReference: 'YOUPI_TX_20261026_998124',
    workspaceId: 'ws-105',
    workspaceName: 'BlueSky Hardware Supplies',
    customerEmail: 'amitabh@blueskyhardware.com',
    amountInr: 4498.00,
    currency: 'INR',
    provider: 'youpi_pg',
    status: 'failed',
    planId: 'starter_mobile',
    errorMessage: 'PAYMENT_AUTHORIZED_AFTER_RESERVATION_EXPIRY: Reservation expired 15m prior to gateway capture',
    supportReviewRequired: true,
    createdAt: '2026-10-26T17:45:00Z'
  }
];

export const mockReconciliationSummary = {
  totalProcessedCount: 428,
  totalSuccessVolumeInr: 4825900.00,
  totalFailedVolumeInr: 124900.00,
  totalRefundedVolumeInr: 34990.00,
  successRatePercent: 96.2,
  averageTicketSizeInr: 11275.00,
  settledWithProvider: true,
  lastReconciliationRun: '2026-11-01T00:00:00Z',
  unreconciledCount: 0
};

