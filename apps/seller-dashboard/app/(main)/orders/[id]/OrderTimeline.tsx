import React from 'react';
import { TimelineEvent } from '../../../../lib/api/orders.client';
import { CheckCircle2, Circle, AlertCircle } from 'lucide-react';

export interface OrderTimelineProps {
  timeline: TimelineEvent[];
  currentStatus: string;
}

const FLOW_STATES = [
  'PLACED',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'COMPLETED'
];

export function OrderTimeline({ timeline, currentStatus }: OrderTimelineProps) {
  // Determine if there are exceptions
  const hasDispute = timeline.some(t => t.status === 'DISPUTE_OPEN');
  const hasReturn = timeline.some(t => t.status === 'RETURN_INITIATED');
  const isCancelled = currentStatus === 'CANCELLED';

  const renderStep = (status: string, isLast: boolean) => {
    const event = timeline.find(t => t.status === status);
    
    // Find current index in FLOW_STATES
    const currentIndex = FLOW_STATES.indexOf(currentStatus);
    const stepIndex = FLOW_STATES.indexOf(status);
    
    let state = 'FUTURE';
    if (event) {
      state = 'COMPLETED';
    } else if (stepIndex === currentIndex + 1 || (currentIndex === -1 && stepIndex === 0)) {
      state = 'CURRENT';
    }

    if (isCancelled && state !== 'COMPLETED') {
      state = 'FUTURE'; // Skip future states if cancelled
    }

    const isException = status === 'DISPUTE_OPEN' || status === 'RETURN_INITIATED' || status === 'CANCELLED';
    
    return (
      <li key={status} className={`relative flex gap-4 ${isLast ? '' : 'pb-6'}`}>
        {!isLast && (
          <div 
            className={`absolute top-6 left-[11px] bottom-0 w-px border-l-2 ${
              state === 'COMPLETED' ? 'border-brand-600' : 'border-neutral-200 border-dashed'
            }`} 
          />
        )}
        
        <div className="shrink-0 mt-1">
          {state === 'COMPLETED' && !isException && (
            <CheckCircle2 size={24} className="text-brand-600 bg-surface-default" />
          )}
          {state === 'COMPLETED' && status === 'CANCELLED' && (
            <AlertCircle size={24} className="text-error-600 bg-surface-default" />
          )}
          {state === 'COMPLETED' && (status === 'DISPUTE_OPEN' || status === 'RETURN_INITIATED') && (
            <AlertCircle size={24} className="text-warning-600 bg-surface-default" />
          )}
          {state === 'CURRENT' && !isCancelled && (
            <div className="w-6 h-6 rounded-full border-2 border-brand-600 bg-surface-default flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-brand-600" />
            </div>
          )}
          {state === 'FUTURE' && (
            <Circle size={24} className="text-neutral-300 bg-surface-default" />
          )}
        </div>
        
        <div className="flex-1">
          <p className={`text-sm font-semibold ${
            isException && state === 'COMPLETED' ? (status === 'CANCELLED' ? 'text-error-700' : 'text-warning-700') :
            state === 'COMPLETED' || state === 'CURRENT' ? 'text-text-primary' : 'text-text-muted'
          }`}>
            {status.replace('_', ' ')}
          </p>
          {event && (
            <p className="text-xs text-text-secondary mt-1">
              {new Date(event.timestamp).toLocaleString('en-IN', {
                day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'
              })} — {event.actor}
            </p>
          )}
          {event?.note && (
            <p className="text-xs text-text-secondary mt-1 italic">{event.note}</p>
          )}
        </div>
      </li>
    );
  };

  const stepsToRender: string[] = [];
  
  // Build dynamic timeline array
  for (let i = 0; i < FLOW_STATES.length; i++) {
    const st = FLOW_STATES[i];
    stepsToRender.push(st);
    
    // Inject exceptions right after the state they happened in
    if (st === currentStatus) {
      if (hasDispute) stepsToRender.push('DISPUTE_OPEN');
      if (isCancelled) stepsToRender.push('CANCELLED');
    }
    if (st === 'DELIVERED' && hasReturn) {
      stepsToRender.push('RETURN_INITIATED');
    }
  }

  // If cancelled happened early, append it
  if (isCancelled && !stepsToRender.includes('CANCELLED')) {
    stepsToRender.push('CANCELLED');
  }

  return (
    <div className="bg-surface-default border border-border-default rounded-lg p-5">
      <h3 className="text-sm font-bold text-text-primary mb-4">Order Timeline</h3>
      <ol role="list">
        {stepsToRender.map((st, idx) => renderStep(st, idx === stepsToRender.length - 1))}
      </ol>
    </div>
  );
}
