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

@Module({
  imports: [PrismaModule, InventoryModule, CartModule, RedisModule, ObservabilityModule, AuthModule],
  controllers: [BuyerOrdersController, BuyerDashboardController], // FIX-5: §7.1 structure
  providers: [BuyerOrderService, BuyerOrderRepository, BuyerReorderService],
  exports: [BuyerOrderService, BuyerReorderService],
})
export class BuyerModule {}
