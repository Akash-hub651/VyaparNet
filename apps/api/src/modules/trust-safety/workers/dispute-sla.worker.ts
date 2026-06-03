import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { NotificationService } from '../../notification/services/notification.service';
import { RedisService } from '../../../core/redis/redis.service';
import { DisputeStatus } from '@vyaparnet/database';

@Injectable()
@Processor('dispute-sla')
export class DisputeSlaWorker extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(DisputeSlaWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly redisService: RedisService,
    @InjectQueue('dispute-sla') private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit() {
    this.logger.log('Registering Dispute SLA repeatable job...');
    await this.queue.add(
      'check-sla',
      {},
      {
        repeat: {
          pattern: '*/30 * * * *',
        },
        jobId: 'dispute-sla-repeatable', // Idempotency
      },
    );
  }

  async process(_job: Job<any, any, string>) {
    this.logger.log('Starting Dispute SLA check...');

    const threshold = new Date(Date.now() - 48 * 3600000); // 48 hours ago

    const breachedDisputes = await this.prisma.dispute.findMany({
      where: {
        status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] },
        createdAt: { lt: threshold },
        slaBreachedAt: null,
      },
      select: { id: true, order: { select: { segment: true } } },
    });

    if (breachedDisputes.length === 0) {
      this.logger.log('No new breached disputes found.');
      return;
    }

    this.logger.warn(`Found ${breachedDisputes.length} breached disputes.`);

    for (const dispute of breachedDisputes) {
      await this.prisma.dispute.update({
        where: { id: dispute.id },
        data: { slaBreachedAt: new Date() },
      });

      await this.redisService.incr('dispute_sla_breach_count');

      await this.notificationService
        .sendDirect('admin_group', 'DisputeSlaBreach_ADMIN_hi', {
          disputeId: dispute.id,
          segment: dispute.order.segment,
        })
        .catch((err) =>
          this.logger.error(
            `Failed to send SLA breach notification: ${err.message}`,
          ),
        );
    }
  }
}
