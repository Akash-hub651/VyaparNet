import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { NotificationService } from '../../notification/services/notification.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import {
  AdminOrderRepository,
  OrderDetailDto,
  OrderListResponse,
} from '../repositories/admin-order.repository';
import { AdminPayoutService } from './admin-payout.service';
import {
  validateAdminTransition,
  formatYearMonth,
} from '../../order/order-state-machine';
import {
  AuditAction,
  type AdminOrderListQuery,
  type AdminCancelDto,
} from '@vyaparnet/types';
import {
  OrderStatus,
  EventStatus,
  SystemActorType,
} from '@vyaparnet/database';
import type { Request } from 'express';

/**
 * AdminOrderService — Order Management for Sprint 7 Phase 6.
 *
 * CRITICAL INVARIANTS:
 *  INV-S7-2:  safeWrite() ALWAYS outside $transaction
 *  INV-S7-3:  actorId = req.user.id (JWT only)
 *  INV-S7-6:  OrderStatusChanged uses schemaVersion '5.0' (existing handler)
 *  INV-S7-7:  Idempotency-Key on all PATCH routes
 *  INV-S7-13: validateAdminTransition() called BEFORE $transaction
 *  INV-S7-19: sendDirect() OUTSIDE $transaction
 *  INV-S7-25: No forbidden module imports
 *  INV-S7-35: SellerPayout INSIDE same $transaction as COMPLETED status update
 *  INV-S7-37: OrderStatusHistory.actorRole = SystemActorType.ADMIN
 *  INV-S7-38: eventMonth in all EventOutbox creates
 *
 * FOOTGUN avoidance:
 *  FOOTGUN-6-A: validateAdminTransition() — NEVER validateSellerTransition()
 *  FOOTGUN-6-B: OrderStatusHistory appended in every status change (via repo.updateStatus)
 *  FOOTGUN-6-C: actorRole = ADMIN in history (enforced in repo.updateStatus)
 *  FOOTGUN-6-D: SellerPayout INSIDE $transaction with COMPLETED update
 *  FOOTGUN-6-E: Buyer PII only returned from getOrderDetail — not in list
 *  FOOTGUN-6-F: Admin sees ALL orders — no seller scope restriction
 */
@Injectable()
export class AdminOrderService {
  private readonly logger = new Logger(AdminOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly auditWriter: AuditSafeWriterService,
    private readonly orderRepo: AdminOrderRepository,
    private readonly adminPayoutService: AdminPayoutService,
  ) {}

  // ─── GET /admin/orders ────────────────────────────────────────────────────

  /**
   * FOOTGUN-6-E: Returns OrderSummaryDto — NO buyer PII.
   * FOOTGUN-6-F: Admin sees ALL orders — no scope restriction.
   */
  async getOrderList(filter: AdminOrderListQuery): Promise<OrderListResponse> {
    return this.orderRepo.findMany(filter);
  }

  // ─── GET /admin/orders/:id ────────────────────────────────────────────────

