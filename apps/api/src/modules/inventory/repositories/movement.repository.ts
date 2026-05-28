// APPEND-ONLY: This repository has no update or delete methods by design.
// Inventory movement history is an immutable audit log.
//
// Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §0 INV-7, §33.4 RULE 2, §7.3 rule 5
//
// ANY agent adding update() or delete() to this file has violated INV-7.
// InventoryMovement records are forensic evidence — they must never be modified.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  InventoryMovement,
  InventoryMovementType,
} from '@vyaparnet/database';

/** Tx client type for $transaction callbacks. §3.3 */
type PrismaTx = Omit<
  PrismaService,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/** Input for creating an inventory movement record. */
export interface CreateMovementInput {
  inventoryId: string;
  type: InventoryMovementType;
  quantity: number;
  orderId?: string;
  returnId?: string;
  reason?: string;
  createdBy?: string;
}

/**
 * MovementRepository — APPEND-ONLY repository for InventoryMovement audit log.
 *
 * Authority: SPRINT3_EXECUTION_LOCK_FINAL.md §0 INV-7, §33.4 RULE 2
 *
 * INVARIANTS (violation = architectural invalidity):
 *  - ZERO update() or delete() methods — ever. (INV-7, WARNING 9)
 *  - create() MUST be called inside $transaction with tx (INV-3, WARNING 12)
 *  - All findMany() have explicit take and orderBy — NO unbounded queries (§33.4 RULE 6)
 *
 * AI-AGENT WARNINGS (§34):
 *  - WARNING 9: NO update method may ever be added to this file
 *  - WARNING 12: create() inside $transaction MUST receive tx argument
 */
@Injectable()
export class MovementRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an inventory movement record — MUST be called inside $transaction.
   *
   * This is the audit trail for every stock change. (INV-7, INV-3)
   * Every quantity mutation MUST have a corresponding movement. (§7.3 rule 5)
   *
   * @param tx — Prisma transaction client. MANDATORY. Never call without tx. (WARNING 12)
   */
  async create(
    input: CreateMovementInput,
    tx: PrismaTx,
  ): Promise<InventoryMovement> {
    return tx.inventoryMovement.create({
      data: {
        inventoryId: input.inventoryId,
        type: input.type,
        quantity: input.quantity,
        orderId: input.orderId,
        returnId: input.returnId,
        reason: input.reason,
        createdBy: input.createdBy,
      },
    });
  }

  /**
   * Find movements for an inventory record.
   * Bounded by take and orderBy — NO unbounded queries. (§33.4 RULE 6)
   */
  async findMany(params: {
    inventoryId: string;
    take: number;
    cursor?: string;
    types?: InventoryMovementType[];
  }): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: {
        inventoryId: params.inventoryId,
        ...(params.types ? { type: { in: params.types } } : {}),
      },
      take: params.take,
      skip: params.cursor ? 1 : 0,
      ...(params.cursor ? { cursor: { id: params.cursor } } : {}),
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find movements since a given date for reconciliation. (§16.1)
   * Used by incremental reconciliation — bounded cursor pagination. (WARNING 13)
   */
  async findSince(params: {
    inventoryId: string;
    since: Date;
    take: number;
  }): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: {
        inventoryId: params.inventoryId,
        createdAt: { gt: params.since },
      },
      take: params.take,
      orderBy: { createdAt: 'asc' },
    });
  }
}
