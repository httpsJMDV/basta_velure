import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAdminDisputesApi, getAdminDisputeApi, resolveDisputeApi, getAdminDisputeStatsApi } from '../../api/client';
import type { AdminDispute, DisputeStatus, AdminDisputeStats } from '../../types';
import { PageHero } from '../../components/admin/dashboardKit';
import { SearchField, ListError, Pill, type PillTone, relativeTime } from '../../components/admin/listKit';
import { ShieldAlert, ChevronLeft, ChevronRight, Package, ExternalLink, Loader2, Inbox, Scale } from 'lucide-react';
import { getStatusLabel } from '../../utils/orderStatus';
import { peso, whole } from '../../utils/adminReports';

type PageMeta = { current_page: number; last_page: number; total: number };

const STATUS: Record<DisputeStatus, { label: string; tone: PillTone }> = {
  open: { label: 'Open', tone: 'red' },
  in_progress: { label: 'In progress', tone: 'amber' },
  resolved: { label: 'Resolved', tone: 'emerald' },
  closed: { label: 'Closed', tone: 'gray' },
};

/** Days a case has been open; an open case older than three days is overdue. */
function ageDays(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function day(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }) : '—';
}

function buyerName(d: AdminDispute) {
  return d.buyer ? `${d.buyer.first_name} ${d.buyer.last_name}`.trim() : 'Unknown buyer';
}

function isActive(status: DisputeStatus) {
  return status === 'open' || status === 'in_progress';
}

// ─── The case file ────────────────────────────────────────────────────────────

