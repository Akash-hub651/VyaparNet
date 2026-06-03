import {
  Injectable,
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { BuyerLedgerRepository } from './buyer-ledger.repository';
import {
  Prisma,
  ReturnStatus,
  BuyerLedgerType,
  Segment,
  PaymentStatus,
} from '@vyaparnet/database';
import { formatYearMonth } from '../../order/order-state-machine';

import { MetricsService } from '../../observability/metrics.service';
import { Logger } from '@nestjs/common';

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly buyerLedgerRepo: BuyerLedgerRepository,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Initiates a refund for a return request.
   * State Machine: QC_APPROVED -> REFUND_INITIATED
   */
  async initiateRefund(
    returnId: string,
    approvedAmount: string,
    actorId: string,
  ) {
    const returnRequest = await this.prisma.returnRequest.findUnique({
      where: { id: returnId },
      include: { order: true },
    });

    if (!returnRequest) throw new NotFoundException('Return not found');

    if (returnRequest.status !== ReturnStatus.QC_APPROVED) {
      throw new UnprocessableEntityException(
        'Return must be QC_APPROVED to initiate refund',
      );
    }

    const requestedAmountDecimal = new Prisma.Decimal(
      returnRequest.requestedRefundAmount,
    );
    const approvedAmountDecimal = new Prisma.Decimal(approvedAmount);

    // INV-S8-37: Refund amount cannot exceed requested amount
    if (approvedAmountDecimal.greaterThan(requestedAmountDecimal)) {
      throw new UnprocessableEntityException(
        'Approved amount exceeds requested amount',
      );
    }

    // INV-S8-41: Double-refund guard (checked BEFORE transaction)
    const existingLedgerEntry =
      await this.buyerLedgerRepo.findByReturnId(returnId);
    if (existingLedgerEntry) {
      throw new UnprocessableEntityException(
        'Refund already initiated for this return',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // INV-S8-40: BuyerLedger balance MUST be read INSIDE $transaction
      const currentBalance = await this.buyerLedgerRepo.findLatestBalance(
        tx,
        returnRequest.order.buyerId,
      );
      const newBalance = currentBalance.add(approvedAmountDecimal);

      // Update ReturnRequest
      const updatedReturn = await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status: ReturnStatus.REFUND_INITIATED,
          approvedRefundAmount: approvedAmountDecimal,
        },
      });

      // Update Payment status (INV-S8-18)
      // We take the first CAPTURED or PARTIALLY_REFUNDED payment for the order
      const payment = await tx.payment.findFirst({
        where: {
          orderId: returnRequest.orderId,
          status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] },
        },
      });

      if (payment) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REFUND_INITIATED },
        });
      }

      // Append to BuyerLedger (INV-S8-2)
      const ledgerEntry = await this.buyerLedgerRepo.create(tx, {
        buyerId: returnRequest.order.buyerId,
        segment: returnRequest.order.segment as Segment,
        transactionType: BuyerLedgerType.REFUND,
        orderId: returnRequest.orderId,
        amount: approvedAmountDecimal,
        balance: newBalance,
        description: `Refund for return ${returnId}`,
        returnRequestId: returnId,
        createdBy: actorId,
      });

      // Write Outbox Event (INV-S4-OUTBOX)
      await tx.eventOutbox.create({
        data: {
          eventType: 'RefundInitiated',
          schemaVersion: '8.0', // INV-S8-14
          eventMonth: formatYearMonth(new Date()), // INV-S8-16
          deduplicationKey: `RefundInitiated:${returnId}:${actorId}`, // INV-S8-15
          payload: {
            returnId,
            orderId: returnRequest.orderId,
            buyerId: returnRequest.order.buyerId,
            segment: returnRequest.order.segment,
            amount: approvedAmountDecimal.toString(),
            ledgerEntryId: ledgerEntry.id,
          },
        },
      });

      return { updatedReturn, ledgerEntry };
    });

    // ─── Phase 9: Observability & Traces (§20.1, §20.2, §20.4, §20.5) ────────
    // 1. Metric: Increment refund initiated counters
    this.metricsService.refundInitiatedTotal.inc({ segment: returnRequest.order.segment });
    
    // OBS-AR8-18: parseFloat ONLY for Prometheus gauge serialisation
    this.metricsService.refundAmountTotal.set(
      { segment: returnRequest.order.segment }, 
      parseFloat(approvedAmountDecimal.toString())
    );
    this.metricsService.buyerLedgerEntriesTotal.inc({ type: 'REFUND' });
    
    // 2. Structured Log & Trace
    this.logger.log({
      level: 'info',
      event: 'refund.initiate',
      trace_id: `trace_refund_${returnRequest.id}`, // Trace bounds for refund.initiate workflow
      returnId,
      from: ReturnStatus.QC_APPROVED,
      to: ReturnStatus.REFUND_INITIATED,
      actorId,
      orderId: returnRequest.orderId,
      segment: returnRequest.order.segment,
      msg: 'Refund initiated, buyer ledger updated, and outbox event emitted',
    });

    return result;
  }

  /**
   * Marks a refund as fully processed/completed.
   * State Machine: REFUND_INITIATED -> REFUNDED
   */
  async markRefunded(returnId: string) {
    const returnRequest = await this.prisma.returnRequest.findUnique({
      where: { id: returnId },
      include: { order: true },
    });

    if (!returnRequest) throw new NotFoundException('Return not found');
    if (returnRequest.status !== ReturnStatus.REFUND_INITIATED) {
      throw new UnprocessableEntityException(
        'Return must be REFUND_INITIATED to mark as refunded',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedReturn = await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status: ReturnStatus.REFUNDED,
        },
      });

      const payment = await tx.payment.findFirst({
        where: {
          orderId: returnRequest.orderId,
          status: PaymentStatus.REFUND_INITIATED,
        },
      });

      if (payment) {
        // Simple logic for FULLY vs PARTIALLY: if returnRequest.approvedRefundAmount >= payment.amount
        const isFull = returnRequest.approvedRefundAmount.gte(payment.amount);
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: isFull
              ? PaymentStatus.FULLY_REFUNDED
              : PaymentStatus.PARTIALLY_REFUNDED,
            refundedAt: new Date(),
          },
        });
      }

      await tx.eventOutbox.create({
        data: {
          eventType: 'RefundCompleted',
          schemaVersion: '8.0',
          eventMonth: formatYearMonth(new Date()),
          deduplicationKey: `RefundCompleted:${returnId}:SYSTEM`,
          payload: {
            returnId,
            orderId: returnRequest.orderId,
            amount: returnRequest.approvedRefundAmount.toString(),
          },
        },
      });

      return updatedReturn;
    });

    return result;
  }
}
