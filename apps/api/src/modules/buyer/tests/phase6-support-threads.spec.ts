import { Test, TestingModule } from '@nestjs/testing';
import { BuyerTicketService } from '../services/buyer-ticket.service';
import { BuyerTicketRepository } from '../repositories/buyer-ticket.repository';
import { NotificationService } from '../../notification/services/notification.service';
import { EvidenceService } from '../../trust-safety/evidence/evidence.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Phase 6: Support Ticket Threads - Buyer', () => {
  let service: BuyerTicketService;
  let ticketRepo: unknown;
  let notificationService: unknown;
  let evidenceService: unknown;
  let prisma: unknown;

  beforeEach(async () => {
    ticketRepo = {
      findByIdForBuyer: vi.fn(),
      getMessages: vi.fn(),
      addMessage: vi.fn(),
    };

    notificationService = {
      sendDirect: vi.fn(),
    };

    evidenceService = {
      uploadEvidence: vi.fn(),
    };

    prisma = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BuyerTicketService,
        { provide: BuyerTicketRepository, useValue: ticketRepo },
        { provide: NotificationService, useValue: notificationService },
        { provide: EvidenceService, useValue: evidenceService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BuyerTicketService>(BuyerTicketService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('replyToTicket', () => {
    it('should throw NotFoundException if ticket not found or wrong owner', async () => {
      ticketRepo.findByIdForBuyer.mockResolvedValue(null);
      await expect(
        service.replyToTicket(
          't1',
          { message: 'hello', clientMessageId: '123' },
          'buyer1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should add message and notify assigned admin if assigned', async () => {
      ticketRepo.findByIdForBuyer.mockResolvedValue({
        id: 't1',
        assignedTo: 'admin1',
      });
      ticketRepo.addMessage.mockResolvedValue({ id: 'm1' });
      evidenceService.uploadEvidence.mockResolvedValue('s3://buyer/test.jpg');

      const files: unknown[] = [
        { buffer: Buffer.from('test'), originalname: 'test.jpg' },
      ];
      const result = await service.replyToTicket(
        't1',
        { message: 'hello', clientMessageId: '123' },
        'buyer1',
        files,
      );

      expect(evidenceService.uploadEvidence).toHaveBeenCalledWith(
        'ticket',
        't1',
        expect.any(Buffer),
        'test.jpg',
      );
      expect(ticketRepo.addMessage).toHaveBeenCalledWith(
        't1',
        'buyer1',
        'hello',
        ['s3://buyer/test.jpg'],
        '123',
      );
      expect(notificationService.sendDirect).toHaveBeenCalledWith(
        'admin1',
        'SupportTicketReplyReceived',
        { ticketId: 't1', messageId: 'm1' },
      );
      expect(result).toEqual({ id: 'm1' });
    });

    it('should deduplicate messages using clientMessageId (OBS-AR8-17)', async () => {
      // Simulate that the repository will return the existing message instead of creating a new one
      ticketRepo.findByIdForBuyer.mockResolvedValue({ id: 't1' });
      ticketRepo.addMessage.mockResolvedValue({ id: 'existing_m1', clientMessageId: 'dedup_123' });

      const result = await service.replyToTicket(
        't1',
        { message: 'hello', clientMessageId: 'dedup_123' },
        'buyer1',
      );

      expect(ticketRepo.addMessage).toHaveBeenCalledWith(
        't1',
        'buyer1',
        'hello',
        [],
        'dedup_123',
      );
      expect(result).toEqual({ id: 'existing_m1', clientMessageId: 'dedup_123' });
    });
  });
});
