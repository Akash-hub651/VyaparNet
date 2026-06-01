'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ConfirmModal from '../../components/ConfirmModal';
import Link from 'next/link';
import {
  listBusinesses,
  verifyBusiness,
  rejectBusiness,
  suspendBusiness,
  type BusinessListItem,
} from '../../lib/api';

type ModalMode = 'verify' | 'reject' | 'suspend' | null;

export default function BusinessesPage(): React.JSX.Element {
  const [data, setData] = useState<BusinessListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [kycStatus, setKycStatus] = useState('PENDING_REVIEW');
  const [search, setSearch] = useState('');

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [actionTarget, setActionTarget] = useState<BusinessListItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBusinesses({ page, limit: 20, kycStatus: kycStatus || undefined, search: search || undefined });
      setData(res.data);
      setTotal(res.total);
    } catch {
      /* error handled silently; UI shows empty */
    } finally {
      setLoading(false);
    }
  }, [page, kycStatus, search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const handleAction = async (reason?: string): Promise<void> => {
    if (!actionTarget || !modalMode) return;
    const key = crypto.randomUUID();
    try {
      if (modalMode === 'verify') await verifyBusiness(actionTarget.id, key);
      else if (modalMode === 'reject') await rejectBusiness(actionTarget.id, reason ?? '', key);
      else if (modalMode === 'suspend') await suspendBusiness(actionTarget.id, reason ?? '', key);
      setModalMode(null);
      setActionTarget(null);
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const columns = [
    { key: 'name', header: 'Business', render: (row: BusinessListItem) => (
      <Link href={`/businesses/${row.id}`} className="text-[#2563EB] hover:underline font-medium">
        {row.name}
      </Link>
    )},
    { key: 'gstin', header: 'GSTIN' },
    { key: 'segment', header: 'Segment' },
    { key: 'ownerName', header: 'Owner' },
    { key: 'ownerPhone', header: 'Phone' },
    { key: 'kycStatus', header: 'KYC Status', render: (row: BusinessListItem) => (
      <StatusBadge status={row.kycStatus} />
    )},
    { key: 'actions', header: 'Actions', render: (row: BusinessListItem) => (
      <div className="flex gap-2">
        {row.kycStatus === 'PENDING_REVIEW' && (
          <>
            <button
              type="button"
              onClick={() => { setActionTarget(row); setModalMode('verify'); }}
              className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 font-medium"
            >
              Verify
            </button>
            <button
              type="button"
              onClick={() => { setActionTarget(row); setModalMode('reject'); }}
              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 font-medium"
            >
              Reject
            </button>
          </>
        )}
        {row.kycStatus === 'VERIFIED' && (
          <button
            type="button"
            onClick={() => { setActionTarget(row); setModalMode('suspend'); }}
            className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200 font-medium"
          >
            Suspend
          </button>
        )}
      </div>
    )},
  ];

  return (
    <AdminLayout title="Businesses — KYC Verification Queue">
      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          type="text"
          placeholder="Search business or GSTIN…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border border-[#E2E8F0] rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] w-72"
        />
        <select
          value={kycStatus}
          onChange={(e) => { setKycStatus(e.target.value); setPage(1); }}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
        >
          <option value="">All Statuses</option>
          <option value="PENDING_REVIEW">Pending Review</option>
          <option value="VERIFIED">Verified</option>
          <option value="REJECTED">Rejected</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>

      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <DataTable
        columns={columns}
        data={data as unknown as Record<string, unknown>[]}
        total={total}
        page={page}
        limit={20}
        onPageChange={setPage}
        rowKey="id"
        loading={loading}
        emptyMessage="No businesses found matching the filter."
      />

      <ConfirmModal
        open={modalMode === 'verify'}
        title="Verify Business KYC"
        description={`Verify KYC for ${actionTarget?.name}? This will allow them to start selling.`}
        confirmLabel="Verify"
        onConfirm={handleAction}
        onCancel={() => { setModalMode(null); setActionError(null); }}
      />
      <ConfirmModal
        open={modalMode === 'reject'}
        title="Reject KYC"
        description={`Reject KYC for ${actionTarget?.name}? Provide a reason.`}
        confirmLabel="Reject"
        destructive
        requireReason
        reasonPlaceholder="Reason for rejection…"
        onConfirm={handleAction}
        onCancel={() => { setModalMode(null); setActionError(null); }}
      />
      <ConfirmModal
        open={modalMode === 'suspend'}
        title="Suspend Business"
        description={`Suspend ${actionTarget?.name}? This will block all their active operations.`}
        confirmLabel="Suspend"
        destructive
        requireReason
        reasonPlaceholder="Reason for suspension…"
        onConfirm={handleAction}
        onCancel={() => { setModalMode(null); setActionError(null); }}
      />
    </AdminLayout>
  );
}
