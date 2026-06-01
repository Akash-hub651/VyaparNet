import { Injectable, BadRequestException } from '@nestjs/common';
import { ProductStatus } from '@vyaparnet/database';

export class InvalidProductTransitionException extends BadRequestException {
  constructor(
    public readonly transition: {
      from: ProductStatus;
      to: ProductStatus;
      allowedNext: ProductStatus[];
    },
  ) {
    super(
      `Invalid status transition from ${transition.from} to ${transition.to}. Allowed transitions: ${transition.allowedNext.join(', ')}`,
    );
  }
}

@Injectable()
export class ProductStateMachineService {
  /**
   * Defines the valid state transitions for a Product.
   * Based on standard approval flows:
   * DRAFT -> PENDING_APPROVAL -> APPROVED (ACTIVE) | REJECTED
   * ACTIVE -> ARCHIVED
   * REJECTED -> DRAFT | ARCHIVED
   */
  private readonly VALID_TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
    [ProductStatus.DRAFT]: [
      ProductStatus.PENDING_APPROVAL,
      ProductStatus.ARCHIVED,
    ],
    [ProductStatus.PENDING_APPROVAL]: [
      ProductStatus.ACTIVE,
      ProductStatus.REJECTED,
    ],
    [ProductStatus.ACTIVE]: [
      ProductStatus.ARCHIVED,
      ProductStatus.PENDING_APPROVAL,
    ],
    [ProductStatus.REJECTED]: [ProductStatus.DRAFT, ProductStatus.ARCHIVED],
    [ProductStatus.ARCHIVED]: [], // Terminal state (usually)
  };

  /**
   * Validates if a transition from one status to another is legally allowed.
   * Throws InvalidProductTransitionException if invalid.
   */
  public validateTransition(from: ProductStatus, to: ProductStatus): void {
    const allowedNext = this.VALID_TRANSITIONS[from];

    if (!allowedNext || !allowedNext.includes(to)) {
      throw new InvalidProductTransitionException({
        from,
        to,
        allowedNext: allowedNext || [],
      });
    }
  }
}
