'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AdminLayout from '../../../components/AdminLayout';
import StatusBadge from '../../../components/StatusBadge';
import ConfirmModal from '../../../components/ConfirmModal';
import { getUser, suspendUser, changeUserRole, type UserListItem } from '../../../lib/api';

type ModalMode = 'suspend' | 'change-role' | null;

export default function UserDetailPage(): React.JSX.Element {
  const params = useParams();
  const id = params.id as string;

  const [user, setUser] = useState<UserListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [newRole, setNewRole] = useState<'BUYER' | 'SELLER'>('BUYER');
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await getUser(id);
      setUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [id]);

  const handleSuspend = async (reason?: string): Promise<void> => {
    if (!user) return;
    const key = crypto.randomUUID();
    try {
      await suspendUser(user.id, reason ?? '', key);
      setModalMode(null);
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const handleChangeRole = async (): Promise<void> => {
    if (!user) return;
    const key = crypto.randomUUID();
    try {
      await changeUserRole(user.id, newRole, key);
      setModalMode(null);
      void load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  if (loading) return <AdminLayout title="User Detail"><p className="text-[#64748B]">Loading…</p></AdminLayout>;
  if (error || !user) return <AdminLayout title="User Detail"><p className="text-red-600">{error ?? 'User not found'}</p></AdminLayout>;

  return (
    <AdminLayout title={`User — ${user.name}`}>
      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{actionError}</div>
      )}

      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-[#1E293B]">{user.name}</h2>
            <p className="text-[#64748B] text-sm">{user.email} · {user.phone}</p>
            <p className="text-[#64748B] text-sm">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <StatusBadge status={user.role} />
              <StatusBadge status={user.isDeleted ? 'SUSPENDED' : 'ACTIVE'} />
            </div>
            <div className="flex gap-2 mt-2">
              {!user.isDeleted && (
                <button
                  type="button"
                  onClick={() => setModalMode('suspend')}
                  className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium"
                >
                  Suspend User
                </button>
              )}
              {!user.isDeleted && (user.role === 'BUYER' || user.role === 'SELLER') && (
                <button
                  type="button"
                  onClick={() => { setNewRole(user.role === 'BUYER' ? 'SELLER' : 'BUYER'); setModalMode('change-role'); }}
                  className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium"
                >
                  Change Role → {user.role === 'BUYER' ? 'SELLER' : 'BUYER'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={modalMode === 'suspend'}
        title="Suspend User"
        description={`Suspend ${user.name}? This invalidates all their active sessions immediately (INV-S7-10).`}
        confirmLabel="Suspend"
        destructive
        requireReason
        reasonPlaceholder="Reason for suspension…"
        onConfirm={handleSuspend}
        onCancel={() => { setModalMode(null); setActionError(null); }}
      />
      <ConfirmModal
        open={modalMode === 'change-role'}
        title={`Change Role to ${newRole}`}
        description={`Change ${user.name}'s role from ${user.role} to ${newRole}?`}
        confirmLabel="Change Role"
        onConfirm={handleChangeRole}
        onCancel={() => { setModalMode(null); setActionError(null); }}
      />
    </AdminLayout>
  );
}