function CaseFile({ disputeId, onUpdated, onBack }: { disputeId: number; onUpdated: (d: AdminDispute) => void; onBack: () => void }) {
  const [result, setResult] = useState<{ id: number; dispute: AdminDispute | null } | null>(null);
  const [decision, setDecision] = useState<'resolved' | 'closed'>('resolved');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dispute = result?.id === disputeId ? result.dispute : null;
  const loading = result?.id !== disputeId;

  useEffect(() => {
    let alive = true;
    getAdminDisputeApi(disputeId)
      .then((d) => { if (alive) setResult({ id: disputeId, dispute: d }); })
      .catch(() => { if (alive) setResult({ id: disputeId, dispute: null }); });
    return () => { alive = false; };
  }, [disputeId]);

  async function decide() {
    if (!dispute || !note.trim()) return;
    setSaving(true);
    setError('');
    try {
      const updated = await resolveDisputeApi(dispute.id, decision, note.trim());
      setResult({ id: disputeId, dispute: updated });
      setNote('');
      onUpdated(updated);
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'The decision was not saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center flex-1 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!dispute) return <div className="flex items-center justify-center flex-1 text-[13px] text-gray-500">This case could not be loaded.</div>;

  const age = ageDays(dispute.created_at);
  const overdue = isActive(dispute.status) && age > 3;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <header className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 sm:px-6">
        <button type="button" onClick={onBack} className="flex items-center justify-center w-8 h-8 -ml-1 text-gray-500 rounded-lg lg:hidden hover:bg-gray-100" aria-label="Back to the cases">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-gray-400">Case #{dispute.id} · opened {day(dispute.created_at)}</p>
          <h2 className="text-[16px] font-bold text-gray-900 truncate">{buyerName(dispute)} <span className="font-normal text-gray-400">against</span> order <span className="font-mono">{dispute.order?.order_number ?? '—'}</span></h2>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Pill tone={STATUS[dispute.status].tone}>{STATUS[dispute.status].label}</Pill>
          {isActive(dispute.status) && <span className={`text-[11px] ${overdue ? 'font-semibold text-red-700' : 'text-gray-400'}`}>{age === 0 ? 'Opened today' : `${age} day${age === 1 ? '' : 's'} open`}</span>}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* The buyer's claim, in their words */}
        <section className="px-5 py-5 border-b border-gray-100 sm:px-6">
          <p className="text-[11px] font-semibold text-gray-400 mb-2">What the buyer says</p>
          <blockquote className="pl-4 border-l-[3px] border-brand-red text-[14px] leading-relaxed text-gray-800 whitespace-pre-line">{dispute.reason}</blockquote>
          {dispute.buyer?.email && <p className="mt-3 text-[12px] text-gray-500">{buyerName(dispute)} · <a href={`mailto:${dispute.buyer.email}`} className="hover:underline">{dispute.buyer.email}</a></p>}
        </section>

        {/* The order in question */}
        {dispute.order && (
          <section className="px-5 py-5 border-b border-gray-100 sm:px-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-[11px] font-semibold text-gray-400">The order · {getStatusLabel(dispute.order.status).toLowerCase()}</p>
              <Link to={`/admin/orders?search=${encodeURIComponent(dispute.order.order_number)}`} className="inline-flex items-center gap-1 text-[12px] font-bold text-brand-red hover:underline">
                Open order <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            <ul className="space-y-3">
              {(dispute.order.items ?? []).map((item, i) => (
                <li key={item.id ?? i} className="flex items-center gap-3">
                  <span className="w-12 h-12 overflow-hidden bg-gray-100 rounded-lg shrink-0">
                    {item.image_url ? <img src={item.image_url} alt="" className="object-cover w-full h-full" /> : <span className="flex items-center justify-center w-full h-full text-gray-300"><Package className="w-4 h-4" /></span>}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-gray-900 truncate">{item.product_name}</span>
                    <span className="block text-[12px] text-gray-500">{[item.variant_label, `qty ${item.quantity}`].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="text-[13px] font-semibold text-gray-900 tabular-nums">{peso(item.subtotal)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between pt-3 mt-3 text-[14px] font-bold border-t border-dashed border-gray-200">
              <span>Order total</span><span className="tabular-nums">{peso(dispute.order.total)}</span>
            </div>
          </section>
        )}

        {/* The decision: recorded, or still to make */}
        <section className="px-5 py-5 sm:px-6">
          {dispute.resolution_note ? (
            <>
              <p className="text-[11px] font-semibold text-gray-400 mb-2">Decision</p>
              <div className={`rounded-xl px-4 py-3 ${dispute.status === 'resolved' ? 'bg-emerald-50' : 'bg-gray-100'}`}>
                <p className={`text-[12px] font-bold ${dispute.status === 'resolved' ? 'text-emerald-800' : 'text-gray-700'}`}>{dispute.status === 'resolved' ? 'Resolved for the buyer' : 'Closed without action'}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-gray-800 whitespace-pre-line">{dispute.resolution_note}</p>
                <p className="mt-2 text-[11.5px] text-gray-500">
                  {dispute.resolver ? `${dispute.resolver.first_name} ${dispute.resolver.last_name}` : 'An admin'}{dispute.resolved_at ? `, ${day(dispute.resolved_at)}` : ''}
                </p>
              </div>
            </>
          ) : isActive(dispute.status) ? (
            <>
              <p className="text-[11px] font-semibold text-gray-400 mb-2">Your decision</p>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Decision">
                {([
                  ['resolved', 'Resolve for the buyer', 'A refund, return or replacement was arranged. Write down what was agreed.'],
                  ['closed', 'Close without action', 'The claim does not hold up. Write down why, for the record.'],
                ] as const).map(([value, title, text]) => {
                  const on = decision === value;
                  return (
                    <button key={value} type="button" role="radio" aria-checked={on} onClick={() => setDecision(value)}
                      className={`text-left p-3 rounded-xl border-[1.5px] transition-colors ${on ? 'border-brand-red bg-red-50/40' : 'border-gray-200 hover:border-gray-400'}`}>
                      <span className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${on ? 'border-brand-red' : 'border-gray-300'}`}>{on && <span className="w-1.5 h-1.5 rounded-full bg-brand-red" />}</span>
                        <span className="text-[13px] font-bold text-gray-900">{title}</span>
                      </span>
                      <span className="block mt-1 pl-6 text-[12px] leading-snug text-gray-500">{text}</span>
                    </button>
                  );
                })}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder={decision === 'resolved' ? 'For example: the shop agreed to refund ₱450 to the buyer\'s GCash after the item is returned.' : 'For example: the delivery photo shows the parcel received intact, and the buyer did not reply.'}
                className="w-full mt-3 px-3.5 py-2.5 text-[13px] border border-gray-200 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 resize-none"
              />
              <div className="flex items-center justify-between gap-3 mt-2">
                <span className="text-[11px] text-gray-400">Saved on the case and in the activity log · {note.length}/1000</span>
                <button type="button" onClick={decide} disabled={!note.trim() || saving}
                  className="h-10 px-5 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-bold disabled:opacity-40">
                  {saving ? 'Saving…' : decision === 'resolved' ? 'Resolve case' : 'Close case'}
                </button>
              </div>
              {error && <p role="alert" className="mt-2 text-[12px] text-red-700">{error}</p>}
            </>
          ) : (
            <p className="text-[13px] text-gray-500">This case was closed without a note.</p>
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [stats, setStats] = useState<AdminDisputeStats | null>(null);
  const [meta, setMeta] = useState<PageMeta>({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<DisputeStatus | ''>('open');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [mobilePane, setMobilePane] = useState<'list' | 'case'>('list');

  useEffect(() => {
    const id = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(false);
    getAdminDisputesApi({ status: status || undefined, search: search || undefined, page })
      .then((res) => {
        setDisputes(res.data);
        setMeta(res.meta);
        setSelected((prev) => prev ?? res.data[0]?.id ?? null);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [status, search, page]);

  const loadStats = useCallback(() => { getAdminDisputeStatsApi().then(setStats).catch(() => {}); }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const onUpdated = (updated: AdminDispute) => {
    setDisputes((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    loadStats();
  };

  const filters: { value: DisputeStatus | ''; label: string; count?: number }[] = [
    { value: 'open', label: 'Open', count: stats?.open },
    { value: 'in_progress', label: 'In progress', count: stats?.in_progress },
    { value: 'resolved', label: 'Resolved' },
    { value: 'closed', label: 'Closed' },
    { value: '', label: 'All' },
  ];

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={ShieldAlert} eyebrow="Admin / Trust & Safety" title="Disputes & Returns"
        subtitle="Claims buyers raise about an order. Read the claim, check the order, and record a decision.">
        {stats && (
          <span className="text-[11px] text-white/70 tabular-nums">
            <b className="text-white">{whole(stats.open)}</b> open · <b className="text-white">{whole(stats.in_progress)}</b> in progress · {whole(stats.resolved)} decided
          </span>
        )}
      </PageHero>

      <div className="flex bg-white border shadow-xs border-gray-200/80 rounded-2xl overflow-hidden h-[calc(100dvh-196px)] min-h-[560px]">
        {/* Case queue */}
        <aside className={`${mobilePane === 'case' ? 'hidden lg:flex' : 'flex'} w-full lg:w-[380px] shrink-0 flex-col border-r border-gray-200/80`}>
          <div className="p-3 space-y-2.5 border-b border-gray-100">
            <SearchField value={searchInput} onChange={setSearchInput} label="Search cases" placeholder="Order number, buyer or reason" />
            <div className="flex gap-4 -mx-3 px-3 overflow-x-auto no-scrollbar" role="tablist" aria-label="Case status">
              {filters.map((f) => (
                <button key={f.value || 'all'} type="button" role="tab" aria-selected={status === f.value} onClick={() => { setStatus(f.value); setPage(1); setSelected(null); }}
                  className={`relative shrink-0 inline-flex items-center gap-1.5 pb-2 text-[12.5px] font-semibold transition-colors ${status === f.value ? 'text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}>
                  {f.label}
                  {!!f.count && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-gray-900 text-white text-[10px] font-bold flex items-center justify-center">{f.count}</span>}
                  {status === f.value && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-brand-red" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {failed ? <div className="p-3"><ListError message="The cases could not be loaded." onRetry={load} /></div>
              : loading && disputes.length === 0 ? (
                <ul aria-busy="true">{Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="px-4 py-3.5 space-y-2 border-b border-gray-50 animate-pulse"><div className="w-1/2 h-3 bg-gray-100 rounded" /><div className="w-full h-3 bg-gray-100 rounded" /></li>
                ))}</ul>
              ) : disputes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full px-8 text-center">
                  <span className="flex items-center justify-center text-gray-400 bg-gray-100 w-14 h-14 rounded-2xl"><Inbox className="w-6 h-6" /></span>
                  <p className="mt-3 text-[13px] font-semibold text-gray-800">{search ? 'No case matches that search' : status === 'open' ? 'No open cases' : 'No cases here'}</p>
                  <p className="mt-1 text-[12px] text-gray-500">{status === 'open' && !search ? 'Every claim has an answer. New ones land here.' : 'Try another filter.'}</p>
                </div>
              ) : (
                <ul className={loading ? 'opacity-60' : ''}>
                  {disputes.map((d) => {
                    const on = d.id === selected;
                    const age = ageDays(d.created_at);
                    const overdue = isActive(d.status) && age > 3;
                    return (
                      <li key={d.id}>
                        <button type="button" onClick={() => { setSelected(d.id); setMobilePane('case'); }} aria-current={on ? 'true' : undefined}
                          className={`relative w-full px-4 py-3.5 text-left border-b border-gray-50 transition-colors ${on ? 'bg-red-50/60' : 'hover:bg-gray-50'}`}>
                          {on && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-brand-red" aria-hidden="true" />}
                          <span className="flex items-center gap-2">
                            <span className="text-[12px] font-mono text-gray-400">#{d.id}</span>
                            <span className="flex-1 text-[13px] font-semibold text-gray-900 truncate">{buyerName(d)}</span>
                            <span className={`text-[11px] shrink-0 ${overdue ? 'font-semibold text-red-700' : 'text-gray-400'}`}>{relativeTime(d.created_at)}</span>
                          </span>
                          <span className="block mt-1 text-[12.5px] leading-snug text-gray-600 line-clamp-2">{d.reason}</span>
                          <span className="flex items-center gap-2 mt-2">
                            <Pill tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Pill>
                            <span className="font-mono text-[11px] text-gray-400 truncate">{d.order?.order_number}</span>
                            {d.order && <span className="ml-auto text-[12px] font-semibold text-gray-700 tabular-nums">{peso(d.order.total)}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
          </div>

          {meta.last_page > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
              <span className="text-[12px] text-gray-500">{whole(meta.total)} cases</span>
              <div className="flex items-center gap-1">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page" className="flex items-center justify-center w-8 h-8 text-gray-500 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"><ChevronLeft className="w-3.5 h-3.5" /></button>
                <span className="px-1 text-[12px] text-gray-600 tabular-nums">{meta.current_page} / {meta.last_page}</span>
                <button type="button" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)} aria-label="Next page" className="flex items-center justify-center w-8 h-8 text-gray-500 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}
        </aside>

        {/* Case file */}
        <section className={`${mobilePane === 'list' ? 'hidden lg:flex' : 'flex'} flex-1 min-w-0 flex-col`}>
          {selected !== null ? (
            <CaseFile key={selected} disputeId={selected} onUpdated={onUpdated} onBack={() => setMobilePane('list')} />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 p-8 text-center bg-gray-50/50">
              <span className="flex items-center justify-center w-16 h-16 bg-white border border-gray-200 text-brand-red rounded-2xl"><Scale className="w-7 h-7" /></span>
              <h2 className="mt-4 text-[15px] font-bold text-gray-900">Pick a case</h2>
              <p className="mt-1 text-[12.5px] text-gray-500 max-w-xs">The claim, the order and the decision form open here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
