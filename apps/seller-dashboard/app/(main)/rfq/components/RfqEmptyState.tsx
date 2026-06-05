import React from 'react';
import { RfqStatus } from '../../../../lib/api/rfq.client';

interface RfqEmptyStateProps {
  currentTab: RfqStatus | 'ALL';
  hasFilters: boolean;
  onClearFilters: () => void;
}

export function RfqEmptyState({ currentTab, hasFilters, onClearFilters }: RfqEmptyStateProps) {
  if (hasFilters) {
    return (
      <div className="bg-surface-card rounded-xl p-12 text-center border border-neutral-200 shadow-1 flex flex-col items-center justify-center">
        <div className="w-16 h-16 bg-neutral-100 text-neutral-400 rounded-full flex items-center justify-center mb-4">
           <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
           </svg>
        </div>
        <h3 className="text-base font-semibold text-text-primary mb-1">Applied filters se koi RFQ nahi mila.</h3>
        <p className="text-sm text-text-secondary max-w-sm mb-6">Search criteria change karein ya filters hatayein.</p>
        <button
          type="button"
          onClick={onClearFilters}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-md transition-colors"
        >
          Filters hatayein
        </button>
      </div>
    );
  }

  let icon = (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
  let title = "Aapke segment mein abhi koi RFQ nahi aaya.";
  let body = "Jab buyers RFQ bhejenge, yahan dikhega.";
  let iconBg = "bg-neutral-100 text-neutral-400";

  if (currentTab === 'NOT_QUOTED') {
    icon = (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
    title = "Sab RFQs pe quote bhej diya! 💪";
    body = "Naye RFQs aayenge to yahan dikhenge.";
    iconBg = "bg-success-50 text-success-500";
  } else if (currentTab === 'QUOTED') {
    title = "Abhi koi quoted RFQ nahi";
    body = "Jab aap kisi RFQ pe quote bhejenge, woh yahan dikhega.";
  } else if (currentTab === 'EXPIRED') {
    title = "Koi expired RFQ nahi — great!";
    body = "";
  } else if (currentTab === 'WON') {
    title = "Abhi tak koi RFQ won nahi hua.";
    body = "Quotes submit karte rahein.";
  } else if (currentTab === 'LOST') {
    title = "Koi lost RFQ nahi hai.";
    body = "";
  }

  return (
    <div className="bg-surface-card rounded-xl p-16 text-center border border-neutral-200 shadow-1 flex flex-col items-center justify-center min-h-[400px]">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-5 ${iconBg}`}>
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
      {body && <p className="text-sm text-text-secondary max-w-sm">{body}</p>}
    </div>
  );
}
