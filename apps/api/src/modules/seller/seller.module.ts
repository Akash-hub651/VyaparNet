import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { RedisModule } from '../../core/redis/redis.module';
import { ObservabilityModule } from '../observability/observability.module';
import { S3Module } from '../s3/s3.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SellerContextGuard } from './guards/seller-context.guard';
import { SellerKpiRepository } from './repositories/seller-kpi.repository';
import { SellerKpiService } from './services/seller-kpi.service';
import { SellerDashboardController } from './controllers/seller-dashboard.controller';
import { SellerOrderRepository } from './repositories/seller-order.repository';
import { SellerOrderService } from './services/seller-order.service';
import { SellerDispatchProofService } from './services/seller-dispatch-proof.service';
import { SellerOrdersController } from './controllers/seller-orders.controller';
import { SellerInventoryController } from './controllers/seller-inventory.controller';
import { SellerScorecardController } from './controllers/seller-scorecard.controller';
import { SellerScorecardService } from './services/seller-scorecard.service';
import { SellerScorecardWorker } from './workers/seller-scorecard.worker';
import { AuthModule } from '../identity/auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ObservabilityModule,
    S3Module,
    AuthModule,
    // InventoryModule: exposes InventoryService for countLowStock() in SellerKpiRepository.
    // INV-S5-27: InventoryService is the ONLY permitted path to Inventory table from seller module.
    // Repositories inside InventoryModule are NEVER exported — only InventoryService facade is.
    InventoryModule,
    // BullMQ queue for 6-hour scorecard cron (Phase 7).
    // Queue is also registered globally in BullMQModule — this forFeature() ensures
    // InjectQueue('scorecard') works inside SellerScorecardWorker DI.
    BullModule.registerQueue({ name: 'scorecard' }),
  ],
  controllers: [
    SellerDashboardController,
    SellerOrdersController,
    SellerInventoryController,
    SellerScorecardController, // FIX-3: GET /seller/scorecard per spec §8.1
  ],
  providers: [
    SellerContextGuard,
    SellerKpiRepository,
    SellerKpiService,
    SellerOrderRepository,
    SellerOrderService,
    SellerDispatchProofService,
    SellerScorecardService,
    SellerScorecardWorker,
  ],
  exports: [SellerContextGuard, SellerOrderService],
})
export class SellerModule {}
