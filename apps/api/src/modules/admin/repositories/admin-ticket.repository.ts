import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  Prisma,
  SupportTicketStatus,
  SupportTicketPriority,
} from '@vyaparnet/database';

/**
 * AdminTicketRepository — Phase 11
 *
 * Direct Prisma access for Admin Support Tickets.
 * INV-S7-26: direct Prisma access (never import domain repos).
 */
@Injectable()
export class AdminTicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * findMany — returns paginated support tickets.
   */
  async findMany(filter: {
    status?: SupportTicketStatus;
    priority?: SupportTicketPriority;
    assignedTo?: string;
    limit: number;
    cursor?: string;
  }) {
    const where: Prisma.SupportTicketWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.priority) where.priority = filter.priority;
    if (filter.assignedTo) where.assignedTo = filter.assignedTo;

    const tickets = await this.prisma.supportTicket.findMany({
      where,
      take: filter.limit + 1,
      cursor: filter.cursor ? { id: filter.cursor } : undefined,
      orderBy: [
        { priority: 'desc' }, // CRITICAL first
        { createdAt: 'asc' }, // Oldest first
      ],
      include: {
        user: { select: { id: true, email: true, role: true } },
        assigned: { select: { id: true, email: true } }, // Prisma generated: SupportTicketInclude.assigned (from @relation("TicketAssignee"))
      },
    });

    let nextCursor: string | null = null;
    if (tickets.length > filter.limit) {
      const nextItem = tickets.pop();
      nextCursor = nextItem!.id;
    }

    return {
      data: tickets,
      nextCursor,
      hasMore: nextCursor !== null,
    };
  }

  /**
   * findById — returns single ticket detail.
   */
  async findById(id: string) {
    return this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, role: true } },
        assigned: { select: { id: true, email: true } }, // Prisma generated: SupportTicketInclude.assigned
      },
    });
  }

  /**
   * assign — assigns ticket to admin, updates firstResponseAt if first.
   * Executed inside $transaction.
   */
  async assign(id: string, adminUserId: string, tx: Prisma.TransactionClient) {
    const ticket = await tx.supportTicket.findUniqueOrThrow({
      where: { id },
      select: { firstResponseAt: true },
    });

    const data: Prisma.SupportTicketUncheckedUpdateInput = {
      assignedTo: adminUserId,
      status: 'IN_PROGRESS',
    };

    if (!ticket.firstResponseAt) {
      data.firstResponseAt = new Date();
    }

    return tx.supportTicket.update({
      where: { id },
      data,
    });
  }

  /**
   * resolve — resolves ticket with note.
   * Executed inside $transaction.
   */
  async resolve(
    id: string,
    note: string | undefined,
    tx: Prisma.TransactionClient,
  ) {
    return tx.supportTicket.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedNote: note,
        resolvedAt: new Date(),
      },
    });
  }

  /**
   * escalate — escalates ticket to CRITICAL.
   * Executed inside $transaction.
   */
  async escalate(id: string, _reason: string, tx: Prisma.TransactionClient) {
    // Reason is passed here to match the spec but we don't store escalationReason
    // in the model directly in Sprint 7. We will store it in EventOutbox payload
    // and log it in AuditLog. The status changes to ESCALATED, priority CRITICAL.
    return tx.supportTicket.update({
      where: { id },
      data: {
        priority: 'CRITICAL',
        escalatedAt: new Date(),
      },
    });
  }

  /**
   * addMessage — append a reply to the ticket thread.
   */
  async addMessage(
    ticketId: string,
    senderId: string,
    senderRole: 'ADMIN' | 'BUYER' | 'SELLER',
    message: string,
    attachments: string[],
    clientMessageId: string,
  ) {
    // OBS-AR8-17: deduplication via findFirst
    const existing = await this.prisma.supportTicketMessage.findFirst({
      where: { ticketId, senderId, clientMessageId },
    });
    if (existing) return existing;

    return this.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        senderId,
        senderRole,
        message,
        attachments,
        clientMessageId,
      },
    });
  }

  /**
   * getMessages — fetch messages for a ticket
   */
  async getMessages(ticketId: string) {
    return this.prisma.supportTicketMessage.findMany({
      where: { ticketId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * linkDispute — links a dispute to the ticket
   */
  async linkDispute(
    id: string,
    disputeId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.supportTicket.update({
      where: { id },
      data: { disputeId },
    });
  }
}
