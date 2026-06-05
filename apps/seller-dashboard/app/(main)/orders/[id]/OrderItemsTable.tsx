import React from 'react';
import Image from 'next/image';
import { OrderItemDto } from '../../../../lib/api/orders.client';
import { formatAmount } from '../../../../lib/formatters';

export interface OrderItemsTableProps {
  items: OrderItemDto[];
  payment: {
    subtotal: string;
    tax: string;
    total: string;
  };
}

export function OrderItemsTable({ items, payment }: OrderItemsTableProps) {
  return (
    <div className="bg-surface-default border border-border-default rounded-lg overflow-hidden">
      <div className="p-5 border-b border-border-default bg-surface-card">
        <h3 className="text-sm font-bold text-text-primary">Order Items ({items.length})</h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" role="table">
          <thead className="bg-surface-hover border-b border-border-default" role="rowgroup">
            <tr role="row" className="h-10 text-xs text-text-secondary font-medium uppercase tracking-wider">
              <th className="px-5 py-2">Product</th>
              <th className="px-5 py-2 w-24 text-right">Qty</th>
              <th className="px-5 py-2 w-32 text-right">Unit Price</th>
              <th className="px-5 py-2 w-32 text-right">Total</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {items.map((item) => (
              <tr key={item.id} role="row" className="border-b border-border-default last:border-b-0 group">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    {item.imageUrl ? (
                      <div className="relative w-10 h-10 rounded border border-border-default overflow-hidden">
                        <Image src={item.imageUrl} alt={item.name} fill unoptimized className="object-cover" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded border border-border-default bg-surface-hover flex items-center justify-center">
                        <span className="text-text-muted text-xs">IMG</span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-text-primary group-hover:text-brand-600 transition-colors">{item.name}</p>
                      <p className="text-xs text-text-muted">SKU: {item.sku}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 w-24 text-right">
                  <span className="text-sm text-text-primary tabular-nums">{item.qty}</span>
                </td>
                <td className="px-5 py-4 w-32 text-right">
                  <span className="text-sm text-text-secondary tabular-nums font-mono">{formatAmount(parseFloat(item.price))}</span>
                </td>
                <td className="px-5 py-4 w-32 text-right">
                  <span className="text-sm font-semibold text-text-primary tabular-nums font-mono">{formatAmount(parseFloat(item.total))}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-surface-hover p-5 border-t border-border-default flex flex-col items-end gap-2">
        <div className="flex justify-between w-64 text-sm text-text-secondary">
          <span>Subtotal</span>
          <span className="tabular-nums font-mono">{formatAmount(parseFloat(payment.subtotal))}</span>
        </div>
        <div className="flex justify-between w-64 text-sm text-text-secondary">
          <span>GST</span>
          <span className="tabular-nums font-mono">{formatAmount(parseFloat(payment.tax))}</span>
        </div>
        <div className="w-64 h-px bg-border-default my-1" />
        <div className="flex justify-between w-64 text-base font-bold text-text-primary">
          <span>Total</span>
          <span className="tabular-nums font-mono">{formatAmount(parseFloat(payment.total))}</span>
        </div>
      </div>
    </div>
  );
}
