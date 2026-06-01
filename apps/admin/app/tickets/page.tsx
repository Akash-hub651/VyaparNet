'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ConfirmModal from '../../components/ConfirmModal';
import { listTickets, resolveTicket, type SupportTicket } from '../../lib/api';

export default function TicketsPage(): React.JSX.Element {
  const [data, setData] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('OPEN');
  const [priority, setPriority] = useState('');
  const [resolveTarget, setResolveTarget] = useState<SupportTicket | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listTickets({ page, limit: 20, status: status || undefined, priority: priority || undefined });
      setData(res.data);
      setTotal(res.total);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [page, status, priority]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const handleResolve = async (): Promise<void> => {
    if (!resolveTarget) return;
    const key = crypto.randomUUID();
    try {
      await resolveTicket(resolveTarget.id, key);
      setResolveTarget(null);
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const priorityColor: Record<string, string> = {
    HIGH: 'text-red-700',
    MEDIUM: 'text-amber-700',
    LOW: 'text-[#64748B]',
  };

  const columns = [
    { key: 'subject', header: 'Subject', render: (row: SupportTicket) => (
      <span className="font-medium text-[#1E293B]">{row.subject}</span>
    )},
    { key: 'reporterName', header: 'Reporter', render: (row: SupportTicket) => (
      <span>{row.reporterName} <span className="text-[#94A3B8] text-xs">({row.reporterRole})</span></span>
    )},
    { key: 'priority', header: 'Priority', render: (row: SupportTicket) => (
      <span className={`text-sm font-semibold ${priorityColor[row.priority] ?? ''}`}>{row.priority}</span>
    )},
    { key: 'status', header: 'Status', render: (row: SupportTicket) => <StatusBadge status={row.status} /> },
    { key: 'assigneeName', header: 'Assignee', render: (row: SupportTicket) => (
      <span className="text-[#64748B]">{row.assigneeName ?? '—'}</span>
    )},
    { key: 'createdAt', header: 'Created', render: (row: SupportTicket) => new Date(row.createdAt).toLocaleDateString() },
    { key: 'actions', header: 'Actions', render: (row: SupportTicket) => (
      row.status !== 'RESOLVED' && row.status !== 'CLOSED' ? (
        <button
          type="button"
          onClick={() => { setResolveTarget(row); setActionError(null); }}
          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 font-medium"
        >
          Resolve
        </button>
      ) : null
    )},
  ];

  return (
    <AdminLayout title="Support Tickets">
      <div className="flex gap-3 mb-5 flex-wrap">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
        <select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }} className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm">
          <option value="">All Priorities</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
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
        rowKey="id"
        loading={loading}
        emptyMessage="No support tickets found."
      />

      <ConfirmModal
        open={resolveTarget !== null}
        title="Resolve Ticket"
        description={`Mark "${resolveTarget?.subject}" as RESOLVED?`}
        confirmLabel="Resolve"
        onConfirm={handleResolve}
        onCancel={() => { setResolveTarget(null); setActionError(null); }}
      />
    </AdminLayout>
  );
}
