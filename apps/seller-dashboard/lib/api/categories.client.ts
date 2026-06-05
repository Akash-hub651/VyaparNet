/**
 * Categories API Client — apps/seller-dashboard/lib/api/categories.client.ts
 *
 * Authority: seller_dashboard_architecture.md §9.1
 *
 * Rules:
 * - Returns ApiResult<T> from client.ts
 * - Uses apiGet wrapper
 * - filterConfig is JSONB
 */

import { z } from "zod";
import { Segment } from "@vyaparnet/types";
import { apiFetch, ApiResult } from "./client";

// ─────────────────────────────────────────────────────────────
// FilterConfig type
// ─────────────────────────────────────────────────────────────

export interface FilterConfigOption {
  label: string;
  value: string;
}

export interface FilterConfigField {
  key: string;
  label: string;
  type: "range" | "multiselect" | "select" | "checkbox";
  options?: FilterConfigOption[];
  min?: number;
  max?: number;
  unit?: string;
}

export interface FilterConfig {
  filters: FilterConfigField[];
}

// ─────────────────────────────────────────────────────────────
// Zod response schemas
// ─────────────────────────────────────────────────────────────

export const CategoryResponseSchema: z.ZodType<CategoryResponse> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable().optional(),
    segment: z.nativeEnum(Segment),
    parentId: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    displayOrder: z.number().default(0),
    isActive: z.boolean().default(true),
    filterConfig: z.any().nullable().optional(),
    children: z.array(z.lazy(() => CategoryResponseSchema)).optional(),
  }),
);

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  segment: Segment;
  parentId?: string | null;
  imageUrl?: string | null;
  displayOrder: number;
  isActive: boolean;
  filterConfig?: FilterConfig | null;
  children?: CategoryResponse[];
}

// ─────────────────────────────────────────────────────────────
// Segment attribute schema types
// ─────────────────────────────────────────────────────────────

export interface AttributePropertyDef {
  label: string;
  type: "string" | "number" | "boolean" | "enum";
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
  description?: string;
}

export interface SegmentAttributeSchemaDef {
  required: string[];
  optional: string[];
  properties: Record<string, AttributePropertyDef>;
}

export interface SegmentAttributeSchemaResponse {
  id: string;
  segment: Segment;
  version: number;
  schema: SegmentAttributeSchemaDef;
  isActive: boolean;
}

// ─────────────────────────────────────────────────────────────
// Categories API Client functions
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/categories
 */
export async function getCategories(
  segment?: Segment,
  token?: string | null,
): Promise<ApiResult<CategoryResponse[]>> {
  const url = segment
    ? `api/v1/categories?segment=${segment}`
    : `api/v1/categories`;
  // Using apiFetch to pass custom cache options for SSR if needed, although client token implies client side
  return apiFetch<CategoryResponse[]>(url, token || "", {
    method: "GET",
    next: { revalidate: 300 },
  });
}

/**
 * GET /api/v1/categories/:id
 */
export async function getCategory(
  id: string,
  token?: string | null,
): Promise<ApiResult<CategoryResponse>> {
  const url = `api/v1/categories/${encodeURIComponent(id)}`;
  return apiFetch<CategoryResponse>(url, token || "", {
    method: "GET",
    next: { revalidate: 300 },
  });
}

/**
 * GET /api/v1/segments/:segment/schema
 */
export async function getSegmentAttributeSchema(
  segment: Segment,
  token?: string | null,
): Promise<ApiResult<SegmentAttributeSchemaResponse>> {
  const url = `api/v1/segments/${encodeURIComponent(segment)}/schema`;
  return apiFetch<SegmentAttributeSchemaResponse>(url, token || "", {
    method: "GET",
    next: { revalidate: 600 },
  });
}
