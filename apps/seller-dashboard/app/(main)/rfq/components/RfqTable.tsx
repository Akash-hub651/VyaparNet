'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RfqViewModel } from '../../../../lib/api/rfq.client';

interface RfqTableProps {
  items: RfqViewModel[];
  isLoading?: boolean;
  canQuote: boolean;
  visibleColumnIds?: string[];
}

function getExpiryDisplay(expiresAtStr: string) {
  const expiresAt = new Date(expiresAtStr).getTime();
  const now = new Date().getTime();
  const diffMs = expiresAt - now;

  if (diffMs <= 0) {
    return { text: 'Expire ho gaya', colorClass: 'text-neutral-500', isUrgent: false };
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffHours > 24) {
    const days = Math.floor(diffHours / 24);
    return { text: `${days} din`, colorClass: 'text-text-secondary', isUrgent: false };
  }
  
  if (diffHours >= 6) {
    return { text: `${diffHours} ghante`, colorClass: 'text-warning-700', isUrgent: false };
  }

  // < 6 hours
  return { 
    text: `${diffHours} ghante ${diffMins} min`, 
    colorClass: 'text-error-700 font-medium', 
    isUrgent: true 
  };
}

export function RfqTable({ items, isLoading, canQuote, visibleColumnIds = ['id_segment', 'product', 'quantity', 'budget', 'expires_in', 'status', 'actions'] }: RfqTableProps) {
  const isColVisible = (id: string) => visibleColumnIds.includes(id);
  const router = useRouter();
  // Force re-render for countdown (simple interval)
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="bg-surface-card rounded-xl shadow-1 overflow-hidden border border-neutral-200" aria-busy="true">
        <div className="p-4 border-b border-neutral-200">
          <div className="h-6 w-32 bg-neutral-200 animate-pulse rounded"></div>
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-4 p-4 border-b border-neutral-100 items-center">
            {isColVisible('id_segment') && <div className="h-4 w-32 bg-neutral-200 animate-pulse rounded"></div>}
            {isColVisible('product') && <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-neutral-200 animate-pulse rounded"></div>
            </div>}
            {isColVisible('actions') && <div className="h-8 w-24 bg-neutral-200 animate-pulse rounded-md"></div>}
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return null; // Parent handles empty state
  }

  return (
    <div className="bg-surface-card rounded-xl shadow-1 border border-neutral-200 overflow-hidden">
      {/* 900px minimum width enforcing horizontal scroll on small devices */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[900px]" role="table">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              {isColVisible('id_segment') && <th className="py-3 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider min-w-[160px]">RFQ ID + Segment</th>}
              {isColVisible('product') && <th className="py-3 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider w-40">Product Required</th>}
              {isColVisible('quantity') && <th className="py-3 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider w-28">Quantity</th>}
              {isColVisible('budget') && <th className="py-3 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider w-36">Budget Range</th>}
              {isColVisible('expires_in') && <th className="py-3 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider w-28">Expires In</th>}
              {isColVisible('status') && <th className="py-3 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider w-32">Status</th>}
              {isColVisible('actions') && <th className="py-3 px-4 text-xs font-medium text-text-secondary uppercase tracking-wider w-24 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.map((item) => {
              const expiry = getExpiryDisplay(item.expiresAt);
              
              // Status Map with explicit Tailwind classes
              let badgeClasses = 'bg-neutral-100 text-neutral-700';
              let badgeLabel: string = item.status;
              if (item.status === 'NOT_QUOTED') { badgeClasses = 'bg-warning-100 text-warning-700'; badgeLabel = 'Quote Karo'; }
              else if (item.status === 'QUOTED') { badgeClasses = 'bg-info-100 text-info-700'; badgeLabel = 'Quoted'; }
              else if (item.status === 'EXPIRED') { badgeClasses = 'bg-neutral-100 text-neutral-700'; badgeLabel = 'Expire'; }
              else if (item.status === 'WON') { badgeClasses = 'bg-success-100 text-success-700'; badgeLabel = 'Won 🎉'; }
              else if (item.status === 'LOST') { badgeClasses = 'bg-neutral-100 text-neutral-700'; badgeLabel = 'Lost'; }

              return (
                <tr key={item.id} className="hover:bg-neutral-50 transition-colors group cursor-pointer" onClick={() => router.push(`/rfq/${item.id}`)}>
                  {isColVisible('id_segment') && (
                    <td className="py-3 px-4 align-top">
                      <p className="text-sm font-medium text-brand-600 mb-1">{item.rfqId}</p>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-brand-50 text-brand-700 border border-brand-100 uppercase tracking-wide">
                        {item.segment.replace(/_/g, ' ')}
                      </span>
                    </td>
                  )}
                  {isColVisible('product') && (
                    <td className="py-3 px-4 align-top">
                      <p className="text-sm font-medium text-text-primary line-clamp-2">{item.productRequired}</p>
                    </td>
                  )}
                  {isColVisible('quantity') && (
                    <td className="py-3 px-4 align-top tabular-nums">
                      <p className="text-sm font-semibold text-text-primary">
                        {item.quantity.toLocaleString('en-IN')} <span className="text-xs font-normal text-text-secondary">{item.unit}</span>
                      </p>
                    </td>
                  )}
                  {isColVisible('budget') && (
                    <td className="py-3 px-4 align-top">
                      <p className="text-sm font-mono text-text-primary">
                        {item.budgetMin && item.budgetMax 
                          ? `₹${item.budgetMin.toLocaleString('en-IN')}–₹${item.budgetMax.toLocaleString('en-IN')}`
                          : item.budgetMax 
                            ? `Up to ₹${item.budgetMax.toLocaleString('en-IN')}`
                            : item.budgetMin
                              ? `Min ₹${item.budgetMin.toLocaleString('en-IN')}`
                              : 'Open'}
                      </p>
                    </td>
                  )}
                  {isColVisible('expires_in') && (
                    <td className="py-3 px-4 align-top">
                      <div className="flex items-center gap-1.5">
                        {expiry.isUrgent && (
                          <div className="w-2 h-2 rounded-full bg-error-500 animate-pulse flex-shrink-0" aria-hidden="true" />
                        )}
                        <span className={`text-sm ${expiry.colorClass}`}>{expiry.text}</span>
                      </div>
                    </td>
                  )}
                  {isColVisible('status') && (
                    <td className="py-3 px-4 align-top">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeClasses}`}>
                        {badgeLabel}
                      </span>
                    </td>
                  )}
                  {isColVisible('actions') && (
                    <td className="py-3 px-4 align-top text-right" onClick={(e) => e.stopPropagation()}>
                      {item.status === 'NOT_QUOTED' ? (
                        <div className="relative inline-block" title={!canQuote ? 'Quote bhejne ki permission nahi — owner se baat karein' : ''}>
                          <Link 
                            href={canQuote ? `/rfq/${item.id}` : '#'}
                            className={`inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors h-8 ${canQuote ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-neutral-100 text-neutral-400 cursor-not-allowed opacity-70'}`}
                            onClick={e => { if (!canQuote) e.preventDefault(); }}
                          >
                            Quote Karein
                          </Link>
                        </div>
                      ) : item.status === 'QUOTED' ? (
                        <Link 
                          href={`/rfq/${item.id}`}
                          className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-md transition-colors h-8 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          Quote Dekho
                        </Link>
                      ) : (
                        <Link 
                          href={`/rfq/${item.id}`}
                          className="inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium text-text-secondary bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-md transition-colors h-8 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          View Details
                        </Link>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
