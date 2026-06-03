import { Module } from '@nestjs/common';
import { BuyerOrdersController } from './controllers/buyer-orders.controller';
import { BuyerDashboardController } from './controllers/buyer-dashboard.controller';
import { BuyerOrderService } from './services/buyer-order.service';
import { BuyerReorderService } from './services/buyer-reorder.service';
import { BuyerOrderRepository } from './repositories/buyer-order.repository';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CartModule } from '../cart/cart.module';
import { RedisModule } from '../../core/redis/redis.module';
import { ObservabilityModule } from '../observability/observability.module';
import { AuthModule } from '../identity/auth/auth.module';
import { TrustSafetyModule } from '../trust-safety/trust-safety.module';
import { BuyerLedgerController } from './controllers/buyer-ledger.controller';
import { BuyerLedgerService } from './services/buyer-ledger.service';

@Module({
  imports: [
    PrismaModule,
    InventoryModule,
    CartModule,
    RedisModule,
    ObservabilityModule,
    AuthModule,
    TrustSafetyModule,
  ],
  controllers: [BuyerOrdersController, BuyerDashboardController, BuyerLedgerController], // FIX-5: §7.1 structure
  providers: [BuyerOrderService, BuyerOrderRepository, BuyerReorderService, BuyerLedgerService],
  exports: [BuyerOrderService, BuyerReorderService],
})
export class BuyerModule {}