  /**
   * Full order detail including buyer PII + status history.
   * FOOTGUN-6-E: Buyer PII ONLY here — findById includes phone/email.
   */
  async getOrderDetail(
    orderId: string,
    adminUserId: string,
    req: Request,
  ): Promise<OrderDetailDto> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    }

    // Audit log KYC-level detail access (consistent with INV-S7-33 spirit)
    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Order',
      entityId: orderId,
      entityName: order.orderNumber,
      oldValue: {},
      newValue: { action: 'ORDER_DETAIL_VIEWED' },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return order;
  }

  // ─── PATCH /admin/orders/:id/deliver ─────────────────────────────────────

  /**
   * Mark order DELIVERED: SHIPPED → DELIVERED.
   * FOOTGUN-6-A: validateAdminTransition (never validateSellerTransition).
   * INV-S7-6: OrderStatusChanged uses schemaVersion '5.0' (existing handler unchanged).
   */
  async markDelivered(
    orderId: string,
    adminUserId: string,
    idempotencyKey: string,
    req: Request,
  ): Promise<void> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    }

    // INV-S7-13 — FOOTGUN-6-A: validateAdminTransition BEFORE $transaction
    validateAdminTransition(order.status, OrderStatus.DELIVERED);

    const oldStatus = order.status;

    await this.prisma.$transaction(async (tx) => {
      // FOOTGUN-6-B: updateStatus writes history; FOOTGUN-6-C: actorRole=ADMIN (in repo)
      await this.orderRepo.updateStatus(
        orderId,
        oldStatus,
        OrderStatus.DELIVERED,
        adminUserId,
        tx,
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      );

      // INV-S7-6: OrderStatusChanged → schemaVersion '5.0' (existing Sprint 5 handler)
      // INV-S7-38: eventMonth REQUIRED
      await tx.eventOutbox.create({
        data: {
          eventType: 'OrderStatusChanged',
          payload: {
            orderId,
            orderNumber: order.orderNumber,
            buyerId: order.buyerId,
            sellerId: order.sellerId,
            segment: order.segment,
            statusFrom: oldStatus,
            statusTo: OrderStatus.DELIVERED,
            actorId: adminUserId,
            actorRole: SystemActorType.ADMIN,
            timestamp: new Date().toISOString(),
          },
          schemaVersion: '5.0', // INV-S7-6: OrderStatusChanged uses 5.0 (existing handler)
          eventVersion: '1.0',
          deduplicationKey: `OrderStatusChanged:${orderId}:${adminUserId}`, // INV-S7-28
          eventMonth: formatYearMonth(new Date()), // INV-S7-38 ⚠️ REQUIRED
          status: EventStatus.PENDING,
        },
      });
    });

    // OUTSIDE $transaction (after commit):
    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Order',
      entityId: orderId,
      entityName: order.orderNumber,
      oldValue: { status: oldStatus },
      newValue: { status: OrderStatus.DELIVERED },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await this.notificationService
      .sendDirect(order.buyerId, 'OrderDelivered_BUYER_hi', {
        orderNumber: order.orderNumber,
      })
      .catch((err: Error) => {
        this.logger.error(
          { orderId, err: err.message },
          'ORDER_DELIVERED_NOTIFICATION_FAILED',
        );
      });

    this.logger.log(
      {
        action: 'ORDER_DELIVERED',
        adminId: adminUserId,
        orderId,
        idempotencyKey,
      },
      'ADMIN_ORDER_DELIVERED',
    );
  }

  // ─── PATCH /admin/orders/:id/complete ────────────────────────────────────

  /**
   * Mark order COMPLETED: DELIVERED → COMPLETED.
   * INV-S7-35: SellerPayout INSIDE same $transaction as status update. (FOOTGUN-6-D)
   * sellerId resolution: order.sellerId = Business.id → resolve Business.ownerId.
   * Commission rates from FeatureFlag (INV-S7-14).
   */
  async markCompleted(
    orderId: string,
    adminUserId: string,
    idempotencyKey: string,
    req: Request,
  ): Promise<void> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    }

    // INV-S7-13: validateAdminTransition BEFORE $transaction (FOOTGUN-6-A)
    validateAdminTransition(order.status, OrderStatus.COMPLETED);

    const oldStatus = order.status;

    // Fetch commission rates from FeatureFlag (INV-S7-14: never hardcoded)
    const rates = await this.getCommissionRates();

    await this.prisma.$transaction(async (tx) => {
      // Step 1: Status update + history (FOOTGUN-6-B: history MANDATORY, FOOTGUN-6-C: ADMIN)
      await this.orderRepo.updateStatus(
        orderId,
        oldStatus,
        OrderStatus.COMPLETED,
        adminUserId,
        tx,
        {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      );

      // Step 2+3+4: Payout + PlatformCommission via AdminPayoutService (FOOTGUN-8-C: Decimal arithmetic)
      // H-P1-9: rates pre-fetched BEFORE $transaction (getCommissionRates() called above)
      await this.adminPayoutService.calculatePayoutInsideTx(
        orderId,
        { sellerId: order.sellerId, grandTotal: order.grandTotal, segment: order.segment },
        tx,
        rates,
      );

      // Step 5: EventOutbox — OrderStatusChanged (schemaVersion '5.0' — INV-S7-6)
      await tx.eventOutbox.create({
        data: {
          eventType: 'OrderStatusChanged',
          payload: {
            orderId,
            orderNumber: order.orderNumber,
            buyerId: order.buyerId,
            sellerId: order.sellerId,
            segment: order.segment,
            statusFrom: oldStatus,
            statusTo: OrderStatus.COMPLETED,
            actorId: adminUserId,
            actorRole: SystemActorType.ADMIN,
            timestamp: new Date().toISOString(),
          },
          schemaVersion: '5.0', // INV-S7-6: OrderStatusChanged ALWAYS uses 5.0
          eventVersion: '1.0',
          deduplicationKey: `OrderStatusChanged:${orderId}:${adminUserId}`, // INV-S7-28
          eventMonth: formatYearMonth(new Date()), // INV-S7-38 ⚠️ REQUIRED
          status: EventStatus.PENDING,
        },
      });
    });

    // OUTSIDE $transaction (after commit):
    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Order',
      entityId: orderId,
      entityName: order.orderNumber,
      oldValue: { status: oldStatus },
      newValue: { status: OrderStatus.COMPLETED },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await this.notificationService
      .sendDirect(order.buyerId, 'OrderCompleted_BUYER_hi', {
        orderNumber: order.orderNumber,
      })
      .catch((err: Error) => {
        this.logger.error(
          { orderId, err: err.message },
          'ORDER_COMPLETED_NOTIFICATION_FAILED',
        );
      });

    this.logger.log(
      {
        action: 'ORDER_COMPLETED',
        adminId: adminUserId,
        orderId,
        idempotencyKey,
      },
      'ADMIN_ORDER_COMPLETED',
    );
  }

  // ─── PATCH /admin/orders/:id/force-cancel ─────────────────────────────────

  /**
   * Force-cancel any non-terminal order.
   * validateAdminTransition enforces reason required for CANCELLED (FOOTGUN-6-A).
   */
  async forceCancel(
    orderId: string,
    dto: AdminCancelDto,
    adminUserId: string,
    idempotencyKey: string,
    req: Request,
  ): Promise<void> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    }

    // INV-S7-13: validateAdminTransition with reason (reason checked inside function)
    validateAdminTransition(order.status, OrderStatus.CANCELLED, dto.reason);

    const oldStatus = order.status;

    await this.prisma.$transaction(async (tx) => {
      await this.orderRepo.updateStatus(
        orderId,
        oldStatus,
        OrderStatus.CANCELLED,
        adminUserId,
        tx,
        {
          reason: dto.reason,
          cancellationReason: dto.reason,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      );

      await tx.eventOutbox.create({
        data: {
          eventType: 'OrderStatusChanged',
          payload: {
            orderId,
            orderNumber: order.orderNumber,
            buyerId: order.buyerId,
            sellerId: order.sellerId,
            segment: order.segment,
            statusFrom: oldStatus,
            statusTo: OrderStatus.CANCELLED,
            actorId: adminUserId,
            actorRole: SystemActorType.ADMIN,
            timestamp: new Date().toISOString(),
          },
          schemaVersion: '5.0', // INV-S7-6: OrderStatusChanged uses 5.0
          eventVersion: '1.0',
          deduplicationKey: `OrderStatusChanged:${orderId}:${adminUserId}:CANCEL`, // INV-S7-28
          eventMonth: formatYearMonth(new Date()), // INV-S7-38 ⚠️ REQUIRED
          status: EventStatus.PENDING,
        },
      });
    });

    // OUTSIDE $transaction:
    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Order',
      entityId: orderId,
      entityName: order.orderNumber,
      oldValue: { status: oldStatus },
      newValue: { status: OrderStatus.CANCELLED, reason: dto.reason },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await this.notificationService
      .sendDirect(order.buyerId, 'OrderCancelled_BUYER_hi', {
        orderNumber: order.orderNumber,
        reason: dto.reason,
      })
      .catch((err: Error) => {
        this.logger.error(
          { orderId, err: err.message },
          'ORDER_CANCELLED_NOTIFICATION_FAILED',
        );
      });

    this.logger.log(
      {
        action: 'ORDER_FORCE_CANCELLED',
        adminId: adminUserId,
        orderId,
        reason: dto.reason,
        idempotencyKey,
      },
      'ADMIN_ORDER_FORCE_CANCELLED',
    );
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Fetch commission rates from FeatureFlag (INV-S7-14: NEVER hardcoded).
   * Falls back to spec defaults if flag not found.
   * INV-S7-34: Exception center data is NOT cached. Rates use TTL-based flag cache.
   */
  private async getCommissionRates(): Promise<{
    commissionPercent: number;
    tdsRatePercent: number;
    gatewayFeePercent: number;
  }> {
    const flags = await this.prisma.featureFlag.findMany({
      where: {
        name: {
          in: [
            'platform_commission_percent',
            'tds_rate_percent',
            'payment_gateway_fee_percent',
          ],
        },
        env: 'production',
      },
    });

    const flagMap = new Map(flags.map((f) => [f.name, f.rolloutPercent]));

    return {
      commissionPercent: flagMap.get('platform_commission_percent') ?? 2, // INV-S7-14 default
      tdsRatePercent: flagMap.get('tds_rate_percent') ?? 1, // INV-S7-14 default
      gatewayFeePercent: flagMap.get('payment_gateway_fee_percent') ?? 2, // INV-S7-14 default
    };
  }
}
