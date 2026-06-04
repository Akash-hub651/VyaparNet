'use client';

import React from 'react';
import Link from 'next/link';
import { Filter, ChevronRight } from 'lucide-react';
import { formatRelativeTime } from '../../../lib/formatters';

interface SavedView {
  id: string;
  name: string;
  type: 'orders' | 'products';
  lastUsedAt: string;
}

interface SavedViewsWidgetProps {
  views?: SavedView[];
}

export function SavedViewsWidget({ views = [] }: SavedViewsWidgetProps): React.JSX.Element | null {
  // If seller has no saved views, widget is hidden entirely per spec
  if (!views || views.length === 0) {
    return null;
  }

  // Max 3 views shown
  const displayViews = views.slice(0, 3);

  return (
    <div className="bg-surface-card border border-border-default rounded-lg p-5 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-text-primary">Saved Views</h3>
        <Link href="/orders" className="text-sm font-medium text-brand-600 hover:underline">
          Manage →
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {displayViews.map((view) => (
          <Link
            key={view.id}
            href={`/${view.type}?view=${view.id}`}
            className="flex items-center justify-between p-3 rounded-md hover:bg-surface-hover transition-colors group border border-transparent hover:border-border-default"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <Filter size={16} className="text-text-muted shrink-0" />
              <div className="flex flex-col truncate">
                <span className="text-sm font-medium text-text-primary truncate">
                  {view.name}
                </span>
                <span className="text-xs text-text-secondary">
                  Last used {formatRelativeTime(view.lastUsedAt)}
                </span>
              </div>
            </div>
            <ChevronRight size={16} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
