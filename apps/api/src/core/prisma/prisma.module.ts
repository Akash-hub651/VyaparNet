import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EventOutboxProcessor } from './event-outbox.processor';

@Global()
@Module({
  providers: [PrismaService, EventOutboxProcessor],
  exports: [PrismaService],
})
export class PrismaModule {}
