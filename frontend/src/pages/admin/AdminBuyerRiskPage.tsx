import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, CheckCheck, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, ShieldAlert, ShieldCheck, Sparkles, X } from 'lucide-react';
import { analyzeBuyerRiskApi, cancelRiskOrderApi, getBuyerRiskApi, getBuyerRiskDetailApi } from '../../api/buyerRisk';
import type { RiskAnalysis, RiskDetail, RiskList, RiskOrder } from '../../api/buyerRisk';
import { HERO_BUTTON, HEADER_BUTTON, HEADER_BUTTON_PRIMARY, PageHero, StatCard } from '../../components/admin/dashboardKit';
import { getStatusLabel } from '../../utils/orderStatus';
import CustomSelect from '../../components/ui/CustomSelect';

const tone = { high: 'bg-rose-50 text-rose-700 border-rose-200', medium: 'bg-amber-50 text-amber-800 border-amber-200', low: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
const money = (n: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);
const date = (s: string) => new Date(s).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function errorText(error: unknown) {
  return isAxiosError(error) && typeof error.response?.data?.message === 'string'
    ? error.response.data.message : 'Could not reach Loved-IT. Please try again.';
}

export default function AdminBuyerRiskPage() {
  const [list, setList] = useState<RiskList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('flagged');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<RiskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [cancelOrder, setCancelOrder] = useState<RiskOrder | null>(null);
  const [notice, setNotice] = useState('');
  const aiRun = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    getBuyerRiskApi({ page, search: query, level }, controller.signal).then(result => {
      setList(result);
      setSelected(current => result.data.some(b => b.id === current) ? current : result.data[0]?.id ?? null);
    }).catch(e => { if (!controller.signal.aborted) setError(errorText(e)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, query, level, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    aiRun.current += 1;
    setDetail(null); setAnalysis(null); setAiError(''); setAnalyzing(false); setDetailError('');
    if (selected === null) { setDetailLoading(false); return () => controller.abort(); }
    setDetailLoading(true);
    getBuyerRiskDetailApi(selected, controller.signal).then(setDetail)
      .catch(e => { if (!controller.signal.aborted) setDetailError(errorText(e)); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => { controller.abort(); aiRun.current += 1; };
  }, [selected, refresh]);

  async function analyze() {
    if (!detail) return;
    const run = ++aiRun.current;
    setAnalyzing(true); setAiError('');
    try { const result = await analyzeBuyerRiskApi(detail.id); if (aiRun.current === run) setAnalysis(result); }
    catch (e) { if (aiRun.current === run) setAiError(errorText(e)); }
    finally { if (aiRun.current === run) setAnalyzing(false); }
  }

  return <div className="space-y-5">
    <PageHero icon={ShieldCheck} eyebrow="Loved-IT / Trust & Safety" title="Buyer risk review" subtitle="Understand unusual activity. Review the evidence. Make a considered decision.">
      <button className={HERO_BUTTON} onClick={() => setRefresh(v => v + 1)} disabled={loading || analyzing}><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh evidence</button>
    </PageHero>

    <div className="grid sm:grid-cols-3 gap-3">
      <StatCard icon={Activity} label="Active buyers reviewed" value={list?.meta.summary.buyers} subtext="Buyers with orders in the last 30 days" iconBg="bg-gray-100" iconColor="text-gray-700" />
      <StatCard icon={ShieldAlert} label="Need a closer look" value={list?.meta.summary.flagged} subtext="Patterns to verify with the buyer" iconBg="bg-amber-50" iconColor="text-amber-600" />
      <StatCard icon={ShieldCheck} label="High priority" value={list?.meta.summary.high} subtext="Prioritize evidence review" iconBg="bg-rose-50" iconColor="text-brand-red" />
    </div>

    <div className="rounded-2xl border border-stone-200 bg-white p-4 flex gap-3 items-start text-xs text-stone-600 leading-relaxed">
      <ShieldCheck className="w-5 h-5 text-brand-red shrink-0" />
      <div><p className="font-semibold text-stone-900">Signals guide review; they do not prove abuse.</p>
        <p>Scores use recorded order activity over 30 days and checkout activity in the last hour. AI helps explain the evidence. An admin decides every cancellation.</p></div>
    </div>
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 p-3 text-sm flex justify-between gap-3">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}><X className="w-4 h-4" /></button></div>}

    <div className="grid xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.65fr)] gap-5 items-start">
      <section aria-label="Buyer review queue" className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-gray-100 space-y-3">
          <div className="flex justify-between items-center"><h2 className="font-bold text-gray-900 text-sm">Review queue</h2><span className="text-xs text-gray-500">{list?.meta.total ?? '—'} {list?.meta.total === 1 ? 'buyer' : 'buyers'}</span></div>
          <label className="flex gap-2 items-center rounded-xl bg-gray-50 border border-gray-200 px-3 py-2.5"><Search className="w-4 h-4 text-gray-400" /><input aria-label="Search buyer name or email" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email" className="w-full min-w-0 text-xs bg-transparent outline-none" /></label>
          <CustomSelect label="Priority" value={level} onChange={value => { setLevel(value); setPage(1); }} options={[
            { value: 'flagged', label: 'Needs review' },
            { value: 'high', label: 'High priority' },
            { value: 'medium', label: 'Medium priority' },
            { value: 'low', label: 'Low priority' },
            { value: 'all', label: 'All active buyers' },
          ]} />
        </div>
        {error ? <div role="alert" className="p-5 text-sm text-rose-700">{error}<button className={`${HEADER_BUTTON} mt-3`} onClick={() => setRefresh(v => v + 1)}>Try again</button></div>
          : loading ? <div role="status" className="p-8 text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking activity…</div>
          : !list?.data.length ? <div className="p-9 text-center"><CheckCheck className="w-9 h-9 text-emerald-600 mx-auto mb-3" /><p className="font-semibold text-gray-900 text-sm">No matching buyers</p><p className="text-xs text-gray-500 mt-1">Try another priority or search.</p></div>
          : <div className="divide-y divide-gray-100">{list.data.map(buyer => <button key={buyer.id} onClick={() => setSelected(buyer.id)} aria-pressed={selected === buyer.id} className={`w-full p-4 text-left transition-colors border-l-[3px] focus-visible:outline-brand-red ${selected === buyer.id ? 'bg-rose-50/50 border-brand-red' : 'border-transparent hover:bg-gray-50'}`}>
            <div className="flex items-center gap-3"><div className="h-10 w-10 shrink-0 rounded-xl bg-stone-100 flex items-center justify-center text-stone-600 font-bold text-sm">{buyer.name.slice(0, 1)}</div>
              <div className="min-w-0 flex-1"><p className="text-sm font-bold text-gray-900 truncate">{buyer.name}</p><p className="text-[11px] text-gray-500 truncate">{buyer.email}</p></div>
              <span className={`rounded-lg border px-2 py-1 text-[10px] uppercase font-bold ${tone[buyer.level]}`}>{buyer.level}</span></div>
            <div className="flex justify-between gap-2 mt-3 text-xs"><span className="text-gray-500">{buyer.signals.length} signals · {buyer.order_count} orders</span><span className="font-bold text-gray-800">{buyer.score}<span className="font-normal text-gray-400"> / 100</span></span></div>
          </button>)}</div>}
        {list && list.meta.last_page > 1 && <div className="p-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
          <button aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(v => v - 1)} className="p-2 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
          <span>Page {page} of {list.meta.last_page}</span>
          <button aria-label="Next page" disabled={page >= list.meta.last_page || loading} onClick={() => setPage(v => v + 1)} className="p-2 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
        </div>}
        {list && <p className="px-4 py-3 text-[10px] text-gray-400 border-t border-gray-100">Checked {date(list.meta.checked_at)} · Manila time</p>}
      </section>

      <section aria-label="Buyer evidence" className="space-y-4 min-w-0">
        {detailError ? <div role="alert" className="p-6 bg-white border rounded-2xl text-sm text-rose-700">{detailError}<button className={`${HEADER_BUTTON} ml-3`} onClick={() => setRefresh(v => v + 1)}>Try again</button></div>
          : detailLoading ? <div role="status" className="bg-white border rounded-2xl p-10 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading buyer evidence…</div>
          : detail ? <>
            <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Buyer profile / #{detail.id}</p><h2 className="text-xl font-bold text-gray-900 mt-1">{detail.name}</h2><p className="text-xs text-gray-500 mt-1 break-all">{detail.email}</p></div><span className={`border px-3 py-1.5 rounded-full text-xs font-semibold ${tone[detail.level]}`}>{detail.level} priority · {detail.score}/100</span></div>
              <div className="mt-5 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-brand-red" style={{ width: `${detail.score}%` }} /></div>
              <p className="text-[11px] text-gray-400 mt-2">Review priority score, based on recorded patterns. This is not a probability of fraud.</p>
              <div className="mt-5 space-y-3">{detail.signals.length ? detail.signals.map(signal => <div key={signal.code} className="flex gap-3 rounded-xl bg-stone-50 border border-stone-100 p-3.5"><ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" /><div><h3 className="text-xs font-bold text-gray-900">{signal.label}</h3><p className="text-xs text-gray-500 leading-relaxed mt-1">{signal.detail}</p></div></div>) : <p className="text-sm text-emerald-700">No review signals in this window.</p>}</div>
            </div>

            <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-white to-rose-50/50 p-5 sm:p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-brand-red" /><h2 className="text-sm font-bold text-gray-900">AI review assistant</h2></div><button className={HEADER_BUTTON_PRIMARY} onClick={analyze} disabled={analyzing || loading}>{analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}{analyzing ? 'Reviewing evidence…' : analysis ? 'Review again' : 'Explain these signals'}</button></div>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed">Get a second look at the recorded patterns before deciding what to do.</p>
              {aiError && <p role="alert" className="mt-4 text-xs text-rose-700">{aiError}</p>}
              {analysis ? <div className="mt-4 space-y-3" aria-live="polite"><p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{analysis.summary}</p><h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Suggested checks</h3><ul className="space-y-2">{analysis.checks.map((check, i) => <li key={i} className="flex gap-2 text-xs text-gray-600 leading-relaxed"><CheckCheck className="w-4 h-4 shrink-0 text-brand-red" />{check}</li>)}</ul><p className="text-[10px] text-gray-400">AI generated · {date(analysis.generated_at)} · Verify against the evidence.</p></div>
                : !analyzing && <div className="mt-4 border border-dashed border-rose-200 rounded-xl p-4 text-xs text-gray-500 leading-relaxed">The assistant will summarize these signals and suggest checks. You can review orders below at any time.</div>}
            </div>

            <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100"><h2 className="text-sm font-bold text-gray-900">Recent transactions</h2><p className="text-xs text-gray-500 mt-1">Latest 50 orders · Cancellations here are available before courier pickup.</p></div>
              <div className="divide-y divide-gray-100">{detail.orders.map(order => <div key={order.id} className="p-4 sm:px-5 flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-xs font-bold text-gray-900">{order.order_number}</p><p className="text-[11px] text-gray-500 mt-1">{date(order.created_at)} · {getStatusLabel(order.status)}</p><p className="text-[11px] text-gray-400 mt-1">{order.payment_method.replaceAll('_', ' ')} · {order.payment_status}</p></div>
                <div className="flex items-center gap-3"><span className="text-sm font-bold text-gray-900">{money(order.total)}</span>{order.can_cancel && <button className="text-xs font-semibold text-brand-red px-3 min-h-10 rounded-lg border border-rose-200 hover:bg-rose-50 disabled:opacity-40" disabled={loading} onClick={() => setCancelOrder(order)}>Review cancellation</button>}</div>
              </div>)}</div>
              <Link className="p-4 border-t border-gray-100 text-xs font-semibold text-brand-red flex items-center justify-center gap-2 hover:bg-gray-50" to={`/admin/orders?search=${encodeURIComponent(detail.email)}`}>Open full order history <ArrowRight className="w-3.5 h-3.5" /></Link>
            </div>
          </> : <div className="rounded-2xl bg-white border border-gray-200 p-12 text-center"><ShieldCheck className="w-10 h-10 text-stone-300 mx-auto" /><h2 className="font-bold text-gray-800 mt-4">Select a buyer to review</h2><p className="text-sm text-gray-500 mt-2">Their signals, AI review and recent transactions will appear here.</p></div>}
      </section>
    </div>
    {cancelOrder && detail && <CancelDialog buyer={detail} order={cancelOrder} onClose={() => setCancelOrder(null)} onDone={() => { setCancelOrder(null); setNotice('Order cancelled. The decision has been recorded in the activity log.'); setRefresh(v => v + 1); }} />}
  </div>;
}

function CancelDialog({ buyer, order, onClose, onDone }: { buyer: RiskDetail; order: RiskOrder; onClose: () => void; onDone: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || !confirmed || reason.trim().length < 10) return;
    setBusy(true); setError('');
    try { await cancelRiskOrderApi(buyer.id, order.id, reason.trim()); onDone(); }
    catch (e) { setError(errorText(e)); setBusy(false); }
  }
  return <dialog ref={dialog} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} aria-labelledby="cancel-risk-title" className="w-[calc(100%-2rem)] max-w-lg rounded-2xl p-0 shadow-2xl backdrop:bg-black/50">
    <form onSubmit={submit} className="p-6 space-y-4"><div className="flex justify-between gap-3"><h2 id="cancel-risk-title" className="font-bold text-lg text-gray-900">Review cancellation</h2><button type="button" aria-label="Close cancellation review" disabled={busy} onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button></div>
      <p className="text-sm text-gray-600 leading-relaxed">Cancel <strong>{order.order_number}</strong> for {buyer.name}, totaling <strong>{money(order.total)}</strong>? This restores stock and eligible vouchers and follows the existing refund process. The reason is recorded with the order.</p>
      <label className="block text-xs font-bold text-gray-700">Reason for your decision<textarea autoFocus required minLength={10} maxLength={500} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} className="block mt-2 w-full border border-gray-200 rounded-xl p-3 text-sm min-h-28 font-normal focus:outline-brand-red" placeholder="Describe the evidence you verified and why cancellation is appropriate." /></label>
      <label className="flex gap-2 text-xs text-gray-600 leading-relaxed"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 accent-red-700" />I reviewed the evidence and take responsibility for this cancellation.</label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className={HEADER_BUTTON} disabled={busy} onClick={onClose}>Keep order</button><button type="submit" className={HEADER_BUTTON_PRIMARY} disabled={busy || !confirmed || reason.trim().length < 10}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{busy ? 'Cancelling…' : 'Confirm cancellation'}</button></div>
    </form>
  </dialog>;
}
