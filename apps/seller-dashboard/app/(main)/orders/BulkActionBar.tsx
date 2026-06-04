import React, { useEffect, useRef, useState } from 'react';
import { Download, PackageCheck, Truck } from 'lucide-react';
import { useSellerPermissions } from '../../../lib/hooks/useSellerPermissions';
import { OrderPreviewDto, confirmOrder } from '../../../lib/api/orders.client';
import { useToast } from '../../../components/ui/Toast';

export interface BulkActionBarProps {
  selectedCount: number;
  selectedIds: string[];
  orders: OrderPreviewDto[];
  onDeselectAll: () => void;
  onSuccess: () => void;
  onOpenShipping: () => void;
}

export function BulkActionBar({
  selectedCount,
  selectedIds,
  orders,
  onDeselectAll,
  onSuccess,
  onOpenShipping
}: BulkActionBarProps) {
  const perms = useSellerPermissions();
  const { addToast } = useToast();
  const firstActionRef = useRef<HTMLButtonElement>(null);
  
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmProgress, setConfirmProgress] = useState(0);

  // L-07 FIX: Focus management when bar appears
  useEffect(() => {
    if (firstActionRef.current) {
      firstActionRef.current.focus();
    }
  }, []);

  const selectedOrders = orders.filter(o => selectedIds.includes(o.id));
  const allPlaced = selectedOrders.length > 0 && selectedOrders.every(o => o.status === 'PLACED');
  const allConfirmed = selectedOrders.length > 0 && selectedOrders.every(o => o.status === 'CONFIRMED');

  const handleBulkConfirm = async () => {
    if (!allPlaced || isConfirming) return;
    setIsConfirming(true);
    setConfirmProgress(0);
    
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedIds.length; i++) {
      const id = selectedIds[i];
      const res = await confirmOrder(id, 'mock-token');
      if (!res.success) failCount++;
      else successCount++;
      
      setConfirmProgress(i + 1);
    }

    if (failCount === 0) {
      addToast({ variant: 'success', message: `${successCount} orders confirm ho gaye!` });
      onDeselectAll();
      onSuccess();
    } else {
      addToast({ variant: 'error', message: `${failCount} orders confirm nahi ho sake.` });
      // Still refresh to show the ones that did succeed
      onSuccess();
    }

    setIsConfirming(false);
  };

  const handleExportSelected = () => {
    const csvContent = [
      ['Order Number', 'Buyer Name', 'Amount', 'Status', 'Segment', 'Created At'],
      ...selectedOrders.map(o => [o.orderNumber, o.buyerName, o.amount, o.status, o.segment, o.createdAt])
    ].map(e => e.join(',')).join('\\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `vyaparnet_selected_orders_${dateStr}_${selectedOrders.length}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onDeselectAll();
  };

  return (
    <div 
      className="flex flex-col sm:flex-row items-center justify-between bg-brand-50 border border-brand-200 rounded-md p-3 shadow-1 animate-fade-in"
      role="toolbar" 
      aria-label="Bulk actions"
    >
      <div className="flex items-center gap-3 w-full sm:w-auto mb-3 sm:mb-0">
        <span className="text-sm font-semibold text-brand-800" aria-live="polite">
          {selectedCount} orders selected
        </span>
        <button 
          onClick={onDeselectAll}
          className="text-sm text-brand-600 hover:text-brand-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        >
          Selection hatao
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
        <button
          ref={firstActionRef}
          disabled={!allPlaced || isConfirming || perms.isSuspended}
          onClick={handleBulkConfirm}
          title={!allPlaced ? "Sirf PLACED orders confirm ho sakti hain" : ""}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
        >
          <PackageCheck size={16} />
          {isConfirming ? `${confirmProgress} of ${selectedCount} confirm ho rahe hain...` : 'Confirm Selected'}
        </button>

        {/* Hide Ship and Export for Staff users */}
        {!perms.businessMissing && (
          <>
            <button
              disabled={!allConfirmed || perms.isSuspended}
              onClick={onOpenShipping}
              title={!allConfirmed ? "Sirf CONFIRMED orders ship ho sakti hain" : ""}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-text-primary bg-surface-default border border-border-default hover:bg-surface-hover rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Truck size={16} />
              Ship Selected
            </button>
            <button
              onClick={handleExportSelected}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-text-primary bg-surface-default border border-border-default hover:bg-surface-hover rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Download size={16} />
              Export Selected
            </button>
          </>
        )}
      </div>
    </div>
  );
}
