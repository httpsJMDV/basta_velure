import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { getAdminUsersApi, suspendUserApi, reactivateUserApi } from '../../api/client';
import type { User, Role, UserStatus } from '../../types';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { Search } from 'lucide-react';

const STATUS_BADGE: Record<UserStatus, 'approved' | 'rejected'> = {
  active:    'approved',
  suspended: 'rejected',
};

interface Meta { current_page: number; last_page: number; total: number; }

export default function AdminUsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const location = useLocation();
  const pathRole: Role | 'all' =
    location.pathname === '/admin/sellers' ? 'seller' :
    location.pathname === '/admin/buyers'  ? 'buyer'  :
    location.pathname === '/admin/riders'  ? 'rider'  : 'all';

  const roleParam = pathRole;
  const statusParam = (searchParams.get('status') ?? '')    as UserStatus | '';
  const searchParam =  searchParams.get('search') ?? '';
  const pageParam   = Number(searchParams.get('page') ?? 1);

  const [users,   setUsers]   = useState<User[]>([]);
  const [meta,    setMeta]    = useState<Meta>({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState(searchParam);
  const [acting,  setActing]  = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminUsersApi({
        role:   roleParam !== 'all' ? roleParam : undefined,
        status: statusParam || undefined,
        search: searchParam || undefined,
        page:   pageParam,
      });
      setUsers(res.data);
      setMeta(res.meta);
    } finally {
      setLoading(false);
    }
  }, [roleParam, statusParam, searchParam, pageParam]);

  useEffect(() => { load(); }, [load]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page');
    setSearchParams(next);
  }

  function setPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setParam('search', search);
  }

  async function handleSuspend(user: User) {
    setActing(user.id);
    try {
      const updated = await suspendUserApi(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } finally { setActing(null); }
  }

  async function handleReactivate(user: User) {
    setActing(user.id);
    try {
      const updated = await reactivateUserApi(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } finally { setActing(null); }
  }

  const pageTitle = roleParam === 'all' ? 'All Users' :
    roleParam === 'buyer' ? 'Buyers' :
    roleParam === 'seller' ? 'Sellers' : 'Riders';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-black">{pageTitle}</h1>
        <p className="text-sm text-gray-500 mt-1">{meta.total} total</p>
      </div>

      {/* Search + status filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={submitSearch} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone…"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
            />
          </div>
          <Button type="submit" variant="primary" className="shrink-0">Search</Button>
        </form>

        <select
          value={statusParam}
          onChange={(e) => setParam('status', e.target.value)}
          className="min-h-[44px] px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red bg-white"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No users found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">User</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Role</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Phone</th>
                  <th className="px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-medium text-brand-black">{user.first_name} {user.last_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="capitalize text-gray-600">{user.role}</span>
                      {user.seller_profile && (
                        <p className="text-xs text-gray-400 mt-0.5">{user.seller_profile.shop_name}</p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Badge label={user.status} variant={STATUS_BADGE[user.status]} />
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell text-gray-500">{user.phone}</td>
                    <td className="px-5 py-4">
                      {user.status === 'active' ? (
                        <Button
                          variant="ghost"
                          className="!min-h-[36px] !px-3 text-xs"
                          loading={acting === user.id}
                          onClick={() => handleSuspend(user)}
                        >
                          Suspend
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          className="!min-h-[36px] !px-3 text-xs"
                          loading={acting === user.id}
                          onClick={() => handleReactivate(user)}
                        >
                          Reactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-gray-500">
            Page {meta.current_page} of {meta.last_page}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="!min-h-[36px] !px-4 text-xs"
              disabled={meta.current_page <= 1}
              onClick={() => setPage(meta.current_page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              className="!min-h-[36px] !px-4 text-xs"
              disabled={meta.current_page >= meta.last_page}
              onClick={() => setPage(meta.current_page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
