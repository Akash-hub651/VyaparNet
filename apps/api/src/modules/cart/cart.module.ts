import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartRepository } from './cart.repository';
import { InventoryModule } from '../inventory/inventory.module';
import { CartCleanupWorker } from './workers/cart-cleanup.worker';

@Module({
  imports: [
    InventoryModule,
    BullModule.registerQueue({
      name: 'orders',
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
  ],
  controllers: [CartController],
  providers: [CartService, CartRepository, CartCleanupWorker],
  exports: [CartService],
})
export class CartModule {}
