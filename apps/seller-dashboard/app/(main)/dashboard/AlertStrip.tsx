'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Info, ShieldAlert, X } from 'lucide-react';
import { useSellerPermissions } from '../../../lib/hooks/useSellerPermissions';

export interface AlertStripProps {
  pendingOrdersAgingCount?: number;
  lowStockCount?: number;
  activeDisputesCount?: number;
  paymentFailedOrderId?: string;
}

export function AlertStrip({
  pendingOrdersAgingCount = 0,
  lowStockCount = 0,
  activeDisputesCount = 0,
  paymentFailedOrderId,
}: AlertStripProps): React.JSX.Element | null {
  const perms = useSellerPermissions();
  
  // Track dismissed alerts (in-memory for session)
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  const dismiss = (id: string) => setDismissed((prev) => ({ ...prev, [id]: true }));

  // Collect all active alerts
  const alerts: Array<{
    id: string;
    type: 'critical' | 'warning' | 'info';
    message: string;
    link: string;
    linkText: string;
    dismissible: boolean;
  }> = [];

  // 1. Account SUSPENDED (CRITICAL, non-dismissible)
  if (perms.isSuspended) {
    alerts.push({
      id: 'suspended',
      type: 'critical',
      message: 'Aapka account suspend ho gaya. Karan jaanein.',
      link: '/support',
      linkText: 'Karan jaanein',
      dismissible: false,
    });
  }

  // 2. KYC REJECTED (CRITICAL, non-dismissible)
  if (perms.kycStatus === 'REJECTED') {
    alerts.push({
      id: 'kyc-rejected',
      type: 'critical',
      message: 'KYC reject ho gaya — resubmit karein jald.',
      link: '/settings#kyc',
      linkText: 'Resubmit karein',
      dismissible: false,
    });
  }

  // 3. Dispute OPEN (CRITICAL)
  if (activeDisputesCount > 0) {
    alerts.push({
      id: 'dispute',
      type: 'critical',
      message: `${activeDisputesCount} active disputes hain. Resolve karein.`,
      link: '/disputes',
      linkText: 'Resolve karein',
      dismissible: true,
    });
  }

  // 4. Payment FAILED
  if (paymentFailedOrderId) {
    alerts.push({
      id: 'payment-fail',
      type: 'critical',
      message: `Ek order ka payment fail hua. Order #${paymentFailedOrderId}`,
      link: `/orders/${paymentFailedOrderId}`,
      linkText: 'Order dekhein',
      dismissible: true,
    });
  }

  // 5. KYC PENDING
  if (perms.isKycPending) {
    alerts.push({
      id: 'kyc-pending',
      type: 'info',
      message: 'KYC review mein hai — 24-48 hrs lagenge.',
      link: '/settings#kyc',
      linkText: 'Status dekhein',
      dismissible: true,
    });
  }

  // 6. Low Stock
  if (lowStockCount > 5) {
    alerts.push({
      id: 'low-stock',
      type: 'warning',
      message: `${lowStockCount} products ka stock kam hai.`,
      link: '/inventory',
      linkText: 'Stock check karein',
      dismissible: true,
    });
  }

  // 7. Pending orders aging
  if (pendingOrdersAgingCount > 0) {
    alerts.push({
      id: 'aging-orders',
      type: 'warning',
      message: `${pendingOrdersAgingCount} orders 4 ghante se zyada purane hain.`,
      link: '/orders',
      linkText: 'Orders process karein',
      dismissible: true,
    });
  }

  // Filter out dismissed alerts
  const visibleAlerts = alerts.filter((a) => !dismissed[a.id]);

  if (visibleAlerts.length === 0) return null;

  // Max 3 alerts shown simultaneously
  const displayAlerts = visibleAlerts.slice(0, 3);
  const hiddenCount = visibleAlerts.length - 3;

  return (
    <div className="w-full flex flex-col gap-1 mb-6">
      {displayAlerts.map((alert) => {
        let containerClass = 'min-h-[40px] px-6 py-2 flex items-center gap-3 w-full text-sm ';
        let Icon = Info;
        
        if (alert.type === 'critical') {
          containerClass += 'bg-error-50 border-l-4 border-error-500 text-error-700';
          Icon = ShieldAlert;
        } else if (alert.type === 'warning') {
          containerClass += 'bg-warning-50 border-l-4 border-warning-500 text-warning-700';
          Icon = AlertCircle;
        } else {
          containerClass += 'bg-info-50 border-l-4 border-info-500 text-info-700';
        }

        return (
          <div key={alert.id} className={containerClass}>
            <Icon size={16} className="shrink-0" />
            <span>{alert.message}</span>
            <div className="flex-1" />
            <Link href={alert.link} className="font-medium underline hover:opacity-80">
              {alert.linkText}
            </Link>
            {alert.dismissible && (
              <button 
                onClick={() => dismiss(alert.id)}
                className="ml-3 p-1 hover:bg-black/5 rounded-full"
                aria-label="Dismiss alert"
              >
                <X size={16} />
              </button>
            )}
          </div>
        );
      })}
      
      {hiddenCount > 0 && (
        <div className="px-6 py-1 text-xs text-text-secondary">
          <button className="underline hover:text-text-primary">
            Aur {hiddenCount} alerts hain
          </button>
        </div>
      )}
    </div>
  );
}
