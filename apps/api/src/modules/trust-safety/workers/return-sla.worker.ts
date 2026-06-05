import { Processor, Process, InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bull';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { NotificationService } from '../../notification/services/notification.service';
import { RedisService } from '../../../core/redis/redis.service';
import { ReturnStatus } from '@vyaparnet/database';

@Injectable()
@Processor('return-sla')
export class ReturnSlaWorker implements OnModuleInit {
  private readonly logger = new Logger(ReturnSlaWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly redisService: RedisService,
    @InjectQueue('return-sla') private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('Registering Return SLA repeatable job...');
    await this.queue.add(
      'check-sla',
      {},
      {
        repeat: {
          cron: '*/30 * * * *',
        },
        jobId: 'return-sla-repeatable', // Idempotency
      },
    );
  }

  @Process('check-sla')
  async process(_job: Job) {
    this.logger.log('Starting Return SLA check...');

    const threshold = new Date(Date.now() - 48 * 3600000); // 48 hours ago

    const breachedReturns = await this.prisma.returnRequest.findMany({
      where: {
        status: ReturnStatus.PENDING,
        createdAt: { lt: threshold },
        slaBreachedAt: null,
      },
      select: { id: true, order: { select: { segment: true } } },
    });

    if (breachedReturns.length === 0) {
      this.logger.log('No new breached returns found.');
      return;
    }

    this.logger.warn(`Found ${breachedReturns.length} breached returns.`);

    for (const returnReq of breachedReturns) {
      await this.prisma.returnRequest.update({
        where: { id: returnReq.id },
        data: { slaBreachedAt: new Date() },
      });

      // Update admin exception center count
      await this.redisService.incr('return_sla_breach_count');

      // Notify admin via sendDirect()
      await this.notificationService
        .sendDirect('admin_group', 'ReturnSlaBreach_ADMIN_hi', {
          returnId: returnReq.id,
          segment: returnReq.order.segment,
        })
        .catch((err) =>
          this.logger.error(
            `Failed to send SLA breach notification: ${err.message}`,
          ),
        );
    }
  }
}
