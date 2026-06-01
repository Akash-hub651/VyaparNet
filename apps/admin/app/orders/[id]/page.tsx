'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AdminLayout from '../../../components/AdminLayout';
import StatusBadge from '../../../components/StatusBadge';
import ConfirmModal from '../../../components/ConfirmModal';
import { getOrderDetail, deliverOrder, completeOrder, cancelOrder, type OrderDetail } from '../../../lib/api';

type ModalMode = 'deliver' | 'complete' | 'cancel' | null;

export default function OrderDetailPage(): React.JSX.Element {
  const params = useParams();
  const id = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await getOrderDetail(id);
      setOrder(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [id]);

  const handleAction = async (reason?: string): Promise<void> => {
    if (!order || !modalMode) return;
    const key = crypto.randomUUID();
    try {
      if (modalMode === 'deliver') await deliverOrder(order.id, key);
      else if (modalMode === 'complete') await completeOrder(order.id, key);
      else if (modalMode === 'cancel') await cancelOrder(order.id, reason ?? '', key);
      setModalMode(null);
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  if (loading) return <AdminLayout title="Order Detail"><p className="text-[#64748B]">Loading…</p></AdminLayout>;
  if (error || !order) return <AdminLayout title="Order Detail"><p className="text-red-600">{error ?? 'Order not found'}</p></AdminLayout>;

  return (
    <AdminLayout title={`Order — ${order.orderNumber}`}>
      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{actionError}</div>
      )}

      {/* Order header */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 mb-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold font-mono text-[#1E293B]">{order.orderNumber}</h2>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-[#64748B] text-sm">Buyer: {order.buyerName} · Seller: {order.sellerName}</p>
            <p className="text-[#64748B] text-sm">₹{order.grandTotal} via {order.paymentMethod} · {order.segment}</p>
          </div>
          <div className="flex gap-2">
            {order.status === 'SHIPPED' && (
              <button type="button" onClick={() => setModalMode('deliver')} className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium">Mark Delivered</button>
            )}
            {order.status === 'DELIVERED' && (
              <button type="button" onClick={() => setModalMode('complete')} className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium">Mark Completed</button>
            )}
            {!['CANCELLED', 'COMPLETED'].includes(order.status) && (
              <button type="button" onClick={() => setModalMode('cancel')} className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium">Cancel Order</button>
            )}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 mb-5">
        <h3 className="text-base font-semibold text-[#1E293B] mb-4">Order Items</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[#64748B] border-b border-[#E2E8F0]">
              <th className="pb-2 font-medium">Product</th>
              <th className="pb-2 font-medium">Qty</th>
              <th className="pb-2 font-medium">Unit Price</th>
              <th className="pb-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {order.items.map((item, i) => (
              <tr key={i} className="h-12">
                <td className="text-[#1E293B]">{item.productName}</td>
                <td>{item.quantity}</td>
                <td>₹{item.unitPrice}</td>
                <td className="font-medium">₹{item.totalPrice}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Status history */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
        <h3 className="text-base font-semibold text-[#1E293B] mb-4">Status History</h3>
        <div className="space-y-2">
          {order.statusHistory.map((h, i) => (
            <div key={i} className="flex items-center gap-4 p-3 bg-[#F8FAFC] rounded-lg">
              <StatusBadge status={h.status} />
              <span className="text-xs text-[#64748B]">{h.actorRole}</span>
              <span className="text-xs text-[#94A3B8]">{new Date(h.createdAt).toLocaleString()}</span>
              {h.note && <span className="text-xs text-[#64748B] ml-auto">{h.note}</span>}
            </div>
          ))}
        </div>
      </div>

      <ConfirmModal open={modalMode === 'deliver'} title="Mark as Delivered" description={`Mark order ${order.orderNumber} as DELIVERED?`} confirmLabel="Confirm Delivered" onConfirm={handleAction} onCancel={() => { setModalMode(null); setActionError(null); }} />
      <ConfirmModal open={modalMode === 'complete'} title="Mark as Completed" description={`Mark order ${order.orderNumber} as COMPLETED? This will trigger seller payout.`} confirmLabel="Confirm Completed" onConfirm={handleAction} onCancel={() => { setModalMode(null); setActionError(null); }} />
      <ConfirmModal open={modalMode === 'cancel'} title="Cancel Order" description={`Cancel order ${order.orderNumber}? Provide a reason.`} confirmLabel="Cancel Order" destructive requireReason reasonPlaceholder="Reason for cancellation…" onConfirm={handleAction} onCancel={() => { setModalMode(null); setActionError(null); }} />
    </AdminLayout>
  );
}
