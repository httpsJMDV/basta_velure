import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { getAdminDisputesApi, getAdminDisputeApi, resolveDisputeApi, getAdminDisputeStatsApi } from '../../api/client';
import type { AdminDispute, DisputeStatus, AdminDisputeStats } from '../../types';
import { PageHero, StatCard, StatCardSkeleton } from '../../components/admin/dashboardKit';
import { SearchField, ListError, Pill, Avatar, type PillTone, relativeTime } from '../../components/admin/listKit';
import {
  ShieldAlert, ChevronLeft, ChevronRight, Package, ExternalLink, Loader2, Inbox, Scale, Gavel, Hourglass, Store,
  CheckCircle2, Clock, AlertTriangle, X, Mail, Check,
} from 'lucide-react';
import { getStatusLabel } from '../../utils/orderStatus';
import { peso, whole } from '../../utils/adminReports';
import { apiErrorMessage } from '../../utils/apiError';

type PageMeta = { current_page: number; last_page: number; total: number };

const STATUS: Record<DisputeStatus, { label: string; tone: PillTone }> = {
  escalated: { label: 'Escalated', tone: 'red' },
  pending: { label: 'With the shop', tone: 'amber' },
  rejected: { label: 'Shop rejected', tone: 'gray' },
  approved: { label: 'Refunded', tone: 'emerald' },
  open: { label: 'Open claim', tone: 'red' },
  in_progress: { label: 'In progress', tone: 'amber' },
  resolved: { label: 'Resolved', tone: 'emerald' },
  closed: { label: 'Closed', tone: 'gray' },
};

/** The queue's four views; each is one or more statuses. */
type Group = 'needs' | 'waiting' | 'decided' | 'all';
const GROUPS: { key: Group; label: string; statuses: string }[] = [
  { key: 'needs', label: 'Needs decision', statuses: 'escalated,open,in_progress' },
  { key: 'waiting', label: 'Waiting', statuses: 'pending,rejected' },
  { key: 'decided', label: 'Decided', statuses: 'approved,resolved,closed' },
  { key: 'all', label: 'All', statuses: '' },
];

function ageDays(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function day(iso: string | null | undefined, withTime = false) {
  return iso
    ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) })
    : '—';
}

function buyerName(d: AdminDispute) {
  return d.buyer ? `${d.buyer.first_name} ${d.buyer.last_name}`.trim() : 'Unknown buyer';
}

/** Cases that wait on Loved-IT: escalated returns, and claims raised before the return flow. */
function isActive(status: DisputeStatus) {
  return status === 'escalated' || status === 'open' || status === 'in_progress';
}

/** A return request from the new flow (A31), as opposed to an older free-text claim. */
function isReturn(d: AdminDispute) {
  return ['pending', 'approved', 'rejected', 'escalated'].includes(d.status) || !!d.description || (d.photos?.length ?? 0) > 0;
}

const PAYMENT_LABEL: Record<string, string> = { cod: 'COD', gcash: 'GCash', e_wallet: 'e-wallet', card: 'card' };

type Choice = 'refund' | 'reject' | 'resolved' | 'closed';

// ─── Pieces of the case file ──────────────────────────────────────────────────

