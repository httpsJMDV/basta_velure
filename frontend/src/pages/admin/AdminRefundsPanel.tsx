import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Receipt, ChevronLeft, ChevronRight } from 'lucide-react';
import { getAdminRefundsApi, refundReceiptUrlApi, resolveRefundApi } from '../../api/commerce';
import type { RefundRow, RefundStatus } from '../../api/commerce';
import { ListCard, ListEmpty, ListError, Pill, SkeletonCards, StatusTabs, type PillTone } from '../../components/admin/listKit';
import { ReasonDialog } from '../../components/ui/Overlay';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage, apiProblem } from '../../utils/apiError';
import { peso } from '../../utils/adminReports';

type View = 'attention' | 'open' | 'done';

const STATUS: Record<RefundStatus, { label: string; tone: PillTone }> = {
  awaiting_account: { label: 'Waiting for the buyer\'s GCash', tone: 'gray' },
  awaiting_shop: { label: 'The shop has to send it', tone: 'amber' },
  sent: { label: 'Sent, buyer to confirm', tone: 'amber' },
  not_received: { label: 'Buyer says not received', tone: 'red' },
  received: { label: 'Received', tone: 'emerald' },
};

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) : '—');

/**
 * Refunds shops send by hand (docs/api/refunds.md). "Needs you" holds the ones the buyer reported as not received
 * and the ones the shop is late with. A reported one is decided: it counts as received, or the shop sends it again.
 */
export default function AdminRefundsPanel() {
  const { showToast } = useToast();
  const [view, setView] = useState<View>('attention');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<RefundRow[] | null>(null);
  const [meta, setMeta] = useState<{ last_page: number; total: number; attention: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [deciding, setDeciding] = useState<{ row: RefundRow; decision: 'received' | 'send_again' } | null>(null);
  const [saving, setSaving] = useState(false);
  const [decideError, setDecideError] = useState<string | undefined>();

  const load = useCallback(() => {
    setFailed(false);
    getAdminRefundsApi(view, page)
      .then((res) => { setRows(res.data); setMeta(res.meta); })
      .catch(() => setFailed(true));
  }, [view, page]);

  useEffect(() => { load(); }, [load]);

  const decide = async (note: string) => {
    if (!deciding) return;
    setSaving(true);
    setDecideError(undefined);
    try {
      await resolveRefundApi(deciding.row.id, deciding.decision, note);
      showToast(deciding.decision === 'received' ? 'Closed as received.' : 'The shop was asked to send it again.');
      setDeciding(null);
      load();
    } catch (e) {
      const p = apiProblem(e, 'The decision was not saved.');
      setDecideError(p.fields.note ?? p.message);
    } finally { setSaving(false); }
  };

  const openReceipt = async (id: number) => {
    try {
      const url = await refundReceiptUrlApi(id);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      showToast(apiErrorMessage(e, 'The receipt could not be opened.'), 'error');
    }
  };

  return (
    <div className="space-y-3">
      <StatusTabs<View> label="Refunds" value={view} onChange={(v) => { setView(v); setPage(1); setRows(null); }} options={[
        { value: 'attention', label: 'Needs you', count: meta?.attention },
        { value: 'open', label: 'All open' },
        { value: 'done', label: 'Done' },
      ]} />

      <ListCard title="Refunds shops send by GCash" count={meta?.total}>
        {failed ? <div className="p-3"><ListError message="The refunds could not be loaded." onRetry={load} /></div>
          : rows === null ? <div className="p-3"><SkeletonCards count={3} /></div>
            : rows.length === 0 ? (
              <ListEmpty icon={Wallet} title={view === 'attention' ? 'Nothing needs you' : 'No refunds here'}
                hint="When a GCash or cash-on-delivery order is refunded, the shop sends the money and the buyer confirms it. Problems show here." />
            ) : (
              <ul className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <li key={r.id} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-gray-900">
                          {peso(r.amount)} · {r.shop?.shop_name ?? 'Shop'} → {r.buyer?.name ?? 'Buyer'}
                        </p>
                        <p className="text-[12px] text-gray-500">
                          {r.order && <Link to={`/admin/orders?search=${encodeURIComponent(r.order.order_number)}`} className="font-mono hover:text-brand-red">{r.order.order_number}</Link>}
                          {r.cause === 'return' ? ' · approved return' : ' · cancelled order'}
                          {r.gcash_number ? ` · to ${r.gcash_number} (${r.gcash_name})` : ''}
                        </p>
                      </div>
                      <Pill tone={r.overdue ? 'red' : STATUS[r.status].tone}>{r.overdue ? 'The shop is late' : STATUS[r.status].label}</Pill>
                    </div>
                    <div className="mt-1.5 text-[12px] text-gray-700 space-y-0.5">
                      {r.status === 'awaiting_shop' && <p>Send by {when(r.send_by)}{r.times_sent_before ? ` · sent ${r.times_sent_before} time(s) before` : ''}.</p>}
                      {r.sent_at && <p>Sent {when(r.sent_at)}, reference <span className="font-mono">{r.reference}</span>.</p>}
                      {r.status === 'not_received' && <p className="text-red-800"><span className="font-semibold">The buyer says:</span> {r.report_note}</p>}
                      {r.resolution_note && <p className="text-gray-500">Last decision: {r.resolution_note}</p>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.has_receipt && (
                        <button type="button" onClick={() => void openReceipt(r.id)} className="h-8 px-3 rounded-full border border-gray-300 text-[12px] font-semibold inline-flex items-center gap-1.5 hover:border-gray-900">
                          <Receipt className="w-3.5 h-3.5" /> Receipt
                        </button>
                      )}
                      {r.can_decide && (r.status === 'not_received' || r.status === 'sent') && (
                        <button type="button" onClick={() => setDeciding({ row: r, decision: 'received' })} className="h-8 px-3 rounded-full bg-gray-900 text-white text-[12px] font-semibold">Counts as received</button>
                      )}
                      {r.status === 'not_received' && (
                        <button type="button" onClick={() => setDeciding({ row: r, decision: 'send_again' })} className="h-8 px-3 rounded-full bg-brand-red text-white text-[12px] font-semibold">Shop sends it again</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
        {meta && meta.last_page > 1 && (
          <div className="flex items-center justify-end gap-1 px-3 py-2 border-t border-gray-100">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page" className="flex items-center justify-center w-8 h-8 text-gray-500 border border-gray-200 rounded-lg disabled:opacity-40"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <span className="px-1 text-[12px] text-gray-600 tabular-nums">{page} / {meta.last_page}</span>
            <button type="button" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)} aria-label="Next page" className="flex items-center justify-center w-8 h-8 text-gray-500 border border-gray-200 rounded-lg disabled:opacity-40"><ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </ListCard>

      <ReasonDialog open={!!deciding} onClose={() => !saving && setDeciding(null)} onConfirm={decide} busy={saving} error={decideError} max={1000}
        title={deciding?.decision === 'send_again' ? 'Ask the shop to send it again' : 'Close the refund as received'}
        confirmLabel={deciding?.decision === 'send_again' ? 'Ask to send again' : 'Close as received'} tone={deciding?.decision === 'send_again' ? 'primary' : 'dark'}
        label="Why (both sides see this)"
        intro={deciding?.decision === 'send_again'
          ? 'The earlier transfer stays in the history. The shop gets 3 more days to send it and record a new receipt.'
          : 'Use this when the receipt shows the money reached the buyer\'s number. The order shows the refund as done.'} />
    </div>
  );
}
