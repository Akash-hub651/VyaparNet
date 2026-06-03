/**
 * Admin Support Ticket DTO Schemas — Phase 1
 *
 * Governs:
 * - AdminTicketListQuerySchema: query params for GET /admin/tickets
 * - AdminAssignTicketDtoSchema: body for PATCH /admin/tickets/:id/assign
 * - AdminResolveTicketDtoSchema: body for PATCH /admin/tickets/:id/resolve
 * - AdminEscalateTicketDtoSchema: body for PATCH /admin/tickets/:id/escalate
 *
 * Invariants:
 * - AUDIT-P1-B: resolvedNote stored in SupportTicket.resolvedNote (added in sprint7_schema migration)
 * - FOOTGUN-1-D: NEVER import from @vyaparnet/database
 */
import { z } from "zod";

export const AdminTicketListQuerySchema = z
  .object({
    status: z
      .enum(["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"])
      .optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
    assignedTo: z.string().optional(), // admin User.id
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type AdminTicketListQuery = z.infer<typeof AdminTicketListQuerySchema>;

// PATCH /admin/tickets/:id/assign
export const AdminAssignTicketDtoSchema = z
  .object({
    adminUserId: z.string().min(1),
  })
  .strict();

export type AdminAssignTicketDto = z.infer<typeof AdminAssignTicketDtoSchema>;

// PATCH /admin/tickets/:id/resolve — stores note in SupportTicket.resolvedNote (AUDIT-P1-B)
export const AdminResolveTicketDtoSchema = z
  .object({
    resolutionNote: z.string().max(2000).optional(),
  })
  .strict();

export type AdminResolveTicketDto = z.infer<typeof AdminResolveTicketDtoSchema>;

// PATCH /admin/tickets/:id/escalate
export const AdminEscalateTicketDtoSchema = z
  .object({
    escalationReason: z
      .string()
      .min(10, { message: "Escalation reason must be at least 10 characters" })
      .max(1000),
  })
  .strict();

export type AdminEscalateTicketDto = z.infer<
  typeof AdminEscalateTicketDtoSchema
>;
