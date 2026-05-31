import { z } from 'zod';

export const DispatchProofUploadUrlSchema = z.object({
  uploadUrl: z.string().url(),
  s3Key: z.string().min(1).max(500),
  expiresAt: z.string(),
}).strict();

export type DispatchProofUploadUrlDto = z.infer<typeof DispatchProofUploadUrlSchema>;

export const DispatchProofConfirmSchema = z.object({
  s3Key: z.string().min(1).max(500),
}).strict();

export type DispatchProofConfirmDto = z.infer<typeof DispatchProofConfirmSchema>;
