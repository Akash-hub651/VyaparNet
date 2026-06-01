'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import AdminLayout from '../../../../components/AdminLayout';
import StatusBadge from '../../../../components/StatusBadge';
import { generateInvoice } from '../../../../lib/api';

interface InvoiceDetail {
  id: string;
  orderNumber: string;
  buyerName: string;
  sellerName: string;
  sellerGstin: string;
  grandTotal: string;
  status: string;
  pdfUrl?: string;
  createdAt: string;
}

export default function InvoiceDetailPage(): React.JSX.Element {
  const params = useParams();
  const orderId = params.orderId as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (): Promise<void> => {
    setGenerating(true);
    setError(null);
    try {
      const key = crypto.randomUUID();
      const result = await generateInvoice(orderId, key);
      if (result.status === 'DONE' && result.url) {
        setInvoice((prev) =>
          prev ? { ...prev, pdfUrl: result.url, status: 'DONE' } : null,
        );
      } else {
        // 202 GENERATING — poll is out of scope (FOOTGUN-15-A: no WebSocket)
        setInvoice((prev) =>
          prev ? { ...prev, status: 'GENERATING' } : null,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invoice');
    } finally {
      setGenerating(false);
    }
  };

  // No auto-load — user lands here from the finance list which has the invoice ID
  // This page is the viewer; generation is triggered manually (INV-S7-17)

  return (
    <AdminLayout title="Invoice Viewer">
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-[#1E293B]">Order: {orderId}</h2>
            <p className="text-sm text-[#64748B] mt-1">
              Generate a tax invoice PDF for this order. Generation may be async (INV-S7-16).
            </p>
          </div>
          <div className="flex items-center gap-3">
            {invoice?.status && <StatusBadge status={invoice.status} />}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 text-sm bg-[#2563EB] text-white rounded-lg hover:bg-[#1D4ED8] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? 'Generating…' : 'Generate Invoice'}
            </button>
          </div>
        </div>

        {invoice?.status === 'GENERATING' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            ⏳ Invoice is being generated in the background. Refresh this page in a few seconds.
          </div>
        )}

        {/* PDF inline viewer */}
        {invoice?.pdfUrl && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[#1E293B]">Invoice PDF</h3>
              <a
                href={invoice.pdfUrl}
                download
                className="text-xs text-[#2563EB] hover:underline font-medium"
              >
                ⬇ Download PDF
              </a>
            </div>
            <iframe
              src={invoice.pdfUrl}
              title="Invoice PDF"
              className="w-full h-[700px] border border-[#E2E8F0] rounded-lg"
            />
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
