import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@vyaparnet/database';

/**
 * PrismaService — singleton database client for the API.
 *
 * Lifecycle:
 * - onModuleInit: connects to database, verifies connection
 * - onModuleDestroy: disconnects cleanly (SIGTERM handling)
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 3
 * Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 8
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env['NODE_ENV'] === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to database...');
    await this.$connect();
    this.logger.log('Database connected successfully.');

    if (process.env['NODE_ENV'] === 'development') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).$on('query', (event: { query: string; duration: number }) => {
        if (event.duration > 100) {
          this.logger.warn(`Slow query (${event.duration}ms): ${event.query}`);
        }
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
    this.logger.log('Database disconnected.');
  }
}
