import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { NotificationService } from '../../notification/services/notification.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { AdminMetricsService } from './admin-metrics.service';
import {
  AdminProductRepository,
  ProductDetailDto,
  ProductListResponse,
} from '../repositories/admin-product.repository';
import {
  ProductStateMachineService,
  InvalidProductTransitionException,
} from '../../catalog/products/product-state-machine.service';
import { formatYearMonth } from '../../order/order-state-machine';
import {
  AuditAction,
  type AdminProductListQuery,
  type RejectProductDto,
  type BulkApproveDto,
} from '@vyaparnet/types';
import { ProductStatus, EventStatus } from '@vyaparnet/database';
import type { Request } from 'express';

export interface BulkApproveResult {
  approved: string[];
  failed: Array<{ productId: string; reason: string }>;
  total: number;
}

/**
 * AdminProductService — Product approval workflow for Sprint 7 Phase 4.
 *
 * CRITICAL INVARIANTS:
 *  INV-S7-2:  safeWrite() ALWAYS outside $transaction
 *  INV-S7-3:  actorId = req.user.id (JWT only — NEVER body/param)
 *  INV-S7-6:  schemaVersion: '7.0', eventVersion: '1.0' on all new events
 *  INV-S7-7:  Idempotency key stored AFTER $transaction commit
 *  INV-S7-19: sendDirect() OUTSIDE $transaction
 *  INV-S7-20: bulkApprove batch capped at 100 (enforced in Zod schema + service)
 *  INV-S7-21: ProductStateMachineService.validateTransition() MUST be called before any status change
 *  INV-S7-28: deduplicationKey = {eventType}:{entityId}:{adminUserId}
 *  INV-S7-38: eventMonth = formatYearMonth(new Date()) in ALL EventOutbox creates
 *
 * FOOTGUN avoidance:
 *  FOOTGUN-4-A: validateTransition() called for EACH product in bulk (not skipped)
 *  FOOTGUN-4-B: EventOutbox create is INSIDE $transaction (not outside)
 *  FOOTGUN-4-C: approvedBy always from adminUserId (JWT), never body
 *  FOOTGUN-4-D: bulkApprove failure per-product is non-fatal (partial success)
 *  FOOTGUN-4-E: ProductStateMachineService instantiated directly — no CatalogModule import (INV-S7-25)
 */
@Injectable()
export class AdminProductService {
  private readonly logger = new Logger(AdminProductService.name);

