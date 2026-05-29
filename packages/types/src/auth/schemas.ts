import { z } from 'zod';
import { Segment, UserRole } from '../enums';

/**
 * VyaparNet Auth Zod Schemas
 *
 * These schemas are shared between:
 * - apps/api (server-side validation via ZodValidationPipe)
 * - apps/web (client-side form validation)
 *
 * Authority: VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md Section 2
 */

// ─── OTP ────────────────────────────────────────────────────

export const SendOtpSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+91[6-9][0-9]{9}$/, 'Valid Indian mobile number required (+91XXXXXXXXXX)')
    .describe('Indian mobile number with +91 country code'),
});
export type SendOtpDto = z.infer<typeof SendOtpSchema>;

export const VerifyOtpSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+91[6-9][0-9]{9}$/, 'Valid Indian mobile number required'),
  otp: z
    .string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^[0-9]{6}$/, 'OTP must contain only digits'),
  deviceId: z
    .string()
    .uuid('Device ID must be a valid UUID')
    .describe('Client-generated persistent device identifier (UUID) for session tracking'),
});
export type VerifyOtpDto = z.infer<typeof VerifyOtpSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .uuid('Refresh token must be a valid UUID'),
});
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;

// ─── User ────────────────────────────────────────────────────

export const UpdateUserSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters')
    .optional(),
  email: z
    .string()
    .email('Valid email address required')
    .optional(),
  language: z
    .enum(['hi', 'en'])
    .optional()
    .default('hi'),
});
export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;

// ─── Onboarding ───────────────────────────────────────────────

export const OnboardBusinessSchema = z.object({
  businessName: z
    .string()
    .min(3, 'Business name must be at least 3 characters')
    .max(200, 'Business name must not exceed 200 characters'),
  businessType: z
    .enum(['TEXTILE', 'SPARE_PARTS'])
    .describe('Primary business segment'),
  segment: z.nativeEnum(Segment),
  gstNumber: z
    .string()
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      'Invalid GST number format'
    )
    .optional()
    .describe('GST number — optional during onboarding'),
  city: z
    .string()
    .min(2, 'City name required')
    .max(100),
  state: z
    .string()
    .min(2, 'State name required')
    .max(100),
  pincode: z
    .string()
    .regex(/^[1-9][0-9]{5}$/, 'Valid 6-digit Indian pincode required'),
  language: z
    .enum(['hi', 'en'])
    .default('hi'),
});
export type OnboardBusinessDto = z.infer<typeof OnboardBusinessSchema>;

// ─── Auth Responses ───────────────────────────────────────────

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;       // Access token TTL in seconds (900)
  tokenType: 'Bearer';
}

export interface UserProfileResponse {
  id: string;
  phoneNumber: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  segment: Segment;
  kycStatus: string;
  isPhoneVerified: boolean;
  createdAt: string;
  businesses: BusinessSummary[];
}

export interface BusinessSummary {
  id: string;
  name: string;
  segment: Segment;
  kycStatus: string;
  isVerified: boolean;
}

// ─── Address ──────────────────────────────────────────────────

export const CreateAddressSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  line1: z.string().min(5, 'Address line 1 must be at least 5 characters').max(200),
  line2: z.string().optional().nullable(),
  city: z.string().min(2, 'City must be at least 2 characters').max(100),
  state: z.string().min(2, 'State must be at least 2 characters').max(100),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Valid 6-digit Indian pincode required'),
  landmark: z.string().optional().nullable(),
  isDefault: z.boolean().default(false),
});
export type CreateAddressDto = z.infer<typeof CreateAddressSchema>;

export const AddressDto = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  line1: z.string(),
  line2: z.string().nullable().optional(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  landmark: z.string().nullable().optional(),
  country: z.string(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  isDefault: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type AddressType = z.infer<typeof AddressDto>;

