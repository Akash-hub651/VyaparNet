'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AdminLayout from '../../../components/AdminLayout';
import StatusBadge from '../../../components/StatusBadge';
import ConfirmModal from '../../../components/ConfirmModal';
import {
  getBusinessDetail,
  verifyBusiness,
  rejectBusiness,
  suspendBusiness,
  type BusinessDetail,
} from '../../../lib/api';

type ModalMode = 'verify' | 'reject' | 'suspend' | null;

export default function BusinessDetailPage(): React.JSX.Element {
  const params = useParams();
  const id = params.id as string;

  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await getBusinessDetail(id);
      setBusiness(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load business');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [id]);

  const handleAction = async (reason?: string): Promise<void> => {
    if (!business || !modalMode) return;
    const key = crypto.randomUUID();
    try {
      if (modalMode === 'verify') await verifyBusiness(business.id, key);
      else if (modalMode === 'reject') await rejectBusiness(business.id, reason ?? '', key);
      else if (modalMode === 'suspend') await suspendBusiness(business.id, reason ?? '', key);
      setModalMode(null);
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  if (loading) return <AdminLayout title="Business Detail"><p className="text-[#64748B]">Loading…</p></AdminLayout>;
  if (error || !business) return <AdminLayout title="Business Detail"><p className="text-red-600">{error ?? 'Business not found'}</p></AdminLayout>;

  return (
    <AdminLayout title={`Business — ${business.name}`}>
      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{actionError}</div>
      )}

      {/* Header card */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[#1E293B]">{business.name}</h2>
            <p className="text-[#64748B] text-sm mt-1">GSTIN: {business.gstin} · Segment: {business.segment}</p>
            <p className="text-[#64748B] text-sm">Owner: {business.ownerName} · {business.ownerPhone} · {business.ownerEmail}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={business.kycStatus} />
            <div className="flex gap-2">
              {business.kycStatus === 'PENDING_REVIEW' && (
                <>
                  <button type="button" onClick={() => setModalMode('verify')} className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium">Verify KYC</button>
                  <button type="button" onClick={() => setModalMode('reject')} className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium">Reject KYC</button>
                </>
              )}
              {business.kycStatus === 'VERIFIED' && (
                <button type="button" onClick={() => setModalMode('suspend')} className="px-3 py-1.5 text-xs bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 font-medium">Suspend</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KYC Documents */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
        <h3 className="text-base font-semibold text-[#1E293B] mb-4">KYC Documents</h3>
        {business.kycDocuments.length === 0 ? (
          <p className="text-[#94A3B8] text-sm">No documents submitted.</p>
        ) : (
          <div className="space-y-3">
            {business.kycDocuments.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                <div>
                  <span className="text-sm font-medium text-[#1E293B]">{doc.type.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={doc.status} />
                  {doc.signedUrl && (
                    <a
                      href={doc.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#2563EB] hover:underline font-medium"
                    >
                      View Document →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal open={modalMode === 'verify'} title="Verify Business KYC" description={`Verify KYC for ${business.name}?`} confirmLabel="Verify" onConfirm={handleAction} onCancel={() => setModalMode(null)} />
      <ConfirmModal open={modalMode === 'reject'} title="Reject KYC" description={`Reject KYC for ${business.name}?`} confirmLabel="Reject" destructive requireReason reasonPlaceholder="Reason for rejection…" onConfirm={handleAction} onCancel={() => setModalMode(null)} />
      <ConfirmModal open={modalMode === 'suspend'} title="Suspend Business" description={`Suspend ${business.name}?`} confirmLabel="Suspend" destructive requireReason reasonPlaceholder="Reason for suspension…" onConfirm={handleAction} onCancel={() => setModalMode(null)} />
    </AdminLayout>
  );
}
