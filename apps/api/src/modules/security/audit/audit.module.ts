import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AuditSafeWriterService } from './audit-safe-writer.service';
import { AuditRepository } from '../../identity/users/repositories/audit.repository';
import { AuthRepository } from '../../identity/auth/repositories/auth.repository';
import { AuthMetrics } from '../../identity/auth/auth.metrics';

@Module({
  imports: [BullModule.registerQueue({ name: 'dead-letter' })],
  providers: [
    AuditSafeWriterService,
    AuditRepository,
    AuthRepository,
    AuthMetrics,
  ],
  exports: [AuditSafeWriterService],
})
export class AuditModule {}
