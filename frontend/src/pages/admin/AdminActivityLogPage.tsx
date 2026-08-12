import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getActivityLogApi } from '../../api/client';
import type { ActivityLogEntry } from '../../types';
import Button from '../../components/ui/Button';

const ACTION_LABELS: Record<string, string> = {
  approve_seller:  'Approved Seller',
  reject_seller:   'Rejected Seller',
  suspend_user:    'Suspended User',
  reactivate_user: 'Reactivated User',
  takedown_product:'Product Takedown',
  delete_review:   'Deleted Review',
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

function actionColor(action: string) {
  if (action.startsWith('approve')) return 'bg-green-100 text-green-800';
  if (action.startsWith('reject') || action.startsWith('suspend') || action.startsWith('takedown') || action.startsWith('delete'))
    return 'bg-red-100 text-red-700';
  if (action.startsWith('reactivate')) return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-600';
}

interface Meta { current_page: number; last_page: number; total: number; }

export default function AdminActivityLogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const actionParam = searchParams.get('action') ?? '';
  const pageParam   = Number(searchParams.get('page') ?? 1);

  const [logs,    setLogs]    = useState<ActivityLogEntry[]>([]);
  const [meta,    setMeta]    = useState<Meta>({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getActivityLogApi({ action: actionParam || undefined, page: pageParam });
      setLogs(res.data);
      setMeta(res.meta);
    } finally { setLoading(false); }
  }, [actionParam, pageParam]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-black">Activity Log</h1>
        <p className="text-sm text-gray-500 mt-1">Every admin action, timestamped. {meta.total} entries.</p>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <select
          value={actionParam}
          onChange={(e) => setParam('action', e.target.value)}
          className="min-h-[44px] px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red bg-white"
        >
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No log entries found.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {logs.map((log) => (
              <div key={log.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="shrink-0 pt-0.5">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${actionColor(log.action)}`}>
                    {actionLabel(log.action)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-brand-black">{log.description}</p>
                  {log.meta && Object.keys(log.meta).length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">
                      {JSON.stringify(log.meta)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-gray-500">
                    {log.admin.first_name} {log.admin.last_name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(log.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-gray-500">Page {meta.current_page} of {meta.last_page}</p>
          <div className="flex gap-2">
            <Button variant="ghost" className="!min-h-[36px] !px-4 text-xs" disabled={meta.current_page <= 1} onClick={() => setPage(meta.current_page - 1)}>
              Previous
            </Button>
            <Button variant="ghost" className="!min-h-[36px] !px-4 text-xs" disabled={meta.current_page >= meta.last_page} onClick={() => setPage(meta.current_page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
