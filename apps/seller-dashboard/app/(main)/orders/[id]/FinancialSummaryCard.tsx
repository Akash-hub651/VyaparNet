import React from 'react';
import { formatAmount } from '../../../../lib/formatters';
import { StatusBadge } from '../../../../components/ui/StatusBadge';

export interface FinancialSummaryCardProps {
  payment: {
    method: string;
    status: string;
    subtotal: string;
    tax: string;
    total: string;
    payoutStatus?: string;
    payoutDate?: string;
    payoutAmount?: string;
    platformFee?: string;
  };
}

export function FinancialSummaryCard({ payment }: FinancialSummaryCardProps) {
  return (
    <div className="bg-surface-default border border-border-default rounded-lg p-5">
      <h3 className="text-sm font-bold text-text-primary mb-4">Payment Details</h3>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">Method</span>
          <span className="text-sm font-medium text-text-primary">{payment.method}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-secondary">Status</span>
          {/* Note: In a real app we'd have a specific Payout/Payment status badge mapping. For now we use the raw string if the StatusBadge doesn't support it, but StatusBadge in phase 0 should support basic colors based on standard strings. We'll pass it anyway. */}
          <StatusBadge status={payment.status as any} />
        </div>
        
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-secondary">Order Amount</span>
            <span className="text-sm text-text-primary tabular-nums font-mono">{formatAmount(parseFloat(payment.subtotal))}</span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-secondary">GST (18%)</span>
            <span className="text-sm text-text-primary tabular-nums font-mono">{formatAmount(parseFloat(payment.tax))}</span>
          </div>
          <div className="w-full h-px bg-border-default my-2" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-text-primary">Total</span>
            <span className="text-sm font-bold text-text-primary tabular-nums font-mono">{formatAmount(parseFloat(payment.total))}</span>
          </div>
        </div>
      </div>

      {(payment.payoutStatus || payment.payoutAmount) && (
        <>
          <div className="w-full h-px bg-border-default my-5" />
          
          <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-4">Payout details</h4>
          
          <div className="space-y-4">
            {payment.payoutStatus && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Payout Status</span>
                <StatusBadge status={payment.payoutStatus as any} />
              </div>
            )}
            
            {payment.payoutDate && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Expected Date</span>
                <span className="text-sm font-medium text-text-primary">
                  {new Date(payment.payoutDate).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short'
                  })}
                </span>
              </div>
            )}
            
            {payment.payoutAmount && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Payout Amount</span>
                <span className="text-sm font-bold text-success-600 tabular-nums font-mono">{formatAmount(parseFloat(payment.payoutAmount))}</span>
              </div>
            )}
            
            {payment.platformFee && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Platform Fee</span>
                <span className="text-sm text-text-secondary tabular-nums font-mono">-{formatAmount(parseFloat(payment.platformFee))}</span>
              </div>
            )}
          </div>
          
          <p className="text-xs text-text-muted mt-4 italic">
            Payout amount platform fee ke baad
          </p>
        </>
      )}
    </div>
  );
}
