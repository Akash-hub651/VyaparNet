import { Injectable, NotFoundException } from '@nestjs/common';
import { BuyerTicketRepository } from '../repositories/buyer-ticket.repository';
import { SupportTicketReplyDto } from '@vyaparnet/types';
import { NotificationService } from '../../notification/services/notification.service';
import { EvidenceService } from '../../trust-safety/evidence/evidence.service';

@Injectable()
export class BuyerTicketService {
  constructor(
    private readonly ticketRepo: BuyerTicketRepository,
    private readonly notificationService: NotificationService,
    private readonly evidenceService: EvidenceService,
  ) {}

  async getTicketMessages(id: string, buyerId: string) {
    const ticket = await this.ticketRepo.findByIdForBuyer(id, buyerId);
    if (!ticket) throw new NotFoundException({ code: 'TICKET_NOT_FOUND', id });
    return this.ticketRepo.getMessages(id);
  }

  async replyToTicket(id: string, dto: SupportTicketReplyDto, buyerId: string, files: Express.Multer.File[] = []) {
    const ticket = await this.ticketRepo.findByIdForBuyer(id, buyerId);
    if (!ticket) throw new NotFoundException({ code: 'TICKET_NOT_FOUND', id });

    const attachmentKeys: string[] = [];
    if (files.length > 0) {
      for (const file of files) {
        const key = await this.evidenceService.uploadEvidence(
          'ticket',
          id,
          file.buffer,
          file.originalname
        );
        attachmentKeys.push(key);
      }
    }

    const message = await this.ticketRepo.addMessage(
      id,
      buyerId,
      dto.message,
      attachmentKeys,
      dto.clientMessageId
    );

    if (ticket.assignedTo) {
      await this.notificationService.sendDirect(
        ticket.assignedTo,
        'SupportTicketReplyReceived',
        { ticketId: id, messageId: message.id }
      );
    }

    return message;
  }
}
