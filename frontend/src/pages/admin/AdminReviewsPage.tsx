import { useEffect, useState, useCallback } from 'react';
import { getAdminReviewsApi, moderateReviewApi } from '../../api/client';
import type { AdminReview, ModerationStatus } from '../../types';
import Badge from '../../components/ui/Badge';
import { Search, ChevronLeft, ChevronRight, Star } from 'lucide-react';

const STATUS_OPTIONS: { label: string; value: ModerationStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Pending Review', value: 'pending_review' },
  { label: 'Visible', value: 'visible' },
  { label: 'Hidden', value: 'hidden' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${i < rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`}
        />
      ))}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminReviewsPage() {
  const [reviews, setReviews]     = useState<AdminReview[]>([]);
  const [meta, setMeta]           = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState<ModerationStatus | ''>('pending_review');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page, setPage]           = useState(1);
  const [actioning, setActioning] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminReviewsApi({
        moderation_status: status || undefined,
        flagged: flaggedOnly || undefined,
        search: search || undefined,
        page,
      });
      setReviews(res.data);
      setMeta(res.meta);
    } finally {
      setLoading(false);
    }
  }, [status, flaggedOnly, search, page]);

  useEffect(() => { load(); }, [load]);

  async function handleModerate(id: number, newStatus: ModerationStatus) {
    setActioning(id);
    try {
      const updated = await moderateReviewApi(id, newStatus);
      setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } finally {
      setActioning(null);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-brand-black">Reviews</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buyer name or email…"
            className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red bg-white"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as ModerationStatus | ''); setPage(1); }}
          className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-red"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-[13px] text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(e) => { setFlaggedOnly(e.target.checked); setPage(1); }}
            className="accent-brand-red"
          />
          Flagged only
        </label>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Buyer</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Rating</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Comment</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Flag</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-gray-400">Loading…</td></tr>
              )}
              {!loading && reviews.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-gray-400">No reviews found.</td></tr>
              )}
              {!loading && reviews.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600">
                    {r.buyer ? `${r.buyer.first_name} ${r.buyer.last_name}` : '—'}
                  </td>
                  <td className="px-4 py-3"><StarRating rating={r.rating} /></td>
                  <td className="px-4 py-3 text-gray-600 max-w-[220px] truncate">
                    {r.comment ?? <span className="text-gray-300 italic">no comment</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={r.moderation_status.replace(/_/g, ' ')} variant={r.moderation_status as never} />
                  </td>
                  <td className="px-4 py-3">
                    {r.flagged ? (
                      <span className="text-[10px] font-bold text-brand-red bg-red-50 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                        Flagged
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {r.moderation_status !== 'visible' && (
                        <button
                          disabled={actioning === r.id}
                          onClick={() => handleModerate(r.id, 'visible')}
                          className="text-[11px] font-semibold text-emerald-600 hover:underline disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {r.moderation_status !== 'hidden' && (
                        <button
                          disabled={actioning === r.id}
                          onClick={() => handleModerate(r.id, 'hidden')}
                          className="text-[11px] font-semibold text-brand-red hover:underline disabled:opacity-50"
                        >
                          Hide
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {meta.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-[12px] text-gray-400">{meta.total} reviews</p>
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
    </div>
  );
}
