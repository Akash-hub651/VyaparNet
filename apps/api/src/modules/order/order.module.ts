import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { InventoryModule } from '../inventory/inventory.module';
import { CartModule } from '../cart/cart.module';
import { PaymentModule } from '../payment/payment.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { OrderStatusHistoryRepository } from './order-status-history.repository';
import { CartRepository } from '../cart/cart.repository';

/**
 * OrderModule — §8.3, §11.2
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §8.3, §11.2
 *
 * IMPORTS: InventoryModule (InventoryService), forwardRef(PaymentModule), PrismaModule, BullMQ('orders')
 * EXPORTS: [OrdersService, OrdersRepository]
 * OWNS: Cart, CartItem, Order, OrderItem, OrderStatusHistory tables
 * FORBIDDEN: Direct Prisma writes to Inventory, InventoryReservation, InventoryMovement
 *
 * forwardRef is required to break the circular dependency:
 *   OrderModule → PaymentModule (for payment initiation in online order path)
 *   PaymentModule → OrderModule (for order status updates in webhook processor)
 */
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'orders',
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 200,
      },
    }),
    InventoryModule,
    CartModule,
    // HARDENED: forwardRef prevents circular dependency (§8.3)
    forwardRef(() => PaymentModule),
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrdersRepository,
    OrderStatusHistoryRepository,
    CartRepository, // needed directly here for the saga coordinator
  ],
  exports: [OrdersService, OrdersRepository],
})
export class OrderModule {}
