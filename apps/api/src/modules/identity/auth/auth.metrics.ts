import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AuthMetrics {
  private readonly logger = new Logger(AuthMetrics.name);

  increment(metric: string, labels?: Record<string, string>): void {
    this.logger.log({ metric, labels }, 'Stub increment metric called');
  }
}
