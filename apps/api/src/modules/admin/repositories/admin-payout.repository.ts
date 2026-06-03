import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PayoutStatus } from '@vyaparnet/database';
import type { AdminPayoutListQuery } from '@vyaparnet/types';

// ─── Payout list item (no buyer PII — seller-facing financial data) ──────────

export interface PayoutListItem {
  id: string;
  orderId: string;
  sellerId: string; // User.id — H-P0-3
  sellerName: string | null;
  grossAmount: string;
  platformFee: string;
  paymentGatewayFee: string;
  tdsAmount: string;
  netPayout: string;
  status: PayoutStatus;
  utrNumber: string | null;
  transferDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutListResult {
  data: PayoutListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ─── Payout detail ────────────────────────────────────────────────────────────

export type PayoutDetail = PayoutListItem;

/**
 * AdminPayoutRepository — Step 8.1.
 *
 * Provides:
 *  - findMany(filter)   → cursor-paginated SellerPayout list (no buyer PII)
 *  - findById(id)       → SellerPayout detail
 *  - initiateById(id, tx) → status=INITIATED (atomic with AuditLog in service)
 *
 * FOOTGUN-8-C: All monetary values returned as .toFixed(2) strings — Decimal throughout.
 * FOOTGUN-8-D: SellerPayout.orderId has @@index — NOT @@unique (verified in schema).
 * INV-S7-15: Never rely on orderId uniqueness in payout queries.
 *
 * H-P0-3: SellerPayout.sellerId = User.id (set correctly in Phase 6 via Business.ownerId).
 *
 * Authority: §23 Phase 8, Step 8.1.
 */
@Injectable()
export class AdminPayoutRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── findMany ──────────────────────────────────────────────────────────────

  /**
   * findMany — cursor-paginated payout list.
   * Filters: status, sellerId (User.id).
   * Sorted by: createdAt DESC (newest first).
   * FOOTGUN-8-C: Decimal amounts serialized to strings.
   */
  async findMany(filter: AdminPayoutListQuery): Promise<PayoutListResult> {
    const limit = filter.limit ?? 20;

    const payouts = await this.prisma.sellerPayout.findMany({
      where: {
        ...(filter.status ? { status: filter.status as PayoutStatus } : {}),
        ...(filter.sellerId ? { sellerId: filter.sellerId } : {}),
      },
      include: {
        seller: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });

    const hasMore = payouts.length > limit;
    const items = hasMore ? payouts.slice(0, limit) : payouts;

    return {
      data: items.map((p) => this.toListItem(p)),
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  // ─── findById ─────────────────────────────────────────────────────────────

  /**
   * findById — single payout detail.
   * Returns null if not found.
   */
  async findById(id: string): Promise<PayoutDetail | null> {
    const payout = await this.prisma.sellerPayout.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, name: true } },
      },
    });
    if (!payout) return null;
    return this.toListItem(payout);
  }

  // ─── initiateById ─────────────────────────────────────────────────────────

  /**
   * initiateById — atomically sets SellerPayout.status = INITIATED.
   * Must be called INSIDE the caller's $transaction (INV-S7-35 principle).
   * Only transitions from PENDING → INITIATED are valid.
   *
   * FOOTGUN-8-B: Payout status update MUST be atomic with AuditLog write.
   * The service calls this inside $transaction, then safeWrite() outside.
   */
  async initiateById(
    id: string,
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  ): Promise<void> {
    await tx.sellerPayout.update({
      where: { id },
      data: {
        status: PayoutStatus.INITIATED,
      },
    });
  }

  // ─── updateStatus (Phase 3) ───────────────────────────────────────────────

  async updateStatus(
    id: string,
    status: PayoutStatus,
    tx?: import('@vyaparnet/database').Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.sellerPayout.update({
      where: { id },
      data: { status },
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private toListItem(payout: {
    id: string;
    orderId: string;
    sellerId: string;
    seller?: { id: string; name: string | null } | null;
    grossAmount: { toFixed: (dp: number) => string };
    platformFee: { toFixed: (dp: number) => string };
    paymentGatewayFee: { toFixed: (dp: number) => string };
    tdsAmount: { toFixed: (dp: number) => string };
    netPayout: { toFixed: (dp: number) => string };
    status: PayoutStatus;
    utrNumber: string | null;
    transferDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): PayoutListItem {
    return {
      id: payout.id,
      orderId: payout.orderId,
      sellerId: payout.sellerId, // User.id (H-P0-3 — set correctly in Phase 6)
      sellerName: payout.seller?.name ?? null,
      // FOOTGUN-8-C: Use Decimal.toFixed(2) — never JS float arithmetic
      grossAmount: payout.grossAmount.toFixed(2),
      platformFee: payout.platformFee.toFixed(2),
      paymentGatewayFee: payout.paymentGatewayFee.toFixed(2),
      tdsAmount: payout.tdsAmount.toFixed(2),
      netPayout: payout.netPayout.toFixed(2),
      status: payout.status,
      utrNumber: payout.utrNumber,
      transferDate: payout.transferDate?.toISOString() ?? null,
      createdAt: payout.createdAt.toISOString(),
      updatedAt: payout.updatedAt.toISOString(),
    };
  }
}
