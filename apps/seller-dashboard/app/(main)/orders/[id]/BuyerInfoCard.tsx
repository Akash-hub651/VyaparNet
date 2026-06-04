import React from 'react';
import { useSellerPermissions } from '../../../../lib/hooks/useSellerPermissions';

export interface BuyerInfoCardProps {
  buyerContact: {
    name: string;
    phone: string;
    email: string;
    address: string;
  };
  orderStatus: string;
}

export function BuyerInfoCard({ buyerContact, orderStatus }: BuyerInfoCardProps) {
  const perms = useSellerPermissions();

  // GDPR/Privacy Masking Logic
  // - Staff always sees masked contact details
  // - Owners see masked details until CONFIRMED status
  const shouldMask = perms.isStaff || orderStatus === 'PLACED';

  const displayPhone = shouldMask ? '+91 ***** *****' : buyerContact.phone;
  const displayEmail = shouldMask 
    ? buyerContact.email.replace(/^(.{1})(.*)(@.*)$/, (_, first, middle, domain) => `${first}${middle.replace(/./g, '*')}${domain}`) 
    : buyerContact.email;

  return (
    <div className="bg-surface-default border border-border-default rounded-lg p-5">
      <h3 className="text-sm font-bold text-text-primary mb-4">Buyer Details</h3>
      
      <div className="space-y-4">
        <div>
          <p className="text-xs text-text-secondary mb-1">Name</p>
          <p className="text-sm font-medium text-text-primary">{buyerContact.name}</p>
        </div>
        
        <div>
          <p className="text-xs text-text-secondary mb-1">Phone</p>
          <p className="text-sm font-medium text-text-primary">{displayPhone}</p>
          {shouldMask && !perms.isStaff && (
            <p className="text-xs text-text-muted mt-0.5">Order confirm hone ke baad number dikhega</p>
          )}
        </div>
        
        <div>
          <p className="text-xs text-text-secondary mb-1">Email</p>
          <p className="text-sm font-medium text-text-primary">{displayEmail}</p>
        </div>
        
        <div>
          <p className="text-xs text-text-secondary mb-1">Delivery Address</p>
          <p className="text-sm font-medium text-text-primary whitespace-pre-line leading-relaxed">
            {buyerContact.address}
          </p>
        </div>
      </div>
    </div>
  );
}
