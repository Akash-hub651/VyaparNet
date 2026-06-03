import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import {
  AdminPayoutRepository,
  type PayoutListItem,
  type PayoutListResult,
} from '../repositories/admin-payout.repository';
import { AdminMetricsService } from './admin-metrics.service';
import { Prisma, PayoutStatus } from '@vyaparnet/database';
import {
  AuditAction,
  SystemActorType,
  type AdminPayoutListQuery,
} from '@vyaparnet/types';
import type { Request } from 'express';

/**
 * AdminPayoutService — Step 8.2.
 *
 * Provides:
 *  - getPayoutList(filter)              → paginated payout list (delegates to repo)
 *  - getPayoutDetail(id)               → single payout detail
 *  - initiatePayout(id, adminId, req)  → PENDING → INITIATED (atomic write + audit)
 *
 * FOOTGUN-8-A: Commission rates come from FeatureFlag (calculatePayoutInsideTx is in Phase 6
 *   AdminOrderService — payout CREATION happens there, not here).
 *
 * FOOTGUN-8-B: SellerPayout status update (INITIATED) is inside $transaction;
 *   AuditLog.safeWrite() is outside $transaction (INV-S7-2).
 *
 * FOOTGUN-8-C: No floating-point arithmetic. Decimal comparisons in repo.
 *
 * FOOTGUN-8-D: SellerPayout.orderId = @@index (NOT @@unique) — multiple payouts per order
 *   in theory possible (retry scenarios). Never assume uniqueness.
 *
 * Authority: §23 Phase 8, Step 8.2.
 */
@Injectable()
export class AdminPayoutService {
  private readonly logger = new Logger(AdminPayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payoutRepo: AdminPayoutRepository,
    private readonly auditWriter: AuditSafeWriterService,
    private readonly metrics: AdminMetricsService,
  ) {}

  // ─── calculatePayoutInsideTx ─────────────────────────────────────────────

  /**
   * calculatePayoutInsideTx — Step 8.2 (spec §23).
   * Called from AdminOrderService.markCompleted() INSIDE $transaction.
   *
   * H-P1-9: Rates are pre-fetched by caller BEFORE $transaction and passed here.
   *         Never call getFlagValue() or any Redis/DB inside this method.
   *
   * INV-S7-35: SellerPayout INSIDE same $transaction as COMPLETED status update.
   * H-P0-3: order.sellerId = Business.id → resolve Business.ownerId for SellerPayout.sellerId.
   * FOOTGUN-8-C: All arithmetic uses Prisma.Decimal — NEVER JavaScript parseFloat()/multiplication.
   * FOOTGUN-8-A: Rates passed from caller who read from FeatureFlag (not hardcoded here).
   */
  async calculatePayoutInsideTx(
    orderId: string,
    order: {
      sellerId: string;
      grandTotal: Prisma.Decimal | string;
      segment: string | null;
    },
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    rates: {
      commissionPercent: number;
      tdsRatePercent: number;
      gatewayFeePercent: number;
    },
  ): Promise<void> {
    const { commissionPercent, tdsRatePercent, gatewayFeePercent } = rates;

    // FOOTGUN-8-C: All arithmetic via Prisma.Decimal — never JS float
    const grossAmount = new Prisma.Decimal(order.grandTotal.toString());
    const platformFee = grossAmount.mul(
      new Prisma.Decimal(commissionPercent).div(100),
    );
    const gatewayFee = grossAmount.mul(
      new Prisma.Decimal(gatewayFeePercent).div(100),
    );
    // TDS calculated on net-of-commission amount
    const tdsAmount = grossAmount
      .sub(platformFee)
      .mul(new Prisma.Decimal(tdsRatePercent).div(100));
    const netPayout = grossAmount
      .sub(platformFee)
      .sub(gatewayFee)
      .sub(tdsAmount);

    // INV-S7-35 / H-P0-3: Resolve Business.ownerId — order.sellerId = Business.id, NOT User.id
    const business = await tx.business.findUnique({
      where: { id: order.sellerId },
      select: { ownerId: true },
    });
    if (!business) {
      throw new Error(
        `Business not found for sellerId ${order.sellerId} — cannot create payout`,
      );
    }

    // Create SellerPayout (PENDING) — INSIDE $transaction (INV-S7-35)
    await tx.sellerPayout.create({
      data: {
        sellerId: business.ownerId, // H-P0-3: Business.ownerId = User.id
        orderId,
        grossAmount,
        platformFee,
        paymentGatewayFee: gatewayFee,
        tdsAmount,
        netPayout,
        status: PayoutStatus.PENDING,
      },
    });

    // Create PlatformCommission record — INSIDE $transaction
    await tx.platformCommission.create({
      data: {
        orderId,
        commissionPercent: new Prisma.Decimal(commissionPercent),
        commissionAmount: platformFee,
        category: order.segment,
      },
    });
  }

  /**
   * getPayoutList — delegates to AdminPayoutRepository.findMany().
   * No additional business logic — pure delegation.
   */
  async getPayoutList(filter: AdminPayoutListQuery): Promise<PayoutListResult> {
    return this.payoutRepo.findMany(filter);
  }

  // ─── getPayoutDetail ──────────────────────────────────────────────────────

  /**
   * getPayoutDetail — returns single payout or throws NotFoundException.
   */
  async getPayoutDetail(id: string): Promise<PayoutListItem> {
    const payout = await this.payoutRepo.findById(id);
    if (!payout) {
      throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', payoutId: id });
    }
    return payout;
  }

  // ─── initiatePayout ───────────────────────────────────────────────────────

