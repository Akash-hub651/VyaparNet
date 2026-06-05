import { apiGet, apiPatch, ApiResult } from "./client";

export interface BusinessTypeViewModel {
  id: string;
  name: string;
}

export interface PincodeLookupResponse {
  city: string;
  state: string;
  pincode: string;
}

export interface BusinessProfileUpdateDto {
  // Business Details
  businessName?: string;
  businessType?: string;
  gstNumber?: string;
  panNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;

  // Owner Details
  ownerName?: string;
  email?: string;

  // Brand Details
  brandName?: string;
  brandTagline?: string;
  logoUrl?: string; // Logo file upload should ideally return URL, then we patch it.
}

/**
 * Get available business types from config
 */
export async function getBusinessTypes(
  token: string,
): Promise<ApiResult<BusinessTypeViewModel[]>> {
  return apiGet<BusinessTypeViewModel[]>(
    "/seller/config/business-types",
    token,
  );
}

/**
 * Lookup City and State by Pincode
 */
export async function lookupPincode(
  pincode: string,
  token: string,
): Promise<ApiResult<PincodeLookupResponse>> {
  return apiGet<PincodeLookupResponse>(`/pincode/${pincode}`, token);
}

/**
 * Update Seller Profile (Partial update supported via PATCH)
 */
export async function updateBusinessProfile(
  data: Partial<BusinessProfileUpdateDto>,
  token: string,
): Promise<ApiResult<{ success: boolean; message: string }>> {
  return apiPatch<{ success: boolean; message: string }>(
    "/seller/profile",
    token,
    data,
  );
}
