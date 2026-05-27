import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ProductStatus, Prisma } from '@vyaparnet/database';

@Injectable()
export class SearchReindexWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchReindexWorker.name);
  private timer!: NodeJS.Timeout;
  private isProcessing = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('Starting Search Reindex Worker...');
    // Poll every 10 seconds for pending jobs
    this.timer = setInterval(() => this.processJobs(), 10000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async processJobs() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await this.prisma.$transaction(async (tx) => {
        const pendingJobs = await tx.$queryRaw<any[]>`
          SELECT id, "entityId"
          FROM "SearchReindexJob"
          WHERE "processedAt" IS NULL AND "entityType" = 'Product'
          ORDER BY priority DESC, "createdAt" ASC
          LIMIT 10
          FOR UPDATE SKIP LOCKED
        `;

        if (pendingJobs.length === 0) {
          return;
        }

        this.logger.debug(`Found ${pendingJobs.length} pending search reindex jobs.`);

        for (const job of pendingJobs) {
          await this.processJob(tx, job.id, job.entityId);
        }
      });

    } catch (e) {
      this.logger.error('Error processing search reindex jobs', e);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processJob(tx: Prisma.TransactionClient, jobId: string, productId: string) {
    try {
      // 1. Load product
      const product = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        // Product doesn't exist anymore, mark job processed and delete from SPD if it exists
        await tx.searchProductDocument.deleteMany({
          where: { productId },
        });
        await this.markJobProcessed(tx, jobId);
        return;
      }

      // 2. If deleted or not ACTIVE: update SPD (needsReindex=false), skip GIN
      if (product.isDeleted || product.status !== ProductStatus.ACTIVE) {
        await tx.searchProductDocument.updateMany({
          where: { productId },
          data: { needsReindex: false, lastIndexedAt: new Date() },
        });
        await this.markJobProcessed(tx, jobId);
        return;
      }

      // Ensure SPD exists before we can update its search vector
      // If product is active but not in SPD, we need to create the row first.
      const spd = await tx.searchProductDocument.findUnique({
        where: { productId: product.id }
      });

      if (!spd) {
        await tx.searchProductDocument.create({
          data: {
            productId: product.id,
            name: product.name,
            price: product.basePrice, // assuming basePrice is what goes to search price
            categoryId: product.categoryId,
            segment: product.segment,
            sellerId: product.businessId,
            needsReindex: true,
          }
        });
      } else {
        // Update basic fields just in case they changed (name, price, etc.)
        await tx.searchProductDocument.update({
          where: { productId: product.id },
          data: {
             name: product.name,
             price: product.basePrice,
             categoryId: product.categoryId,
          }
        });
      }

      // 3. Compute tsvector
      // Flatten segment attributes logic here (simplified JSON flatten for now)
      const attrStr = product.segmentAttributes 
        ? Object.values(product.segmentAttributes).join(' ') 
        : '';
        
      const rawText = `${product.name} ${product.description || ''} ${attrStr}`;
      
      // 4. Update SearchProductDocument using Prisma.sql to safely inject `to_tsvector`
      // The tsvector updates natively inside the db using Postgres text search functions
      await tx.$executeRaw`
        UPDATE "SearchProductDocument" 
        SET 
          search_vector = to_tsvector('simple', coalesce(${rawText}, '')),
          "needsReindex" = false,
          "lastIndexedAt" = now()
        WHERE "productId" = ${product.id}
      `;

      // 6. Mark SearchReindexJob.processedAt = now()
      await this.markJobProcessed(tx, jobId);

    } catch (e: any) {
      this.logger.error(`Error processing job ${jobId} for product ${productId}`, e);
      // Dead letter event creation
      await tx.deadLetterEvent.create({
        data: {
          originalId: jobId,
          eventType: 'SearchReindexJob_Failed',
          payload: { productId },
          error: e.message || String(e),
        }
      });
      await this.markJobProcessed(tx, jobId);
    }
  }

  private async markJobProcessed(tx: Prisma.TransactionClient, jobId: string) {
    await tx.searchReindexJob.update({
      where: { id: jobId },
      data: { processedAt: new Date() },
    });
  }
}
