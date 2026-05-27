/**
 * SegmentAttributeDisplay — apps/web/components/buyer/SegmentAttributeDisplay.tsx
 *
 * Authority: SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md Section 9.3
 *
 * Renders segmentAttributes JSONB dynamically.
 * ZERO hardcoded if (segment === 'TEXTILE') logic.
 * Labels are displayed by humanizing the attribute key.
 * Future: fetch SegmentAttributeSchema labels from API for fully dynamic labels.
 */

import React from 'react';
import { Segment } from '@vyaparnet/types';

interface SegmentAttributeDisplayProps {
  segmentAttributes: Record<string, unknown>;
  segment: Segment;
}

/**
 * Humanize camelCase or snake_case attribute keys into readable labels.
 * Example: "fabricComposition" → "Fabric Composition"
 * Example: "gsm" → "GSM"
 */
function humanizeKey(key: string): string {
  // Handle all-caps abbreviations
  if (key === key.toUpperCase()) return key;
  // camelCase → "Camel Case"
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

export default function SegmentAttributeDisplay({
  segmentAttributes,
  segment,
}: SegmentAttributeDisplayProps): React.JSX.Element | null {
  const entries = Object.entries(segmentAttributes).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );

  if (entries.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold text-[#1E293B] mb-3">
        Product Specifications
        <span className="ml-2 text-xs font-normal text-[#94A3B8] bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-0.5 rounded-full">
          {segment}
        </span>
      </h2>
      <div className="bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] overflow-hidden">
        <dl>
          {entries.map(([key, value], i) => (
            <div
              key={key}
              className={`flex gap-4 px-4 py-2.5 ${
                i % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'
              }`}
            >
              <dt className="text-xs font-medium text-[#64748B] w-40 flex-shrink-0">
                {humanizeKey(key)}
              </dt>
              <dd className="text-sm text-[#1E293B] flex-1">
                {formatValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
