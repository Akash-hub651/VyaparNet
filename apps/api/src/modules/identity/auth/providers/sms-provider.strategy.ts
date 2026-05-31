import { Injectable } from '@nestjs/common';
import { Msg91Provider } from './msg91.provider';

export interface ISmsProvider {
  sendOtp(params: { phone: string; message: string }): Promise<void>;
  sendTransactional(params: { phone: string; message: string }): Promise<void>;
}

/**
 * Strategy to determine which SMS provider to use.
 * In Phase 1, we hardcode MSG91 as the primary provider, but this allows for future expansion.
 */
@Injectable()
export class SmsProviderStrategy {
  constructor(private readonly msg91Provider: Msg91Provider) {}

  getProvider(): ISmsProvider {
    // Could check config here (e.g., if (this.config.get('SMS_PROVIDER') === 'twilio'))
    return this.msg91Provider;
  }
}
