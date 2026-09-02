import { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  Activity,
  Search,
  ShieldAlert,
  UserCheck,
  UserX,
  FileCode,
  CheckCircle2,
  Eye,
  X,
  Layers,
  Zap,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { getActivityLogApi } from '../../api/client';
import type { ActivityLogEntry } from '../../types';
import Button from '../../components/ui/Button';
import CustomSelect from '../../components/ui/CustomSelect';
import { useCountUp, useMountAnim } from '../../hooks/useDashboardAnimations';

const ACTION_MAP: Record<
  string,
  { label: string; bg: string; text: string; icon: React.ElementType }
> = {
  approve_seller:   { label: 'Seller Approved',    bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: UserCheck },
  reject_seller:    { label: 'Seller Rejected',    bg: 'bg-rose-50 border-rose-200',       text: 'text-rose-700',    icon: UserX },
  approve_buyer:    { label: 'Buyer Approved',     bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', icon: UserCheck },
  reject_buyer:     { label: 'Buyer Rejected',     bg: 'bg-rose-50 border-rose-200',       text: 'text-rose-700',    icon: UserX },
  suspend_user:     { label: 'Account Suspended',  bg: 'bg-red-50 border-red-200',         text: 'text-red-700',     icon: ShieldAlert },
  reactivate_user:  { label: 'Account Restored',   bg: 'bg-blue-50 border-blue-200',       text: 'text-blue-700',    icon: CheckCircle2 },
  takedown_product: { label: 'Product Takedown',   bg: 'bg-amber-50 border-amber-200',     text: 'text-amber-700',   icon: ShieldAlert },
  delete_review:    { label: 'Review Moderated',   bg: 'bg-purple-50 border-purple-200',   text: 'text-purple-700',  icon: Layers },
  commission_update:{ label: 'Take-Rate Changed',  bg: 'bg-amber-50 border-amber-200',     text: 'text-amber-800',   icon: Zap },
  policy_update:    { label: 'Policy Modified',    bg: 'bg-blue-50 border-blue-200',       text: 'text-blue-800',    icon: FileCode },
};

const ACTION_OPTIONS = [
  { value: '', label: 'All Operations' },
  { value: 'approve_seller', label: 'Seller Approved' },
  { value: 'reject_seller', label: 'Seller Rejected' },
  { value: 'approve_buyer', label: 'Buyer Approved' },
  { value: 'reject_buyer', label: 'Buyer Rejected' },
  { value: 'suspend_user', label: 'Account Suspended' },
  { value: 'reactivate_user', label: 'Account Restored' },
  { value: 'takedown_product', label: 'Product Takedown' },
  { value: 'delete_review', label: 'Review Moderated' },
  { value: 'commission_update', label: 'Commission Update' },
  { value: 'policy_update', label: 'Policy Update' },
];

const PER_PAGE_OPTIONS = [
  { value: '15', label: '15 rows' },
  { value: '30', label: '30 rows' },
  { value: '50', label: '50 rows' },
  { value: '100', label: '100 rows' },
];

function getOperatorInitials(first?: string, last?: string): string {
  const f = first?.[0] || '';
  const l = last?.[0] || '';
  return (f + l).toUpperCase() || 'AD';
}

interface Meta {
  current_page: number;
  last_page: number;
  total: number;
}

export default function AdminActivityLogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const actionParam  = searchParams.get('action') ?? '';
  const pageParam    = Number(searchParams.get('page') ?? 1);
  const perPageParam = searchParams.get('per_page') ?? '30';

  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [meta, setMeta] = useState<Meta>({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayload, setSelectedPayload] = useState<ActivityLogEntry | null>(null);

  const pageRef = useMountAnim();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getActivityLogApi({
        action: actionParam || undefined,
        page: pageParam,
        per_page: Number(perPageParam),
      });
      setLogs(res.data);
      setMeta(res.meta);
    } finally {
      setLoading(false);
    }
  }, [actionParam, pageParam, perPageParam]);

  useEffect(() => {
    load();
  }, [load]);

  function handleActionFilter(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('action', value);
    else next.delete('action');
    next.delete('page');
    setSearchParams(next);
  }

  function handlePerPageFilter(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value && value !== '30') next.set('per_page', value);
    else next.delete('per_page');
    next.delete('page');
    setSearchParams(next);
  }

  function setPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(p));
    setSearchParams(next);
  }

  // Client-side search filtering
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter(
      (log) =>
        log.description?.toLowerCase().includes(q) ||
        log.action?.toLowerCase().includes(q) ||
        log.target_type?.toLowerCase().includes(q) ||
        `${log.admin?.first_name || ''} ${log.admin?.last_name || ''}`.toLowerCase().includes(q)
    );
  }, [logs, searchQuery]);

  // Velocity Metrics
  const totalEvents = useCountUp(meta.total);
  const securityEvents = useCountUp(
    logs.filter((l) => l.action.includes('suspend') || l.action.includes('reject') || l.action.includes('takedown')).length
  );
  const approvalEvents = useCountUp(logs.filter((l) => l.action.includes('approve')).length);

  // Pagination UI Component
  const renderPaginationControls = (isTop = false) => {
    if (meta.last_page <= 1 && meta.total <= Number(perPageParam)) return null;

    return (
      <div className={`flex flex-wrap items-center justify-between gap-2 text-xs ${isTop ? 'pb-1' : 'pt-2 border-t border-gray-100'}`}>
        <span className="text-gray-500 font-medium">
          Page <strong className="text-gray-900">{meta.current_page}</strong> of{' '}
          <strong className="text-gray-900">{meta.last_page}</strong> ({meta.total} total log entries)
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            className="py-1 px-2.5 text-xs flex items-center gap-1 font-semibold"
            disabled={meta.current_page <= 1 || loading}
            onClick={() => setPage(meta.current_page - 1)}
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Previous
          </Button>
          <span className="px-2 py-0.5 text-xs font-mono font-bold bg-gray-100 rounded-lg text-gray-700">
            {meta.current_page} / {meta.last_page}
          </span>
          <Button
            variant="secondary"
            className="py-1 px-2.5 text-xs flex items-center gap-1 font-semibold"
            disabled={meta.current_page >= meta.last_page || loading}
            onClick={() => setPage(meta.current_page + 1)}
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div ref={pageRef} className="pb-8 space-y-4 w-full">
      {/* ── 1. Gradient Hero Band (Matching Products Page) ── */}
      <div
        className="rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm relative overflow-hidden border border-neutral-800"
        style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-rose-300 shrink-0 border border-white/10">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                System Audit Trail &amp; Activity Log
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-spin' : 'bg-emerald-400 animate-pulse'}`} />
                {loading ? 'Streaming…' : 'Live Synced'}
              </span>
            </div>
            <p className="text-[11px] text-white/60 mt-0.5">
              Immutable forensic log of administrator actions, compliance verifications, and platform parameter mutations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          <span className="text-[10px] font-mono text-white/60 bg-black/40 px-2.5 py-1 rounded-xl border border-white/10">
            Retention: 365 Days
          </span>
        </div>
      </div>

      {/* ── 2. Compact 4-Card Velocity Metric Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 rounded-lg bg-gray-100 text-gray-800 flex items-center justify-center font-bold shrink-0">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold text-gray-400">Ledger</span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
              {totalEvents.toLocaleString()}
            </p>
            <p className="text-xs font-bold text-gray-800 mt-1">Total Audit Entries</p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">Across all administrative actors</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
              <UserCheck className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Verified</span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-emerald-600 tracking-tight leading-none">
              {approvalEvents.toLocaleString()}
            </p>
            <p className="text-xs font-bold text-gray-800 mt-1">Approvals &amp; Grants</p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">Sellers &amp; verified merchants</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-brand-red flex items-center justify-center font-bold shrink-0">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold text-brand-red bg-rose-50 px-1.5 py-0.5 rounded">Security</span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-brand-red tracking-tight leading-none">
              {securityEvents.toLocaleString()}
            </p>
            <p className="text-xs font-bold text-gray-800 mt-1">Enforcements &amp; Blocks</p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">Suspensions &amp; product takedowns</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">Engine</span>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">100%</p>
            <p className="text-xs font-bold text-gray-800 mt-1">Audit Integrity</p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">Zero missing forensic signatures</p>
          </div>
        </div>
      </div>

      {/* ── 3. Filters, Rows Per Page, Search & Table Container ── */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Filters on Left: Operation Type + Rows Limit Dropdown */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
            {/* CustomSelect Operation Filter */}
            <div className="w-full sm:w-56">
              <CustomSelect
                value={actionParam}
                onChange={handleActionFilter}
                options={ACTION_OPTIONS}
                placeholder="Filter by operation..."
              />
            </div>

            {/* CustomSelect Rows Per Page Filter */}
            <div className="w-full sm:w-36">
              <CustomSelect
                value={perPageParam}
                onChange={handlePerPageFilter}
                options={PER_PAGE_OPTIONS}
                placeholder="Rows limit..."
              />
            </div>
          </div>

          {/* Search Box on Right */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search description, operator, target..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red transition-all"
            />
          </div>
        </div>

        {/* ── TOP PAGINATION BAR ── */}
        {renderPaginationControls(true)}

        {/* ── High-Density Forensic Table ── */}
        <div className="overflow-x-auto border border-gray-100 rounded-xl">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Operator</th>
                <th className="px-4 py-3">Operation</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3 text-right">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="w-24 h-3.5 bg-gray-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="w-24 h-3.5 bg-gray-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="w-20 h-4 bg-gray-100 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="w-48 h-3.5 bg-gray-100 rounded" /></td>
                    <td className="px-4 py-3"><div className="w-20 h-3.5 bg-gray-100 rounded font-mono" /></td>
                    <td className="px-4 py-3 text-right"><div className="w-14 h-4 bg-gray-100 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    <Activity className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    No audit records found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const metaInfo = ACTION_MAP[log.action] ?? {
                    label: log.action.replace(/_/g, ' '),
                    bg: 'bg-gray-50 border-gray-200',
                    text: 'text-gray-700',
                    icon: Activity,
                  };
                  const Icon = metaInfo.icon;

                  return (
                    <tr key={log.id} className="hover:bg-gray-50/70 transition-colors group">
                      {/* Timestamp */}
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500 font-mono text-[11px]">
                        <span className="font-bold text-gray-900 block">
                          {new Date(log.created_at).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        <span>
                          {new Date(log.created_at).toLocaleTimeString('en-PH', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </td>

                      {/* Operator */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-neutral-900 text-white flex items-center justify-center font-bold text-[9px] shrink-0">
                            {getOperatorInitials(log.admin?.first_name, log.admin?.last_name)}
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 block leading-tight">
                              {log.admin ? `${log.admin.first_name} ${log.admin.last_name}` : 'System Auto'}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono">
                              Admin #{log.admin?.id ?? 0}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Operation */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${metaInfo.bg} ${metaInfo.text}`}
                        >
                          <Icon className="w-2.5 h-2.5" />
                          {metaInfo.label}
                        </span>
                      </td>

                      {/* Description */}
                      <td className="px-4 py-3 text-gray-700 font-medium max-w-sm truncate" title={log.description}>
                        {log.description}
                      </td>

                      {/* Target */}
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-gray-500">
                        {log.target_type ? `${log.target_type} #${log.target_id}` : 'Platform'}
                      </td>

                      {/* Payload / Details */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {log.meta ? (
                          <button
                            onClick={() => setSelectedPayload(log)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-red hover:underline cursor-pointer"
                          >
                            <Eye className="w-3 h-3" /> Inspect JSON
                          </button>
                        ) : (
                          <span className="text-gray-300 font-mono">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── BOTTOM PAGINATION BAR ── */}
        {renderPaginationControls(false)}
      </div>

      {/* ── 4. JSON Payload Inspector Modal via createPortal ── */}
      {selectedPayload && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-5 border border-gray-200 shadow-2xl space-y-3 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-brand-red" />
                <h3 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Forensic Event Metadata: #{selectedPayload.id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPayload(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 text-xs shrink-0">
              <div className="flex justify-between text-gray-500 pb-1 border-b border-gray-50">
                <span>Operation:</span>
                <span className="font-bold text-gray-900">{selectedPayload.action}</span>
              </div>
              <div className="flex justify-between text-gray-500 pb-1 border-b border-gray-50">
                <span>Actor:</span>
                <span className="font-bold text-gray-900">
                  {selectedPayload.admin ? `${selectedPayload.admin.first_name} ${selectedPayload.admin.last_name}` : 'System'}
                </span>
              </div>
              <div className="flex justify-between text-gray-500 pb-1 border-b border-gray-50">
                <span>Target:</span>
                <span className="font-mono text-gray-700">
                  {selectedPayload.target_type} #{selectedPayload.target_id}
                </span>
              </div>
            </div>

            <div className="bg-neutral-900 text-emerald-400 font-mono text-[11px] p-3 rounded-xl overflow-y-auto flex-1 border border-neutral-800 [scrollbar-width:thin]">
              <pre className="whitespace-pre-wrap break-all">{JSON.stringify(selectedPayload.meta, null, 2)}</pre>
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100 shrink-0">
              <Button variant="secondary" onClick={() => setSelectedPayload(null)} className="py-1 px-3 text-xs">
                Close
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
