import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { RefundService } from '../../trust-safety/refunds/refund.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { AuditAction } from '@vyaparnet/types';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class AdminRefundService {
  constructor(
    private readonly refundService: RefundService,
    private readonly auditWriter: AuditSafeWriterService,
    @InjectQueue('scorecard') private readonly scorecardQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Orchestrates the refund initiation and ledger modification, 
   * followed by an out-of-band audit log write (INV-S7-2).
   */
  async initiateRefund(returnId: string, approvedAmount: string, actorId: string): Promise<any> {
    const result = await this.refundService.initiateRefund(returnId, approvedAmount, actorId);

    // INV-S7-2: Audit write MUST be outside the $transaction to prevent connection starvation
    await this.auditWriter.safeWrite({
      action: AuditAction.STATUS_CHANGE,
      entityId: returnId,
      entityType: 'RETURN',
      actorId,
      newValue: {
        status: { from: 'QC_APPROVED', to: 'REFUND_INITIATED' },
        approvedRefundAmount: approvedAmount,
        ledgerEntryId: result.ledgerEntry.id,
      },
    });

    return result.updatedReturn;
  }

  /**
   * Orchestrates the completion of a refund.
   */
  async markRefunded(returnId: string, actorId: string): Promise<any> {
    const updatedReturn = await this.refundService.markRefunded(returnId);

    await this.auditWriter.safeWrite({
      action: AuditAction.STATUS_CHANGE,
      entityId: returnId,
      entityType: 'RETURN',
      actorId,
      newValue: {
        status: { from: 'REFUND_INITIATED', to: 'REFUNDED' },
      },
    });

    const order = await this.prisma.order.findUnique({
      where: { id: updatedReturn.orderId },
      select: { sellerId: true, segment: true },
    });

    if (order) {
      await this.scorecardQueue.add('increment-return-rate', {
        businessId: order.sellerId,
        segment: order.segment,
      });
    }

    return updatedReturn;
  }
}
