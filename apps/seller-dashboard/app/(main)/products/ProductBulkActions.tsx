import React, { useState } from 'react';
import { Archive, Play, RefreshCw, X } from 'lucide-react';
import { ProductStatus } from '@vyaparnet/types';
import { publishProduct, archiveProduct, restoreProduct, type ProductResponse } from '../../../lib/api/products.client';
import { useAuth } from '../../contexts/auth.context';
import { useToast } from '../../../components/ui/Toast';
import { ConfirmDialog } from '../../../components/ui/Modal';

interface ProductBulkActionsProps {
  selectedCount: number;
  products: ProductResponse[];
  onClearSelection: () => void;
  onSuccess: () => void;
}

export function ProductBulkActions({
  selectedCount,
  products,
  onClearSelection,
  onSuccess
}: ProductBulkActionsProps): React.JSX.Element {
  const { accessToken } = useAuth();
  const { addToast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Checks for button states
  const allDrafts = products.every(p => p.status === ProductStatus.DRAFT);
  const allArchived = products.every(p => p.status === ProductStatus.ARCHIVED);
  const canArchive = products.every(p => p.status === ProductStatus.ACTIVE || p.status === ProductStatus.REJECTED);

  const handleBulkPublish = async () => {
    if (!accessToken) return;
    setIsProcessing(true);
    
    let successCount = 0;
    
    for (const product of products) {
      if (product.status !== ProductStatus.DRAFT) continue;
      
      const res = await publishProduct(product.id, accessToken);
      if (res.success) {
        successCount++;
      }
    }
    
    setIsProcessing(false);
    
    if (successCount > 0) {
      addToast({ message: `${successCount} products review ke liye submit ho gaye!`, variant: 'success' });
      onSuccess();
    } else {
      addToast({ message: 'Action fail ho gaya', variant: 'error' });
    }
  };

  const handleBulkArchive = async () => {
    if (!accessToken) return;
    setIsProcessing(true);
    
    let successCount = 0;
    
    for (const product of products) {
      const res = await archiveProduct(product.id, accessToken);
      if (res.success) {
        successCount++;
      }
    }
    
    setIsProcessing(false);
    setShowArchiveConfirm(false);
    
    if (successCount > 0) {
      addToast({ message: `${successCount} products archive ho gaye`, variant: 'success' });
      onSuccess();
    } else {
      addToast({ message: 'Action fail ho gaya', variant: 'error' });
    }
  };

  const handleBulkRestore = async () => {
    if (!accessToken) return;
    setIsProcessing(true);
    
    let successCount = 0;
    
    for (const product of products) {
      if (product.status !== ProductStatus.ARCHIVED) continue;
      const res = await restoreProduct(product.id, accessToken);
      if (res.success) {
        successCount++;
      }
    }
    
    setIsProcessing(false);
    
    if (successCount > 0) {
      addToast({ message: `${successCount} products restore ho gaye`, variant: 'success' });
      onSuccess();
    } else {
      addToast({ message: 'Action fail ho gaya', variant: 'error' });
    }
  };

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-surface-card border border-border-strong rounded-full shadow-3 px-4 py-3 flex items-center gap-4 transition-transform translate-y-0">
        <div className="flex items-center gap-2 border-r border-border-default pr-4">
          <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold">
            {selectedCount}
          </span>
          <span className="text-sm font-medium text-text-primary hidden sm:inline-block">
            selected
          </span>
        </div>

        <div className="flex items-center gap-2">
          {allDrafts && (
            <button
              onClick={() => void handleBulkPublish()}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 rounded-md transition-colors disabled:opacity-50 min-h-[44px] sm:min-h-0"
            >
              <Play size={16} /> <span className="hidden sm:inline">Publish All</span>
            </button>
          )}

          {canArchive && (
            <button
              onClick={() => setShowArchiveConfirm(true)}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-error-700 hover:bg-error-50 rounded-md transition-colors disabled:opacity-50 min-h-[44px] sm:min-h-0"
            >
              <Archive size={16} /> <span className="hidden sm:inline">Archive All</span>
            </button>
          )}

          {allArchived && (
            <button
              onClick={() => void handleBulkRestore()}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 rounded-md transition-colors disabled:opacity-50 min-h-[44px] sm:min-h-0"
            >
              <RefreshCw size={16} /> <span className="hidden sm:inline">Restore All</span>
            </button>
          )}
        </div>

        <button
          onClick={onClearSelection}
          disabled={isProcessing}
          className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-full transition-colors border-l border-border-default pl-3 ml-2 min-h-[44px] sm:min-h-0"
          aria-label="Clear selection"
        >
          <X size={18} />
        </button>
      </div>

      <ConfirmDialog
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        onConfirm={() => void handleBulkArchive()}
        title="Archive Products?"
        description={`Ye ${selectedCount} products archive ho jayenge. Buyers inhe nahi dekh payenge.`}
        confirmLabel="Archive Karein"
        cancelLabel="Cancel"
        isConfirming={isProcessing}
      />
    </>
  );
}
