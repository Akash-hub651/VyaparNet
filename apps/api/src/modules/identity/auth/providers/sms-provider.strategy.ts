import { Injectable } from '@nestjs/common';
import { Msg91Provider } from './msg91.provider';
import { SmsProvider } from './sms-provider.interface';

@Injectable()
export class SmsProviderStrategy {
  constructor(private readonly msg91Provider: Msg91Provider) {}

  getProvider(): SmsProvider {
    // future: env-based provider switching (e.g. msg91, twilio)
    return this.msg91Provider;
  }
}
