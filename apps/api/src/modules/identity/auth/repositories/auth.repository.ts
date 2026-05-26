import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AuthRepository {
  private readonly logger = new Logger(AuthRepository.name);

  async findByPhone(phone: string): Promise<unknown> {
    this.logger.log({ phone }, 'Stub findByPhone called');
    return null;
  }

  async upsertByPhone(phone: string): Promise<unknown> {
    this.logger.log({ phone }, 'Stub upsertByPhone called');
    return null;
  }

  async logSecurityEvent(data: Record<string, unknown>): Promise<void> {
    this.logger.log({ data }, 'Stub logSecurityEvent called');
  }
}
