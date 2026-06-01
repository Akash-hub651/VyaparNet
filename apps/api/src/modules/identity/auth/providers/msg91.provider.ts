import { Injectable, Logger } from '@nestjs/common';
import type { ISmsProvider } from './sms-provider.strategy';

@Injectable()
export class Msg91Provider implements ISmsProvider {
  private readonly logger = new Logger(Msg91Provider.name);

  async sendOtp(params: { phone: string; message: string }): Promise<void> {
    // Phase 1 MVP: Just log the OTP unless MSG91 API keys are explicitly configured.
    // In production, this would use fetch/axios to call MSG91 API.
    this.logger.log(
      `[MSG91 Stub] Sending OTP to ${params.phone}: ${params.message}`,
    );

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  async sendTransactional(params: {
    phone: string;
    message: string;
  }): Promise<void> {
    // Phase 6 MVP: Just log the transactional SMS.
    this.logger.log(
      `[MSG91 Stub] Sending Transactional SMS to ****${params.phone.slice(-4)}: ${params.message}`,
    );

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
