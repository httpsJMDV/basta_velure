import { useEffect, useState, useCallback } from 'react';
import { getAdminDisputesApi, getAdminDisputeApi, resolveDisputeApi } from '../../api/client';
import type { AdminDispute, DisputeStatus } from '../../types';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';

const STATUS_OPTIONS: { label: string; value: DisputeStatus | '' }[] = [
  { label: 'All', value: '' },
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

// ─── Detail drawer ────────────────────────────────────────────────────────────

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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full flex flex-col shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <p className="text-[14px] font-bold text-brand-black">Dispute #{dispute?.id ?? '…'}</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-400">Loading…</p>
          </div>
        )}

        {!loading && dispute && (
          <div className="flex-1 px-5 py-4 space-y-5">
            <Badge label={dispute.status.replace(/_/g, ' ')} variant={dispute.status as never} />

            {/* Buyer */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Buyer</p>
              <p className="text-[13px] text-brand-black">
                {dispute.buyer
                  ? `${dispute.buyer.first_name} ${dispute.buyer.last_name}`
                  : '—'}
                {dispute.buyer && <span className="text-gray-400 ml-1">· {dispute.buyer.email}</span>}
              </p>
            </div>

            {/* Order */}
            {dispute.order && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Order</p>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-gray-500">Order #</span>
                    <span className="font-mono font-semibold text-brand-black">{dispute.order.order_number}</span>
                  </div>
                  <div className="flex justify-between text-[12px]">
                    <span className="text-gray-500">Total</span>
                    <span className="font-semibold text-brand-black">{formatPHP(dispute.order.total)}</span>
                  </div>
                  <div className="flex justify-between text-[12px]">
                    <span className="text-gray-500">Order status</span>
                    <Badge label={dispute.order.status.replace(/_/g, ' ')} variant={dispute.order.status as never} />
                  </div>
                </div>
                {dispute.order.items && dispute.order.items.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {dispute.order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-[12px] text-gray-500">
                        <span>{item.product_name} × {item.quantity}</span>
                        <span>{formatPHP(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Reason */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Reason</p>
              <p className="text-[13px] text-brand-black">{dispute.reason}</p>
            </div>

            {/* Resolution */}
            {dispute.resolution_note && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Resolution</p>
                <p className="text-[13px] text-brand-black">{dispute.resolution_note}</p>
                {dispute.resolver && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    by {dispute.resolver.first_name} {dispute.resolver.last_name}
                    {dispute.resolved_at && ` · ${formatDate(dispute.resolved_at)}`}
                  </p>
                )}
              </div>
            )}

            {/* Resolve form */}
            {canResolve && (
              <div className="border-t border-gray-100 pt-4 space-y-3">
                <p className="text-[12px] font-bold text-brand-black">Resolve Dispute</p>
                <div className="flex gap-2">
                  {(['resolved', 'closed'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setResolveStatus(s)}
                      className={[
                        'flex-1 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors',
                        resolveStatus === s
                          ? 'bg-brand-red text-white border-brand-red'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-brand-red',
                      ].join(' ')}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Resolution note…"
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-red resize-none"
                />
                <Button
                  variant="primary"
                  loading={submitting}
                  disabled={!note.trim()}
                  onClick={handleResolve}
                  className="w-full"
                >
                  Submit Resolution
                </Button>
              </div>
            )}

            <p className="text-[11px] text-gray-400">Opened {formatDate(dispute.created_at)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDisputesPage() {
  const [disputes, setDisputes]   = useState<AdminDispute[]>([]);
  const [meta, setMeta]           = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState<DisputeStatus | ''>('');
  const [page, setPage]           = useState(1);
  const [selected, setSelected]   = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminDisputesApi({
        status: status || undefined,
        search: search || undefined,
        page,
      });
      setDisputes(res.data);
      setMeta(res.meta);
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => { load(); }, [load]);

  function handleUpdated(updated: AdminDispute) {
    setDisputes((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-brand-black">Disputes</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Order #…"
            className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red bg-white"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as DisputeStatus | ''); setPage(1); }}
          className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-red"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">#</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Order</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Buyer</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Reason</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Opened</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px] text-gray-400">Loading…</td></tr>
              )}
              {!loading && disputes.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px] text-gray-400">No disputes found.</td></tr>
              )}
              {!loading && disputes.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setSelected(d.id)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-gray-400 font-mono">#{d.id}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-brand-black">
                    {d.order?.order_number ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {d.buyer ? `${d.buyer.first_name} ${d.buyer.last_name}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">{d.reason}</td>
                  <td className="px-4 py-3">
                    <Badge label={d.status.replace(/_/g, ' ')} variant={d.status as never} />
                  </td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {meta.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-[12px] text-gray-400">{meta.total} disputes</p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
              </button>
              <span className="text-[12px] text-gray-500">{page} / {meta.last_page}</span>
              <button
                disabled={page >= meta.last_page}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
          </div>
        )}
      </div>

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
