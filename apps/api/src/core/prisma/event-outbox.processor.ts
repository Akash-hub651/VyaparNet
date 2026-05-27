import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EventStatus } from '@vyaparnet/database';

@Injectable()
export class EventOutboxProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventOutboxProcessor.name);
  private timer!: NodeJS.Timeout;
  private isProcessing = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('Starting Event Outbox Processor...');
    this.timer = setInterval(() => this.processEvents(), 5000); // 5 seconds
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async processEvents() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await this.prisma.$transaction(async (tx) => {
        // Fetch up to 20 events using FOR UPDATE SKIP LOCKED
        const pendingEvents = await tx.$queryRaw<any[]>`
          SELECT id, "eventType", payload, "retryCount"
          FROM "EventOutbox"
          WHERE status = 'PENDING'
          ORDER BY "createdAt" ASC
          LIMIT 20
          FOR UPDATE SKIP LOCKED
        `;

        if (pendingEvents.length === 0) return;

        this.logger.debug(`Processing ${pendingEvents.length} outbox events...`);

        for (const event of pendingEvents) {
          try {
            await this.dispatchToMessageBroker(event);
            
            // Mark as processed
            await tx.eventOutbox.update({
              where: { id: event.id },
              data: {
                status: EventStatus.COMPLETED,
                processedAt: new Date(),
              },
            });
          } catch (e: any) {
            this.logger.error(`Failed to process outbox event ${event.id}`, e);
            const newRetryCount = event.retryCount + 1;
            
            if (newRetryCount >= 3) {
              await tx.eventOutbox.update({
                where: { id: event.id },
                data: {
                  status: EventStatus.FAILED,
                  retryCount: newRetryCount,
                  lastError: e.message || String(e),
                },
              });
              
              // Create DeadLetterEvent
              await tx.deadLetterEvent.create({
                data: {
                  originalId: event.id,
                  eventType: event.eventType,
                  payload: event.payload,
                  error: e.message || String(e),
                },
              });
            } else {
              await tx.eventOutbox.update({
                where: { id: event.id },
                data: {
                  retryCount: newRetryCount,
                  lastError: e.message || String(e),
                },
              });
            }
          }
        }
      });
    } catch (e) {
      this.logger.error('Error in outbox processor loop', e);
    } finally {
      this.isProcessing = false;
    }
  }

  private async dispatchToMessageBroker(event: any) {
    // In Sprint 2 Phase 6, we simulate Kafka/RabbitMQ dispatch
    // We can assume it is successful if it reaches here.
    this.logger.debug(`Simulating dispatch of event ${event.eventType} to broker...`);
    // Example: await this.kafkaService.emit(event.eventType, event.payload);
  }
}
