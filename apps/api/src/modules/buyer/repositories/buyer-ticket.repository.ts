import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class BuyerTicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdForBuyer(id: string, buyerId: string) {
    return this.prisma.supportTicket.findFirst({
      where: { id, userId: buyerId },
    });
  }

  async getMessages(ticketId: string) {
    return this.prisma.supportTicketMessage.findMany({
      where: { ticketId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addMessage(
    ticketId: string,
    senderId: string,
    message: string,
    attachments: string[],
    clientMessageId: string
  ) {
    const existing = await this.prisma.supportTicketMessage.findFirst({
      where: { ticketId, senderId, clientMessageId },
    });
    if (existing) return existing;

    return this.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        senderId,
        senderRole: 'BUYER',
        message,
        attachments,
        clientMessageId,
      },
    });
  }
}
