import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CreateDisputeDto, DisputeResponseDto } from '@vyaparnet/types';
import {
  DisputeStatus,
  OrderStatus,
  DisputePriority,
  PayoutStatus,
} from '@vyaparnet/database';
import { formatYearMonth } from '../../../utils/date.utils';
import { MetricsService } from '../../observability/metrics.service';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  validateDisputeTransition(
    currentStatus: DisputeStatus,
    newStatus: DisputeStatus,
  ): void {
    const validTransitions: Record<DisputeStatus, DisputeStatus[]> = {
      OPEN: ['UNDER_REVIEW', 'RESOLVED_BUYER', 'RESOLVED_SELLER'],
      UNDER_REVIEW: ['ESCALATED', 'RESOLVED_BUYER', 'RESOLVED_SELLER'],
      ESCALATED: ['RESOLVED_BUYER', 'RESOLVED_SELLER'],
      RESOLVED_BUYER: ['CLOSED'],
      RESOLVED_SELLER: ['CLOSED'],
      CLOSED: [],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid dispute state transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  async createDispute(
    buyerId: string,
    dto: CreateDisputeDto,
  ): Promise<DisputeResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId)
      throw new ForbiddenException('Not authorized');

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Order has not been delivered yet');
    }

    // Rule: Mutual Exclusion (INV-S8-39) - No active return on the order
    const activeReturn = await this.prisma.returnRequest.findFirst({
      where: {
        orderId: dto.orderId,
        status: {
          notIn: ['CLOSED', 'QC_REJECTED'],
        },
      },
    });

    if (activeReturn) {
      throw new BadRequestException(
        'Cannot initiate dispute while an active return request exists for this order',
      );
    }

    // Rule: Duplicate active dispute check
    const existingDispute = await this.prisma.dispute.findFirst({
      where: {
        orderId: dto.orderId,
        status: {
          in: ['OPEN', 'UNDER_REVIEW', 'ESCALATED'],
        },
      },
    });

    if (existingDispute) {
      throw new BadRequestException(
        'An active dispute already exists for this order',
      );
    }

    // INV-S8-7: Max 3 disputes per orderId (including resolved/closed disputes)
    const totalDisputeCount = await this.prisma.dispute.count({
      where: { orderId: dto.orderId },
    });

    if (totalDisputeCount >= 3) {
      throw new BadRequestException(
        'Maximum dispute limit (3) reached for this order',
      );
    }

    const segment = order.segment;
    const slaHours = this.configService.get('DISPUTE_SLA_HOURS')
      ? parseInt(this.configService.get('DISPUTE_SLA_HOURS')!)
      : 48;
    const slaBreachedAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    const dispute = await this.prisma.$transaction(async (tx) => {
      // 1. Create Dispute
      const createdDispute = await tx.dispute.create({
        data: {
          orderId: dto.orderId,
          raisedBy: buyerId,
          reason: dto.reason,
          description: dto.description,
          status: DisputeStatus.OPEN,
          priority: DisputePriority.MEDIUM,
          segment,
          slaBreachedAt,
        },
      });

      // 2. Atomic Payout Hold (INV-S8-9)
      await tx.sellerPayout.updateMany({
        where: {
          orderId: dto.orderId,
          status: {
            in: [PayoutStatus.PENDING, PayoutStatus.INITIATED],
          },
        },
        data: {
          status: PayoutStatus.ON_HOLD,
        },
      });

      // 3. Create EventOutbox event (INV-S4-OUTBOX)
      const eventMonth = formatYearMonth(new Date()); // INV-S8-16
      const deduplicationKey = `DisputeOpened:${createdDispute.id}:${buyerId}`; // INV-S8-15

      await tx.eventOutbox.create({
        data: {
          eventType: 'DisputeOpened', // Must match OUTBOX_EVENT_NOTIFICATION_MAP key
          payload: {
            disputeId: createdDispute.id,
            orderId: createdDispute.orderId,
            buyerId,
            segment: createdDispute.segment,
            priority: createdDispute.priority,
          },
          schemaVersion: '8.0', // INV-S8-14
          eventMonth,
          deduplicationKey,
        },
      });

      return createdDispute;
    });

    // ─── Phase 9: Observability & Traces (§20.1, §20.2, §20.4, §20.5) ────────
    // 1. Metric: Increment dispute opened counter
    this.metricsService.disputeOpenedTotal.inc({
      segment,
      priority: dispute.priority,
    });

    // 2. Structured Log & Trace
    this.logger.log({
      level: 'info',
      event: 'dispute.create',
      trace_id: `trace_dispute_${dispute.id}`, // Trace bounds for dispute.create workflow
      disputeId: dispute.id,
      from: 'NONE',
      to: dispute.status,
      actorId: buyerId,
      orderId: dispute.orderId,
      segment,
      msg: 'Dispute created, payout hold initiated, and outbox event emitted',
    });

    return {
      id: dispute.id,
      orderId: dispute.orderId,
      raisedBy: dispute.raisedBy,
      reason: dispute.reason,
      description: dispute.description,
      status: dispute.status,
      priority: dispute.priority,
      resolvedBy: dispute.resolvedBy,
      resolution: dispute.resolution,
      resolvedAt: dispute.resolvedAt?.toISOString(),
      createdAt: dispute.createdAt.toISOString(),
      updatedAt: dispute.updatedAt.toISOString(),
    };
  }

  async getDisputesForBuyer(buyerId: string): Promise<DisputeResponseDto[]> {
    const disputes = await this.prisma.dispute.findMany({
      where: {
        raisedBy: buyerId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return disputes.map((dispute) => ({
      id: dispute.id,
      orderId: dispute.orderId,
      raisedBy: dispute.raisedBy,
      reason: dispute.reason,
      description: dispute.description,
      status: dispute.status,
      priority: dispute.priority,
      resolvedBy: dispute.resolvedBy,
      resolution: dispute.resolution,
      resolvedAt: dispute.resolvedAt?.toISOString(),
      createdAt: dispute.createdAt.toISOString(),
      updatedAt: dispute.updatedAt.toISOString(),
    }));
  }

  async getDisputeById(
    id: string,
    buyerId: string,
  ): Promise<DisputeResponseDto> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
    });

    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.raisedBy !== buyerId)
      throw new ForbiddenException('Not authorized');

    return {
      id: dispute.id,
      orderId: dispute.orderId,
      raisedBy: dispute.raisedBy,
      reason: dispute.reason,
      description: dispute.description,
      status: dispute.status,
      priority: dispute.priority,
      resolvedBy: dispute.resolvedBy,
      resolution: dispute.resolution,
      resolvedAt: dispute.resolvedAt?.toISOString(),
      createdAt: dispute.createdAt.toISOString(),
      updatedAt: dispute.updatedAt.toISOString(),
    };
  }
}
