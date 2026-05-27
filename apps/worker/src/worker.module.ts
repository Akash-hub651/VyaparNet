import { Module } from '@nestjs/common';
import { ConfigModule } from './core/config/config.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { RedisModule } from './core/redis/redis.module';
import { BullMQModule } from './core/bullmq/bullmq.module';
import { ImageProcessingProcessor } from './modules/media/image-processing.processor';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    BullMQModule,
  ],
  providers: [ImageProcessingProcessor],
})
export class WorkerModule {}
