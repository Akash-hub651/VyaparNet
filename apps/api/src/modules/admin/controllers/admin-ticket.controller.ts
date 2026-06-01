import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';
import { AdminTicketService } from '../services/admin-ticket.service';
import {
  AdminTicketListQuerySchema,
  AdminAssignTicketDtoSchema,
  AdminResolveTicketDtoSchema,
  AdminEscalateTicketDtoSchema,
} from '@vyaparnet/types';

/**
 * AdminTicketsController — Phase 11 Support Ticket Workflow.
 *
 * INV-S7-1: @UseGuards(JwtAuthGuard, AdminContextGuard) only.
 * INV-S7-7: Idempotency-Key on all state-change endpoints.
 */
@UseGuards(JwtAuthGuard, AdminContextGuard)
@Controller('admin/tickets')
export class AdminTicketsController {
  constructor(private readonly ticketService: AdminTicketService) {}

  /**
   * GET /admin/tickets
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listTickets(@Query() rawQuery: Record<string, unknown>) {
    const parsed = AdminTicketListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        errors: parsed.error.issues,
      });
    }
    return this.ticketService.listTickets(parsed.data);
  }

  /**
   * GET /admin/tickets/:id
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getTicketDetail(@Param('id') id: string) {
    return this.ticketService.getTicketDetail(id);
  }

  /**
   * PATCH /admin/tickets/:id/assign
   */
  @Patch(':id/assign')
  @UseGuards(AdminIdempotencyGuard)
  @HttpCode(HttpStatus.OK)
  async assignTicket(
    @Param('id') id: string,
    @Body() rawBody: Record<string, unknown>,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    // If no body provided, defaults to assigning to the caller admin
    let assigneeId = req.user.id;
    if (Object.keys(rawBody).length > 0) {
      const parsed = AdminAssignTicketDtoSchema.safeParse(rawBody);
      if (!parsed.success) {
        throw new UnprocessableEntityException({
          code: 'VALIDATION_ERROR',
          errors: parsed.error.issues,
        });
      }
      assigneeId = parsed.data.adminUserId;
    }
    
    return this.ticketService.assignTicket(id, assigneeId, req);
  }

  /**
   * PATCH /admin/tickets/:id/resolve
   */
  @Patch(':id/resolve')
  @UseGuards(AdminIdempotencyGuard)
  @HttpCode(HttpStatus.OK)
  async resolveTicket(
    @Param('id') id: string,
    @Body() rawBody: Record<string, unknown>,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    const parsed = AdminResolveTicketDtoSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        errors: parsed.error.issues,
      });
    }
    return this.ticketService.resolveTicket(id, parsed.data, req.user.id, req);
  }

  /**
   * PATCH /admin/tickets/:id/escalate
   */
  @Patch(':id/escalate')
  @UseGuards(AdminIdempotencyGuard)
  @HttpCode(HttpStatus.OK)
  async escalateTicket(
    @Param('id') id: string,
    @Body() rawBody: Record<string, unknown>,
    @Req() req: Request & { user: { id: string }; idempotencyKey: string },
  ) {
    const parsed = AdminEscalateTicketDtoSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        errors: parsed.error.issues,
      });
    }
    return this.ticketService.escalateTicket(id, parsed.data, req.user.id, req);
  }
}
