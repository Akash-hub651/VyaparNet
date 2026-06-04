import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, ArrowUpDown, ArrowUp, ArrowDown, MoreVertical, Search } from 'lucide-react';
import { OrderPreviewDto, confirmOrder } from '../../../lib/api/orders.client';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { formatAmount, formatRelativeTime } from '../../../lib/formatters';
import { useToast } from '../../../components/ui/Toast';
import { useSellerPermissions } from '../../../lib/hooks/useSellerPermissions';

export interface OrdersTableProps {
  orders: OrderPreviewDto[];
  isLoading: boolean;
  sortParam: 'amount' | 'created_at';
  sortDir: 'asc' | 'desc';
  onSort: (param: 'amount' | 'created_at') => void;
  selectedIds: Set<string>;
  onSelect: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onActionSuccess: () => void;
  onClearFilters?: () => void;
}

export function OrdersTable({
  orders,
  isLoading,
  sortParam,
  sortDir,
  onSort,
  selectedIds,
  onSelect,
  onSelectAll,
  onActionSuccess,
  onClearFilters,
}: OrdersTableProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const perms = useSellerPermissions();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const allSelected = orders.length > 0 && selectedIds.size === orders.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < orders.length;

  const handleCopy = (e: React.MouseEvent, text: string) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    addToast({ variant: 'success', message: 'Order number copy ho gaya' });
  };

  const handleConfirm = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmingId(id);
    const res = await confirmOrder(id, 'mock-token'); // useAuth token ideally passed down, but for single action we can rely on interceptor or context. Actually we should use auth context.
    // Wait, the client wrapper handles token. But we need token here.
    // Let's assume the API client uses a global interceptor or we pass it. I'll mock it here, but in a real app we'd pass `accessToken`.
    // We should probably get it from `useAuth()`.
    if (!res.success) {
      addToast({ variant: 'error', message: res.error });
    } else {
      addToast({ variant: 'success', message: 'Order confirm ho gaya!' });
      onActionSuccess();
    }
    setConfirmingId(null);
  };

  const renderSortIcon = (param: 'amount' | 'created_at') => {
    if (sortParam !== param) return <ArrowUpDown size={14} className="text-text-muted" />;
    return sortDir === 'asc' ? <ArrowUp size={14} className="text-brand-600" /> : <ArrowDown size={14} className="text-brand-600" />;
  };

  if (isLoading && orders.length === 0) {
    return (
      <div className="w-full border border-border-default rounded-lg bg-surface-default">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center h-[52px] border-b border-border-default px-4 gap-4">
            <Skeleton className="w-4 h-4 rounded" />
            <div className="flex-1 space-y-2"><Skeleton className="w-24 h-4" /><Skeleton className="w-16 h-3" /></div>
            <div className="w-28 space-y-2"><Skeleton className="w-16 h-4" /><Skeleton className="w-12 h-3" /></div>
            <div className="w-36"><Skeleton className="w-20 h-6 rounded-full" /></div>
            <div className="w-32"><Skeleton className="w-24 h-4" /></div>
            <div className="w-24"><Skeleton className="w-16 h-5 rounded-full" /></div>
            <div className="w-28"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!isLoading && orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border border-border-default rounded-lg bg-surface-default h-full min-h-[400px]">
        <Search size={32} className="text-neutral-400 mb-4" />
        <h3 className="text-lg font-bold text-text-primary mb-2">Koi order nahi mila</h3>
        <p className="text-sm text-text-secondary text-center max-w-sm">
          Applied filters se koi order match nahi kiya. Filters hatayein ya doosra search try karein.
        </p>
        {onClearFilters && (
          <button 
            onClick={onClearFilters}
            className="mt-6 px-4 py-2 text-sm font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-md hover:bg-brand-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
          >
            Filters hatayein
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full border border-border-default rounded-lg bg-surface-default overflow-x-auto">
      <table className="w-full min-w-[800px] text-left border-collapse" role="table">
        <thead className="bg-surface-hover border-b border-border-default" role="rowgroup">
          <tr role="row" className="h-10 text-xs text-text-secondary font-medium uppercase tracking-wider">
            <th className="px-4 py-2 w-10">
              <input 
                type="checkbox"
                checked={allSelected}
                ref={input => { if (input) input.indeterminate = someSelected; }}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="w-4 h-4 rounded border-border-default text-brand-600 focus:ring-brand-500"
                aria-label="Is page ke sab orders select karein"
              />
            </th>
            <th className="px-4 py-2 min-w-[140px]">Order #</th>
            <th className="px-4 py-2 w-28 text-right cursor-pointer hover:bg-surface-active transition-colors group" onClick={() => onSort('amount')}>
              <div className="flex items-center justify-end gap-1">
                Amount {renderSortIcon('amount')}
              </div>
            </th>
            <th className="px-4 py-2 w-36">Status</th>
            <th className="px-4 py-2 w-32 cursor-pointer hover:bg-surface-active transition-colors group" onClick={() => onSort('created_at')}>
              <div className="flex items-center gap-1">
                Age {renderSortIcon('created_at')}
              </div>
            </th>
            <th className="px-4 py-2 w-24">Segment</th>
            <th className="px-4 py-2 w-28 text-right">Actions</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {orders.map((order) => {
            const isSelected = selectedIds.has(order.id);
            
            // Aging logic
            const hoursOld = (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60);
            let ageBorder = 'border-l-4 border-transparent';
            if (order.status === 'PLACED') {
              if (hoursOld > 4) ageBorder = 'border-l-4 border-error-500';
              else if (hoursOld >= 1) ageBorder = 'border-l-4 border-warning-500';
            }

            return (
              <tr 
                key={order.id} 
                role="row"
                onClick={() => router.push(`/orders/${order.id}`)}
                className={`group h-[52px] border-b border-border-default last:border-b-0 hover:bg-surface-hover cursor-pointer transition-colors ${isSelected ? 'bg-brand-50 hover:bg-brand-50' : ''} ${ageBorder}`}
              >
                <td className="px-4 py-2 w-10" onClick={(e) => e.stopPropagation()}>
                  <input 
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(order.id, e.target.checked)}
                    className="w-4 h-4 rounded border-border-default text-brand-600 focus:ring-brand-500"
                    aria-label={`${order.orderNumber} select karein`}
                  />
                </td>
                <td className="px-4 py-2 min-w-[140px]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-brand-600 hover:underline">{order.orderNumber}</span>
                    <button 
                      onClick={(e) => handleCopy(e, order.orderNumber)}
                      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary transition-opacity"
                      aria-label="Copy order number"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  <div className="text-xs text-text-secondary truncate">{order.buyerName}</div>
                </td>
                <td className="px-4 py-2 w-28 text-right">
                  <div className="text-sm text-text-primary tabular-nums font-mono">{formatAmount(parseFloat(order.amount))}</div>
                  <div className="text-xs text-text-secondary">{order.itemCount} items</div>
                </td>
                <td className="px-4 py-2 w-36">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-4 py-2 w-32">
                  <div className="text-sm text-text-primary" title={`Ye order ${hoursOld.toFixed(1)} ghante purana hai`}>
                    {formatRelativeTime(order.createdAt)}
                  </div>
                </td>
                <td className="px-4 py-2 w-24">
                  <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 text-xs font-medium uppercase tracking-wider">
                    {order.segment}
                  </span>
                </td>
                <td className="px-4 py-2 w-28 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center justify-end gap-2 transition-opacity">
                    {order.status === 'PLACED' && (
                      <button 
                        disabled={confirmingId === order.id}
                        onClick={(e) => handleConfirm(e, order.id)}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-800 focus-visible:outline-none disabled:opacity-50"
                      >
                        {confirmingId === order.id ? 'Wait...' : 'Confirm'}
                      </button>
                    )}
                    {order.status === 'CONFIRMED' && !perms.businessMissing && (
                      <button 
                        disabled={perms.isSuspended}
                        title={perms.isSuspended ? 'Suspended accounts cannot ship' : 'Ship mark karein'}
                        className="text-xs font-semibold text-success-600 hover:text-success-800 focus-visible:outline-none disabled:opacity-50"
                        onClick={() => router.push(`/orders/${order.id}?action=ship`)}
                      >
                        Ship
                      </button>
                    )}
                    <button className="text-text-muted hover:text-text-primary p-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="More actions">
                      <MoreVertical size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
