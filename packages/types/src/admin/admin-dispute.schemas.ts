import { z } from 'zod';
import { Segment, DisputeStatus, DisputePriority } from '@vyaparnet/database';

export const AdminDisputeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  segment: z.nativeEnum(Segment).optional(),
  status: z.nativeEnum(DisputeStatus).optional(),
  priority: z.nativeEnum(DisputePriority).optional(),
}).strict();

export type AdminDisputeListQueryDto = z.infer<typeof AdminDisputeListQuerySchema>;

export const AdminDisputeResolveSchema = z.object({
  resolutionText: z.string().min(10, 'Resolution text must be at least 10 characters').max(2000), // INV-S8-11
  resolutionOutcome: z.enum(['BUYER_FAVORED', 'SELLER_FAVORED']),
}).strict();

export type AdminDisputeResolveDto = z.infer<typeof AdminDisputeResolveSchema>;
