/**
 * segments.ts — apps/seller-dashboard/lib/segments.ts
 *
 * Authority: seller_dashboard_architecture.md §21 (Segment Isolation Rule)
 *
 * D-03 FIX: This module provides the ONLY approved way to get a displayable
 * segment label from a segment key. It is config-driven, not hardcoded inline.
 *
 * Rules:
 * - NEVER hardcode segment keys (TEXTILE, SPARE_PARTS, etc.) in UI component JSX.
 * - NEVER use if/else or switch on segment value in the UI layer.
 * - Segment lists for filter dropdowns must use `useSellerSegments()` hook or
 *   derive from user.businesses[0].segment (backend-driven).
 * - Adding a new segment MUST NOT require any changes to UI component files.
 *   Only this config file would need updating (plus backend onboarding).
 *
 * Future: Replace SEGMENT_LABEL_MAP with GET /api/v1/segments response once
 * that endpoint is available (Sprint 10+). The hook interface will remain identical.
 */

/**
 * Human-readable label for each segment key.
 * Source of truth for UI display. New segments require only a new entry here.
 *
 * Sprint 10 TODO: Replace with API response from GET /segments
 */
export const SEGMENT_LABEL_MAP: Record<string, string> = {
  TEXTILE: 'Textile',
  SPARE_PARTS: 'Spare Parts',
  ELECTRONICS: 'Electronics',
  AGRICULTURE: 'Agriculture',
  PACKAGING: 'Packaging',
  MACHINERY: 'Machinery',
};

/**
 * Get a human-readable label for a segment key.
 * Falls back to a humanized version of the key for unknown segments.
 * This ensures zero breakage when backend adds new segments.
 */
export function getSegmentLabel(segmentKey: string): string {
  if (!segmentKey) return 'Unknown';
  return (
    SEGMENT_LABEL_MAP[segmentKey] ??
    segmentKey
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Derive available segments from user profile businesses.
 * Returns an array of { value, label } objects derived from
 * the user's business segment (backend-driven, not hardcoded).
 *
 * Rationale: In the current platform model, a seller belongs to one primary
 * segment per business. The filter UI shows the segments relevant to the seller.
 * When multi-segment businesses are supported, this will expand naturally.
 *
 * Usage: Replace hardcoded SEGMENTS arrays in filter drawers.
 */
export interface SegmentOption {
  value: string;
  label: string;
}

/**
 * Derive segment options from user's business profile.
 * Returns the seller's own segment plus any additional segments visible
 * in the platform (for marketplace-wide filters like RFQ).
 *
 * Sprint 10 TODO: Replace platformSegments with GET /api/v1/segments API call.
 *
 * @param userSegment - The segment from user.businesses[0].segment
 * @param platformSegments - All platform segments (from API or config). Defaults
 *   to SEGMENT_LABEL_MAP keys until a GET /segments endpoint exists.
 */
export function deriveSegmentOptions(
  _userSegment?: string | null,
  platformSegments?: string[],
): SegmentOption[] {
  // Use provided platform segments, or fall back to config keys
  const allKeys = platformSegments ?? Object.keys(SEGMENT_LABEL_MAP);

  return allKeys.map((key) => ({
    value: key,
    label: getSegmentLabel(key),
  }));
}