function Block({ title, aside, children, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-gray-200/80 bg-white ${className}`}>
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-100">
        <h3 className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-gray-500 uppercase">
          <span className="w-1 h-3.5 rounded-full bg-brand-red" aria-hidden="true" />{title}
        </h3>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Where the case stands: requested, answered by the shop, escalated, decided; with the deadline that is running. */
function CaseSteps({ d }: { d: AdminDispute }) {
  const returnCase = isReturn(d);
  const decided = !!d.resolved_at && !isActive(d.status) && d.status !== 'pending' && d.status !== 'rejected';
  const steps: { label: string; at: string | null | undefined; done: boolean; note?: string }[] = returnCase
    ? [
        { label: 'Return requested', at: d.created_at, done: true },
        {
          label: d.status === 'approved' && !d.escalated_at ? (d.auto_approved ? 'Approved automatically' : 'Shop approved') : 'Shop answered',
          at: d.seller_responded_at ?? (d.status === 'approved' && !d.escalated_at ? d.resolved_at : null),
          done: !!d.seller_responded_at || (d.status === 'approved' && !d.escalated_at),
          note: d.status === 'pending' && d.respond_by ? `Due ${day(d.respond_by, true)}` : undefined,
        },
        {
          label: 'Escalated to Loved-IT',
          at: d.escalated_at,
          done: !!d.escalated_at,
          note: d.status === 'rejected' && d.escalate_by ? `Buyer can escalate until ${day(d.escalate_by, true)}` : undefined,
        },
        { label: 'Decided', at: decided ? d.resolved_at : null, done: decided },
      ]
    : [
        { label: 'Claim opened', at: d.created_at, done: true },
        { label: 'Decided', at: decided ? d.resolved_at : null, done: decided },
      ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <ol className="grid gap-3" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Case progress">
      {steps.map((s, i) => {
        const now = i === current;
        return (
          <li key={s.label} className="relative" aria-current={now ? 'step' : undefined}>
            <div className={`h-1 rounded-full ${s.done ? 'bg-emerald-500' : now ? 'bg-brand-red' : 'bg-gray-200'}`} aria-hidden="true" />
            <p className={`mt-2 flex items-center gap-1 text-[12px] font-bold ${s.done ? 'text-gray-900' : now ? 'text-brand-red' : 'text-gray-400'}`}>
              {s.done && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />}
              <span className="truncate">{s.label}</span>
            </p>
            <p className="text-[11px] text-gray-500 truncate">{s.at ? day(s.at, true) : s.note ?? (now ? 'Now' : 'Not yet')}</p>
            {s.at && s.note && <p className="text-[11px] text-amber-700 truncate">{s.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}

// ─── The case file ────────────────────────────────────────────────────────────

function CaseFile({ disputeId, onUpdated, onBack }: { disputeId: number; onUpdated: (d: AdminDispute) => void; onBack: () => void }) {
  const [result, setResult] = useState<{ id: number; dispute: AdminDispute | null } | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const dispute = result?.id === disputeId ? result.dispute : null;
  const loading = result?.id !== disputeId;

  useEffect(() => {
    let alive = true;
    getAdminDisputeApi(disputeId)
      .then((d) => { if (alive) setResult({ id: disputeId, dispute: d }); })
      .catch(() => { if (alive) setResult({ id: disputeId, dispute: null }); });
    return () => { alive = false; };
  }, [disputeId]);

  useEffect(() => {
    if (!photo) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPhoto(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [photo]);

  const returnCase = dispute ? isReturn(dispute) : false;
  const decision: Choice = choice ?? (returnCase ? 'refund' : 'resolved');

  async function decide() {
    if (!dispute || note.trim().length < 10) return;
    setSaving(true);
    setError('');
    try {
      const body = decision === 'refund' || decision === 'reject'
        ? { decision, resolution_note: note.trim() }
        : { status: decision, resolution_note: note.trim() };
      const updated = await resolveDisputeApi(dispute.id, body);
      setResult({ id: disputeId, dispute: { ...dispute, ...updated, order: updated.order ? { ...dispute.order, ...updated.order } : dispute.order } });
      setNote('');
      onUpdated(updated);
    } catch (err) {
      setError(apiErrorMessage(err, 'The decision was not saved. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center flex-1 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" aria-label="Loading the case" /></div>;
  if (!dispute) return <div className="flex items-center justify-center flex-1 text-[13px] text-gray-500">This case could not be loaded.</div>;

  const age = ageDays(dispute.escalated_at ?? dispute.created_at);
  const overdue = isActive(dispute.status) && age > 3;
  const canDecide = dispute.can_decide ?? isActive(dispute.status);
  const paidWith = dispute.order?.payment_method ? PAYMENT_LABEL[dispute.order.payment_method] ?? dispute.order.payment_method : null;
  const shop = dispute.seller?.shop_name ?? 'The shop';
  const options: [Choice, string, string][] = returnCase
    ? [
        ['refund', 'Refund the buyer', `The order becomes Returned and ${dispute.order ? peso(dispute.order.total) : 'the amount paid'} goes back${paidWith ? ` to the buyer's ${paidWith === 'COD' ? 'refund account' : paidWith}` : ''}. The shop does not earn on it.`],
        ['reject', 'Side with the shop', 'The return is closed and the order is Completed, so the shop is paid.'],
      ]
    : [
        ['resolved', 'Resolve for the buyer', 'A refund, return or replacement was arranged. Write down what was agreed.'],
        ['closed', 'Close without action', 'The claim does not hold up. Write down why, for the record.'],
      ];
  const decided = !!dispute.resolution_note && !canDecide;
  const forBuyer = dispute.status === 'approved' || dispute.status === 'resolved';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <header className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 sm:px-6">
        <button type="button" onClick={onBack} className="flex items-center justify-center w-9 h-9 -ml-1 text-gray-500 rounded-lg lg:hidden hover:bg-gray-100" aria-label="Back to the cases">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-gray-400">
            {returnCase ? 'Return' : 'Claim'} #{dispute.id} · {dispute.reason}
          </p>
          <h2 className="text-[17px] font-black text-gray-900 truncate">
            {buyerName(dispute)} <span className="font-medium text-gray-400">vs</span> {shop}
          </h2>
          {dispute.order && <p className="text-[12px] text-gray-500 font-mono">{dispute.order.order_number}</p>}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Pill tone={STATUS[dispute.status].tone}>{STATUS[dispute.status].label}</Pill>
          {isActive(dispute.status) && (
            <span className={`inline-flex items-center gap-1 text-[11px] ${overdue ? 'font-bold text-red-700' : 'text-gray-500'}`}>
              {overdue ? <AlertTriangle className="w-3 h-3" aria-hidden="true" /> : <Clock className="w-3 h-3" aria-hidden="true" />}
              {age === 0 ? 'Waiting since today' : `${age} day${age === 1 ? '' : 's'} waiting${overdue ? ', overdue' : ''}`}
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-gray-50/60">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="rounded-2xl border border-gray-200/80 bg-white px-4 py-3.5">
            <CaseSteps d={dispute} />
          </div>

          {/* Both sides, side by side on a wide screen */}
          <div className={`grid gap-4 ${returnCase ? 'xl:grid-cols-2' : ''}`}>
            <Block title="The buyer says" aside={dispute.buyer?.email && (
              <a href={`mailto:${dispute.buyer.email}`} className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-gray-500 hover:text-brand-red">
                <Mail className="w-3.5 h-3.5" aria-hidden="true" /> Email
              </a>
            )}>
              <div className="flex items-center gap-2.5 mb-3">
                <Avatar name={buyerName(dispute)} size="sm" />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-gray-900 truncate">{buyerName(dispute)}</p>
                  <p className="text-[11.5px] text-gray-500">{day(dispute.created_at, true)}</p>
                </div>
              </div>
              <p className="text-[13.5px] leading-relaxed text-gray-800 whitespace-pre-line">{dispute.description || dispute.reason}</p>
              {(dispute.photos?.length ?? 0) > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {dispute.photos!.map((src, i) => (
                    <button key={src} type="button" onClick={() => setPhoto(src)} className="aspect-square overflow-hidden bg-gray-100 border border-gray-200 rounded-xl hover:ring-2 hover:ring-brand-red/40" aria-label={`Open photo ${i + 1}`}>
                      <img src={src} alt={`Evidence ${i + 1}`} className="object-cover w-full h-full" />
                    </button>
                  ))}
                </div>
              )}
            </Block>

            {returnCase && (
              <Block title="The shop says">
                <div className="flex items-center gap-2.5 mb-3">
                  <Avatar name={shop} icon={Store} size="sm" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-gray-900 truncate">{shop}</p>
                    <p className="text-[11.5px] text-gray-500">{dispute.seller_responded_at ? `Rejected ${day(dispute.seller_responded_at, true)}` : 'No answer yet'}</p>
                  </div>
                </div>
                {dispute.seller_reason ? (
                  <p className="text-[13.5px] leading-relaxed text-gray-800 whitespace-pre-line">{dispute.seller_reason}</p>
                ) : dispute.status === 'pending' ? (
                  <p className="text-[13px] text-gray-500">The shop has 3 days to answer{dispute.respond_by ? ` (until ${day(dispute.respond_by, true)})` : ''}. Without an answer the return is approved automatically.</p>
                ) : (
                  <p className="text-[13px] text-gray-500">{dispute.status === 'approved' && !dispute.escalated_at ? 'The return was approved without a dispute.' : 'The shop gave no reason.'}</p>
                )}
              </Block>
            )}
          </div>

          {dispute.order && (
            <Block title="The order" aside={
              <Link to={`/admin/orders?search=${encodeURIComponent(dispute.order.order_number)}`} className="inline-flex items-center gap-1 text-[12px] font-bold text-brand-red hover:underline">
                Open order <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            }>
              <p className="mb-3 text-[12px] text-gray-500">
                {getStatusLabel(dispute.order.status)}{paidWith ? ` · paid by ${paidWith}` : ''}{dispute.order.refund_status ? ` · refund ${dispute.order.refund_status}` : ''}
              </p>
              <ul className="space-y-3">
                {(dispute.order.items ?? []).map((item, i) => (
                  <li key={item.id ?? i} className="flex items-center gap-3">
                    <span className="w-12 h-12 overflow-hidden bg-gray-100 rounded-xl shrink-0 border border-gray-100">
                      {item.image_url ? <img src={item.image_url} alt="" className="object-cover w-full h-full" /> : <span className="flex items-center justify-center w-full h-full text-gray-300"><Package className="w-4 h-4" aria-hidden="true" /></span>}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold text-gray-900 truncate">{item.product_name}</span>
                      <span className="block text-[12px] text-gray-500">{[item.variant_label, `qty ${item.quantity}`].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="text-[13px] font-semibold text-gray-900 tabular-nums">{peso(item.subtotal ?? item.unit_price * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between pt-3 mt-3 text-[14px] font-black border-t border-dashed border-gray-200">
                <span>Amount paid</span><span className="tabular-nums">{peso(dispute.order.total)}</span>
              </div>
            </Block>
          )}

          {decided ? (
            <Block title="Decision">
              <div className={`rounded-xl px-4 py-3 border ${forBuyer ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
                <p className={`flex items-center gap-1.5 text-[13px] font-bold ${forBuyer ? 'text-emerald-800' : 'text-gray-800'}`}>
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  {dispute.status === 'approved'
                    ? `Refunded to the buyer${dispute.refund_amount != null ? ` · ${peso(dispute.refund_amount)}` : ''}${dispute.auto_approved ? ' · approved automatically' : ''}`
                    : dispute.status === 'resolved'
                      ? 'Resolved for the buyer'
                      : dispute.escalated_at ? 'Decided for the shop' : 'Closed without action'}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-gray-800 whitespace-pre-line">{dispute.resolution_note}</p>
                <p className="mt-2 text-[11.5px] text-gray-500">
                  {dispute.resolver ? `${dispute.resolver.first_name} ${dispute.resolver.last_name}` : dispute.auto_approved ? 'Loved-IT, after 3 days without an answer' : dispute.status === 'approved' ? 'The shop' : 'An admin'}
                  {dispute.resolved_at ? `, ${day(dispute.resolved_at, true)}` : ''}
                </p>
              </div>
            </Block>
          ) : !canDecide && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-gray-200/80 bg-white px-4 py-3.5 text-[13px] text-gray-600">
              <Hourglass className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" aria-hidden="true" />
              {dispute.status === 'pending'
                ? 'Waiting for the shop. Loved-IT decides only if the shop rejects and the buyer escalates.'
                : dispute.status === 'rejected'
                  ? 'The shop rejected this return. The buyer has 3 days to escalate it; until then there is nothing to decide.'
                  : 'This case was closed without a note.'}
            </div>
          )}
        </div>
      </div>

      {/* The decision form stays in reach at the bottom of the case */}
      {canDecide && (
        <footer className="border-t border-gray-200 bg-white px-4 py-4 sm:px-6 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.25)]">
          <p className="flex items-center gap-2 mb-2.5 text-[11px] font-bold tracking-wider text-gray-500 uppercase"><Gavel className="w-3.5 h-3.5 text-brand-red" aria-hidden="true" /> Your decision</p>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Decision">
            {options.map(([value, title, text]) => {
              const on = decision === value;
              return (
                <button key={value} type="button" role="radio" aria-checked={on} onClick={() => setChoice(value)}
                  className={`text-left p-3 rounded-xl border-[1.5px] transition-colors ${on ? 'border-brand-red bg-red-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <span className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${on ? 'border-brand-red' : 'border-gray-300'}`}>{on && <span className="w-1.5 h-1.5 rounded-full bg-brand-red" />}</span>
                    <span className="text-[13px] font-bold text-gray-900">{title}</span>
                  </span>
                  <span className="block mt-1 pl-6 text-[11.5px] leading-snug text-gray-500">{text}</span>
                </button>
              );
            })}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            aria-label="Reason for the decision"
            placeholder={decision === 'refund' || decision === 'resolved'
              ? 'Why: for example, the photos show the rim was broken in transit.'
              : 'Why: for example, the photos show the item was used and the tag removed.'}
            className="w-full mt-2.5 px-3.5 py-2.5 text-[13px] border border-gray-200 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 resize-none"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
            <span className={`text-[11px] ${note.trim().length > 0 && note.trim().length < 10 ? 'text-amber-700' : 'text-gray-400'}`}>
              Both sides see this note · {note.trim().length < 10 ? 'at least 10 characters' : `${note.length}/1000`}
            </span>
            <button type="button" onClick={decide} disabled={note.trim().length < 10 || saving}
              className="min-h-10 px-5 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-[13px] font-bold disabled:opacity-40">
              {saving ? 'Saving…' : decision === 'refund' ? 'Refund the buyer' : decision === 'reject' ? 'Close for the shop' : decision === 'resolved' ? 'Resolve case' : 'Close case'}
            </button>
          </div>
          {error && <p role="alert" className="mt-2 text-[12px] text-red-700">{error}</p>}
        </footer>
      )}

      {photo && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85" role="dialog" aria-modal="true" aria-label="Evidence photo" onClick={() => setPhoto(null)}>
          <img src={photo} alt="Evidence" className="max-w-full max-h-full rounded-xl" />
          <button type="button" onClick={() => setPhoto(null)} aria-label="Close photo" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 flex items-center justify-center text-gray-800">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>,
        document.body,
      )}
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
  const [group, setGroup] = useState<Group>('needs');
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
    const statuses = GROUPS.find((g) => g.key === group)?.statuses;
    getAdminDisputesApi({ status: statuses || undefined, search: search || undefined, page })
      .then((res) => {
        setDisputes(res.data);
        setMeta(res.meta);
        setSelected((prev) => prev ?? res.data[0]?.id ?? null);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [group, search, page]);

  const loadStats = useCallback(() => { getAdminDisputeStatsApi().then(setStats).catch(() => {}); }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const onUpdated = (updated: AdminDispute) => {
    setDisputes((prev) => prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
    loadStats();
  };

  const pick = (g: Group) => { setGroup(g); setPage(1); setSelected(null); setMobilePane('list'); };
  const counts: Record<Group, number | undefined> = {
    needs: stats?.needs_decision,
    waiting: stats ? (stats.awaiting_seller ?? 0) + (stats.rejected ?? 0) : undefined,
    decided: stats?.resolved,
    all: stats?.total,
  };

  return (
    <div className="w-full pb-8 space-y-4">
      <PageHero icon={ShieldAlert} eyebrow="Admin / Trust & Safety" title="Disputes & Returns"
        subtitle="Returns the buyer escalated after the shop said no. Read both sides, look at the photos, and decide.">
        {!!stats?.overdue && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/15 border border-red-400/30 text-[11px] font-bold text-red-200">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> {whole(stats.overdue)} overdue
          </span>
        )}
      </PageHero>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats === null ? [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />) : (
          <>
            <StatCard icon={Gavel} label="Needs a decision" value={stats.needs_decision ?? 0} subtext={stats.overdue ? `${whole(stats.overdue)} waiting over 3 days` : 'Escalated returns and claims'}
              iconBg="bg-rose-50" iconColor="text-brand-red" onClick={() => pick('needs')} active={group === 'needs'} actionLabel="Show queue" />
            <StatCard icon={Store} label="With the shop" value={stats.awaiting_seller ?? 0} subtext="3 days to answer" iconBg="bg-amber-50" iconColor="text-amber-600"
              onClick={() => pick('waiting')} active={group === 'waiting'} actionLabel="Show waiting" />
            <StatCard icon={Hourglass} label="Shop rejected" value={stats.rejected ?? 0} subtext="Buyer may still escalate" iconBg="bg-gray-100" iconColor="text-gray-600"
              onClick={() => pick('waiting')} active={false} actionLabel="Show waiting" />
            <StatCard icon={CheckCircle2} label="Decided" value={stats.resolved} subtext="Refunded, resolved or closed" iconBg="bg-emerald-50" iconColor="text-emerald-600"
              onClick={() => pick('decided')} active={group === 'decided'} actionLabel="Show decided" />
          </>
        )}
      </div>

      <div className="flex bg-white border shadow-xs border-gray-200/80 rounded-2xl overflow-hidden h-[calc(100dvh-300px)] min-h-[600px]">
        {/* Case queue */}
        <aside className={`${mobilePane === 'case' ? 'hidden lg:flex' : 'flex'} w-full lg:w-[400px] shrink-0 flex-col border-r border-gray-200/80`}>
          <div className="p-3 space-y-3 border-b border-gray-100">
            <SearchField value={searchInput} onChange={setSearchInput} label="Search cases" placeholder="Order, buyer, shop or reason" />
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-gray-100/80" role="tablist" aria-label="Cases">
              {GROUPS.map((g) => {
                const on = group === g.key;
                return (
                  <button key={g.key} type="button" role="tab" aria-selected={on} onClick={() => pick(g.key)}
                    className={`min-h-9 px-1 rounded-lg text-[11.5px] font-semibold leading-tight transition-colors ${on ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}>
                    <span className="block truncate">{g.label}</span>
                    {counts[g.key] !== undefined && <span className={`block text-[10.5px] tabular-nums ${on ? 'text-brand-red font-bold' : 'text-gray-400'}`}>{whole(counts[g.key] ?? 0)}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {failed ? <div className="p-3"><ListError message="The cases could not be loaded." onRetry={load} /></div>
              : loading && disputes.length === 0 ? (
                <ul aria-busy="true">{Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex gap-3 px-4 py-4 border-b border-gray-50 animate-pulse">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl" />
                    <div className="flex-1 space-y-2"><div className="w-1/2 h-3 bg-gray-100 rounded" /><div className="w-full h-3 bg-gray-100 rounded" /></div>
                  </li>
                ))}</ul>
              ) : disputes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full px-8 text-center">
                  <span className="flex items-center justify-center text-gray-400 bg-gray-100 w-14 h-14 rounded-2xl"><Inbox className="w-6 h-6" aria-hidden="true" /></span>
                  <p className="mt-3 text-[14px] font-bold text-gray-800">
                    {search ? 'No case matches that search' : group === 'needs' ? 'Nothing to decide' : group === 'waiting' ? 'Nothing waiting' : 'No cases yet'}
                  </p>
                  <p className="mt-1 text-[12.5px] text-gray-500 max-w-[260px]">
                    {search ? 'Try an order number, a buyer or a shop name.'
                      : group === 'needs' ? 'When a buyer escalates a return the shop rejected, it lands here.'
                        : group === 'waiting' ? 'Returns the shop has not answered, or rejected, show here.'
                          : 'Return requests and their decisions show here.'}
                  </p>
                </div>
              ) : (
                <ul className={loading ? 'opacity-60' : ''}>
                  {disputes.map((d) => {
                    const on = d.id === selected;
                    const age = ageDays(d.escalated_at ?? d.created_at);
                    const overdue = isActive(d.status) && age > 3;
                    return (
                      <li key={d.id}>
                        <button type="button" onClick={() => { setSelected(d.id); setMobilePane('case'); }} aria-current={on ? 'true' : undefined}
                          className={`relative flex w-full gap-3 px-4 py-3.5 text-left border-b border-gray-100 transition-colors ${on ? 'bg-red-50/60' : 'hover:bg-gray-50'}`}>
                          {on && <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-brand-red" aria-hidden="true" />}
                          <Avatar name={buyerName(d)} size="md" />
                          <span className="flex-1 min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="flex-1 text-[13px] font-bold text-gray-900 truncate">{buyerName(d)}</span>
                              <span className={`text-[11px] shrink-0 ${overdue ? 'font-bold text-red-700' : 'text-gray-400'}`}>{overdue ? `${age}d overdue` : relativeTime(d.escalated_at ?? d.created_at)}</span>
                            </span>
                            <span className="block text-[11.5px] text-gray-500 truncate">
                              {d.seller?.shop_name ?? 'Shop'}{d.order ? <> · <span className="font-mono">{d.order.order_number}</span></> : null}
                            </span>
                            <span className="block mt-1 text-[12.5px] leading-snug text-gray-700 line-clamp-2">
                              {d.description ? <><b className="font-semibold text-gray-900">{d.reason}.</b> {d.description}</> : d.reason}
                            </span>
                            <span className="flex items-center gap-2 mt-2">
                              <Pill tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Pill>
                              {d.order && <span className="ml-auto text-[12.5px] font-bold text-gray-800 tabular-nums">{peso(d.order.total)}</span>}
                            </span>
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
            <div className="flex flex-col items-center justify-center flex-1 p-8 text-center bg-gray-50/60">
              <span className="flex items-center justify-center w-16 h-16 bg-white border border-gray-200 shadow-xs text-brand-red rounded-2xl"><Scale className="w-7 h-7" aria-hidden="true" /></span>
              <h2 className="mt-4 text-[15px] font-bold text-gray-900">{disputes.length ? 'Pick a case' : 'No case open'}</h2>
              <p className="mt-1 text-[12.5px] text-gray-500 max-w-xs">
                {disputes.length ? 'Both sides, the evidence, the order and the decision open here.' : 'Choose another list on the left, or wait for the next return request.'}
              </p>
              <ol className="grid max-w-md gap-2 mt-6 text-left sm:grid-cols-3">
                {[['1', 'Read both sides', 'The buyer\'s request and the shop\'s answer.'], ['2', 'Check the evidence', 'Photos, and the order the buyer paid for.'], ['3', 'Decide', 'Refund the buyer or side with the shop.']].map(([n, t, s]) => (
                  <li key={n} className="p-3 bg-white border border-gray-200/80 rounded-xl">
                    <span className="flex items-center justify-center w-5 h-5 text-[10.5px] font-black rounded-md bg-rose-50 text-brand-red">{n}</span>
                    <p className="mt-1.5 text-[12px] font-bold text-gray-900">{t}</p>
                    <p className="text-[11px] text-gray-500 leading-snug">{s}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
