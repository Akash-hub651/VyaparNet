import { Injectable, BadRequestException } from '@nestjs/common';
import { ProductsRepository } from './products.repository';
import { ProductOwnershipService } from './product-ownership.service';
import { ProductApprovalService } from './product-approval.service';
import { ProductEventsService } from './product-events.service';
import { ProductStateMachineService } from './product-state-machine.service';
import { BaseProductDto } from '@vyaparnet/types';
import { SegmentProductSchemaRegistry } from './segment-product-schema.registry';
import { MediaClassificationService } from '../media/media-classification.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';
import { UserRole, ProductStatus, Segment, Product } from '@vyaparnet/database';
import { randomBytes } from 'crypto';
import { CatalogMetrics } from '../catalog-metrics.service';
import { performance } from 'perf_hooks';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productRepository: ProductsRepository,

    private readonly ownershipService: ProductOwnershipService,
    private readonly approvalService: ProductApprovalService,
    private readonly eventsService: ProductEventsService,
    private readonly stateMachine: ProductStateMachineService,
    private readonly schemaRegistry: SegmentProductSchemaRegistry,
    private readonly mediaClassification: MediaClassificationService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly metrics: CatalogMetrics,
  ) {}

  /**
   * Generates a unique slug for the product, always appending a random suffix to avoid collisions.
   */
  private async generateSlug(name: string): Promise<string> {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    return `${baseSlug}-${randomBytes(3).toString('hex')}`;
  }

  private async validateCategorySegmentMatch(
    categoryId: string,
    segment: Segment,
  ) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { segment: true },
    });
    if (!category) {
      throw new BadRequestException('Category not found');
    }
    if (category.segment !== segment) {
      throw new BadRequestException(
        `Category segment ${category.segment} does not match product segment ${segment}`,
      );
    }
  }

  async createProduct(
    dto: BaseProductDto & { segment: Segment },
    userId: string,
    _userRole: UserRole,
  ): Promise<Product> {
    const startTime = performance.now();
    const business = await this.ownershipService.resolveSellerBusiness(userId);
    const schema = this.schemaRegistry.getSchema(dto.segment);

    const validationResult = schema.safeParse(dto);
    if (!validationResult.success) {
      this.metrics.segmentAttrValidationFailure(dto.segment);
      throw new BadRequestException(validationResult.error.format());
    }

    const validData = validationResult.data as any;

    // Validate Category-Segment match
    await this.validateCategorySegmentMatch(
      validData.categoryId,
      validData.segment,
    );

    // Validate media
    await this.ownershipService.verifyMediaOwnership(
      userId,
      validData.mediaIds || [],
    );
    if (validData.mediaIds && validData.mediaIds.length > 0) {
      await this.mediaClassification.validateForSegment(
        validData.mediaIds,
        validData.segment,
      );
    }

    const status = ProductStatus.DRAFT;

    // Slug retry logic (P2002)
    let slug = '';
    let product: Product | null = null;
    let attempts = 0;

    while (attempts < 3 && !product) {
      try {
        slug = await this.generateSlug(validData.name);

        product = await this.prisma.$transaction(async (tx) => {
          const created = await this.productRepository.create(
            {
              name: validData.name,
              slug,
              description: validData.description,
              basePrice: validData.basePrice,
              mrp: validData.mrp,
              moq: validData.moq,
              unit: validData.unit,
              hsnCode: validData.hsnCode,
              gstPercent: validData.gstPercent,
              tags: validData.tags || [],
              segmentAttributes: validData.segmentAttributes || {},
              segment: validData.segment,
              status,
              category: { connect: { id: validData.categoryId } },
              business: { connect: { id: business.id } },
              createdBy: userId,
            },
            tx,
          );

          // ProductMedia links
          if (validData.mediaIds && validData.mediaIds.length > 0) {
            await tx.productMedia.createMany({
              data: validData.mediaIds.map(
                (mediaId: string, index: number) => ({
                  productId: created.id,
                  mediaId,
                  displayOrder: index,
                }),
              ),
            });
          }

          // SearchReindexJob + AuditLog
          // Emit ProductUpdated instead of Created for DRAFT so it doesn't trigger notification systems
          await this.eventsService.emitProductUpdated(tx, created, userId, {
            status: created.status,
          });
          return created;
        });
      } catch (err: any) {
        if (err.code === 'P2002' && err.meta?.target?.includes('slug')) {
          attempts++;
          continue;
        }
        throw err;
      }
    }

    if (!product) {
      throw new Error('Failed to generate a unique slug after 3 attempts.');
    }

    const duration = performance.now() - startTime;
    this.metrics.recordProductCreateDuration(duration);
    this.metrics.productCreated(product.segment, product.status);

    return product;
  }

  async publishProduct(
    productId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Product> {
    const { product, business } =
      await this.ownershipService.verifyProductOwnership(userId, productId);

    this.stateMachine.validateTransition(
      product.status,
      ProductStatus.PENDING_APPROVAL,
    );

    const nextStatus = await this.approvalService.determineInitialStatus(
      business,
      userRole,
      product.segment,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.productRepository.update(
        product.id,
        product.version,
        { status: nextStatus, updatedBy: userId },
        tx,
      );

      // We emit created since it is now published and commercially visible
      await this.eventsService.emitProductCreated(tx, updated, userId);
      this.metrics.productPublished(updated.segment, updated.status);
      return updated;
    });
  }

  async updateProduct(
    productId: string,
    dto: Partial<BaseProductDto & { segment: Segment }>,
    userId: string,
  ): Promise<Product> {
    const { product } = await this.ownershipService.verifyProductOwnership(
      userId,
      productId,
    );

    const schema = this.schemaRegistry.getSchema(product.segment);
    // Merge existing attributes with new dto to partial validation
    const payload = { ...product, ...dto };
    const validationResult = schema.safeParse(payload);

    if (!validationResult.success) {
      this.metrics.segmentAttrValidationFailure(product.segment);
      throw new BadRequestException(validationResult.error.format());
    }

    const validData = validationResult.data as any;

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.productRepository.update(
        product.id,
        product.version,
        {
          name: validData.name,
          description: validData.description,
          basePrice: validData.basePrice,
          mrp: validData.mrp,
          segmentAttributes: validData.segmentAttributes,
          updatedBy: userId,
        },
        tx,
      );

      await this.eventsService.emitProductUpdated(tx, updated, userId, dto);
      await this.redis.del(`product:${product.id}`); // Cache invalidation
      this.metrics.productUpdated(updated.segment);
      return updated;
    });
  }

  async deleteProduct(productId: string, userId: string): Promise<Product> {
    const { product } = await this.ownershipService.verifyProductOwnership(
      userId,
      productId,
    );

    this.stateMachine.validateTransition(
      product.status,
      ProductStatus.ARCHIVED,
    );

    return this.prisma.$transaction(async (tx) => {
      const deleted = await this.productRepository.softDelete(
        product.id,
        product.version,
        tx,
      );
      await this.eventsService.emitProductDeleted(tx, deleted, userId);
      await this.redis.del(`product:${product.id}`);
      this.metrics.productDeleted(deleted.segment);
      return deleted;
    });
  }

  async getProduct(id: string, segment?: Segment): Promise<Product> {
    const cacheKey = `product:${id}`;
    const cached = await this.redis.getJson<Product>(cacheKey);
    if (cached) return cached;

    const product = await this.productRepository.findById(id, segment);
    if (!product) {
      throw new BadRequestException('Product not found');
    }

    await this.redis.setJson(cacheKey, product, 300);
    return product;
  }
}
