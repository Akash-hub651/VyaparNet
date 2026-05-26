import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  AuditRepository,
  CreateAuditLogInput,
} from '../../identity/users/repositories/audit.repository';
import { AuthRepository } from '../../identity/auth/repositories/auth.repository';
import { AuthMetrics } from '../../identity/auth/auth.metrics';

@Injectable()
export class AuditSafeWriterService {
  private readonly logger = new Logger(AuditSafeWriterService.name);

  constructor(
    private readonly auditRepository: AuditRepository,
    private readonly authRepository: AuthRepository,
    private readonly metricsService: AuthMetrics,
    @InjectQueue('dead-letter') private readonly deadLetterQueue: Queue,
  ) {}

  async safeWrite(payload: CreateAuditLogInput): Promise<void> {
    try {
      await this.auditRepository.create(payload);
    } catch (error) {
      this.logger.error('Audit log write failed', error);

      this.metricsService.increment('audit.write.failure');

      // Enqueue to Dead Letter Queue for retry
      await this.deadLetterQueue
        .add('audit-log-failed', payload)
        .catch((err: Error) => {
          this.logger.error(
            'Failed to enqueue audit log to dead letter queue',
            err,
          );
        });

      await this.authRepository
        .logSecurityEvent({
          eventType: 'AUDIT_LOG_WRITE_FAILED',
          userId: payload.actorId,
          ipAddress: payload.ipAddress ?? '0.0.0.0',
          metadata: {
            action: payload.action,
            userId: payload.actorId,
            severity: 'HIGH',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        })
        .catch((err: Error) => {
          this.logger.error(
            'Failed to log security event for audit log write failure',
            err.message,
          );
        });
    }
  }
}
