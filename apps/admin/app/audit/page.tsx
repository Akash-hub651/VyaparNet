'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import StatusBadge from '../../components/StatusBadge';
import { listAuditLogs, type AuditLogEntry } from '../../lib/api';

export default function AuditPage(): React.JSX.Element {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [action, setAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [hasPrev, setHasPrev] = useState(false);

  const cursorStack = useRef<Array<string | undefined>>([undefined]);

  const load = useCallback(async (overrideCursor?: string | undefined) => {
    setLoading(true);
    try {
      const res = await listAuditLogs({
        cursor: overrideCursor,
        limit: 50,
        entityType: entityType || undefined,
        entityId: entityId || undefined,
        action: action || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setEntries(res.data);
      setNextCursor(res.nextCursor);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [entityType, entityId, action, dateFrom, dateTo]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    cursorStack.current = [undefined];
    setHasPrev(false);
    void load(undefined);
  }, [load]); // load is memoised via useCallback with all filter deps
  /* eslint-enable react-hooks/set-state-in-effect */

  const goNext = (): void => {
    if (!nextCursor) return;
    cursorStack.current.push(nextCursor);
    setHasPrev(cursorStack.current.length > 1);
    void load(nextCursor);
  };

  const goPrev = (): void => {
    if (cursorStack.current.length <= 1) return;
    cursorStack.current.pop();
    setHasPrev(cursorStack.current.length > 1);
    const prev = cursorStack.current.at(-1);
    void load(prev);
  };

  const toggleExpanded = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <AdminLayout title="Audit Log">
      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          type="text"
          placeholder="Entity type (e.g. Business)…"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="border border-[#E2E8F0] rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] w-52"
        />
        <input
          type="text"
          placeholder="Entity ID…"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          className="border border-[#E2E8F0] rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] w-52"
        />
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Actions</option>
          <option value="STATUS_CHANGE">Status Change</option>
          <option value="ROLE_CHANGE">Role Change</option>
          <option value="UPDATE">Update</option>
          <option value="CREATE">Create</option>
          <option value="DELETE">Delete</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#94A3B8] text-sm">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-[#94A3B8] text-sm">No audit log entries found.</div>
        ) : (
          <div className="divide-y divide-[#F1F5F9]">
            {entries.map((entry) => (
              <div key={entry.id} className="px-5 py-4">
                <div
                  className="flex items-center gap-4 cursor-pointer"
                  onClick={() => toggleExpanded(entry.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && toggleExpanded(entry.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-[#1E293B]">{entry.entityType}</span>
                      <span className="text-[#94A3B8] text-xs">·</span>
                      <span className="font-mono text-xs text-[#64748B] truncate max-w-[180px]">{entry.entityName || entry.entityId}</span>
                      <StatusBadge status={entry.action} />
                      <span className="text-xs text-[#94A3B8] ml-auto">{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      by {entry.actorRole} · {entry.ipAddress}
                    </p>
                  </div>
                  <span className="text-[#94A3B8] text-xs">{expanded.has(entry.id) ? '▲' : '▼'}</span>
                </div>

                {expanded.has(entry.id) && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {entry.oldValue && (
                      <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-red-700 mb-1">Before</p>
                        <pre className="text-xs text-red-800 overflow-auto">{JSON.stringify(entry.oldValue, null, 2)}</pre>
                      </div>
                    )}
                    {entry.newValue && (
                      <div className="bg-green-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-green-700 mb-1">After</p>
                        <pre className="text-xs text-green-800 overflow-auto">{JSON.stringify(entry.newValue, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Cursor pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC]">
          <span className="text-sm text-[#64748B]">{entries.length} entries shown</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={!hasPrev || loading}
              className="px-3 py-1.5 text-sm rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-white disabled:opacity-50"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!nextCursor || loading}
              className="px-3 py-1.5 text-sm rounded-lg border border-[#E2E8F0] text-[#64748B] hover:bg-white disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
