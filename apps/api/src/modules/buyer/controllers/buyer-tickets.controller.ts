import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  UnprocessableEntityException,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import type { Request } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { BuyerTicketService } from '../services/buyer-ticket.service';
import { SupportTicketReplySchema } from '@vyaparnet/types';

@UseGuards(JwtAuthGuard)
@Controller('buyer/tickets')
export class BuyerTicketsController {
  constructor(private readonly ticketService: BuyerTicketService) {}

  @Post(':id/reply')
  @UseInterceptors(FilesInterceptor('attachments', 5))
  @HttpCode(HttpStatus.CREATED)
  async replyToTicket(
    @Param('id') id: string,
    @Body() rawBody: Record<string, unknown>,
    @Req() req: Request & { user: { id: string } },
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const parsed = SupportTicketReplySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        errors: parsed.error.issues,
      });
    }
    return this.ticketService.replyToTicket(
      id,
      parsed.data,
      req.user.id,
      files || [],
    );
  }

  @Get(':id/messages')
  @HttpCode(HttpStatus.OK)
  async getTicketMessages(
    @Param('id') id: string,
    @Req() req: Request & { user: { id: string } },
  ) {
    return this.ticketService.getTicketMessages(id, req.user.id);
  }
}
