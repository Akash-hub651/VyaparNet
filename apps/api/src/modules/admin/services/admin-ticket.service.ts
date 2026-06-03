import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AdminTicketRepository } from '../repositories/admin-ticket.repository';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { AuditAction } from '@vyaparnet/types';
import type {
  AdminTicketListQuery,
  AdminResolveTicketDto,
  AdminEscalateTicketDto,
  AdminLinkDisputeDto,
} from '@vyaparnet/types';
import { SupportTicketReplyDto } from '@vyaparnet/types';
import { NotificationService } from '../../notification/services/notification.service';
import { EvidenceService } from '../../trust-safety/evidence/evidence.service';

/**
 * AdminTicketService — Phase 11 Support Ticket Workflow
 */
@Injectable()
export class AdminTicketService {
  private readonly logger = new Logger(AdminTicketService.name);

  constructor(
    private readonly ticketRepo: AdminTicketRepository,
    private readonly prisma: PrismaService,
    private readonly auditWriter: AuditSafeWriterService,
    private readonly notificationService: NotificationService,
    private readonly evidenceService: EvidenceService,
  ) {}

  /**
   * listTickets
   */
  async listTickets(filter: AdminTicketListQuery) {
    // F-02 Fix: removed `as any` — AdminTicketListQuery matches AdminTicketRepository.findMany() parameter exactly
    return this.ticketRepo.findMany(filter);
  }

  /**
   * getTicketDetail
   */
  async getTicketDetail(id: string) {
    const ticket = await this.ticketRepo.findById(id);
    if (!ticket) {
      throw new NotFoundException({
        code: 'TICKET_NOT_FOUND',
        id,
      });
    }

    // Sprint 7: slaBreachedAt computed at read time (not stored)
    // createdAt + 24 hours
    const slaBreachedAt = new Date(
      ticket.createdAt.getTime() + 24 * 60 * 60 * 1000,
    );

    return {
      ...ticket,
      slaBreachedAt,
    };
  }

  /**
   * assignTicket
   * INV-S7-2: safeWrite() outside $transaction
   */
  async assignTicket(id: string, adminUserId: string, req: Request) {
    const ticket = await this.ticketRepo.findById(id);
    if (!ticket) {
      throw new NotFoundException({ code: 'TICKET_NOT_FOUND', id });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      return this.ticketRepo.assign(id, adminUserId, tx);
    });

    this.logger.log(
      {
        action: 'TICKET_ASSIGNED',
        adminId: adminUserId,
        entityId: id,
        entityType: 'SupportTicket',
        result: 'SUCCESS',
      },
      'ADMIN_TICKET_ASSIGN',
    );

    // FOOTGUN-11-B: Creating AuditLog on ticket assignment
    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'SupportTicket',
      entityId: id,
      entityName: ticket.subject,
      oldValue: { assignedTo: ticket.assignedTo, status: ticket.status },
      newValue: { assignedTo: adminUserId, status: updated.status },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });

    return updated;
  }

  /**
   * resolveTicket
   */
  async resolveTicket(
    id: string,
    dto: AdminResolveTicketDto,
    adminUserId: string,
    req: Request,
  ) {
    const ticket = await this.ticketRepo.findById(id);
    if (!ticket) {
      throw new NotFoundException({ code: 'TICKET_NOT_FOUND', id });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      return this.ticketRepo.resolve(id, dto.resolutionNote, tx);
    });

    this.logger.log(
      {
        action: 'TICKET_RESOLVED',
        adminId: adminUserId,
        entityId: id,
        entityType: 'SupportTicket',
        result: 'SUCCESS',
      },
      'ADMIN_TICKET_RESOLVE',
    );

    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'SupportTicket',
      entityId: id,
      entityName: ticket.subject,
      oldValue: { status: ticket.status },
      newValue: { status: updated.status },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });

    return updated;
  }

  /**
   * escalateTicket
   */
  async escalateTicket(
    id: string,
    dto: AdminEscalateTicketDto,
    adminUserId: string,
    req: Request,
  ) {
    const ticket = await this.ticketRepo.findById(id);
    if (!ticket) {
      throw new NotFoundException({ code: 'TICKET_NOT_FOUND', id });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      return this.ticketRepo.escalate(id, dto.escalationReason, tx);
    });

    this.logger.log(
      {
        action: 'TICKET_ESCALATED',
        adminId: adminUserId,
        entityId: id,
        entityType: 'SupportTicket',
        result: 'SUCCESS',
      },
      'ADMIN_TICKET_ESCALATE',
    );

    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      action: AuditAction.STATUS_CHANGE,
      entityType: 'SupportTicket',
      entityId: id,
      entityName: ticket.subject,
      oldValue: { status: ticket.status, priority: ticket.priority },
      newValue: {
        status: updated.status,
        priority: updated.priority,
        reason: dto.escalationReason,
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });

    return updated;
  }

  /**
   * getTicketMessages
   */
  async getTicketMessages(id: string) {
    const ticket = await this.ticketRepo.findById(id);
    if (!ticket) throw new NotFoundException({ code: 'TICKET_NOT_FOUND', id });
    return this.ticketRepo.getMessages(id);
  }

  /**
   * replyToTicket
   */
  async replyToTicket(
    id: string,
    dto: SupportTicketReplyDto,
    adminUserId: string,
    files: Express.Multer.File[] = [],
  ) {
    const ticket = await this.ticketRepo.findById(id);
    if (!ticket) throw new NotFoundException({ code: 'TICKET_NOT_FOUND', id });

    // Enforce INV-S8-13 and INV-S8-30 through EvidenceService
    const attachmentKeys: string[] = [];
    if (files.length > 0) {
      for (const file of files) {
        const key = await this.evidenceService.uploadEvidence(
          'ticket',
          id,
          file.buffer,
          file.originalname,
        );
        attachmentKeys.push(key);
      }
    }

    const message = await this.ticketRepo.addMessage(
      id,
      adminUserId,
      'ADMIN',
      dto.message,
      attachmentKeys,
      dto.clientMessageId,
    );

    // Send direct notification (NO EventOutbox) (D-TKT-2)
    await this.notificationService.sendDirect(
      ticket.userId,
      'SupportTicketReplyReceived',
      { ticketId: id, messageId: message.id },
    );

    return message;
  }

  /**
   * linkDispute
   */
  async linkDispute(
    id: string,
    dto: AdminLinkDisputeDto,
    adminUserId: string,
    req: Request,
  ) {
    const ticket = await this.ticketRepo.findById(id);
    if (!ticket) throw new NotFoundException({ code: 'TICKET_NOT_FOUND', id });

    const dispute = await this.prisma.dispute.findUnique({
      where: { id: dto.disputeId },
    });
    if (!dispute)
      throw new NotFoundException({
        code: 'DISPUTE_NOT_FOUND',
        id: dto.disputeId,
      });

    const updated = await this.ticketRepo.linkDispute(id, dto.disputeId);

    await this.auditWriter.safeWrite({
      actorId: adminUserId,
      action: 'TICKET_DISPUTE_LINKED' as any,
      entityType: 'SupportTicket',
      entityId: id,
      entityName: ticket.subject,
      oldValue: { disputeId: ticket.disputeId },
      newValue: { disputeId: updated.disputeId },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });

    return updated;
  }
}
