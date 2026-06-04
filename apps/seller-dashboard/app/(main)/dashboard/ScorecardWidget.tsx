'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import type { SellerScorecardDto } from '../../../lib/api/dashboard.client';
import { Skeleton } from '../../../components/ui/Skeleton';

interface ScorecardWidgetProps {
  data?: SellerScorecardDto;
  isLoading: boolean;
  error?: Error;
}

export function ScorecardWidget({ data, isLoading, error }: ScorecardWidgetProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);

  if (error) {
    return (
      <div className="bg-surface-card border border-border-default rounded-lg p-5 md:h-[280px] flex flex-col items-center justify-center text-center">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Seller Score</h3>
        <p className="text-sm text-error-700">Score load nahi ho paya</p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="bg-surface-card border border-border-default rounded-lg p-5 md:h-[280px]">
        <div className="flex items-center gap-2 mb-6">
          <h3 className="text-sm font-semibold text-text-primary">Seller Score</h3>
          <Info size={14} className="text-text-muted" />
        </div>
        <div className="flex justify-center mb-6 hidden md:flex">
          <Skeleton className="w-24 h-12 rounded-t-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-full h-4" />
          <Skeleton className="w-full h-4" />
        </div>
      </div>
    );
  }

  // Calculate arc for SVG gauge
  const score = data.score;
  const percentage = Math.min(Math.max(score, 0), 100);
  const r = 50;
  const strokeDasharray = r * Math.PI;
  const strokeDashoffset = strokeDasharray - (percentage / 100) * strokeDasharray;

  let scoreColor = 'stroke-success-500 text-success-600';
  if (score < 40) scoreColor = 'stroke-error-500 text-error-600';
  else if (score < 70) scoreColor = 'stroke-warning-500 text-warning-600';

  return (
    <div className="bg-surface-card border border-border-default rounded-lg p-5 md:h-[280px] flex flex-col relative overflow-hidden">
      {/* Header - Interactive on mobile */}
      <div 
        className="flex items-center justify-between mb-2 cursor-pointer md:cursor-default"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        tabIndex={0}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">Seller Score</h3>
          <button className="text-text-muted hover:text-text-primary transition-colors hidden md:block" title="Score breakdown help">
            <Info size={14} />
          </button>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <span className={`text-lg font-bold ${scoreColor.split(' ')[1]}`}>{score}</span>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Content area: hidden on mobile unless expanded */}
      <div className={`flex-col flex-1 ${isExpanded ? 'flex' : 'hidden md:flex'}`}>
        {/* SVG Semi-circle Gauge - hidden on mobile to save vertical space unless explicitly needed, but per spec "collapsed (expandable accordion)" implies the whole content is accordion */}
        <div className="flex flex-col items-center justify-center relative my-2" aria-hidden="true">
          <svg width="120" height="60" viewBox="0 0 120 60" className="overflow-visible">
            {/* Background Arc */}
            <path
              d="M 10 60 A 50 50 0 0 1 110 60"
              fill="none"
              stroke="var(--color-neutral-200, #e5e5e5)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Foreground Arc */}
            <path
              d="M 10 60 A 50 50 0 0 1 110 60"
              fill="none"
              className={scoreColor.split(' ')[0]}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
            />
          </svg>
          
          <div className="absolute bottom-0 left-0 right-0 flex justify-center items-baseline gap-1">
            <span className={`text-3xl font-bold ${scoreColor.split(' ')[1]}`}>{score}</span>
            <span className="text-lg text-text-secondary">/100</span>
          </div>
        </div>

        {/* Breakdown */}
        <div className="flex-1 mt-4 flex flex-col gap-2">
          {data.breakdown ? (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">Order Fulfillment Rate:</span>
                <span className="font-medium">
                  {data.breakdown.orderFulfillment}%
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">Return Rate:</span>
                <span className="font-medium">
                  {data.breakdown.returnRate}%
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">Response Time:</span>
                <span className="font-medium">
                  {data.breakdown.responseTime} hrs
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-text-secondary text-center">
              {data.narrative || 'Score breakdown abhi available nahi hai.'}
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-border-default text-center">
          <Link href="/analytics" className="text-xs font-medium text-brand-600 hover:underline">
            Score improve karein →
          </Link>
        </div>
      </div>
    </div>
  );
}
