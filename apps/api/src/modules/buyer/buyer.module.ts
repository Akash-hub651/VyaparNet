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
import { BuyerTicketsController } from './controllers/buyer-tickets.controller';
import { BuyerTicketService } from './services/buyer-ticket.service';
import { BuyerTicketRepository } from './repositories/buyer-ticket.repository';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    PrismaModule,
    InventoryModule,
    CartModule,
    RedisModule,
    ObservabilityModule,
    AuthModule,
    TrustSafetyModule,
    NotificationModule,
  ],
  controllers: [
    BuyerOrdersController,
    BuyerDashboardController,
    BuyerLedgerController,
    BuyerTicketsController,
  ], // FIX-5: §7.1 structure
  providers: [
    BuyerOrderService,
    BuyerOrderRepository,
    BuyerReorderService,
    BuyerLedgerService,
    BuyerTicketService,
    BuyerTicketRepository,
  ],
  exports: [BuyerOrderService, BuyerReorderService],
})
export class BuyerModule {}
