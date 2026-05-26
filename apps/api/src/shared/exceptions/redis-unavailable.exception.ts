import { ServiceUnavailableException } from '@nestjs/common';
import { AuthErrorCode } from '@vyaparnet/types';

export class RedisUnavailableException extends ServiceUnavailableException {
  constructor(message = 'Service temporarily unavailable.') {
    super({
      code: AuthErrorCode.REDIS_UNAVAILABLE,
      message,
    });
  }
}
