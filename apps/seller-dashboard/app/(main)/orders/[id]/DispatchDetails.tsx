import React from 'react';
import { Copy, ExternalLink, Edit2, FileText } from 'lucide-react';
import { useToast } from '../../../../components/ui/Toast';

export interface DispatchDetailsProps {
  dispatch: {
    carrier: string;
    trackingNumber: string;
    shipDate: string;
    proofUrl?: string;
  };
  onEditClick: () => void;
  canEdit: boolean;
}

export function DispatchDetails({ dispatch, onEditClick, canEdit }: DispatchDetailsProps) {
  const { addToast } = useToast();

  const handleCopy = () => {
    navigator.clipboard.writeText(dispatch.trackingNumber);
    addToast({ variant: 'success', message: 'Tracking number copy ho gaya' });
  };

  return (
    <div className="bg-surface-default border border-border-default rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-text-primary">Dispatch Details</h3>
        {canEdit && (
          <button 
            onClick={onEditClick}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 py-1"
          >
            <Edit2 size={14} />
            Tracking update karein
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div>
          <p className="text-xs text-text-secondary mb-1">Carrier</p>
          <p className="text-sm font-medium text-text-primary">{dispatch.carrier}</p>
        </div>
        
        <div>
          <p className="text-xs text-text-secondary mb-1">Tracking #</p>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">{dispatch.trackingNumber}</span>
            <button 
              onClick={handleCopy}
              className="text-text-muted hover:text-brand-600 transition-colors focus-visible:outline-none"
              aria-label="Copy tracking number"
            >
              <Copy size={14} />
            </button>
            <a 
              href={`https://www.google.com/search?q=${encodeURIComponent(dispatch.carrier + ' tracking ' + dispatch.trackingNumber)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-800 transition-colors focus-visible:outline-none"
              aria-label="Track Live externally"
              title="Track Live"
            >
              <ExternalLink size={14} />
            </a>
          </div>
        </div>

        <div>
          <p className="text-xs text-text-secondary mb-1">Ship Date</p>
          <p className="text-sm font-medium text-text-primary">
            {new Date(dispatch.shipDate).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric'
            })}
          </p>
        </div>

        <div>
          <p className="text-xs text-text-secondary mb-1">Proof of Dispatch</p>
          {dispatch.proofUrl ? (
            <a 
              href={dispatch.proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-800 group"
            >
              <div className="w-8 h-8 rounded bg-brand-50 flex items-center justify-center group-hover:bg-brand-100 transition-colors">
                <FileText size={16} />
              </div>
              Dekhein
            </a>
          ) : (
            <span className="text-sm text-text-muted italic">Nahi diya</span>
          )}
        </div>
      </div>
    </div>
  );
}
