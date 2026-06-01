import { Injectable } from '@nestjs/common';
import type { SmsService, SmsResult } from './sms.service.interface';
import { SmsProviderStrategy } from './providers/sms-provider.strategy';

/**
 * MSG91 SMS Service — concrete implementation for production.
 * Delegates the actual delivery to SmsProviderStrategy.
 */
@Injectable()
export class Msg91SmsService implements SmsService {
  constructor(private readonly smsProviderStrategy: SmsProviderStrategy) {}

  async sendOtp(phoneNumber: string, otp: string): Promise<SmsResult> {
    try {
      const provider = this.smsProviderStrategy.getProvider();
      await provider.sendOtp({
        phone: phoneNumber,
        message: otp,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async sendTransactional(
    phoneNumber: string,
    message: string,
  ): Promise<SmsResult> {
    try {
      const provider = this.smsProviderStrategy.getProvider();
      await provider.sendTransactional({
        phone: phoneNumber,
        message,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
