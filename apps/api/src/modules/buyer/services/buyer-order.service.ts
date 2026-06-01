import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import {
  BuyerOrderRepository,
  BuyerOrderDetailShape,
} from '../repositories/buyer-order.repository';
import { InventoryService } from '../../inventory/inventory.service';
import { OrderStatus } from '@vyaparnet/database';
import { formatYearMonth } from '../../order/order-state-machine';

@Injectable()
export class BuyerOrderService {
  private readonly logger = new Logger(BuyerOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly buyerOrderRepo: BuyerOrderRepository,
    private readonly inventoryService: InventoryService,
  ) {}

  async getOrders(
    buyerId: string,
    filter: { status?: OrderStatus; cursor?: string; limit: number },
  ) {
    return this.buyerOrderRepo.findManyForBuyer(buyerId, filter);
  }

  async getOrder(
    orderId: string,
    buyerId: string,
  ): Promise<BuyerOrderDetailShape> {
    return this.buyerOrderRepo.findByIdForBuyer(orderId, buyerId);
  }

  async cancelOrder(
    orderId: string,
    buyerId: string,
    reason: string,
  ): Promise<{ id: string; status: string }> {
    const order = await this.buyerOrderRepo.findByIdForBuyer(orderId, buyerId);

    if (order.status === 'CANCELLED' || order.status === 'COMPLETED') {
      throw new UnprocessableEntityException({
        code: 'ORDER_ALREADY_TERMINAL',
      });
    }

    if (order.status === 'CONFIRMED') {
      // 2-hour grace window after confirmation (INV-S5-24)
      // confirmedAt is ISO8601 string from typed repo — parse to ms for comparison
      const gracePeriodMs = 2 * 60 * 60 * 1000; // 2 hours
      const confirmedAtMs = order.confirmedAt
        ? new Date(order.confirmedAt).getTime()
        : 0;
      if (Date.now() > confirmedAtMs + gracePeriodMs) {
        throw new UnprocessableEntityException({
          code: 'CANCELLATION_WINDOW_EXPIRED',
        });
      }
    }

    if (order.status === 'SHIPPED' || order.status === 'PROCESSING') {
      throw new UnprocessableEntityException({
        code: 'ORDER_TOO_FAR_IN_FULFILLMENT',
      });
    }

    // Valid — proceed with cancellation inside $transaction (INV-S5-39: timeout required)
    const updated = await this.prisma.$transaction(
      async (tx) => {
        const u = await tx.order.update({
          where: { id: orderId },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
          select: { id: true, status: true },
        });
        await tx.orderStatusHistory.create({
          // INV-13: APPEND-ONLY
          data: {
            orderId,
            statusFrom: order.status as any,
            statusTo: 'CANCELLED',
            actorId: buyerId,
            actorRole: 'BUYER' as any, // INV-S5-22: SystemActorType.BUYER — DB enum extended in Sprint 5 migration
            reason,
            historyMonth: formatYearMonth(new Date()),
            timestamp: new Date(),
          },
        });
        await tx.eventOutbox.create({
          // INV-S5-8: inside $transaction
          data: {
            eventType: 'OrderStatusChanged',
            eventVersion: '1.0', // INV-20
            schemaVersion: '5.0', // INV-S5-23
            deduplicationKey: `order-status-changed-${orderId}-CANCELLED`, // INV-17
            payload: {
              orderId,
              orderNumber: order.orderNumber,
              buyerId,
              sellerId: order.sellerId,
              segment: order.segment,
              statusFrom: order.status,
              statusTo: 'CANCELLED',
              actorId: buyerId,
              actorRole: 'BUYER',
              timestamp: new Date().toISOString(),
            },
            eventMonth: formatYearMonth(new Date()),
            status: 'PENDING',
          },
        });
        return u;
      },
      { timeout: 5000 },
    ); // INV-S5-39

    // MANDATORY POST-TX: Release inventory reservation (INV-S5-34)
    // This MUST happen AFTER $transaction commits — NEVER inside (Sprint 3 INV-3)
    // Only release if order was PLACED/CONFIRMED (has an active reservation)
    if (order.status === 'PLACED' || order.status === 'CONFIRMED') {
      try {
        // AUDIT-S5-2: Sprint 3 contract — releaseAllForOrder(orderId, reason, actorId)
        // InventoryService.releaseAllForOrder() is idempotent (INV-S5-41)
        await this.inventoryService.releaseAllForOrder(
          orderId,
          'ORDER_CANCELLED',
          buyerId,
        );
      } catch (releaseErr) {
        // Log CRITICAL — inventory stuck reserved. Ops must investigate.
        this.logger.error(
          { orderId, buyerId, error: (releaseErr as Error).message },
          'INVENTORY_RELEASE_FAILED_AFTER_CANCEL',
        );
        // Do NOT re-throw — order is already CANCELLED. Release failure is ops concern.
      }
    }

    return updated;
  }
}