  /**
   * initiatePayout — transitions SellerPayout from PENDING → INITIATED.
   *
   * State machine:
   *  - Only PENDING payouts may be initiated (UnprocessableEntityException if not PENDING)
   *  - Status update is ATOMIC inside $transaction (FOOTGUN-8-B)
   *  - AuditLog.safeWrite() called OUTSIDE $transaction (INV-S7-2)
   *
   * This does NOT trigger actual bank transfer — that is a downstream process.
   * INITIATED status signals "cleared for transfer processing".
   */
  async initiatePayout(
    id: string,
    adminUserId: string,
    req: Request,
  ): Promise<PayoutListItem> {
    // Step 1: Load existing payout (pre-tx guard)
    const existing = await this.payoutRepo.findById(id);
    if (!existing) {
      throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', payoutId: id });
    }

    // Step 2: Validate state — only PENDING may be initiated
    if (existing.status !== PayoutStatus.PENDING) {
      throw new UnprocessableEntityException({
        code: 'PAYOUT_NOT_INITIATABLE',
        message: `Payout ${id} is ${existing.status} — only PENDING payouts can be initiated.`,
        currentStatus: existing.status,
      });
    }

    // Step 3: Atomic status update (FOOTGUN-8-B: inside $transaction)
    await this.prisma.$transaction(async (tx) => {
      await this.payoutRepo.initiateById(id, tx);
    });

    // Step 4: Audit log OUTSIDE $transaction (INV-S7-2)
    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      actorRole: SystemActorType.ADMIN,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'SellerPayout',
      entityId: id,
      entityName: `Payout for Order ${existing.orderId}`,
      oldValue: { status: existing.status },
      newValue: { status: PayoutStatus.INITIATED },
      ipAddress: req.ip ?? 'unknown',
      userAgent: String(req.headers['user-agent'] ?? 'unknown'),
    });

    this.logger.log(
      { payoutId: id, orderId: existing.orderId, adminUserId },
      'PAYOUT_INITIATED',
    );

    // Return updated payout
    const updated = await this.payoutRepo.findById(id);

    // Increment Observability Metrics
    this.metrics.payoutInitiatedTotal.inc();
    this.metrics.payoutAmountInitiatedInr.inc(Number(updated!.grossAmount));

    return updated!;
  }

  // ─── Phase 3: hold, releaseHold, cancel, reverse ──────────────────────────

  async hold(
    id: string,
    adminUserId: string,
    req: Request,
  ): Promise<PayoutListItem> {
    const existing = await this.payoutRepo.findById(id);
    if (!existing)
      throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', payoutId: id });
    if (existing.status !== PayoutStatus.PENDING) {
      throw new UnprocessableEntityException(
        `Payout ${id} is ${existing.status} — only PENDING payouts can be held.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.payoutRepo.updateStatus(id, PayoutStatus.ON_HOLD, tx);
    });

    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      actorRole: SystemActorType.ADMIN,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'SellerPayout',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: PayoutStatus.ON_HOLD },
      ipAddress: req?.ip ?? 'unknown',
      userAgent: String(req?.headers?.['user-agent'] ?? 'unknown'),
    });

    return (await this.payoutRepo.findById(id))!;
  }

  async releaseHold(
    id: string,
    adminUserId: string,
    req: Request,
  ): Promise<PayoutListItem> {
    const existing = await this.payoutRepo.findById(id);
    if (!existing)
      throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', payoutId: id });
    if (existing.status !== PayoutStatus.ON_HOLD) {
      throw new UnprocessableEntityException(
        `Payout ${id} is ${existing.status} — only ON_HOLD payouts can be released.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.payoutRepo.updateStatus(id, PayoutStatus.PENDING, tx);
    });

    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      actorRole: SystemActorType.ADMIN,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'SellerPayout',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: PayoutStatus.PENDING },
      ipAddress: req?.ip ?? 'unknown',
      userAgent: String(req?.headers?.['user-agent'] ?? 'unknown'),
    });

    return (await this.payoutRepo.findById(id))!;
  }

  async cancel(
    id: string,
    adminUserId: string,
    req: Request,
  ): Promise<PayoutListItem> {
    const existing = await this.payoutRepo.findById(id);
    if (!existing)
      throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', payoutId: id });
    if (
      existing.status !== PayoutStatus.ON_HOLD &&
      existing.status !== PayoutStatus.PENDING
    ) {
      throw new UnprocessableEntityException(
        `Payout ${id} is ${existing.status} — cannot be cancelled.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.payoutRepo.updateStatus(id, PayoutStatus.CANCELLED, tx);
    });

    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      actorRole: SystemActorType.ADMIN,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'SellerPayout',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: PayoutStatus.CANCELLED },
      ipAddress: req?.ip ?? 'unknown',
      userAgent: String(req?.headers?.['user-agent'] ?? 'unknown'),
    });

    return (await this.payoutRepo.findById(id))!;
  }

  async reverse(
    id: string,
    adminUserId: string,
    req: Request,
    reversalReason: string,
  ): Promise<PayoutListItem> {
    const existing = await this.payoutRepo.findById(id);
    if (!existing)
      throw new NotFoundException({ code: 'PAYOUT_NOT_FOUND', payoutId: id });
    if (existing.status !== PayoutStatus.TRANSFERRED) {
      throw new UnprocessableEntityException(
        `Payout ${id} is ${existing.status} — only TRANSFERRED payouts can be reversed.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.payoutRepo.updateStatus(id, PayoutStatus.REVERSED, tx);
      // NOTE: Actual reversal logic (Ledger updates, Bank API) is out of Phase 3 scope
    });

    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      actorRole: SystemActorType.ADMIN,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'SellerPayout',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: PayoutStatus.REVERSED, reversalReason },
      ipAddress: req?.ip ?? 'unknown',
      userAgent: String(req?.headers?.['user-agent'] ?? 'unknown'),
    });

    return (await this.payoutRepo.findById(id))!;
  }
}
