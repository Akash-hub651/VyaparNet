'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import Link from 'next/link';
import { listOrders, type OrderListItem } from '../../lib/api';

export default function OrdersPage(): React.JSX.Element {
  const [data, setData] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [segment, setSegment] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listOrders({ page, limit: 20, status: status || undefined, segment: segment || undefined, search: search || undefined });
      setData(res.data);
      setTotal(res.total);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [page, status, segment, search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const columns = [
    { key: 'orderNumber', header: 'Order #', render: (row: OrderListItem) => (
      <Link href={`/orders/${row.id}`} className="text-[#2563EB] hover:underline font-medium font-mono">{row.orderNumber}</Link>
    )},
    { key: 'buyerName', header: 'Buyer' },
    { key: 'sellerName', header: 'Seller' },
    { key: 'segment', header: 'Segment' },
    { key: 'grandTotal', header: 'Total', render: (row: OrderListItem) => `₹${row.grandTotal}` },
    { key: 'paymentMethod', header: 'Payment' },
    { key: 'status', header: 'Status', render: (row: OrderListItem) => <StatusBadge status={row.status} /> },
    { key: 'createdAt', header: 'Date', render: (row: OrderListItem) => new Date(row.createdAt).toLocaleDateString() },
  ];

  return (
    <AdminLayout title="All Orders">
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          type="text"
          placeholder="Search order #…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border border-[#E2E8F0] rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] w-56"
        />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="PLACED">Placed</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PROCESSING">Processing</option>
          <option value="SHIPPED">Shipped</option>
          <option value="DELIVERED">Delivered</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <select value={segment} onChange={(e) => { setSegment(e.target.value); setPage(1); }} className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm">
          <option value="">All Segments</option>
          <option value="TEXTILE">Textile</option>
          <option value="SPARE_PARTS">Spare Parts</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={data as unknown as Record<string, unknown>[]}
        total={total}
        page={page}
        limit={20}
        onPageChange={setPage}
        rowKey="id"
        loading={loading}
        emptyMessage="No orders found."
      />
    </AdminLayout>
  );
}
