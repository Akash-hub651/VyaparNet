import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';

import { PrismaModule } from '../../core/prisma/prisma.module';
import { RedisModule } from '../../core/redis/redis.module';
import { BullMQModule } from '../../core/bullmq/bullmq.module';
import { S3Module } from '../s3/s3.module';
import { NotificationModule } from '../notification/notification.module';
import { ObservabilityModule } from '../observability/observability.module';
import { AuditModule } from '../security/audit/audit.module';
import { AuthModule } from '../identity/auth/auth.module';


import { AdminContextGuard } from './guards/admin-context.guard';
import { AdminIdempotencyGuard } from './guards/admin-idempotency.guard';
import { AdminRateLimitGuard } from './guards/admin-rate-limit.guard';

// Phase 3: KYC Verification
import { AdminBusinessesController } from './controllers/admin-business.controller';
import { AdminBusinessRepository } from './repositories/admin-business.repository';
import { AdminKycService } from './services/admin-kyc.service';
import { AdminMetricsService } from './services/admin-metrics.service';

// Phase 4: Product Approval
import { AdminProductsController } from './controllers/admin-product.controller';
import { AdminProductRepository } from './repositories/admin-product.repository';
import { AdminProductService } from './services/admin-product.service';

// Phase 5: User Management & Suspension
import { AdminUsersController } from './controllers/admin-user.controller';
import { AdminUserRepository } from './repositories/admin-user.repository';
import { AdminUserService } from './services/admin-user.service';

// Phase 6: Admin Order Management
import { AdminOrdersController } from './controllers/admin-order.controller';
import { AdminOrderRepository } from './repositories/admin-order.repository';
import { AdminOrderService } from './services/admin-order.service';
import { AdminExceptionService } from './services/admin-exception.service';

// Phase 7: Tax Invoice Generation
import { AdminInvoicesController } from './controllers/admin-invoice.controller';
import { AdminInvoiceService } from './services/admin-invoice.service';
import { InvoiceGenerationWorker } from './workers/invoice-generation.worker';

// Phase 8: Seller Payout Management
import { AdminPayoutsController } from './controllers/admin-payout.controller';
import { AdminPayoutRepository } from './repositories/admin-payout.repository';
import { AdminPayoutService } from './services/admin-payout.service';

// Phase 9: Feature Flag Management
import { AdminFlagsController } from './controllers/admin-flag.controller';
import { AdminFlagRepository } from './repositories/admin-flag.repository';
import { AdminFlagService } from './services/admin-flag.service';
import { AdminSeedService } from './services/admin-seed.service';

// Phase 10: Audit Log Viewer & Exception Center
import { AdminAuditController } from './controllers/admin-audit.controller';
import { AdminExceptionsController } from './controllers/admin-exception.controller';
import { AdminAuditRepository } from './repositories/admin-audit.repository';
import { AdminAuditService } from './services/admin-audit.service';

// Phase 11: Support Ticket Workflow
import { AdminTicketsController } from './controllers/admin-ticket.controller';
import { AdminTicketRepository } from './repositories/admin-ticket.repository';
import { AdminTicketService } from './services/admin-ticket.service';

/**
 * AdminModule — Sprint 7 Admin System & Platform Governance.
 *
 * FOOTGUN-2-A: NO RolesGuard or SellerContextGuard — AdminContextGuard is exclusive (INV-S7-1).
 * FOOTGUN-2-B: AdminModule is a LEAF module — exports NOTHING.
 *
 * Imports allowed (INV-S7-25):
 *  PrismaModule, RedisModule, BullMQModule, S3Module,
 *  NotificationModule, ObservabilityModule, AuditModule
 *
 * Imports FORBIDDEN (INV-S7-25):
 *  ❌ OrderModule  ❌ InventoryModule  ❌ SellerModule
 *  ❌ BuyerModule  ❌ PaymentModule    ❌ CatalogModule  ❌ CartModule
 *
 * Phase 4 note (FOOTGUN-4-E):
 *  ProductStateMachineService is instantiated directly in AdminProductService
 *  (new ProductStateMachineService()). CatalogModule is NOT imported here.
 *
 * Phase 6 note:
 *  AdminOrderService uses direct Prisma + validateAdminTransition() (no OrderModule import).
 *  AdminExceptionService computes exceptions fresh — no Redis caching (INV-S7-34).
 *
 * Phase 7 note:
 *  AdminInvoiceService uses pdf-lib (FOOTGUN-7-A: not puppeteer).
 *  PDF generation is ALWAYS outside $transaction (FOOTGUN-7-B).
 *  TaxInvoice.pdfUrl = S3 key (FOOTGUN-7-C: never presigned URL in DB).
 *  Manual admin trigger ONLY (FOOTGUN-7-D: INV-S7-17).
 */
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    BullMQModule,
    S3Module,
    NotificationModule,
    ObservabilityModule,
    AuditModule,
    AuthModule,
    BullModule.registerQueue({ name: 'invoice-generation' }),
    BullModule.registerQueue({ name: 'notifications-failed' }), // Phase 10: DLQ reader (INV-S7-24)
  ],
  controllers: [
    AdminBusinessesController, // Phase 3: KYC
    AdminProductsController,   // Phase 4: Product Approval
    AdminUsersController,      // Phase 5: User Management
    AdminOrdersController,     // Phase 6: Order Management
    AdminInvoicesController,   // Phase 7: Tax Invoice
    AdminPayoutsController,    // Phase 8: Payout Management
    AdminFlagsController,      // Phase 9: Feature Flags
    AdminAuditController,      // Phase 10: Audit Log Viewer
    AdminExceptionsController, // Phase 10: Exception Center + DLQ
    AdminTicketsController,    // Phase 11: Support Tickets
  ],
  providers: [
    // Guards
    AdminContextGuard,
    AdminIdempotencyGuard,
    AdminRateLimitGuard,

    // Phase 3: KYC Verification
    AdminBusinessRepository,
    AdminKycService,
    AdminMetricsService,

    // Phase 4: Product Approval
    AdminProductRepository,
    AdminProductService,

    // Phase 5: User Management & Suspension
    AdminUserRepository,
    AdminUserService,

    // Phase 6: Admin Order Management
    AdminOrderRepository,
    AdminOrderService,
    AdminExceptionService,

    // Phase 7: Tax Invoice Generation
    AdminInvoiceService,
    InvoiceGenerationWorker,

    // Phase 8: Seller Payout Management
    AdminPayoutRepository,
    AdminPayoutService,

    // Phase 9: Feature Flag Management
    AdminFlagRepository,
    AdminFlagService,
    AdminSeedService,

    // Phase 10: Audit Log Viewer & Exception Center
    AdminAuditRepository,
    AdminAuditService,
    // AdminExceptionService already registered in Phase 6 — Phase 10 extends it with getTechnicalExceptions()
    
    // Phase 11: Support Ticket Workflow
    AdminTicketRepository,
    AdminTicketService,
  ],
  exports: [], // FOOTGUN-2-B: AdminModule is a leaf, it exports nothing.
})
export class AdminModule {}
