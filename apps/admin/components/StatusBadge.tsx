import React from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default';

interface StatusBadgeProps {
  status: string;
}

/** Maps backend enum values to visual badge styles */
function getVariant(status: string): BadgeVariant {
  const upper = status.toUpperCase();
  // KYC / Business
  if (upper === 'VERIFIED') return 'success';
  if (upper === 'REJECTED') return 'error';
  if (upper === 'PENDING_REVIEW' || upper === 'PENDING') return 'warning';
  if (upper === 'SUSPENDED') return 'error';
  // Product
  if (upper === 'ACTIVE') return 'success';
  if (upper === 'INACTIVE') return 'default';
  if (upper === 'UNDER_REVIEW') return 'warning';
  if (upper === 'ARCHIVED') return 'default';
  // Order
  if (upper === 'PLACED') return 'info';
  if (upper === 'CONFIRMED') return 'info';
  if (upper === 'PROCESSING') return 'warning';
  if (upper === 'SHIPPED') return 'info';
  if (upper === 'DELIVERED') return 'success';
  if (upper === 'COMPLETED') return 'success';
  if (upper === 'CANCELLED') return 'error';
  // Payout
  if (upper === 'INITIATED') return 'info';
  if (upper === 'TRANSFERRED') return 'success';
  if (upper === 'FAILED') return 'error';
  // User
  if (upper === 'ACTIVE' || upper === 'FALSE') return 'success';
  if (upper === 'TRUE') return 'error';
  // Ticket
  if (upper === 'OPEN') return 'warning';
  if (upper === 'IN_PROGRESS') return 'info';
  if (upper === 'RESOLVED' || upper === 'CLOSED') return 'success';
  // Feature flag
  if (upper === 'ENABLED' || upper === 'ON') return 'success';
  if (upper === 'DISABLED' || upper === 'OFF') return 'default';
  return 'default';
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  default: 'bg-[#F1F5F9] text-[#64748B]',
};

export default function StatusBadge({ status }: StatusBadgeProps): React.JSX.Element {
  const variant = getVariant(status);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${variantClasses[variant]}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
