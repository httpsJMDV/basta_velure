import { useEffect, useState, useCallback } from 'react';
import { getAdminDisputesApi, getAdminDisputeApi, resolveDisputeApi, getAdminDisputeStatsApi } from '../../api/client';
import type { AdminDispute, DisputeStatus, AdminDisputeStats } from '../../types';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  User,
  ShoppingBag,
  Check,
  Eye,
} from 'lucide-react';
import { useCountUp } from '../../hooks/useDashboardAnimations';

const STATUS_OPTIONS: { label: string; value: DisputeStatus | '' }[] = [
  { label: 'All Disputes', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPHP(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Modern Dispute Detail Drawer ─────────────────────────────────────────────

function DisputeDetailDrawer({
  disputeId,
  onClose,
  onUpdated,
}: {
  disputeId: number;
  onClose: () => void;
  onUpdated: (d: AdminDispute) => void;
  }) {
  const [dispute, setDispute]   = useState<AdminDispute | null>(null);
  const [loading, setLoading]   = useState(true);
  const [note, setNote]         = useState('');
  const [resolveStatus, setResolveStatus] = useState<'resolved' | 'closed'>('resolved');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    getAdminDisputeApi(disputeId).then(setDispute).finally(() => setLoading(false));
  }, [disputeId]);

  async function handleResolve() {
    if (!dispute || !note.trim()) return;
    setSubmitting(true);
    try {
      const updated = await resolveDisputeApi(dispute.id, resolveStatus, note);
      setDispute(updated);
      onUpdated(updated);
    } finally {
      setSubmitting(false);
    }
  }

  const canResolve = dispute && (dispute.status === 'open' || dispute.status === 'in_progress');

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 transition-opacity bg-black/50 backdrop-blur-xs" onClick={onClose} />
      <div className="relative flex flex-col w-full h-full max-w-lg overflow-y-auto bg-white border-l border-gray-200 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 sticky top-0 bg-white/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center rounded-lg w-7 h-7 bg-rose-50 text-brand-red">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
            <div>
              <p className="text-xs font-bold leading-none text-gray-900">Dispute Case #{dispute?.id ?? '…'}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Order Resolution &amp; Claim Mediation</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 p-8">
            <div className="w-8 h-8 border-2 rounded-full border-brand-red border-t-transparent animate-spin" />
            <p className="text-xs text-gray-400">Loading dispute details…</p>
          </div>
        )}

        {!loading && dispute && (
          <div className="flex-1 px-5 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500">Current Status</span>
              <Badge label={dispute.status.replace(/_/g, ' ')} variant={dispute.status as never} />
            </div>

            {/* Buyer Info */}
            <div className="p-3 border border-gray-100 bg-gray-50/80 rounded-xl">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                <User className="w-3 h-3 text-gray-400" />
                Buyer Details
              </div>
              <p className="text-xs font-bold text-gray-900">
                {dispute.buyer ? `${dispute.buyer.first_name} ${dispute.buyer.last_name}` : '—'}
              </p>
              {dispute.buyer && <p className="text-[11px] text-gray-400 mt-0.5">{dispute.buyer.email}</p>}
            </div>

            {/* Order Info */}
            {dispute.order && (
              <div className="p-3 space-y-2 border border-gray-100 bg-gray-50/80 rounded-xl">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  <ShoppingBag className="w-3 h-3 text-gray-400" />
                  Order Overview
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-gray-400 block font-medium">Order Number</span>
                    <span className="font-mono font-bold text-gray-900">{dispute.order.order_number}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block font-medium">Total Paid</span>
                    <span className="font-bold text-brand-red">{formatPHP(dispute.order.total)}</span>
                  </div>
                </div>

                {dispute.order.items && dispute.order.items.length > 0 && (
                  <div className="pt-2 space-y-1 border-t border-gray-200/60">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">Claimed Items</span>
                    {dispute.order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-[11px] text-gray-600 bg-white p-2 rounded-lg border border-gray-100">
                        <span className="mr-2 font-medium truncate">{item.product_name} × {item.quantity}</span>
                        <span className="font-bold shrink-0">{formatPHP(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Reason */}
            <div className="p-3 space-y-1 border bg-rose-50/40 rounded-xl border-rose-100">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-700 uppercase tracking-wider">
                <AlertTriangle className="w-3 h-3 text-brand-red" />
                Buyer Stated Reason
              </div>
              <p className="text-xs leading-relaxed text-gray-800">{dispute.reason}</p>
            </div>

            {/* Existing Resolution Note */}
            {dispute.resolution_note && (
              <div className="p-3 space-y-1 border bg-emerald-50/40 rounded-xl border-emerald-100">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Admin Resolution Note
                </div>
                <p className="text-xs leading-relaxed text-gray-800">{dispute.resolution_note}</p>
                {dispute.resolver && (
                  <p className="text-[10px] text-gray-400 pt-1 border-t border-emerald-100/60">
                    Resolved by <span className="font-semibold text-gray-700">{dispute.resolver.first_name} {dispute.resolver.last_name}</span>
                    {dispute.resolved_at && ` on ${formatDate(dispute.resolved_at)}`}
                  </p>
                )}
              </div>
            )}

            {/* Resolution Form */}
            {canResolve && (
              <div className="border-t border-gray-100 pt-3 space-y-2.5">
                <p className="text-xs font-bold tracking-wider text-gray-900 uppercase">Submit Case Mediation</p>
                <div className="flex gap-2">
                  {(['resolved', 'closed'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setResolveStatus(s)}
                      className={[
                        'flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all',
                        resolveStatus === s
                          ? 'bg-brand-red text-white border-brand-red shadow-xs'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-brand-red',
                      ].join(' ')}
                    >
                      {s === 'resolved' ? 'Mark Resolved (Actioned)' : 'Close Dispute (Rejected)'}
                    </button>
                  ))}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Provide resolution details, refund agreement, or closing justification…"
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red bg-gray-50 focus:bg-white resize-none"
                />
                <Button
                  variant="primary"
                  loading={submitting}
                  disabled={!note.trim()}
                  onClick={handleResolve}
                  className="w-full text-xs font-bold py-2 bg-brand-red hover:bg-[#8e2424]"
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Finalize Decision
                </Button>
              </div>
            )}

            <div className="pt-2 text-[10px] text-gray-400 text-center">
              Case opened on {formatDate(dispute.created_at)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Admin Disputes Page ─────────────────────────────────────────────────

export default function AdminDisputesPage() {
  const [disputes, setDisputes]     = useState<AdminDispute[]>([]);
  const [stats, setStats]           = useState<AdminDisputeStats | null>(null);
  const [meta, setMeta]             = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading]       = useState(false);
  const [search, setSearch]         = useState('');
  const [status, setStatus]         = useState<DisputeStatus | ''>('');
  const [page, setPage]             = useState(1);
  const [selected, setSelected]     = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, statsRes] = await Promise.all([
        getAdminDisputesApi({
          status: status || undefined,
          search: search.trim() || undefined,
          page,
        }),
        getAdminDisputeStatsApi().catch(() => null),
      ]);
      setDisputes(res.data);
      setMeta(res.meta);
      if (statsRes) setStats(statsRes);
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => { load(); }, [load]);

  function handleUpdated(updated: AdminDispute) {
    setDisputes((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  const animatedOpen       = useCountUp(stats?.open ?? 0);
  const animatedInProgress = useCountUp(stats?.in_progress ?? 0);
  const animatedResolved   = useCountUp(stats?.resolved ?? 0);
  const totalCases         = (stats?.open ?? 0) + (stats?.in_progress ?? 0) + (stats?.resolved ?? 0);
  const animatedTotal      = useCountUp(totalCases);

  return (
    <div className="pb-8 space-y-4">
      {/* ── 1. Compact Executive Hero Command Bar ── */}
      <div
        className="rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm border border-neutral-800 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 border rounded-xl bg-white/10 text-rose-400 shrink-0 border-white/10">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-bold tracking-wider text-white uppercase sm:text-sm">Disputes &amp; Return Mediation</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Synced
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">Mediate customer return claims, inspect refund issues, and arbitrate buyer-seller disputes</p>
          </div>
        </div>

        <div className="flex items-center self-end gap-2 shrink-0 md:self-auto">
          <span className="text-[11px] font-semibold text-neutral-400 bg-neutral-800 px-3 py-1 rounded-xl border border-neutral-700/60">
            {stats?.open ?? 0} Cases Needing Attention
          </span>
        </div>
      </div>

      {/* ── 2. Compact 4-Card KPI Stat Row ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Open Disputes', value: animatedOpen, icon: AlertTriangle, color: 'text-rose-600', bg: 'bg-rose-50', isAlert: (stats?.open ?? 0) > 0 },
          { label: 'In Progress Mediation', value: animatedInProgress, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', isAlert: false },
          { label: 'Resolved Cases', value: animatedResolved, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', isAlert: false },
          { label: 'Total Tracked Claims', value: animatedTotal, icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-50', isAlert: false },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-7 h-7 rounded-lg ${stat.bg} ${stat.color} flex items-center justify-center font-bold shrink-0`}>
                <stat.icon className="w-3.5 h-3.5" />
              </div>
              {stat.isAlert && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-50 text-brand-red border border-rose-100 animate-pulse">
                  Action Required
                </span>
              )}
            </div>
            <div>
              <p className="text-xl font-black leading-none tracking-tight text-gray-900 sm:text-2xl">{stat.value}</p>
              <p className="mt-1 text-xs font-bold text-gray-800">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── 3. Main Disputes Data Container ── */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-4 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
          {/* Status Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => {
                  setStatus(o.value);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  status === o.value
                    ? 'bg-gray-900 text-white shadow-xs'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200/50'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by order #, reason..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red focus:ring-1 focus:ring-red-100 transition-all"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-gray-100 rounded-xl">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Case ID</th>
                <th className="px-4 py-3">Order Number</th>
                <th className="px-4 py-3">Buyer Name</th>
                <th className="px-4 py-3">Dispute Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date Opened</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5"><div className="w-10 h-4 bg-gray-200 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="w-24 h-4 bg-gray-200 rounded font-mono" /></td>
                    <td className="px-4 py-3.5">
                      <div className="w-28 h-3.5 bg-gray-200 rounded mb-1" />
                      <div className="w-36 h-2.5 bg-gray-100 rounded" />
                    </td>
                    <td className="px-4 py-3.5"><div className="w-40 h-4 bg-gray-100 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="w-16 h-4 bg-gray-200 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="w-20 h-4 bg-gray-100 rounded" /></td>
                    <td className="px-4 py-3.5 text-right"><div className="w-16 h-6 bg-gray-100 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : disputes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    No disputes found matching current filter.
                  </td>
                </tr>
              ) : (
                disputes.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => setSelected(d.id)}
                    className="transition-colors cursor-pointer hover:bg-gray-50/80 group"
                  >
                    <td className="px-4 py-3.5 font-mono font-bold text-gray-900">#{d.id}</td>
                    <td className="px-4 py-3.5 font-mono font-bold text-gray-900">
                      {d.order?.order_number ?? '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-gray-900">
                        {d.buyer ? `${d.buyer.first_name} ${d.buyer.last_name}` : '—'}
                      </p>
                      {d.buyer && <p className="text-[10px] text-gray-400">{d.buyer.email}</p>}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 max-w-[200px] truncate" title={d.reason}>
                      {d.reason}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge label={d.status.replace(/_/g, ' ')} variant={d.status as never} />
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">
                      {formatDate(d.created_at)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(d.id);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gray-100 hover:bg-brand-red hover:text-white transition-all text-gray-700"
                      >
                        <Eye className="w-3 h-3" /> Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.last_page > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-gray-400">
              Page {meta.current_page} of {meta.last_page} ({meta.total} total)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <button
                disabled={page >= meta.last_page}
                onClick={() => setPage((p) => Math.min(meta.last_page, p + 1))}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-over Detail Drawer */}
      {selected !== null && (
        <DisputeDetailDrawer
          disputeId={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
