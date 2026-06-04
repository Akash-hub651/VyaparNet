import React from 'react';
import { useSellerPermissions } from '../../../../lib/hooks/useSellerPermissions';
import { Check, Package, FileText, ExternalLink, HelpCircle } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';

export interface ActionPanelProps {
  orderId: string;
  status: string;
  onActionClick: (action: 'CONFIRM' | 'SHIP' | 'DELIVER' | 'COMPLETE' | 'DOWNLOAD_INVOICE') => void;
  isActionLoading: boolean;
}

export function ActionPanel({ orderId, status, onActionClick, isActionLoading }: ActionPanelProps) {
  const perms = useSellerPermissions();

  const renderContent = () => {
    switch (status) {
      case 'PLACED':
        return (
          <>
            <Button 
              variant="primary" 
              fullWidth 
              onClick={() => onActionClick('CONFIRM')}
              isLoading={isActionLoading}
              disabled={isActionLoading || perms.isSuspended}
              icon={<Check size={18} />}
            >
              Confirm Order
            </Button>
            {/* Note: Cancellation blocked for Sellers entirely per architecture rules. */}
          </>
        );

      case 'CONFIRMED':
      case 'PROCESSING':
        return (
          <Button 
            variant="primary" 
            fullWidth 
            onClick={() => onActionClick('SHIP')}
            isLoading={isActionLoading}
            disabled={isActionLoading || perms.isSuspended || perms.businessMissing}
            icon={<Package size={18} />}
          >
            Mark as Shipped
          </Button>
        );

      case 'SHIPPED':
        return (
          <>
            {!perms.businessMissing && !perms.isStaff ? (
              <Button 
                variant="primary" 
                fullWidth 
                onClick={() => onActionClick('DELIVER')}
                isLoading={isActionLoading}
                disabled={isActionLoading}
                icon={<Check size={18} />}
              >
                Mark Delivered
              </Button>
            ) : (
              <p className="text-sm text-text-secondary text-center">Shipped ho gaya. Buyer delivery ka wait kar raha hai.</p>
            )}
            
            <a 
              href={`#track-${orderId}`}
              className="mt-4 flex items-center justify-center gap-2 w-full min-h-[44px] text-sm font-medium text-brand-600 hover:text-brand-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              View Tracking <ExternalLink size={14} />
            </a>
          </>
        );

      case 'DELIVERED':
        return (
          <>
            {!perms.businessMissing && !perms.isStaff ? (
              <Button 
                variant="primary" 
                fullWidth 
                onClick={() => onActionClick('COMPLETE')}
                isLoading={isActionLoading}
                disabled={isActionLoading}
                icon={<Check size={18} />}
              >
                Mark Completed
              </Button>
            ) : (
              <p className="text-sm text-text-secondary text-center">Delivered mark ho chuka hai.</p>
            )}
            
            <a 
              href={`/support/dispute?order=${orderId}`}
              className="mt-4 flex items-center justify-center gap-2 w-full min-h-[44px] text-sm font-medium text-text-muted hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              Dispute Open Hai? <HelpCircle size={14} />
            </a>
          </>
        );

      case 'COMPLETED':
      case 'CANCELLED':
        return (
          <div className="flex flex-col items-center">
            {!perms.isStaff && (
              <Button 
                variant="secondary" 
                fullWidth 
                onClick={() => onActionClick('DOWNLOAD_INVOICE')}
                isLoading={isActionLoading}
                disabled={isActionLoading}
                icon={<FileText size={18} />}
              >
                Invoice Download
              </Button>
            )}
            <p className="mt-4 text-sm text-text-secondary text-center">
              Ye order {status.toLowerCase()} ho gaya.
            </p>
          </div>
        );

      case 'DISPUTE_OPEN':
        return (
          <div className="flex flex-col items-center">
            <Button 
              variant="primary" 
              fullWidth 
              onClick={() => { window.location.href = '/support'; }}
              icon={<HelpCircle size={18} />}
            >
              Support Se Contact Karein
            </Button>
            <a 
              href={`/disputes/${orderId}`}
              className="mt-4 flex items-center justify-center gap-2 w-full min-h-[44px] text-sm font-medium text-brand-600 hover:text-brand-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
            >
              Dispute Details
            </a>
          </div>
        );

      default:
        return (
          <p className="text-sm text-text-secondary text-center">
            Koi action required nahi.
          </p>
        );
    }
  };

  return (
    <div className="bg-surface-default border border-border-default rounded-lg p-5 lg:sticky lg:top-[96px]">
      <h2 className="sr-only">Actions</h2>
      {renderContent()}
    </div>
  );
}
