import React, { useState } from 'react';
import { FormModal } from '../../../components/ui/Modal';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { OrderPreviewDto, shipOrder } from '../../../lib/api/orders.client';
import { useToast } from '../../../components/ui/Toast';
import { ChevronDown, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';

export interface BulkShippingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIds: string[];
  orders: OrderPreviewDto[];
  onSuccess: () => void;
}

const CARRIERS = ['Delhivery', 'Blue Dart', 'DTDC', 'Ecom Express', 'Speed Post', 'Doosra Carrier'];

export function BulkShippingModal({
  isOpen,
  onClose,
  selectedIds,
  orders,
  onSuccess
}: BulkShippingModalProps) {
  const { addToast } = useToast();
  const selectedOrders = orders.filter(o => selectedIds.includes(o.id));
  
  const [mode, setMode] = useState<'SINGLE' | 'PER_ORDER'>('SINGLE');
  const [carrier, setCarrier] = useState(CARRIERS[0]);
  const [customCarrier, setCustomCarrier] = useState('');
  const [shipDate, setShipDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Single Tracking
  const [singleTracking, setSingleTracking] = useState('');
  const [isOrderPreviewOpen, setIsOrderPreviewOpen] = useState(false);
  
  // Per Order Tracking
  const [perOrderTracking, setPerOrderTracking] = useState<Record<string, string>>({});
  
  // State Machine
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Record<string, 'PENDING' | 'SUCCESS' | 'ERROR'>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  const finalCarrier = carrier === 'Doosra Carrier' ? customCarrier : carrier;
  
  // Validation
  const isValid = () => {
    if (!finalCarrier) return false;
    if (mode === 'SINGLE') {
      return singleTracking.trim().length >= 5;
    } else {
      return selectedIds.every(id => {
        // Skip already successful ones if retrying
        if (results[id] === 'SUCCESS') return true;
        const t = perOrderTracking[id];
        return t && t.trim().length >= 5;
      });
    }
  };

  const handleSubmit = async () => {
    if (!isValid() || isSubmitting) return;
    setIsSubmitting(true);
    setGlobalError(null);
    
    let failCount = 0;
    const newResults = { ...results };

    const toProcess = selectedIds.filter(id => results[id] !== 'SUCCESS');

    for (let i = 0; i < toProcess.length; i++) {
      const id = toProcess[i];
      const trackingNumber = mode === 'SINGLE' ? singleTracking : perOrderTracking[id];
      
      const res = await shipOrder(id, {
        carrier: finalCarrier,
        trackingNumber,
        shipDate
      }, 'mock-token');

      if (!res.success) {
        failCount++;
        newResults[id] = 'ERROR';
      } else {
        newResults[id] = 'SUCCESS';
      }
      
      setResults({ ...newResults });
      setProgress(i + 1);
    }

    if (failCount === 0) {
      addToast({ variant: 'success', message: `${selectedIds.length} orders ship mark ho gayi! 🎉` });
      onSuccess();
      onClose();
    } else {
      setGlobalError(`${failCount} orders ship nahi ho sake. Neeche dekh kar retry karein.`);
    }

    setIsSubmitting(false);
  };

  const handleRetryFailed = () => {
    handleSubmit();
  };

  if (!isOpen) return null;

  const renderCarrierSelect = () => (
    <div className="space-y-3 mb-4">
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Courier company</label>
        <select 
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          disabled={isSubmitting}
          className="w-full px-3 py-2 bg-surface-default border border-border-default rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {carrier === 'Doosra Carrier' && (
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Carrier naam likhein</label>
          <input 
            type="text"
            value={customCarrier}
            onChange={(e) => setCustomCarrier(e.target.value)}
            disabled={isSubmitting}
            className="w-full px-3 py-2 bg-surface-default border border-border-default rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">Ship Date</label>
        <input 
          type="date"
          value={shipDate}
          onChange={(e) => setShipDate(e.target.value)}
          disabled={isSubmitting}
          max={new Date().toISOString().split('T')[0]} // Cannot ship in future
          className="w-full px-3 py-2 bg-surface-default border border-border-default rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
    </div>
  );

  const hasFails = Object.values(results).includes('ERROR');
  const toProcessCount = selectedIds.filter(id => results[id] !== 'SUCCESS').length;

  return (
    <FormModal isOpen={isOpen} onClose={isSubmitting ? () => {} : onClose} title={`Bulk Ship — ${selectedIds.length} Orders`}>
      <div className="flex flex-col gap-4">
        
        {globalError && (
          <ErrorBanner message={globalError} />
        )}

        {!hasFails && (
          <div className="flex bg-surface-hover rounded-md p-1 border border-border-default w-full">
            <button 
              onClick={() => setMode('SINGLE')} 
              className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-colors ${mode === 'SINGLE' ? 'bg-surface-default shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Single Tracking
            </button>
            <button 
              onClick={() => setMode('PER_ORDER')} 
              className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-colors ${mode === 'PER_ORDER' ? 'bg-surface-default shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Per-Order Tracking
            </button>
          </div>
        )}

        {renderCarrierSelect()}

        {mode === 'SINGLE' ? (
          <>
            <div className="bg-info-50 border border-info-100 rounded-md p-3 text-xs text-info-800 font-medium">
              Ye tracking info sab {selectedIds.length} orders pe lagegi
            </div>
            
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Tracking number</label>
              <input 
                type="text"
                value={singleTracking}
                onChange={(e) => setSingleTracking(e.target.value)}
                disabled={isSubmitting || hasFails}
                maxLength={60}
                placeholder="e.g., 12345678901"
                className="w-full px-3 py-2 bg-surface-default border border-border-default rounded-md text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-text-secondary mt-1">Ye buyer ko share hoga</p>
            </div>

            <div className="border border-border-default rounded-md overflow-hidden">
              <button 
                onClick={() => setIsOrderPreviewOpen(!isOrderPreviewOpen)}
                className="w-full flex items-center justify-between p-3 bg-surface-hover hover:bg-surface-active transition-colors"
              >
                <span className="text-sm font-medium">{selectedIds.length} orders selected</span>
                {isOrderPreviewOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              {isOrderPreviewOpen && (
                <div className="max-h-48 overflow-y-auto p-3 border-t border-border-default bg-surface-default space-y-2">
                  {selectedOrders.map(order => (
                    <div key={order.id} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        {results[order.id] === 'SUCCESS' && <CheckCircle2 size={14} className="text-success-500" />}
                        {results[order.id] === 'ERROR' && <XCircle size={14} className="text-error-500" />}
                        <span className="font-medium text-brand-600">#{order.orderNumber}</span>
                        <span className="text-text-secondary">· {order.buyerName}</span>
                      </div>
                      <span className="tabular-nums">₹{order.amount}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="border border-border-default rounded-md overflow-hidden flex flex-col max-h-[40vh]">
            <div className="p-3 bg-surface-hover border-b border-border-default text-xs font-semibold text-text-secondary uppercase tracking-wider">
              {selectedIds.length} Orders
            </div>
            <div className="overflow-y-auto p-3 space-y-3">
              {selectedOrders.map(order => (
                <div key={order.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-default last:border-0 pb-3 last:pb-0">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      {results[order.id] === 'SUCCESS' && <CheckCircle2 size={14} className="text-success-500" />}
                      {results[order.id] === 'ERROR' && <XCircle size={14} className="text-error-500" />}
                      <span className="font-medium text-brand-600">#{order.orderNumber}</span>
                      <span className="text-text-secondary truncate max-w-[120px]">· {order.buyerName}</span>
                    </div>
                    {results[order.id] === 'ERROR' && (
                      <div className="text-xs text-error-700 mt-1">Ship nahi ho paya.</div>
                    )}
                  </div>
                  <div className="w-full sm:w-48">
                    <input
                      type="text"
                      placeholder="Tracking number"
                      aria-label={`${order.orderNumber} ka tracking number`}
                      value={perOrderTracking[order.id] || ''}
                      onChange={(e) => setPerOrderTracking({ ...perOrderTracking, [order.id]: e.target.value })}
                      disabled={isSubmitting || results[order.id] === 'SUCCESS'}
                      className="w-full px-2 py-1.5 bg-surface-default border border-border-default rounded text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-border-default">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-md transition-colors disabled:opacity-50"
          >
            Baad Mein
          </button>
          
          {hasFails ? (
            <button
              onClick={handleRetryFailed}
              disabled={isSubmitting || toProcessCount === 0}
              className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-error-600 hover:bg-error-700 rounded-md transition-colors disabled:opacity-50"
            >
              {isSubmitting ? `${progress} / ${toProcessCount} retry ho rahe hain...` : 'Failed Orders Retry Karein'}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!isValid() || isSubmitting}
              className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-md transition-colors disabled:opacity-50"
            >
              {isSubmitting ? `${progress} / ${toProcessCount} ship ho rahe hain...` : `${toProcessCount} Orders Ship Karein`}
            </button>
          )}
        </div>
      </div>
    </FormModal>
  );
}
