'use client';

import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import StatusBadge from '../../components/StatusBadge';
import { getExceptions, type BusinessExceptions } from '../../lib/api';

export default function ExceptionsPage(): React.JSX.Element {
  const [data, setData] = useState<BusinessExceptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      // INV-S7-34: computed fresh — no Redis cache
      const res = await getExceptions();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exceptions');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  const formatMs = (ms: number): string => {
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
    return `${Math.round(ms / 3_600_000)}h`;
  };

  return (
    <AdminLayout title="Exception Center">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-[#64748B]">
          Data computed fresh on each load — not cached (INV-S7-34).
          {data?.generatedAt && ` Last fetched: ${new Date(data.generatedAt).toLocaleTimeString()}`}
        </p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-4 py-2 text-sm bg-[#1E293B] text-white rounded-lg hover:bg-[#334155] font-medium disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>
      )}

      {/* DLQ depth */}
      {data?.dlqDepth !== undefined && (
        <div className={`mb-5 rounded-xl border p-5 ${data.dlqDepth > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{data.dlqDepth > 0 ? '🔴' : '🟢'}</span>
            <div>
              <p className={`text-sm font-semibold ${data.dlqDepth > 0 ? 'text-red-800' : 'text-green-800'}`}>
                DLQ Depth: {data.dlqDepth} message{data.dlqDepth !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-[#64748B] mt-0.5">Queue: notifications-failed</p>
            </div>
          </div>
        </div>
      )}

      {/* Stuck Orders */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-[#1E293B]">Stuck Orders</h2>
          {data && data.stuckOrders.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {data.stuckOrders.length}
            </span>
          )}
        </div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          {!data || data.stuckOrders.length === 0 ? (
            <div className="p-5 text-sm text-[#94A3B8]">No stuck orders. ✅</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-left text-[#64748B]">
                  <th className="px-4 py-3 font-medium">Order #</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Seller</th>
                  <th className="px-4 py-3 font-medium">Stuck For</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {data.stuckOrders.map((o) => (
                  <tr key={o.id} className="h-14">
                    <td className="px-4 font-mono text-sm text-[#2563EB]">{o.orderNumber}</td>
                    <td className="px-4"><StatusBadge status={o.status} /></td>
                    <td className="px-4 text-[#64748B]">{o.sellerName}</td>
                    <td className="px-4">
                      <span className="text-red-600 font-medium">{formatMs(o.stuckForMs)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Failed Payments */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-[#1E293B]">Failed Payments</h2>
          {data && data.failedPayments.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {data.failedPayments.length}
            </span>
          )}
        </div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          {!data || data.failedPayments.length === 0 ? (
            <div className="p-5 text-sm text-[#94A3B8]">No failed payments. ✅</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-left text-[#64748B]">
                  <th className="px-4 py-3 font-medium">Order #</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Failed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {data.failedPayments.map((p) => (
                  <tr key={p.id} className="h-14">
                    <td className="px-4 font-mono text-sm">{p.orderNumber}</td>
                    <td className="px-4 font-medium text-red-600">₹{p.amount}</td>
                    <td className="px-4 text-[#64748B]">{p.paymentMethod}</td>
                    <td className="px-4 text-[#64748B] text-xs">{new Date(p.failedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Suspended sellers with active orders */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-[#1E293B]">Suspended Sellers with Active Orders</h2>
          {data && data.suspendedSellersWithActiveOrders.length > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {data.suspendedSellersWithActiveOrders.length}
            </span>
          )}
        </div>
        <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
          {!data || data.suspendedSellersWithActiveOrders.length === 0 ? (
            <div className="p-5 text-sm text-[#94A3B8]">No suspended sellers with active orders. ✅</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-left text-[#64748B]">
                  <th className="px-4 py-3 font-medium">Business</th>
                  <th className="px-4 py-3 font-medium">Active Orders</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {data.suspendedSellersWithActiveOrders.map((s) => (
                  <tr key={s.businessId} className="h-14">
                    <td className="px-4 text-[#1E293B]">{s.businessName}</td>
                    <td className="px-4">
                      <span className="font-semibold text-amber-700">{s.activeOrderCount}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </AdminLayout>
  );
}
