import { Injectable, Logger } from '@nestjs/common';

export interface CreateAuditLogInput {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  sessionId?: string;
  entityName?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditRepository {
  private readonly logger = new Logger(AuditRepository.name);

  async create(input: CreateAuditLogInput): Promise<void> {
    this.logger.log({ action: input.action }, 'Stub audit log created');
  }
}
