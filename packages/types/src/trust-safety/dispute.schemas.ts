import { z } from 'zod';

export const CreateDisputeDtoSchema = z.object({
  orderId: z.string().cuid(),
  reason: z.string().min(3).max(100),
  description: z.string().min(10).max(2000).optional(),
}).strict(); // INV-S8-36: All Zod schemas use .strict()

export type CreateDisputeDto = z.infer<typeof CreateDisputeDtoSchema>;

export const DisputeResponseDtoSchema = z.object({
  id: z.string().cuid(),
  orderId: z.string().cuid(),
  raisedBy: z.string().cuid(),
  reason: z.string(),
  description: z.string().nullable().optional(),
  status: z.string(), // DisputeStatus
  priority: z.string(), // DisputePriority
  resolvedBy: z.string().cuid().nullable().optional(),
  resolution: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DisputeResponseDto = z.infer<typeof DisputeResponseDtoSchema>;

export const EvidenceUploadDtoSchema = z.object({
  fileType: z.enum(['DOCUMENT', 'IMAGE', 'VIDEO']),
  // File data will be transmitted via multipart/form-data. This DTO handles any accompanying metadata.
}).strict();

export type EvidenceUploadDto = z.infer<typeof EvidenceUploadDtoSchema>;
