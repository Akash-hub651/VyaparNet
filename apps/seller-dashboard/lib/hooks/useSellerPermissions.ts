'use client';

/**
 * useSellerPermissions — apps/seller-dashboard/lib/hooks/useSellerPermissions.ts
 *
 * Authority: seller_dashboard_architecture.md §10 (Permission Architecture)
 * Pattern: ARCH-REV-SD-12 + SD-13 RESOLVED
 *
 * RULES:
 * 1. ALL permission checks MUST go through this hook — NEVER inline user.business.kycStatus
 * 2. If business is null → ALL permissions default to MOST RESTRICTIVE (no silent failure)
 * 3. isSuspended = true → layout shows persistent banner AND action buttons disabled
 * 4. FRONTEND IS NOT THE AUTHORITY — backend enforces permissions via JWT + RolesGuard
 *    Frontend gates are UI hints only, not security boundaries
 *
 * Usage:
 *   const perms = useSellerPermissions();
 *   if (perms.businessMissing) return <BusinessMissingBanner />;
 *   if (perms.isSuspended) { ... } // Layout already handles banner
 *   const canQuote = perms.canSubmitRfqQuote;
 */

import { useAuth } from '../../app/contexts/auth.context';

/* ── TYPES ───────────────────────────────────────────────────── */
export type KycStatus = 'VERIFIED' | 'PENDING' | 'UNVERIFIED' | 'REJECTED';
export type BusinessStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' | string;

export interface SellerPermissions {
  /**
   * True when user.business is null/undefined.
   * Caller MUST show banner: "Aapka business profile nahi mila."
   */
  businessMissing: boolean;

  /** KYC status — use for UI gating only. Backend enforces the actual rule. */
  kycStatus: KycStatus | null;

  /** VERIFIED sellers can submit RFQ quotes (INV-S8-27) */
  canSubmitRfqQuote: boolean;

  /** Non-UNVERIFIED sellers can publish products (backend enforced) */
  canPublishProduct: boolean;

  /** VERIFIED + bank verified sellers can receive payouts */
  canReceivePayouts: boolean;

  /** True when KYC = PENDING — show banner prompting completion */
  isKycPending: boolean;

  /** True when KYC = UNVERIFIED — show banner prompting submission */
  isKycUnverified: boolean;

  /**
   * True when business.status = SUSPENDED.
   * layout.tsx shows persistent red banner.
   * ALL action buttons must be proactively disabled.
   * Read-only views (lists, detail) remain accessible.
   * Authority: ARCH-REV-SD-13 RESOLVED
   */
  isSuspended: boolean;
}

/* ── HELPER — safely extract business field ──────────────────── */
// UserProfileResponse may have business nested — handle both shapes
function getBusiness(user: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!user) return null;
  const biz = user['business'];
  if (typeof biz === 'object' && biz !== null) return biz as Record<string, unknown>;
  return null;
}

/* ── HOOK ────────────────────────────────────────────────────── */
export function useSellerPermissions(): SellerPermissions {
  const { user } = useAuth();
  const typedUser = user as unknown as Record<string, unknown> | null;
  const business = getBusiness(typedUser);

  // CRITICAL: Handle null business — all permissions MOST RESTRICTIVE
  // Authority: ARCH-REV-SD-12 RESOLVED
  if (!business) {
    return {
      businessMissing: true,
      kycStatus: null,
      canSubmitRfqQuote: false,
      canPublishProduct: false,
      canReceivePayouts: false,
      isKycPending: false,
      isKycUnverified: false,
      isSuspended: false,
    };
  }

  const kycStatus = (business['kycStatus'] as KycStatus) ?? 'UNVERIFIED';
  const bizStatus = (business['status'] as BusinessStatus) ?? 'ACTIVE';
  const bankVerified = Boolean(business['bankAccountVerified']);

  return {
    businessMissing: false,
    kycStatus,
    canSubmitRfqQuote: kycStatus === 'VERIFIED',
    canPublishProduct: kycStatus !== 'UNVERIFIED',
    canReceivePayouts: kycStatus === 'VERIFIED' && bankVerified,
    isKycPending: kycStatus === 'PENDING',
    isKycUnverified: kycStatus === 'UNVERIFIED',
    isSuspended: bizStatus === 'SUSPENDED',
  };
}
