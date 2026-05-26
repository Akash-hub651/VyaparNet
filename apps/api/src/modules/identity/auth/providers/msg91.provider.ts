import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsProvider, SendSmsPayload } from './sms-provider.interface';
import type { AppConfig } from '../../../../core/config/config.schema';

@Injectable()
export class Msg91Provider implements SmsProvider {
  private readonly logger = new Logger(Msg91Provider.name);

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async sendOtp(payload: SendSmsPayload): Promise<void> {
    const authKey = this.config.get('MSG91_AUTH_KEY', { infer: true });
    const templateId = this.config.get('MSG91_TEMPLATE_ID', { infer: true });

    if (!authKey || !templateId) {
      this.logger.warn('MSG91 config missing — running in stub mode');
      this.logger.log(
        `🔐 [DEV STUB] OTP SMS to ${payload.phone} — Message: ${payload.message}`,
      );
      return;
    }

    try {
      const response = await fetch('https://api.msg91.com/api/v5/otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: authKey,
        },
        body: JSON.stringify({
          template_id: templateId,
          mobile: payload.phone.replace('+', ''),
          otp: payload.message,
        }),
      });

      const data = (await response.json()) as { type: string; message: string };

      if (data.type !== 'success') {
        throw new Error(data.message);
      }

      this.logger.log(
        { phoneHash: this.hashPhone(payload.phone), messageId: data.message },
        'OTP SMS sent via MSG91',
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error({ error: err.message }, 'MSG91 API call failed');
      throw err;
    }
  }

  private hashPhone(phone: string): string {
    return phone.slice(0, 3) + 'XXXXXX' + phone.slice(-4);
  }
}
