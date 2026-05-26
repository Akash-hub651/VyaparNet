import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/prisma/prisma.service';

@Injectable()
export class TicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createLockoutTicket(data: {
    userId: string;
    requestIp: string;
  }): Promise<void> {
    await this.prisma.supportTicket.create({
      data: {
        userId: data.userId,
        subject: 'Account Lockout - OTP Failed 5 Times',
        description: `Account locked due to 5 failed OTP attempts. IP: ${data.requestIp}. User may need assistance unlocking.`,
        priority: 'HIGH',
        status: 'OPEN',
      },
    });
  }
}
