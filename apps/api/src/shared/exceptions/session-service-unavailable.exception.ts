import { ServiceUnavailableException } from '@nestjs/common';
import { AuthErrorCode } from '@vyaparnet/types';

export class SessionServiceUnavailableException extends ServiceUnavailableException {
  constructor(message = 'Session service temporarily unavailable.') {
    super({
      code: AuthErrorCode.SESSION_SERVICE_UNAVAILABLE,
      message,
    });
  }
}
