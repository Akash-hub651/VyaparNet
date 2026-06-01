import { BadRequestException } from '@nestjs/common';
import { KycStatus } from '@vyaparnet/database';

/**
 * ADMIN_KYC_TRANSITIONS — pure constant defining valid KYC state transitions
 * available to admin actors only.
 *
 * GOVERNANCE (H-P1-4):
 *  - This constant MUST live in its own file (not inline in AdminKycService).
 *  - Exported for use in AdminKycService AND tests.
 *  - Admin transitions are distinct from seller-initiated transitions.
 *
 * Valid transitions:
 *  UNVERIFIED → PENDING   (seller uploads first doc — triggers PENDING)
 *  PENDING    → VERIFIED  (admin approves KYC)
 *  PENDING    → REJECTED  (admin rejects KYC)
 *  VERIFIED   → SUSPENDED (admin suspends business)
 *  SUSPENDED  → VERIFIED  (admin reactivates suspended business)
 *  REJECTED   → PENDING   (seller resubmits — triggers PENDING review)
 *
 * Authority: §18 Phase 3, H-P1-4.
 */
export const ADMIN_KYC_TRANSITIONS: Record<KycStatus, KycStatus[]> = {
  [KycStatus.UNVERIFIED]: [KycStatus.PENDING],
  [KycStatus.PENDING]: [KycStatus.VERIFIED, KycStatus.REJECTED],
  [KycStatus.VERIFIED]: [KycStatus.SUSPENDED],
  [KycStatus.SUSPENDED]: [KycStatus.VERIFIED],
  [KycStatus.REJECTED]: [KycStatus.PENDING],
};

/**
 * validateAdminKycTransition — pure function, throws BadRequestException
 * if the transition is not permitted.
 *
 * FOOTGUN-3-E avoidance: Always call this before any KYC status update.
 *
 * @param current - Current KycStatus of the Business
 * @param next    - Target KycStatus being requested
 * @throws BadRequestException with code INVALID_KYC_TRANSITION
 */
export function validateAdminKycTransition(
  current: KycStatus,
  next: KycStatus,
): void {
  const allowed = ADMIN_KYC_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw new BadRequestException({
      code: 'INVALID_KYC_TRANSITION',
      message: `Cannot transition KYC status from ${current} to ${next}`,
      from: current,
      to: next,
      allowed: allowed ?? [],
    });
  }
}
