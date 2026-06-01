'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import ConfirmModal from '../../components/ConfirmModal';
import Link from 'next/link';
import {
  listPayouts,
  initiatePayout,
  listInvoices,
  type PayoutListItem,
  type InvoiceListItem,
} from '../../lib/api';

type ModalMode = 'initiate-payout' | null;

export default function FinancePage(): React.JSX.Element {
  const [payouts, setPayouts] = useState<PayoutListItem[]>([]);
  const [payoutTotal, setPayoutTotal] = useState(0);
  const [payoutPage, setPayoutPage] = useState(1);
  const [payoutStatus, setPayoutStatus] = useState('PENDING');
  const [payoutLoading, setPayoutLoading] = useState(false);

  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [actionTarget, setActionTarget] = useState<PayoutListItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<'payouts' | 'invoices'>('payouts');

  const loadPayouts = useCallback(async () => {
    setPayoutLoading(true);
    try {
      const res = await listPayouts({ page: payoutPage, limit: 20, status: payoutStatus || undefined });
      setPayouts(res.data);
      setPayoutTotal(res.total);
    } catch { /* silent */ } finally {
      setPayoutLoading(false);
    }
  }, [payoutPage, payoutStatus]);

  const loadInvoices = useCallback(async () => {
    setInvoiceLoading(true);
    try {
      const res = await listInvoices({ page: invoicePage, limit: 20 });
      setInvoices(res.data);
      setInvoiceTotal(res.total);
    } catch { /* silent */ } finally {
      setInvoiceLoading(false);
    }
  }, [invoicePage]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadPayouts(); }, [loadPayouts]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadInvoices(); }, [loadInvoices]);

  const handleInitiatePayout = async (): Promise<void> => {
    if (!actionTarget) return;
    const key = crypto.randomUUID();
    try {
      await initiatePayout(actionTarget.id, key);
      setModalMode(null);
      setActionTarget(null);
      void loadPayouts();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const payoutColumns = [
    { key: 'orderNumber', header: 'Order #', render: (row: PayoutListItem) => (
      <span className="font-mono text-sm">{row.orderNumber}</span>
    )},
    { key: 'sellerName', header: 'Seller' },
    { key: 'grossAmount', header: 'Gross', render: (row: PayoutListItem) => `₹${row.grossAmount}` },
    { key: 'platformFee', header: 'Platform Fee', render: (row: PayoutListItem) => `₹${row.platformFee}` },
    { key: 'tdsAmount', header: 'TDS', render: (row: PayoutListItem) => `₹${row.tdsAmount}` },
    { key: 'netPayout', header: 'Net Payout', render: (row: PayoutListItem) => (
      <span className="font-semibold text-green-700">₹{row.netPayout}</span>
    )},
    { key: 'status', header: 'Status', render: (row: PayoutListItem) => <StatusBadge status={row.status} /> },
    { key: 'actions', header: 'Actions', render: (row: PayoutListItem) => (
      row.status === 'PENDING' ? (
        <button
          type="button"
          onClick={() => { setActionTarget(row); setModalMode('initiate-payout'); }}
          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium"
        >
          Initiate
        </button>
      ) : null
    )},
  ];

  const invoiceColumns = [
    { key: 'orderNumber', header: 'Order #', render: (row: InvoiceListItem) => (
      <span className="font-mono text-sm">{row.orderNumber}</span>
    )},
    { key: 'buyerName', header: 'Buyer' },
    { key: 'sellerName', header: 'Seller' },
    { key: 'grandTotal', header: 'Total', render: (row: InvoiceListItem) => `₹${row.grandTotal}` },
    { key: 'status', header: 'Status', render: (row: InvoiceListItem) => <StatusBadge status={row.status} /> },
    { key: 'createdAt', header: 'Created', render: (row: InvoiceListItem) => new Date(row.createdAt).toLocaleDateString() },
    { key: 'actions', header: 'View', render: (row: InvoiceListItem) => (
      <Link href={`/finance/invoices/${row.id}`} className="text-xs text-[#2563EB] hover:underline font-medium">
        View →
      </Link>
    )},
  ];

  return (
    <AdminLayout title="Finance — Payouts & Invoices">
      {/* Tabs */}
      <div className="flex border-b border-[#E2E8F0] mb-5">
        <button
          type="button"
          onClick={() => setTab('payouts')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'payouts'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
          }`}
        >
          Seller Payouts
        </button>
        <button
          type="button"
          onClick={() => setTab('invoices')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'invoices'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-[#64748B] hover:text-[#1E293B]'
          }`}
        >
          Tax Invoices
        </button>
      </div>

      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{actionError}</div>
      )}

      {tab === 'payouts' && (
        <>
          <div className="flex gap-3 mb-5">
            <select
              value={payoutStatus}
              onChange={(e) => { setPayoutStatus(e.target.value); setPayoutPage(1); }}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="INITIATED">Initiated</option>
              <option value="TRANSFERRED">Transferred</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
          <DataTable
            columns={payoutColumns}
            data={payouts as unknown as Record<string, unknown>[]}
            total={payoutTotal}
            page={payoutPage}
            limit={20}
            onPageChange={setPayoutPage}
            rowKey="id"
            loading={payoutLoading}
            emptyMessage="No payouts found."
          />
        </>
      )}

      {tab === 'invoices' && (
        <DataTable
          columns={invoiceColumns}
          data={invoices as unknown as Record<string, unknown>[]}
          total={invoiceTotal}
          page={invoicePage}
          limit={20}
          onPageChange={setInvoicePage}
          rowKey="id"
          loading={invoiceLoading}
          emptyMessage="No invoices found."
        />
      )}

      <ConfirmModal
        open={modalMode === 'initiate-payout'}
        title="Initiate Payout"
        description={`Initiate payout of ₹${actionTarget?.netPayout} to ${actionTarget?.sellerName}?`}
        confirmLabel="Initiate Payout"
        onConfirm={handleInitiatePayout}
        onCancel={() => { setModalMode(null); setActionError(null); }}
      />
    </AdminLayout>
  );
}
