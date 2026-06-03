import { z } from 'zod';

export const SellerScoreSchema = z.object({
  id: z.string(),
  businessId: z.string(),
  compositeScore: z.number().int().min(0).max(100),
  dispatchSpeedScore: z.number().int().min(0).max(100),
  deliveryQualityScore: z.number().int().min(0).max(100),
  acceptanceRate: z.number().int().min(0).max(100),
  returnRate: z.number().int().nonnegative(),
  disputeRate: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
  calculatedAt: z.string().datetime(),
  previousCompositeScore: z.number().int().min(0).max(100).nullable(),
}).strict();

export type SellerScoreDto = z.infer<typeof SellerScoreSchema>;

export const ScorecardNarrativeSchema = z.object({
  dispatch: z.string(),
  delivery: z.string(),
  overall: z.string(),
}).strict();

export const SellerScoreResponseSchema = z.object({
  eligible: z.boolean(),
  compositeScore: z.number().int().min(0).max(100),
  dispatchSpeedScore: z.number().int().min(0).max(100),
  deliveryQualityScore: z.number().int().min(0).max(100),
  acceptanceRate: z.number().int().min(0).max(100),
  returnRate: z.number().int().nonnegative().optional(),
  disputeRate: z.number().int().nonnegative().optional(),
  orderCount: z.number().int().nonnegative(),
  calculatedAt: z.string(), // ISO8601
  narrative: ScorecardNarrativeSchema,
  previousCompositeScore: z.number().int().min(0).max(100).nullable(),
  scoreTrend: z.enum(['UP', 'DOWN', 'STABLE']).nullable(),
}).strict();

export type SellerScoreResponseDto = z.infer<typeof SellerScoreResponseSchema>;
