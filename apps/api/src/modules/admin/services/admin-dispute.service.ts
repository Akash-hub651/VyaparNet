import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AdminDisputeRepository } from '../repositories/admin-dispute.repository';
import { AdminPayoutRepository } from '../repositories/admin-payout.repository';
import { DisputeStatus, Segment, DisputePriority, PayoutStatus } from '@vyaparnet/database';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { AuditAction } from '@vyaparnet/types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EvidenceService } from '../../trust-safety/evidence/evidence.service';
import { NotificationService } from '../../notification/services/notification.service';

const DISPUTE_ADMIN_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  OPEN: ['UNDER_REVIEW', 'RESOLVED_BUYER', 'RESOLVED_SELLER', 'CLOSED', 'ESCALATED'],
  UNDER_REVIEW: ['ESCALATED', 'RESOLVED_BUYER', 'RESOLVED_SELLER', 'CLOSED'],
  ESCALATED: ['RESOLVED_BUYER', 'RESOLVED_SELLER', 'CLOSED'],
  RESOLVED_BUYER: ['CLOSED'],
  RESOLVED_SELLER: ['CLOSED'],
  CLOSED: [],
};

@Injectable()
export class AdminDisputeService {
  constructor(
    private readonly repository: AdminDisputeRepository,
    private readonly payoutRepository: AdminPayoutRepository,
    private readonly auditSafeWriter: AuditSafeWriterService,
    private readonly prisma: PrismaService,
    private readonly evidenceService: EvidenceService,
    private readonly notificationService: NotificationService,
    @InjectQueue('scorecard') private readonly scorecardQueue: Queue,
  ) {}

  async listDisputes(page: number, limit: number, segment?: Segment, status?: DisputeStatus, priority?: DisputePriority) {
    return this.repository.findMany(page, limit, segment, status, priority);
  }

  async getDisputeDetail(id: string, _adminId: string): Promise<any> {
    const dispute = await this.repository.findById(id);
    if (!dispute) throw new NotFoundException('Dispute not found');

    const imagesWithUrls = await Promise.all(
      (await this.prisma.disputeEvidence.findMany({ where: { disputeId: id } })).map(async (ev) => ({
        url: await this.evidenceService.getEvidenceUrl(ev.fileUrl),
      })),
    );

    const auditLogs = await this.prisma.auditLog.findMany({
      where: { entityId: id, entityType: 'DISPUTE' },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...dispute,
      evidenceImages: imagesWithUrls,
      auditLogs,
    };
  }

  private validateTransition(currentStatus: DisputeStatus, nextStatus: DisputeStatus) {
    if (!DISPUTE_ADMIN_TRANSITIONS[currentStatus].includes(nextStatus)) {
      throw new UnprocessableEntityException(`Invalid transition from ${currentStatus} to ${nextStatus}`);
    }
  }



  async underReview(id: string, adminId: string) {
    const dispute = await this.repository.findById(id);
    if (!dispute) throw new NotFoundException('Dispute not found');

    this.validateTransition(dispute.status, DisputeStatus.UNDER_REVIEW);

    const updated = await this.repository.updateStatus(id, DisputeStatus.UNDER_REVIEW, adminId);

    await this.auditSafeWriter.safeWrite({
      entityType: 'DISPUTE',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      actorId: adminId,
      oldValue: { status: dispute.status },
      newValue: { status: DisputeStatus.UNDER_REVIEW },
    });

    return updated;
  }

  async escalate(id: string, adminId: string) {
    const dispute = await this.repository.findById(id);
    if (!dispute) throw new NotFoundException('Dispute not found');

    this.validateTransition(dispute.status, DisputeStatus.ESCALATED);

    const updated = await this.repository.updateStatus(id, DisputeStatus.ESCALATED, adminId);

    await this.auditSafeWriter.safeWrite({
      entityType: 'DISPUTE',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      actorId: adminId,
      oldValue: { status: dispute.status },
      newValue: { status: DisputeStatus.ESCALATED },
    });

    await this.notificationService.sendDirect('admin_group', 'DisputeEscalated_ADMIN_hi', {
      disputeId: id,
      segment: dispute.order.segment,
    }).catch(err => console.error(err));

    return updated;
  }

  async resolveDispute(id: string, adminId: string, outcome: 'BUYER_FAVORED' | 'SELLER_FAVORED', resolutionText: string) {
    const dispute = await this.repository.findById(id);
    if (!dispute) throw new NotFoundException('Dispute not found');

    const nextStatus = outcome === 'BUYER_FAVORED' ? DisputeStatus.RESOLVED_BUYER : DisputeStatus.RESOLVED_SELLER;
    this.validateTransition(dispute.status, nextStatus);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await this.repository.updateStatus(id, nextStatus, adminId, resolutionText, tx);

      if (nextStatus === DisputeStatus.RESOLVED_BUYER) {
        const payout = await tx.sellerPayout.findFirst({ where: { orderId: dispute.orderId } });
        if (payout && payout.status === PayoutStatus.ON_HOLD) {
          await this.payoutRepository.updateStatus(payout.id, PayoutStatus.CANCELLED, tx);
        }
      }

      return updated;
    });

    await this.auditSafeWriter.safeWrite({
      entityType: 'DISPUTE',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      actorId: adminId,
      oldValue: { status: dispute.status, resolution: dispute.resolution },
      newValue: { status: nextStatus, resolution: resolutionText },
    });

    if (nextStatus === DisputeStatus.RESOLVED_BUYER) {
      const order = await this.prisma.order.findUnique({
        where: { id: dispute.orderId },
        select: { sellerId: true, segment: true },
      });
      if (order) {
        await this.scorecardQueue.add('increment-dispute-rate', {
          businessId: order.sellerId,
          segment: order.segment,
        });
      }
    }

    return result;
  }

  async closeDispute(id: string, adminId: string) {
    const dispute = await this.repository.findById(id);
    if (!dispute) throw new NotFoundException('Dispute not found');

    this.validateTransition(dispute.status, DisputeStatus.CLOSED);

    const updated = await this.repository.updateStatus(id, DisputeStatus.CLOSED, adminId);

    await this.auditSafeWriter.safeWrite({
      entityType: 'DISPUTE',
      entityId: id,
      action: AuditAction.STATUS_CHANGE,
      actorId: adminId,
      oldValue: { status: dispute.status },
      newValue: { status: DisputeStatus.CLOSED },
    });

    return updated;
  }
}
