import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Product, AuditAction } from '@vyaparnet/database';

export interface ProductEventPayload {
  aggregateId: string;
  aggregateType: string;
  productId: string;
  segment?: string;
  status?: string;
  changes?: Record<string, any>;
}

@Injectable()
export class ProductEventsService {
  private readonly logger = new Logger(ProductEventsService.name);

  /**
   * Emits the ProductCreated event.
   * MUST be executed inside a Prisma transaction block.
   */
  async emitProductCreated(
    tx: Prisma.TransactionClient,
    product: Product,
    userId: string,
  ): Promise<void> {
    const eventPayload = {
      segment: product.segment,
      status: product.status,
    };

    const payload: ProductEventPayload = {
      aggregateId: product.id,
      aggregateType: 'Product',
      productId: product.id,
      ...eventPayload,
    };

    await tx.eventOutbox.createMany({
      data: [{
        eventType: 'ProductCreated',
        payload: payload as unknown as Prisma.InputJsonValue,
        deduplicationKey: `product-created-${product.id}`,
        eventMonth: new Date().toISOString().slice(0, 7),
      }],
      skipDuplicates: true,
    });

    await tx.searchReindexJob.deleteMany({
      where: { entityType: 'Product', entityId: product.id, processedAt: null }
    });

    await tx.searchReindexJob.create({
      data: {
        entityType: 'Product',
        entityId: product.id,
        priority: 1,
      },
    });

    await tx.auditLog.create({
      data: {
        action: AuditAction.CREATE,
        entityName: 'Product',
        entityType: 'Product',
        entityId: product.id,
        actorId: userId,
        newValue: { ...product, version: product.version } as unknown as Prisma.InputJsonValue,
        auditMonth: new Date().toISOString().slice(0, 7),
      },
    });

    this.logger.debug(`Queued ProductCreated event for product ${product.id}`);
  }

  /**
   * Emits the ProductUpdated event.
   * MUST be executed inside a Prisma transaction block.
   */
  async emitProductUpdated(
    tx: Prisma.TransactionClient,
    product: Product,
    userId: string,
    changes: Record<string, any>,
  ): Promise<void> {
    const payload: ProductEventPayload = { aggregateId: product.id, aggregateType: 'Product', productId: product.id, changes };
    
    await tx.eventOutbox.createMany({
      data: [{
        eventType: 'ProductStateTransition',
        payload: payload as unknown as Prisma.InputJsonValue,
        deduplicationKey: `product-state-${product.id}-v${product.version}`,
        eventMonth: new Date().toISOString().slice(0, 7),
      }],
      skipDuplicates: true,
    });

    await tx.searchReindexJob.deleteMany({
      where: { entityType: 'Product', entityId: product.id, processedAt: null }
    });

    await tx.searchReindexJob.create({
      data: {
        entityType: 'Product',
        entityId: product.id,
        priority: 1,
      },
    });

    // Cache invalidation (Future Phase placeholder)
    
    await tx.auditLog.create({
      data: {
        action: AuditAction.UPDATE,
        entityName: 'Product',
        entityType: 'Product',
        entityId: product.id,
        actorId: userId,
        newValue: { ...changes, version: product.version } as unknown as Prisma.InputJsonValue,
        auditMonth: new Date().toISOString().slice(0, 7),
      },
    });

    this.logger.debug(`Queued ProductUpdated event for product ${product.id} (v${product.version})`);
  }

  /**
   * Emits the ProductDeleted event.
   */
  async emitProductDeleted(
    tx: Prisma.TransactionClient,
    product: Product,
    userId: string,
  ): Promise<void> {
    const payload: ProductEventPayload = { aggregateId: product.id, aggregateType: 'Product', productId: product.id };

    await tx.eventOutbox.createMany({
      data: [{
        eventType: 'ProductDeleted',
        payload: payload as unknown as Prisma.InputJsonValue,
        deduplicationKey: `product-deleted-${product.id}`,
        eventMonth: new Date().toISOString().slice(0, 7),
      }],
      skipDuplicates: true,
    });

    await tx.searchReindexJob.deleteMany({
      where: { entityType: 'Product', entityId: product.id, processedAt: null }
    });

    await tx.searchReindexJob.create({
      data: {
        entityType: 'Product',
        entityId: product.id,
        priority: 1,
      },
    });

    await tx.auditLog.create({
      data: {
        action: AuditAction.DELETE,
        entityName: 'Product',
        entityType: 'Product',
        entityId: product.id,
        actorId: userId,
        auditMonth: new Date().toISOString().slice(0, 7),
      },
    });
  }
}
