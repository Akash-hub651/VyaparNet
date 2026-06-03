import { z } from 'zod';

export const CreateRfqItemSchema = z
  .object({
    productId: z.string().min(1, 'Product ID is required'),
    quantity: z.number().int().positive('Quantity must be greater than 0'),
    targetPrice: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'targetPrice must be a valid decimal string'),
  })
  .strict();

export const CreateRfqSchema = z
  .object({
    items: z.array(CreateRfqItemSchema).min(1, 'At least one item is required'),
    segment: z.string().min(1, 'Segment is required'),
    validUntil: z.string().datetime({ message: 'Must be a valid ISO 8601 date string' }),
  })
  .strict();
export type CreateRfqDto = z.infer<typeof CreateRfqSchema>;

export const QuotationItemSchema = z
  .object({
    productId: z.string().min(1, 'Product ID is required'),
    productName: z.string().min(1),
    productSlug: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
    totalPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
    requestedPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  })
  .strict();

export const CreateQuotationSchema = z
  .object({
    subtotal: z.string().regex(/^\d+(\.\d{1,2})?$/),
    taxAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    discount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    grandTotal: z.string().regex(/^\d+(\.\d{1,2})?$/),
    validUntil: z.string().datetime(),
    items: z.array(QuotationItemSchema).min(1),
  })
  .strict();
export type CreateQuotationDto = z.infer<typeof CreateQuotationSchema>;

export const NegotiatePriceSchema = z
  .object({
    proposedPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid decimal string'),
    message: z.string().max(2000, 'Message too long').optional(),
  })
  .strict();
export type NegotiatePriceDto = z.infer<typeof NegotiatePriceSchema>;

export const ProcurementTemplateItemSchema = z
  .object({
    productId: z.string().min(1),
    productName: z.string().min(1).max(200),
    specification: z.string().max(2000).optional(),
    unit: z.string().max(50).optional(),
    targetQuantity: z.number().int().positive(),
    targetPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
  })
  .strict();

export const CreateProcurementTemplateSchema = z
  .object({
    name: z.string().min(1).max(200),
    segment: z.string().min(1),
    items: z
      .array(ProcurementTemplateItemSchema)
      .min(1, 'Template must have at least one item')
      .max(100, 'Template cannot exceed 100 items'),
  })
  .strict();
export type CreateProcurementTemplateDto = z.infer<typeof CreateProcurementTemplateSchema>;

export const UpdateProcurementTemplateSchema = CreateProcurementTemplateSchema.partial().strict();
export type UpdateProcurementTemplateDto = z.infer<typeof UpdateProcurementTemplateSchema>;

export const RfqConvertSchema = z
  .object({
    shippingAddressId: z.string().min(1),
    billingAddressId: z.string().min(1),
    paymentMethod: z.enum(['COD', 'ONLINE_UPI', 'ONLINE_CARD']),
  })
  .strict();
export type RfqConvertDto = z.infer<typeof RfqConvertSchema>;
