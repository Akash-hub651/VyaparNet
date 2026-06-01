import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AdminTicketRepository } from '../repositories/admin-ticket.repository';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { AuditAction } from '@vyaparnet/types';
import type { 
  AdminTicketListQuery,
  AdminResolveTicketDto,
  AdminEscalateTicketDto,
} from '@vyaparnet/types';

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
  ) {}

  /**
   * listTickets
   */
  async listTickets(filter: AdminTicketListQuery) {
    return this.ticketRepo.findMany(filter as any);
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
    const slaBreachedAt = new Date(ticket.createdAt.getTime() + 24 * 60 * 60 * 1000);

    return {
      ...ticket,
      slaBreachedAt,
    };
  }

  /**
   * assignTicket
   * INV-S7-2: safeWrite() outside $transaction
   */
  async assignTicket(
    id: string,
    adminUserId: string,
    req: any,
  ) {
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
    req: any,
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
    req: any,
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
      newValue: { status: updated.status, priority: updated.priority, reason: dto.escalationReason },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });

    return updated;
  }
}
