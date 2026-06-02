'use client';

import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import StatusBadge from '../../components/StatusBadge';
import ConfirmModal from '../../components/ConfirmModal';
import { listFlags, toggleFlag, updateFlagRollout, type FeatureFlag } from '../../lib/api';

type ModalMode = 'toggle' | 'edit-rollout' | null;

export default function FlagsPage(): React.JSX.Element {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [actionTarget, setActionTarget] = useState<FeatureFlag | null>(null);
  const [editValue, setEditValue] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await listFlags();
      setFlags(data);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, []);

  /**
   * Toggle enabled state — sends { enabled: !current } to PATCH /admin/flags/:name
   * Backend: AdminFlagService.toggleFlag() → AdminUpdateFlagDto { enabled, rolloutPercent? }
   */
  const handleToggle = async (): Promise<void> => {
    if (!actionTarget) return;
    const key = crypto.randomUUID();
    try {
      await toggleFlag(actionTarget.name, !actionTarget.enabled, key);
      setModalMode(null);
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  /**
   * Update rolloutPercent (used as numeric rate for commission/TDS flags).
   * Backend: AdminUpdateFlagDto { enabled: current, rolloutPercent: number }
   */
  const handleUpdateRollout = async (): Promise<void> => {
    if (!actionTarget) return;
    const numericValue = Number(editValue);
    if (isNaN(numericValue) || numericValue < 0 || numericValue > 100) {
      setActionError('Rollout percent must be a number between 0 and 100');
      return;
    }
    const key = crypto.randomUUID();
    try {
      await updateFlagRollout(actionTarget.name, actionTarget.enabled, numericValue, key);
      setModalMode(null);
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const grouped = flags.reduce<Record<string, FeatureFlag[]>>((acc, f) => {
    const g = f.segment ?? 'GLOBAL';
    if (!acc[g]) acc[g] = [];
    acc[g].push(f);
    return acc;
  }, {});

  return (
    <AdminLayout title="Feature Flags">
      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{actionError}</div>
      )}

      {loading ? (
        <p className="text-[#64748B] text-sm">Loading…</p>
      ) : (
        Object.entries(grouped).map(([segment, segFlags]) => (
          <div key={segment} className="mb-6">
            <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wide mb-3">
              Segment: {segment}
            </h2>
            <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-left text-[#64748B]">
                    <th className="px-5 py-3 font-medium">Flag Name</th>
                    <th className="px-5 py-3 font-medium">Description</th>
                    <th className="px-5 py-3 font-medium">Rollout %</th>
                    <th className="px-5 py-3 font-medium">Env</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {segFlags.map((flag) => (
                    <tr key={flag.id} className="h-14 hover:bg-[#F8FAFC]">
                      <td className="px-5">
                        <span className="font-mono text-sm text-[#1E293B]">{flag.name}</span>
                      </td>
                      <td className="px-5 text-[#64748B]">{flag.description ?? '—'}</td>
                      <td className="px-5">
                        <span className="font-mono text-xs bg-[#F1F5F9] px-2 py-1 rounded">
                          {flag.rolloutPercent}%
                        </span>
                      </td>
                      <td className="px-5 text-[#64748B] text-xs">{flag.env}</td>
                      <td className="px-5">
                        <StatusBadge status={flag.enabled ? 'ACTIVE' : 'INACTIVE'} />
                      </td>
                      <td className="px-5">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setActionTarget(flag); setModalMode('toggle'); setActionError(null); }}
                            className={`px-2 py-1 text-xs rounded font-medium ${
                              flag.enabled
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                            }`}
                          >
                            {flag.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActionTarget(flag);
                              setEditValue(String(flag.rolloutPercent));
                              setModalMode('edit-rollout');
                              setActionError(null);
                            }}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium"
                          >
                            Edit %
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <ConfirmModal
        open={modalMode === 'toggle'}
        title={`${actionTarget?.enabled ? 'Disable' : 'Enable'} Flag`}
        description={`${actionTarget?.enabled ? 'Disable' : 'Enable'} flag "${actionTarget?.name}"? Cache will be invalidated (SCAN + DEL).`}
        confirmLabel={actionTarget?.enabled ? 'Disable' : 'Enable'}
        destructive={actionTarget?.enabled}
        onConfirm={handleToggle}
        onCancel={() => { setModalMode(null); setActionError(null); }}
      />

      {/* Edit rolloutPercent modal */}
      {modalMode === 'edit-rollout' && actionTarget && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm z-50">
            <h2 className="text-lg font-semibold text-[#1E293B] mb-1">Edit Rollout %</h2>
            <p className="text-sm text-[#64748B] mb-1 font-mono">{actionTarget.name}</p>
            <p className="text-xs text-[#94A3B8] mb-4">
              For numeric rate flags (commission, TDS, gateway fee): value = percentage (e.g. 2 = 2%)
            </p>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-4 py-3 text-sm font-mono mb-4 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
            {actionError && (
              <p className="text-xs text-red-600 mb-3">{actionError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setModalMode(null); setActionError(null); }} className="px-4 py-2 text-sm text-[#64748B] bg-[#F1F5F9] rounded-lg">Cancel</button>
              <button type="button" onClick={handleUpdateRollout} className="px-4 py-2 text-sm text-white bg-[#2563EB] rounded-lg hover:bg-[#1D4ED8]">Save</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
