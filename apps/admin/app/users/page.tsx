'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import Link from 'next/link';
import { listUsers, type UserListItem } from '../../lib/api';

export default function UsersPage(): React.JSX.Element {
  const [data, setData] = useState<UserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listUsers({ page, limit: 20, role: role || undefined, search: search || undefined });
      setData(res.data);
      setTotal(res.total);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [page, role, search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const columns = [
    { key: 'name', header: 'Name', render: (row: UserListItem) => (
      <Link href={`/users/${row.id}`} className="text-[#2563EB] hover:underline font-medium">{row.name}</Link>
    )},
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone' },
    { key: 'role', header: 'Role', render: (row: UserListItem) => <StatusBadge status={row.role} /> },
    { key: 'isDeleted', header: 'Status', render: (row: UserListItem) => (
      <StatusBadge status={row.isDeleted ? 'SUSPENDED' : 'ACTIVE'} />
    )},
    { key: 'createdAt', header: 'Joined', render: (row: UserListItem) => new Date(row.createdAt).toLocaleDateString() },
  ];

  return (
    <AdminLayout title="User Management">
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border border-[#E2E8F0] rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] w-72"
        />
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value); setPage(1); }}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Roles</option>
          <option value="BUYER">Buyer</option>
          <option value="SELLER">Seller</option>
          <option value="ADMIN">Admin</option>
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
        emptyMessage="No users found."
      />
    </AdminLayout>
  );
}