  /**
   * FOOTGUN-4-E: ProductStateMachineService is instantiated here directly.
   * We MUST NOT import CatalogModule in AdminModule (INV-S7-25).
   * ProductStateMachineService has NO constructor dependencies — it's a pure
   * function container and is safe to new-up directly.
   */
  private readonly productStateMachine = new ProductStateMachineService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notificationService: NotificationService,
    private readonly auditWriter: AuditSafeWriterService,
    private readonly productRepo: AdminProductRepository,
    private readonly metrics: AdminMetricsService,
  ) {}

  // ─── GET /admin/products ─────────────────────────────────────────────────────

  async getProductList(
    filter: AdminProductListQuery,
  ): Promise<ProductListResponse> {
    return this.productRepo.findMany(filter);
  }

  // ─── GET /admin/products/:id ─────────────────────────────────────────────────

  async getProductDetail(productId: string): Promise<ProductDetailDto> {
    const product = await this.productRepo.findById(productId);
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    }
    return product;
  }

  // ─── PATCH /admin/products/:id/approve ───────────────────────────────────────

  /**
   * Approves a product: PENDING_APPROVAL → ACTIVE.
   * INV-S7-21: ProductStateMachineService.validateTransition() called FIRST (before $tx).
   * FOOTGUN-4-B: EventOutbox INSIDE $transaction.
   * INV-S7-2: safeWrite() OUTSIDE $transaction.
   * INV-S7-19: sendDirect() OUTSIDE $transaction.
   */
  async approveProduct(
    productId: string,
    adminUserId: string,
    idempotencyKey: string,
    req: Request,
  ): Promise<ProductDetailDto> {
    const product = await this.productRepo.findById(productId);
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    }

    // INV-S7-21: validate via state machine BEFORE $transaction (FOOTGUN-4-A avoidance)
    this.productStateMachine.validateTransition(
      product.status,
      ProductStatus.ACTIVE,
    );

    const oldStatus = product.status;

    // ── $TRANSACTION: status update + EventOutbox ─────────────────────────────
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          status: ProductStatus.ACTIVE,
          approvedBy: adminUserId, // INV-S7-3: from JWT, never body (FOOTGUN-4-C)
          approvedAt: new Date(),
        },
      });

      // INV-S7-6: schemaVersion '7.0', eventVersion '1.0'
      // INV-S7-28: deduplicationKey = {eventType}:{entityId}:{adminUserId}
      // INV-S7-38: eventMonth REQUIRED — non-nullable
      await tx.eventOutbox.create({
        data: {
          eventType: 'ProductApproved',
          payload: {
            productId,
            productName: product.name,
            businessId: product.businessId,
            sellerUserId: product.sellerUserId, // Business.ownerId
            segment: product.segment,
            adminUserId,
          },
          schemaVersion: '7.0',
          eventVersion: '1.0',
          deduplicationKey: `ProductApproved:${productId}:${adminUserId}`,
          eventMonth: formatYearMonth(new Date()), // INV-S7-38 ⚠️ REQUIRED
          status: EventStatus.PENDING,
        },
      });
      // NOTE: safeWrite() is NOT called inside $transaction (INV-S7-2, H-P0-1)
    });

    // ── OUTSIDE $transaction (after commit) ───────────────────────────────────

    // INV-S7-7: Store idempotency key result (best-effort, non-fatal)
    await this.redis
      .set(
        `admin-idem:${idempotencyKey}`,
        JSON.stringify({ productId, status: ProductStatus.ACTIVE }),
        'EX',
        86400,
      )
      .catch((err: Error) => {
        this.logger.warn(
          { idempotencyKey, err: err.message },
          'ADMIN_IDEM_REDIS_STORE_FAILED',
        );
      });

    // INV-S7-2: AuditLog OUTSIDE $transaction
    await this.auditWriter.safeWrite({
      actorId: adminUserId, // INV-S7-3: JWT only
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Product',
      entityId: productId,
      entityName: product.name,
      oldValue: { status: oldStatus },
      newValue: { status: ProductStatus.ACTIVE, approvedBy: adminUserId },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // INV-S7-19: sendDirect() OUTSIDE $transaction — failure is non-fatal
    await this.notificationService
      .sendDirect(product.sellerUserId, 'ProductApproved_SELLER_hi', {
        productName: product.name,
      })
      .catch((err: Error) => {
        this.logger.error(
          { productId, sellerUserId: product.sellerUserId, err: err.message },
          'PRODUCT_APPROVED_NOTIFICATION_FAILED',
        );
      });

    this.metrics.productApprovedTotal.inc({
      segment: product.segment,
      adminId: adminUserId,
    });
    this.logger.log(
      {
        action: 'PRODUCT_APPROVED',
        adminId: adminUserId,
        productId,
        status: ProductStatus.ACTIVE,
      },
      'ADMIN_PRODUCT_APPROVED',
    );

    const updated = await this.productRepo.findById(productId);
    return updated!;
  }

  // ─── PATCH /admin/products/:id/reject ────────────────────────────────────────

  /**
   * Rejects a product: PENDING_APPROVAL → REJECTED.
   * Note: Product model has no rejectionReason field — stored in AuditLog.newValue.
   * INV-S7-21: validate via state machine before $transaction.
   */
  async rejectProduct(
    productId: string,
    dto: RejectProductDto,
    adminUserId: string,
    idempotencyKey: string,
    req: Request,
  ): Promise<ProductDetailDto> {
    const product = await this.productRepo.findById(productId);
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    }

    // INV-S7-21: validate state machine BEFORE $transaction
    this.productStateMachine.validateTransition(
      product.status,
      ProductStatus.REJECTED,
    );

    const oldStatus = product.status;

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: { status: ProductStatus.REJECTED },
      });

      await tx.eventOutbox.create({
        data: {
          eventType: 'ProductRejected',
          payload: {
            productId,
            productName: product.name,
            businessId: product.businessId,
            sellerUserId: product.sellerUserId,
            rejectionReason: dto.reason,
            adminUserId,
          },
          schemaVersion: '7.0',
          eventVersion: '1.0',
          deduplicationKey: `ProductRejected:${productId}:${adminUserId}`,
          eventMonth: formatYearMonth(new Date()), // INV-S7-38
          status: EventStatus.PENDING,
        },
      });
    });

    // OUTSIDE $transaction:
    await this.redis
      .set(
        `admin-idem:${idempotencyKey}`,
        JSON.stringify({ productId, status: ProductStatus.REJECTED }),
        'EX',
        86400,
      )
      .catch((err: Error) => {
        this.logger.warn(
          { idempotencyKey, err: err.message },
          'ADMIN_IDEM_REDIS_STORE_FAILED',
        );
      });

    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Product',
      entityId: productId,
      entityName: product.name,
      oldValue: { status: oldStatus },
      newValue: { status: ProductStatus.REJECTED, rejectionReason: dto.reason },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await this.notificationService
      .sendDirect(product.sellerUserId, 'ProductRejected_SELLER_hi', {
        productName: product.name,
        reason: dto.reason,
      })
      .catch((err: Error) => {
        this.logger.error(
          { productId, sellerUserId: product.sellerUserId, err: err.message },
          'PRODUCT_REJECTED_NOTIFICATION_FAILED',
        );
      });

    this.metrics.productRejectedTotal.inc({
      segment: product.segment,
      adminId: adminUserId,
      reason: dto.reason.slice(0, 30),
    });
    this.logger.log(
      {
        action: 'PRODUCT_REJECTED',
        adminId: adminUserId,
        productId,
        reason: dto.reason,
      },
      'ADMIN_PRODUCT_REJECTED',
    );

    const updated = await this.productRepo.findById(productId);
    return updated!;
  }

  // ─── POST /admin/products/bulk-approve ───────────────────────────────────────

  /**
   * Bulk approve products — iterates and approves each independently.
   *
   * FOOTGUN-4-D: Each approval is INDEPENDENT. One failure does NOT stop others.
   *              Partial success is the correct behavior (per spec §19).
   * INV-S7-20:  Batch MUST be capped at 100 — enforced by Zod schema AND guard here.
   *
   * NOTE: Idempotency key from HTTP header applies to the bulk-approve endpoint itself.
   * Individual product approvals use ProductApproved:{id}:{adminId} dedup keys.
   */
  async bulkApproveProducts(
    dto: BulkApproveDto,
    adminUserId: string,
    idempotencyKey: string,
    req: Request,
  ): Promise<BulkApproveResult> {
    // Belt-and-suspenders guard — Zod schema already enforces max 100
    if (dto.productIds.length > 100) {
      throw new UnprocessableEntityException({
        code: 'BATCH_SIZE_EXCEEDED',
        max: 100,
        received: dto.productIds.length,
      });
    }

    const approved: string[] = [];
    const failed: Array<{ productId: string; reason: string }> = [];

    // FOOTGUN-4-D: Process each independently — failure does NOT halt others
    for (const productId of dto.productIds) {
      try {
        // Each call creates its own idempotency key internally via deduplicationKey
        await this.approveSingleProduct(productId, adminUserId, req);
        approved.push(productId);
      } catch (err) {
        const reason =
          err instanceof InvalidProductTransitionException
            ? `Invalid state transition: ${err.message}`
            : err instanceof NotFoundException
              ? 'Product not found'
              : ((err as Error).message ?? 'Unknown error');

        failed.push({ productId, reason });
        this.logger.warn(
          { productId, adminId: adminUserId, reason },
          'BULK_APPROVE_PRODUCT_FAILED',
        );
      }
    }

    // Store bulk-approve idempotency result
    const result: BulkApproveResult = {
      approved,
      failed,
      total: dto.productIds.length,
    };

    await this.redis
      .set(`admin-idem:${idempotencyKey}`, JSON.stringify(result), 'EX', 86400)
      .catch((err: Error) => {
        this.logger.warn(
          { idempotencyKey, err: err.message },
          'ADMIN_IDEM_REDIS_STORE_FAILED',
        );
      });

    this.logger.log(
      {
        action: 'BULK_APPROVE',
        adminId: adminUserId,
        total: dto.productIds.length,
        approved: approved.length,
        failed: failed.length,
      },
      'ADMIN_BULK_APPROVE_COMPLETED',
    );

    return result;
  }

  /**
   * Internal single-product approval without its own idempotency key.
   * Called by both approveProduct() (with idem key) and bulkApproveProducts() (shared idem key).
   * Idempotency within bulk is handled by EventOutbox.deduplicationKey.
   */
  private async approveSingleProduct(
    productId: string,
    adminUserId: string,
    req: Request,
  ): Promise<void> {
    const product = await this.productRepo.findById(productId);
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    }

    // FOOTGUN-4-A: Always validate state machine — even in bulk (per-product validation)
    this.productStateMachine.validateTransition(
      product.status,
      ProductStatus.ACTIVE,
    );

    const oldStatus = product.status;

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          status: ProductStatus.ACTIVE,
          approvedBy: adminUserId,
          approvedAt: new Date(),
        },
      });

      await tx.eventOutbox.create({
        data: {
          eventType: 'ProductApproved',
          payload: {
            productId,
            productName: product.name,
            businessId: product.businessId,
            sellerUserId: product.sellerUserId,
            segment: product.segment,
            adminUserId,
          },
          schemaVersion: '7.0',
          eventVersion: '1.0',
          deduplicationKey: `ProductApproved:${productId}:${adminUserId}`,
          eventMonth: formatYearMonth(new Date()), // INV-S7-38
          status: EventStatus.PENDING,
        },
      });
    });

    // OUTSIDE $transaction:
    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'Product',
      entityId: productId,
      entityName: product.name,
      oldValue: { status: oldStatus },
      newValue: { status: ProductStatus.ACTIVE, approvedBy: adminUserId },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await this.notificationService
      .sendDirect(product.sellerUserId, 'ProductApproved_SELLER_hi', {
        productName: product.name,
      })
      .catch((err: Error) => {
        this.logger.error(
          { productId, err: err.message },
          'PRODUCT_APPROVED_NOTIFICATION_FAILED',
        );
      });

    this.metrics.productApprovedTotal.inc({
      segment: product.segment,
      adminId: adminUserId,
    });
  }
}
