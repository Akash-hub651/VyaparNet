import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CreateReturnDto, ReturnResponseDto } from '@vyaparnet/types';
import { ReturnStatus, OrderStatus, Prisma } from '@vyaparnet/database';
import { formatYearMonth } from '../../../utils/date.utils';
import { MetricsService } from '../../observability/metrics.service';

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * State machine validation for ReturnStatus transitions.
   */
  validateReturnTransition(
    currentStatus: ReturnStatus,
    newStatus: ReturnStatus,
  ): void {
    const validTransitions: Record<ReturnStatus, ReturnStatus[]> = {
      PENDING: ['APPROVED_FOR_PICKUP', 'QC_REJECTED'],
      APPROVED_FOR_PICKUP: ['RECEIVED_AT_QC', 'CLOSED'],
      PICKED_UP: ['RECEIVED_AT_QC'],
      RECEIVED_AT_QC: ['QC_APPROVED', 'QC_REJECTED'],
      QC_APPROVED: ['REFUND_INITIATED', 'REPLACEMENT_SENT'],
      QC_REJECTED: ['CLOSED'],
      REFUND_INITIATED: ['REFUNDED'],
      REFUNDED: ['CLOSED'],
      REPLACEMENT_SENT: ['CLOSED'],
      CLOSED: [],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid return state transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  /**
   * Validates eligibility for creating a return request.
   */
  async validateReturnEligibility(
    orderId: string,
    itemId: string,
    buyerId: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== buyerId)
      throw new ForbiddenException('Not authorized');

    // Rule: Cannot return if order is PROCESSING
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Order has not been delivered yet');
    }

    const item = order.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Item not found in order');

    // Rule: Return window (e.g., 7 days from delivery)
    if (order.deliveredAt) {
      const returnWindowDays = this.configService.get('RETURN_WINDOW_DAYS')
        ? parseInt(this.configService.get('RETURN_WINDOW_DAYS')!)
        : 7;
      const windowEnd = new Date(
        order.deliveredAt.getTime() + returnWindowDays * 24 * 60 * 60 * 1000,
      );
      if (new Date() > windowEnd) {
        throw new BadRequestException('Return window has expired');
      }
    }

    // Rule: No duplicate active return for the same item
    const existingReturn = await this.prisma.returnRequest.findFirst({
      where: {
        orderId,
        itemId,
        status: {
          notIn: ['CLOSED', 'QC_REJECTED'],
        },
      },
    });

    if (existingReturn) {
      throw new BadRequestException(
        'An active return request already exists for this item',
      );
    }

    // Rule: Mutual Exclusion (INV-S8-39) - No active dispute on the order
    const activeDispute = await this.prisma.dispute.findFirst({
      where: {
        orderId,
        status: {
          in: ['OPEN', 'UNDER_REVIEW', 'ESCALATED'],
        },
      },
    });

    if (activeDispute) {
      throw new BadRequestException(
        'Cannot initiate return while an active dispute exists for this order',
      );
    }

    return { order, item };
  }

  /**
   * Creates a return request and generates an outbox event atomically.
   */
  async createReturnRequest(
    buyerId: string,
    dto: CreateReturnDto,
  ): Promise<ReturnResponseDto> {
    const { order, item } = await this.validateReturnEligibility(
      dto.orderId,
      dto.itemId,
      buyerId,
    );

    // Segment derived server-side (INV-S8-42)
    const segment = order.segment;
    // Calculate SLA Breach based on config
    const slaHours = this.configService.get('RETURN_SLA_HOURS')
      ? parseInt(this.configService.get('RETURN_SLA_HOURS')!)
      : 24;
    const slaBreachedAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    const returnReq = await this.prisma.$transaction(async (tx) => {
      // 1. Create Return Request
      const createdReturn = await tx.returnRequest.create({
        data: {
          orderId: dto.orderId,
          itemId: dto.itemId,
          sellerId: item.sellerId, // Pulled securely from DB
          reason: dto.reason as any,
          description: dto.description,
          requestedRefundAmount: new Prisma.Decimal(dto.requestedRefundAmount),
          status: ReturnStatus.PENDING,
          segment,
          slaBreachedAt,
        },
      });

      // 2. Create EventOutbox event (INV-S4-OUTBOX)
      const eventMonth = formatYearMonth(new Date()); // INV-S8-16
      const deduplicationKey = `RETURN_CREATED:${createdReturn.id}:${buyerId}`; // INV-S8-15

      await tx.eventOutbox.create({
        data: {
          eventType: 'RETURN_CREATED',
          payload: {
            returnId: createdReturn.id,
            orderId: createdReturn.orderId,
            sellerId: createdReturn.sellerId,
          },
          schemaVersion: '8.0', // INV-S8-14
          eventMonth,
          deduplicationKey,
        },
      });

      return createdReturn;
    });

    // ─── Phase 9: Observability & Traces (§20.1, §20.2, §20.4, §20.5) ────────
    // 1. Metric: Increment return requests counter
    this.metricsService.returnRequestsTotal.inc({
      segment,
      status: returnReq.status,
    });

    // 2. Structured Log & Trace
    this.logger.log({
      level: 'info',
      event: 'return.create',
      trace_id: `trace_return_${returnReq.id}`, // Trace bounds for return.create workflow
      returnId: returnReq.id,
      from: 'NONE',
      to: returnReq.status,
      actorId: buyerId,
      orderId: returnReq.orderId,
      segment,
      msg: 'Return request created and outbox event emitted',
    });

    return {
      id: returnReq.id,
      orderId: returnReq.orderId,
      itemId: returnReq.itemId,
      sellerId: returnReq.sellerId,
      reason: returnReq.reason,
      description: returnReq.description,
      images: [], // Images are managed separately via Evidence API
      status: returnReq.status,
      requestedRefundAmount: returnReq.requestedRefundAmount.toString(),
      approvedRefundAmount:
        returnReq.approvedRefundAmount?.toString() || '0.00',
      resolution: returnReq.resolution,
      createdAt: returnReq.createdAt.toISOString(),
      updatedAt: returnReq.updatedAt.toISOString(),
    };
  }

  async getReturnsForBuyer(buyerId: string): Promise<ReturnResponseDto[]> {
    const returns = await this.prisma.returnRequest.findMany({
      where: {
        order: {
          buyerId, // Ownership boundary enforced at DB layer
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return returns.map((returnReq) => ({
      id: returnReq.id,
      orderId: returnReq.orderId,
      itemId: returnReq.itemId,
      sellerId: returnReq.sellerId,
      reason: returnReq.reason as any,
      description: returnReq.description,
      images: [],
      status: returnReq.status,
      requestedRefundAmount: returnReq.requestedRefundAmount.toString(),
      approvedRefundAmount:
        returnReq.approvedRefundAmount?.toString() || '0.00',
      resolution: returnReq.resolution,
      createdAt: returnReq.createdAt.toISOString(),
      updatedAt: returnReq.updatedAt.toISOString(),
    }));
  }

  async getReturnById(id: string, buyerId: string): Promise<ReturnResponseDto> {
    const returnReq = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: { order: true },
    });

    if (!returnReq) throw new NotFoundException('Return request not found');
    if (returnReq.order.buyerId !== buyerId)
      throw new ForbiddenException('Not authorized');

    return {
      id: returnReq.id,
      orderId: returnReq.orderId,
      itemId: returnReq.itemId,
      sellerId: returnReq.sellerId,
      reason: returnReq.reason,
      description: returnReq.description,
      images: [], // Controller will inject signed URLs if needed
      status: returnReq.status,
      requestedRefundAmount: returnReq.requestedRefundAmount.toString(),
      approvedRefundAmount:
        returnReq.approvedRefundAmount?.toString() || '0.00',
      resolution: returnReq.resolution,
      createdAt: returnReq.createdAt.toISOString(),
      updatedAt: returnReq.updatedAt.toISOString(),
    };
  }
}
