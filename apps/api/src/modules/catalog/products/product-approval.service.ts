import { Injectable, Logger } from '@nestjs/common';
import { SegmentApprovalPolicyRepository } from './segment-approval-policy.repository';
import {
  Segment,
  SegmentApprovalPolicy,
  ProductStatus,
  ApprovalPolicyType,
  Business,
  UserRole,
} from '@vyaparnet/database';
import { CatalogMetrics } from '../catalog-metrics.service';

@Injectable()
export class ProductApprovalService {
  private readonly logger = new Logger(ProductApprovalService.name);

  constructor(
    private readonly policyRepository: SegmentApprovalPolicyRepository,
    private readonly metrics: CatalogMetrics,
  ) {}

  /**
   * Retrieves the approval policy for a segment.
   */
  async getPolicy(segment: Segment): Promise<SegmentApprovalPolicy | null> {
    return this.policyRepository.findBySegment(segment);
  }

  /**
   * Determines the initial status of a product upon publishing.
   */
  async determineInitialStatus(
    business: Pick<Business, 'trustScore'>,
    userRole: UserRole,
    segment: Segment,
  ): Promise<ProductStatus> {
    // 1. Admins and SELLER_MANAGERs skip approval
    if (userRole === UserRole.ADMIN || userRole === UserRole.SELLER_MANAGER) {
      return ProductStatus.ACTIVE;
    }

    const policy = await this.getPolicy(segment);

    // 2. Safe default if no policy defined
    if (!policy) {
      this.logger.warn(
        `No approval policy found for segment: ${segment}. Falling back to MANUAL_REVIEW (PENDING_APPROVAL).`,
      );
      this.metrics.approvalPolicyType(
        segment,
        ApprovalPolicyType.MANUAL_REVIEW,
      );
      return ProductStatus.PENDING_APPROVAL;
    }

    // 3. Auto-approve based on trust score
    if (
      policy.policyType === ApprovalPolicyType.AUTO_APPROVE &&
      business.trustScore >= policy.minTrustScore
    ) {
      this.metrics.approvalPolicyType(segment, policy.policyType);
      return ProductStatus.ACTIVE;
    }

    // 4. Default to pending approval
    this.metrics.approvalPolicyType(segment, policy.policyType);
    return ProductStatus.PENDING_APPROVAL;
  }
}
