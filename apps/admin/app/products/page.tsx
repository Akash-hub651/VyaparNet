'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ConfirmModal from '../../components/ConfirmModal';
import {
  listProducts,
  approveProduct,
  rejectProduct,
  bulkApproveProducts,
  type ProductListItem,
} from '../../lib/api';

type ModalMode = 'approve' | 'reject' | 'bulk-approve' | null;

export default function ProductsPage(): React.JSX.Element {
  const [data, setData] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('UNDER_REVIEW');
  const [selected, setSelected] = useState<ProductListItem[]>([]);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [actionTarget, setActionTarget] = useState<ProductListItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listProducts({ page, limit: 20, status: status || undefined });
      setData(res.data);
      setTotal(res.total);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [page, status]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const handleAction = async (reason?: string): Promise<void> => {
    const key = crypto.randomUUID();
    try {
      if (modalMode === 'approve' && actionTarget) {
        await approveProduct(actionTarget.id, key);
      } else if (modalMode === 'reject' && actionTarget) {
        await rejectProduct(actionTarget.id, reason ?? '', key);
      } else if (modalMode === 'bulk-approve') {
        await bulkApproveProducts(selected.map((p) => p.id), key);
        setSelected([]);
      }
      setModalMode(null);
      setActionTarget(null);
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const columns = [
    { key: 'name', header: 'Product Name', render: (row: ProductListItem) => <span className="font-medium">{row.name}</span> },
    { key: 'sellerName', header: 'Seller' },
    { key: 'segment', header: 'Segment' },
    { key: 'price', header: 'Price', render: (row: ProductListItem) => `₹${row.price}` },
    { key: 'status', header: 'Status', render: (row: ProductListItem) => <StatusBadge status={row.status} /> },
    { key: 'createdAt', header: 'Submitted', render: (row: ProductListItem) => new Date(row.createdAt).toLocaleDateString() },
    { key: 'actions', header: 'Actions', render: (row: ProductListItem) => (
      <div className="flex gap-2">
        {row.status === 'UNDER_REVIEW' && (
          <>
            <button type="button" onClick={() => { setActionTarget(row); setModalMode('approve'); }} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 font-medium">Approve</button>
            <button type="button" onClick={() => { setActionTarget(row); setModalMode('reject'); }} className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium">Reject</button>
          </>
        )}
      </div>
    )},
  ];

  return (
    <AdminLayout title="Products — Approval Queue">
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="REJECTED">Rejected</option>
        </select>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => setModalMode('bulk-approve')}
            className="ml-auto px-4 py-2 text-sm bg-[#2563EB] text-white rounded-lg hover:bg-[#1D4ED8] font-medium"
          >
            Bulk Approve ({selected.length})
          </button>
        )}
      </div>

      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{actionError}</div>
      )}

      <DataTable
        columns={columns}
        data={data as unknown as Record<string, unknown>[]}
        total={total}
        page={page}
        limit={20}
        onPageChange={setPage}
        onSelectionChange={(sel) => setSelected(sel as unknown as ProductListItem[])}
        rowKey="id"
        loading={loading}
        emptyMessage="No products found."
      />

      <ConfirmModal open={modalMode === 'approve'} title="Approve Product" description={`Approve "${actionTarget?.name}"?`} confirmLabel="Approve" onConfirm={handleAction} onCancel={() => { setModalMode(null); setActionError(null); }} />
      <ConfirmModal open={modalMode === 'reject'} title="Reject Product" description={`Reject "${actionTarget?.name}"?`} confirmLabel="Reject" destructive requireReason reasonPlaceholder="Reason for rejection…" onConfirm={handleAction} onCancel={() => { setModalMode(null); setActionError(null); }} />
      <ConfirmModal open={modalMode === 'bulk-approve'} title={`Bulk Approve ${selected.length} Products`} description="Approve all selected products?" confirmLabel="Approve All" onConfirm={handleAction} onCancel={() => { setModalMode(null); setActionError(null); }} />
    </AdminLayout>
  );
}
