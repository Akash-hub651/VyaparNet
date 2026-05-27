/**
 * Categories API Client — apps/web/lib/api/categories.client.ts
 *
 * Authority: SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md Section 9.1
 *
 * Rules:
 * - Returns { data, error } discriminated union — NEVER throws
 * - Includes Authorization header if token present
 * - Typed response with filterConfig support
 * - filterConfig is JSONB — typed as FilterConfig for runtime safety
 */

import { z } from 'zod';
import { Segment } from '@vyaparnet/types';
import { getApiBaseUrl } from '../config';

// ─────────────────────────────────────────────────────────────
// FilterConfig type — driven by category.filterConfig JSONB
// ─────────────────────────────────────────────────────────────

export interface FilterConfigOption {
  label: string;
  value: string;
}

export interface FilterConfigField {
  key: string;          // attribute key in segmentAttributes
  label: string;        // display label (Hindi or English)
  type: 'range' | 'multiselect' | 'select' | 'checkbox';
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
  })
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

export const CategoryListResponseSchema = z.object({
  data: z.array(CategoryResponseSchema),
});

export type CategoryListResponse = z.infer<typeof CategoryListResponseSchema>;

// ─────────────────────────────────────────────────────────────
// Segment attribute schema types (for dynamic form rendering)
// ─────────────────────────────────────────────────────────────

export interface AttributePropertyDef {
  label: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
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

export const SegmentAttributeSchemaResponseSchema = z.object({
  id: z.string(),
  segment: z.nativeEnum(Segment),
  version: z.number(),
  schema: z.any(), // typed as SegmentAttributeSchemaDef at usage point
  isActive: z.boolean(),
});

// ─────────────────────────────────────────────────────────────
// Client type
// ─────────────────────────────────────────────────────────────

type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string; status?: number } };

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function buildAuthHeaders(token?: string | null): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ─────────────────────────────────────────────────────────────
// Categories API Client functions
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/categories — fetch category tree
 * Optionally filtered by segment.
 */
export async function getCategories(
  segment?: Segment,
  token?: string | null,
): Promise<ApiResult<CategoryResponse[]>> {
  try {
    const url = new URL(`${getApiBaseUrl()}/api/v1/categories`);
    if (segment) url.searchParams.set('segment', segment);

    const res = await fetch(url.toString(), {
      headers: buildAuthHeaders(token),
      next: { revalidate: 300 }, // Category tree is semi-static — cache 5 min
    });

    if (!res.ok) {
      return { data: null, error: { message: `Categories fetch failed: ${res.statusText}`, status: res.status } };
    }

    const json = await res.json() as { success: boolean; data: unknown };
    if (!json.success) {
      return { data: null, error: { message: 'Categories returned unsuccessful response' } };
    }

    // Parse as array
    const parsed = z.array(CategoryResponseSchema).safeParse(json.data);
    if (!parsed.success) {
      return {
        data: null,
        error: { message: `Category list schema validation failed: ${parsed.error.message}` },
      };
    }

    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}

/**
 * GET /api/v1/categories/:id — fetch single category with filterConfig
 */
export async function getCategory(
  id: string,
  token?: string | null,
): Promise<ApiResult<CategoryResponse>> {
  try {
    const url = `${getApiBaseUrl()}/api/v1/categories/${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      headers: buildAuthHeaders(token),
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return { data: null, error: { message: `Category fetch failed: ${res.statusText}`, status: res.status } };
    }

    const json = await res.json() as { success: boolean; data: unknown };
    if (!json.success) {
      return { data: null, error: { message: 'Category returned unsuccessful response' } };
    }

    const parsed = CategoryResponseSchema.safeParse(json.data);
    if (!parsed.success) {
      return {
        data: null,
        error: { message: `Category schema validation failed: ${parsed.error.message}` },
      };
    }

    return { data: parsed.data, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}

/**
 * GET /api/v1/segments/:segment/schema — fetch SegmentAttributeSchema
 * Used by seller form to dynamically render segment attribute fields.
 */
export async function getSegmentAttributeSchema(
  segment: Segment,
  token?: string | null,
): Promise<ApiResult<SegmentAttributeSchemaResponse>> {
  try {
    const url = `${getApiBaseUrl()}/api/v1/segments/${encodeURIComponent(segment)}/schema`;
    const res = await fetch(url, {
      headers: buildAuthHeaders(token),
      next: { revalidate: 600 }, // Schema rarely changes
    });

    if (!res.ok) {
      return { data: null, error: { message: `Segment schema fetch failed: ${res.statusText}`, status: res.status } };
    }

    const json = await res.json() as { success: boolean; data: unknown };
    if (!json.success) {
      return { data: null, error: { message: 'Segment schema returned unsuccessful response' } };
    }

    const parsed = SegmentAttributeSchemaResponseSchema.safeParse(json.data);
    if (!parsed.success) {
      return {
        data: null,
        error: { message: `Segment schema validation failed: ${parsed.error.message}` },
      };
    }

    return { data: parsed.data as SegmentAttributeSchemaResponse, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
  }
}
