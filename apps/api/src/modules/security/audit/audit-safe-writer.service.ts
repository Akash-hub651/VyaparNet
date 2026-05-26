import { Injectable, Logger } from '@nestjs/common';
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
  ) {}

  async safeWrite(payload: CreateAuditLogInput): Promise<void> {
    try {
      await this.auditRepository.create(payload);
    } catch (error) {
      this.logger.error('Audit log write failed', error);

      this.metricsService.increment('audit.write.failure');

      // TODO:
      // enqueue retry job once BullMQ retry
      // infrastructure is enabled in later sprint

      await this.authRepository
        .logSecurityEvent({
          eventType: 'AUDIT_LOG_WRITE_FAILED',
          userId: payload.actorId,
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
