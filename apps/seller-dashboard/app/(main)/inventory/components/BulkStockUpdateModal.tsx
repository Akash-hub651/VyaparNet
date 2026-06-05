'use client';

import React, { useState, useEffect } from 'react';
import { InventoryViewModel, updateSellerStock } from '../../../../lib/api/inventory.client';
import { FormModal } from '../../../../components/ui/Modal';
import { useAuth } from '../../../contexts/auth.context';
import { useToast } from '../../../../components/ui/Toast';

interface BulkStockUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: InventoryViewModel[];
  onSuccess: (updatedItems: InventoryViewModel[]) => void;
}

export function BulkStockUpdateModal({
  isOpen,
  onClose,
  selectedItems,
  onSuccess,
}: BulkStockUpdateModalProps) {
  const [adjustmentMode, setAdjustmentMode] = useState<'same' | 'individual'>('same');
  const [globalAdjustment, setGlobalAdjustment] = useState('');
  const [individualAdjustments, setIndividualAdjustments] = useState<Record<string, string>>({});
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, failed: 0 });

  const { accessToken } = useAuth();
  const { addToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line
      setAdjustmentMode('same');
      setGlobalAdjustment('');
      setIndividualAdjustments({});
      setIsSubmitting(false);
      setProgress({ current: 0, total: 0, failed: 0 });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const calculateNewStock = (current: number, adjStr: string) => {
    if (!adjStr) return current;
    const isRemove = adjStr.startsWith('-');
    const isSet = adjStr.startsWith('=');
    const isAdd = adjStr.startsWith('+');
    
    const val = Number(adjStr.replace(/[^0-9]/g, '')) || 0;
    
    if (isSet) return val;
    if (isRemove) return Math.max(0, current - val);
    if (isAdd) return current + val;
    return current; // If no sign, we ignore or treat as no-op? Spec says "signed number". 
  };

  const getPreview = (item: InventoryViewModel) => {
    const adjStr = adjustmentMode === 'same' ? globalAdjustment : (individualAdjustments[item.id] || '');
    if (!adjStr) return null;
    return calculateNewStock(item.quantity, adjStr);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || selectedItems.length === 0) return;

    // Validate
    const hasInvalid = selectedItems.some(item => {
      const preview = getPreview(item);
      return preview !== null && preview < 0;
    });

    if (hasInvalid) {
      addToast({ message: 'Stock 0 se kam nahi ho sakta.', variant: 'error' });
      return;
    }

    setIsSubmitting(true);
    setProgress({ current: 0, total: selectedItems.length, failed: 0 });

    const updatedResults: InventoryViewModel[] = [];
    let failedCount = 0;

    // Sequential PATCH loop with progress
    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i];
      const adjStr = adjustmentMode === 'same' ? globalAdjustment : (individualAdjustments[item.id] || '');
      
      if (!adjStr) {
        // Skip if no adjustment
        setProgress(prev => ({ ...prev, current: prev.current + 1 }));
        continue;
      }

      const newStock = calculateNewStock(item.quantity, adjStr);
      
      try {
        const res = await updateSellerStock(
          item.productId,
          { quantity: newStock, reason: 'Bulk Update' },
          accessToken
        );
        if (res.data) {
          updatedResults.push({
            ...item,
            quantity: newStock,
            isOutOfStock: newStock === 0,
            isLowStock: newStock > 0 && newStock <= item.lowStockThreshold,
            lastUpdated: new Date().toISOString(),
          });
        } else {
          failedCount++;
        }
      } catch {
         
        failedCount++;
      }
      setProgress(prev => ({ ...prev, current: prev.current + 1, failed: failedCount }));
    }

    setIsSubmitting(false);
    
    if (failedCount === 0) {
      addToast({ message: `Sabhi ${updatedResults.length} products ka stock update ho gaya!`, variant: 'success' });
    } else {
      addToast({ message: `${updatedResults.length} update hue, ${failedCount} fail hue.`, variant: 'warning' });
    }
    
    onSuccess(updatedResults);
    onClose();
  };

  const renderProgressBar = () => {
    if (!isSubmitting) return null;
    const percent = Math.round((progress.current / progress.total) * 100) || 0;
    return (
      <div className="mt-4 p-4 border border-info-200 bg-info-50 rounded-lg" aria-live="assertive">
         <div className="flex justify-between text-sm mb-2 text-info-800">
           <span>Updating stock...</span>
           <span>{progress.current} / {progress.total}</span>
         </div>
         <div className="w-full bg-info-200 rounded-full h-2">
           <div className="bg-info-600 h-2 rounded-full transition-all duration-300" style={{ width: `${percent}%` }}></div>
         </div>
         {progress.failed > 0 && <p className="text-xs text-error-600 mt-2">{progress.failed} errors encountered</p>}
      </div>
    );
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      title={`Bulk Stock Update`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="p-1">
        <p className="text-sm text-text-secondary mb-6">
          Aapne <strong className="text-text-primary">{selectedItems.length} products</strong> select kiye hain. 
          Adjustment format: <code className="bg-neutral-100 px-1 py-0.5 rounded text-brand-700">+10</code>, <code className="bg-neutral-100 px-1 py-0.5 rounded text-error-700">-5</code>, ya <code className="bg-neutral-100 px-1 py-0.5 rounded text-neutral-700">=100</code>
        </p>

        {/* Mode Toggle */}
        <div className="flex bg-neutral-100 p-1 rounded-lg mb-6 max-w-sm">
          <button
            type="button"
            onClick={() => setAdjustmentMode('same')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${adjustmentMode === 'same' ? 'bg-white shadow-1 text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Same for all
          </button>
          <button
            type="button"
            onClick={() => setAdjustmentMode('individual')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${adjustmentMode === 'individual' ? 'bg-white shadow-1 text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Individual
          </button>
        </div>

        {adjustmentMode === 'same' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-text-primary mb-1.5">Sab selected products mein kya karna hai?</label>
            <input
              type="text"
              value={globalAdjustment}
              onChange={(e) => setGlobalAdjustment(e.target.value)}
              placeholder="e.g. +10, -5, =50"
              className="w-full sm:w-1/2 bg-surface-card border border-neutral-300 rounded-lg px-4 py-3 text-base min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        )}

        <div className="border border-neutral-200 rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto mb-6">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-neutral-50 sticky top-0 border-b border-neutral-200">
              <tr>
                <th className="py-2 px-4 font-medium text-text-secondary">Product</th>
                <th className="py-2 px-4 font-medium text-text-secondary">Current</th>
                {adjustmentMode === 'individual' && (
                  <th className="py-2 px-4 font-medium text-text-secondary w-32">Adj</th>
                )}
                <th className="py-2 px-4 font-medium text-text-secondary w-24">Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {selectedItems.map(item => {
                const preview = getPreview(item);
                return (
                  <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-2 px-4 truncate max-w-[150px]">{item.productName}</td>
                    <td className="py-2 px-4 text-text-secondary">{item.quantity}</td>
                    {adjustmentMode === 'individual' && (
                      <td className="py-2 px-4">
                        <input
                          type="text"
                          value={individualAdjustments[item.id] || ''}
                          onChange={(e) => setIndividualAdjustments({ ...individualAdjustments, [item.id]: e.target.value })}
                          placeholder="+X"
                          className="w-full bg-surface-card border border-neutral-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                        />
                      </td>
                    )}
                    <td className="py-2 px-4 font-semibold text-text-primary">
                      {preview !== null ? (
                        <span className={preview < 0 ? 'text-error-600' : 'text-success-600'}>{preview}</span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {renderProgressBar()}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-neutral-100">
           <button
             type="button"
             onClick={onClose}
             disabled={isSubmitting}
             className="px-4 py-2.5 text-sm font-semibold text-text-secondary hover:bg-neutral-50 border border-transparent rounded-lg transition-colors min-h-[44px]"
           >
             Cancel
           </button>
           <button
             type="submit"
             disabled={isSubmitting || selectedItems.length === 0}
             className={`px-6 py-2.5 text-sm font-semibold text-white rounded-lg transition-colors min-h-[44px] ${isSubmitting || selectedItems.length === 0 ? 'bg-brand-400 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700'}`}
           >
             {isSubmitting ? 'Processing...' : 'Bulk Update Karein'}
           </button>
        </div>
      </form>
    </FormModal>
  );
}
