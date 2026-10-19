import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Plus, Ticket, Lock, Square, AlertTriangle, Search, Copy, Check, CalendarClock, Radio, Archive, Receipt, Pencil,
  Eye, KeyRound, Package, Store, Truck, Sparkles, Info, X,
} from 'lucide-react';
import { SidePanel, Dialog, BUTTON } from '../ui/Overlay';
import { useToast } from '../ui/Toast';
import { PageHero, StatCard, StatCardSkeleton } from '../admin/dashboardKit';
import VoucherTicket from './VoucherTicket';
import { createVoucherApi, endVoucherApi, getManagedVouchersApi, updateVoucherApi } from '../../api/commerce';
import type { ManagedVoucher, WalletVoucher } from '../../api/commerce';
import { getSellerProductsApi } from '../../api/client';
import { displayNameError } from '../../utils/accountRules';
import type { SellerProduct } from '../../types';
import { apiProblem } from '../../utils/apiError';
import { pesoCompact as peso } from '../../utils/pricing';

const TZ = 'Asia/Manila';
const DAY = 86_400_000;

function toInput(d: Date | string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(typeof d === 'string' ? new Date(d) : d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}
const fromInput = (v: string) => new Date(`${v}:00+08:00`);
const day = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });
const when = (iso: string) => new Date(iso).toLocaleString('en-PH', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "in 3 days", "in 5 hours", "in 20 min". */
function inTime(ms: number) {
  if (ms >= DAY) { const d = Math.round(ms / DAY); return `${d} day${d === 1 ? '' : 's'}`; }
  if (ms >= 3_600_000) { const h = Math.round(ms / 3_600_000); return `${h} hour${h === 1 ? '' : 's'}`; }
  return `${Math.max(1, Math.round(ms / 60_000))} min`;
}

/** The same wording as the server's Voucher::label(), for the live preview. */
function labelFor(scope: string, type: 'fixed' | 'percent', amount: number, cap: number | null) {
  const n = (v: number) => String(Number(v.toFixed(2)));
  if (scope === 'shipping') return type === 'percent' ? `${n(amount)}% off shipping${cap ? ` up to ${peso(cap)}` : ''}` : `Shipping up to ${peso(amount)} off`;
  return type === 'percent' ? `${n(amount)}% off${cap ? ` up to ${peso(cap)}` : ''}` : `${peso(amount)} off`;
}

type Filter = 'all' | 'ongoing' | 'upcoming' | 'ended';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'ongoing', label: 'Live' }, { key: 'upcoming', label: 'Scheduled' }, { key: 'ended', label: 'Ended' },
];
const ORDER: Record<ManagedVoucher['status'], number> = { ongoing: 0, upcoming: 1, ended: 2 };

/**
 * Vouchers for their owner (S9, and Loved-IT's platform and shipping vouchers). Codes are 4 to 12 letters and
 * digits in uppercase, unique on Loved-IT (A26). Once a buyer has claimed a voucher only its end date (later) and
 * total usage (higher) can change (A27). Ending one takes it out of every wallet; placed orders keep their discount.
 */
export default function VoucherManager({ admin = false }: { admin?: boolean }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<ManagedVoucher[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ManagedVoucher | 'new' | null>(null);
  const [ending, setEnding] = useState<ManagedVoucher | null>(null);
  const [endBusy, setEndBusy] = useState(false);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [kind, setKind] = useState<'all' | 'platform' | 'shipping'>('all');
  const [query, setQuery] = useState('');

  const load = () => {
    getManagedVouchersApi(admin).then((r) => { setRows(r); setError(''); }).catch((e) => setError(apiProblem(e, 'Vouchers could not be loaded.').message));
  };
  useEffect(load, [admin]);
  useEffect(() => { if (!admin) getSellerProductsApi().then(setProducts).catch(() => undefined); }, [admin]);

  const counts = useMemo(() => {
    const c = { all: 0, ongoing: 0, upcoming: 0, ended: 0, used: 0, claimed: 0 };
    for (const v of rows ?? []) {
      if (kind !== 'all' && v.scope !== kind) continue;
      c.all++; c[v.status]++; c.used += v.used_count; c.claimed += v.claimed_count;
    }
    return c;
  }, [rows, kind]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? [])
      .filter((v) => (filter === 'all' || v.status === filter) && (kind === 'all' || v.scope === kind))
      .filter((v) => !q || v.code.toLowerCase().includes(q) || v.name.toLowerCase().includes(q))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.status === 'ended' ? b.ends_at.localeCompare(a.ends_at) : a.ends_at.localeCompare(b.ends_at)));
  }, [rows, filter, kind, query]);

  const end = async () => {
    if (!ending) return;
    setEndBusy(true);
    try {
      const res = await endVoucherApi(ending.id, admin);
      showToast(res.message, 'success');
      setEnding(null);
      load();
    } catch (e) { showToast(apiProblem(e, 'The voucher could not be ended.').message, 'error'); }
    finally { setEndBusy(false); }
  };

  const newButton = (
    <button type="button" onClick={() => setEditing('new')}
      className="min-h-10 inline-flex items-center justify-center gap-1.5 px-4 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-xs font-bold shadow-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red focus-visible:ring-offset-2">
      <Plus className="w-4 h-4" aria-hidden="true" /> New voucher
    </button>
  );

  return (
    <div className="space-y-4">
      {admin ? (
        <PageHero icon={Ticket} eyebrow="Commerce" title="Platform vouchers" subtitle="Whole-order and shipping discounts that Loved-IT pays for. They never reduce a shop's earnings.">
          {newButton}
        </PageHero>
      ) : (
        <div className="bg-white border border-gray-200/80 rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center text-brand-red shrink-0 border border-rose-100">
              <Ticket className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider">Store vouchers</h1>
              <p className="text-[11px] text-gray-500 mt-0.5">Discounts buyers claim on your shop or type at checkout. One store voucher per shop per order.</p>
            </div>
          </div>
          <div className="self-start md:self-auto">{newButton}</div>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 px-4 py-3 rounded-xl border border-red-100 bg-red-50 text-[13px] text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />{error}
          <button type="button" onClick={load} className="ml-auto text-[12px] font-bold underline underline-offset-2">Try again</button>
        </p>
      )}

      {/* Figures; the first three also filter the list */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {rows === null ? [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />) : (
          <>
            <StatCard icon={Radio} label="Live now" value={counts.ongoing} subtext="Buyers can use these today" iconBg="bg-emerald-50" iconColor="text-emerald-600"
              onClick={() => setFilter(filter === 'ongoing' ? 'all' : 'ongoing')} active={filter === 'ongoing'} actionLabel={filter === 'ongoing' ? 'Show all' : 'Show live'} />
            <StatCard icon={CalendarClock} label="Scheduled" value={counts.upcoming} subtext="Start later" iconBg="bg-blue-50" iconColor="text-blue-600"
              onClick={() => setFilter(filter === 'upcoming' ? 'all' : 'upcoming')} active={filter === 'upcoming'} actionLabel={filter === 'upcoming' ? 'Show all' : 'Show scheduled'} />
            <StatCard icon={Archive} label="Ended" value={counts.ended} subtext="No longer usable" iconBg="bg-gray-100" iconColor="text-gray-500"
              onClick={() => setFilter(filter === 'ended' ? 'all' : 'ended')} active={filter === 'ended'} actionLabel={filter === 'ended' ? 'Show all' : 'Show ended'} />
            <StatCard icon={Receipt} label="Times used" value={counts.used} subtext={`${counts.claimed.toLocaleString()} claimed by buyers`} iconBg="bg-rose-50" iconColor="text-brand-red" />
          </>
        )}
      </div>

      <section className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden" aria-label="Vouchers">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Status" className="inline-flex p-1 rounded-xl bg-gray-100/80">
              {FILTERS.map((f) => (
                <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
                  className={`min-h-8 px-3 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors ${filter === f.key ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}>
                  {f.label}
                  <span className={`tabular-nums text-[10.5px] px-1.5 rounded-full ${filter === f.key ? 'bg-rose-50 text-brand-red' : 'bg-gray-200/70 text-gray-500'}`}>{counts[f.key]}</span>
                </button>
              ))}
            </div>
            {admin && (
              <div role="group" aria-label="Kind" className="inline-flex p-1 rounded-xl bg-gray-100/80">
                {(['all', 'platform', 'shipping'] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                    className={`min-h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors ${kind === k ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}>
                    {k === 'all' ? 'Every kind' : k === 'platform' ? 'Whole order' : 'Shipping'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="relative block w-full lg:w-72">
            <span className="sr-only">Search vouchers</span>
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by code or name"
              className="w-full min-h-10 pl-9 pr-9 rounded-xl border border-gray-200 bg-gray-50/60 text-[13px] outline-none focus:bg-white focus:border-brand-red focus:ring-2 focus:ring-red-100" />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:bg-gray-100">
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </label>
        </div>

        <div className="bg-gray-50 p-3 sm:p-4">
          {rows === null ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-40 rounded-2xl bg-white border border-gray-200/80 animate-pulse" />)}</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center text-center gap-2 py-14 px-6">
              <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200/80 shadow-xs flex items-center justify-center"><Ticket className="w-7 h-7 text-brand-red/70" aria-hidden="true" /></div>
              <p className="text-[15px] font-bold text-gray-900 mt-1">No vouchers yet</p>
              <p className="text-[13px] text-gray-500 max-w-sm">
                {admin ? 'Create a whole-order or shipping voucher. Buyers claim it from the vouchers page or type its code at checkout.' : 'Create a voucher to bring buyers back. It shows on your shop and product pages, or works only with its code.'}
              </p>
              <button type="button" onClick={() => setEditing('new')} className={`${BUTTON.primary} mt-2 inline-flex items-center gap-1.5`}><Plus className="w-4 h-4" aria-hidden="true" /> Create a voucher</button>
            </div>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center text-center gap-1.5 py-12 px-6">
              <Search className="w-6 h-6 text-gray-300" aria-hidden="true" />
              <p className="text-[14px] font-bold text-gray-800">No vouchers match</p>
              <button type="button" onClick={() => { setQuery(''); setFilter('all'); setKind('all'); }} className="text-[12.5px] font-semibold text-brand-red hover:underline">Clear the filters</button>
            </div>
          ) : (
            <ul className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {shown.map((v) => (
                <li key={v.id}><VoucherCard v={v} onEdit={() => setEditing(v)} onEnd={() => setEnding(v)} /></li>
              ))}
            </ul>
          )}
        </div>

        <p className="flex items-start gap-2 px-4 py-3 border-t border-gray-100 text-[11.5px] text-gray-500">
          <Info className="w-3.5 h-3.5 mt-px shrink-0 text-gray-400" aria-hidden="true" />
          {admin
            ? 'Loved-IT pays for platform and shipping vouchers. A buyer can use one of each together with a shop\'s store voucher.'
            : 'Your shop pays for store vouchers: the discount comes off the item price, and commission is charged on what the buyer actually pays.'}
        </p>
      </section>

      {editing && (
        <VoucherForm admin={admin} editing={editing === 'new' ? null : editing} products={products} onClose={() => setEditing(null)}
          onSaved={(m) => { showToast(m, 'success'); setEditing(null); load(); }} />
      )}

      <Dialog open={!!ending} onClose={() => !endBusy && setEnding(null)} title={`End ${ending?.code ?? ''} now?`}
        footer={<>
          <button type="button" className={BUTTON.ghost} disabled={endBusy} onClick={() => setEnding(null)}>Keep it</button>
          <button type="button" className={BUTTON.danger} disabled={endBusy} onClick={end}>{endBusy ? 'Ending…' : 'End voucher'}</button>
        </>}>
        <p className="text-[13.5px] text-stone-600">It disappears from every buyer's wallet and can no longer be used. Orders already placed with it keep their discount.</p>
      </Dialog>
    </div>
  );
}

// ─── One voucher, as a ticket ─────────────────────────────────────────────────

const STATUS_PILL: Record<ManagedVoucher['status'], { label: string; cls: string; dot: string }> = {
  ongoing: { label: 'Live', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500 animate-pulse' },
  upcoming: { label: 'Scheduled', cls: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  ended: { label: 'Ended', cls: 'bg-gray-100 text-gray-500 border-gray-200', dot: 'bg-gray-400' },
};

function VoucherCard({ v, onEdit, onEnd }: { v: ManagedVoucher; onEdit: () => void; onEnd: () => void }) {
  const [copied, setCopied] = useState(false);
  const now = Date.now();
  const start = new Date(v.starts_at).getTime();
  const finish = new Date(v.ended_at ?? v.ends_at).getTime();
  const store = v.scope === 'store';
  const stub = store ? 'bg-brand-red' : v.scope === 'shipping' ? 'bg-gradient-to-b from-stone-800 to-stone-900' : 'bg-gradient-to-b from-[#3d1a1a] to-[#1a1a1a]';
  const KindIcon = v.scope === 'shipping' ? Truck : store ? Store : Sparkles;
  const big = v.discount_type === 'percent' ? `${Number(v.amount)}%` : peso(Number(v.amount));
  const status = STATUS_PILL[v.status];
  const elapsed = v.status === 'ongoing' ? Math.min(100, Math.max(0, ((now - start) / Math.max(1, finish - start)) * 100)) : v.status === 'ended' ? 100 : 0;
  const usage = v.total_limit ? Math.min(100, (v.used_count / v.total_limit) * 100) : null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(v.code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* the code is on screen */ }
  };

  return (
    <article className={`relative flex h-full rounded-2xl border bg-white overflow-hidden transition-shadow ${v.status === 'ended' ? 'border-gray-200/80 opacity-80' : 'border-gray-200/80 shadow-xs hover:shadow-md'}`}>
      <div className={`relative w-[104px] sm:w-[118px] shrink-0 flex flex-col items-center justify-center text-center px-2 py-4 text-white ${stub} ${v.status === 'ended' ? 'grayscale-[60%]' : ''}`}>
        <KindIcon className="w-4 h-4 opacity-80" aria-hidden="true" />
        <span className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] opacity-80">{store ? 'Shop' : v.scope === 'shipping' ? 'Shipping' : 'Loved-IT'}</span>
        <span className="mt-1.5 text-[26px] font-black leading-none tracking-tight">{big}</span>
        <span className="mt-0.5 text-[10.5px] font-bold uppercase tracking-wide opacity-90">off{v.scope === 'shipping' ? ' shipping' : ''}</span>
        {v.max_discount != null && v.discount_type === 'percent' && <span className="mt-1 text-[10px] opacity-75">up to {peso(Number(v.max_discount))}</span>}
      </div>
      {/* The perforation between the stub and the details */}
      <span className="absolute left-[96px] sm:left-[110px] -top-2 w-4 h-4 rounded-full bg-gray-50 border border-gray-200/80" aria-hidden="true" />
      <span className="absolute left-[96px] sm:left-[110px] -bottom-2 w-4 h-4 rounded-full bg-gray-50 border border-gray-200/80" aria-hidden="true" />

      <div className="flex-1 min-w-0 p-3.5 sm:p-4 border-l-2 border-dashed border-gray-200 flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-mono text-[15px] font-black tracking-wide text-gray-900 truncate">{v.code}</p>
              <button type="button" onClick={() => void copy()} aria-label={`Copy ${v.code}`} className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
              </button>
            </div>
            <p className="text-[12.5px] text-gray-600 truncate">{v.name}</p>
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${status.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} aria-hidden="true" />{status.label}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Chip>{Number(v.min_spend) > 0 ? `Min. spend ${peso(Number(v.min_spend))}` : 'No minimum spend'}</Chip>
          <Chip>{v.per_buyer_limit} per buyer</Chip>
          {store && <Chip>{v.applies_to === 'products' ? `${v.product_ids.length} selected product${v.product_ids.length === 1 ? '' : 's'}` : 'All products'}</Chip>}
          <Chip icon={v.claimable ? Eye : KeyRound}>{v.claimable ? 'Claimable' : 'Code only'}</Chip>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-auto pt-1">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {v.status === 'upcoming' ? `Starts in ${inTime(start - now)}` : v.status === 'ongoing' ? `Ends in ${inTime(finish - now)}` : `Ended ${day(v.ended_at ?? v.ends_at)}`}
            </p>
            <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
              <div className={`h-full rounded-full ${v.status === 'ongoing' ? 'bg-emerald-500' : 'bg-gray-300'}`} style={{ width: `${elapsed}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-gray-500 truncate" title={`${when(v.starts_at)} to ${when(v.ends_at)}`}>{day(v.starts_at)} – {day(v.ends_at)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Used</p>
            <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
              <div className="h-full rounded-full bg-brand-red" style={{ width: `${usage ?? 0}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-gray-500 truncate">
              <span className="font-bold text-gray-800 tabular-nums">{v.used_count.toLocaleString()}</span>{v.total_limit ? ` of ${v.total_limit.toLocaleString()}` : ' · no limit'} · {v.claimed_count.toLocaleString()} claimed
            </p>
          </div>
        </div>

        {v.status !== 'ended' && (
          <div className="flex items-center justify-end gap-1 pt-2 border-t border-gray-100">
            {v.locked && <span className="mr-auto inline-flex items-center gap-1 text-[11px] text-amber-700"><Lock className="w-3 h-3" aria-hidden="true" /> Claimed: limited edits</span>}
            <button type="button" onClick={onEdit} className="min-h-8 px-2.5 rounded-lg text-[12px] font-semibold text-gray-700 hover:bg-gray-100 inline-flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> Edit
            </button>
            <button type="button" onClick={onEnd} className="min-h-8 px-2.5 rounded-lg text-[12px] font-semibold text-gray-700 hover:text-red-700 hover:bg-red-50 inline-flex items-center gap-1.5">
              <Square className="w-3.5 h-3.5" aria-hidden="true" /> End now
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function Chip({ children, icon: Icon }: { children: ReactNode; icon?: React.ElementType }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 border border-gray-200/80 text-[11px] font-medium text-gray-600">
      {Icon && <Icon className="w-3 h-3 text-gray-400" aria-hidden="true" />}{children}
    </span>
  );
}

// ─── Create or edit ───────────────────────────────────────────────────────────

function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12.5px] font-semibold text-gray-800">{label}</label>
      {children}
      {error ? <p role="alert" className="text-[11.5px] font-medium text-red-600">{error}</p> : hint ? <p className="text-[11.5px] text-gray-500">{hint}</p> : null}
    </div>
  );
}

const input = (error?: string, disabled?: boolean) => [
  'w-full min-h-10 px-3.5 py-2 text-[13.5px] border rounded-xl outline-none bg-white focus:ring-2 focus:ring-red-100',
  error ? 'border-red-400' : 'border-gray-300 focus:border-brand-red',
  disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : '',
].join(' ');

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
        <span className="w-5 h-5 rounded-md bg-rose-50 text-brand-red text-[10.5px] font-black flex items-center justify-center">{n}</span>{title}
      </h3>
      {children}
    </section>
  );
}

/** A choice shown as two cards (instead of a dropdown), for options a seller should read before picking. */
function Choice<T extends string>({ value, onChange, disabled, options }: {
  value: T; onChange: (v: T) => void; disabled?: boolean; options: { value: T; title: string; text: string; icon: React.ElementType }[];
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" disabled={disabled} aria-pressed={on} onClick={() => onChange(o.value)}
            className={`text-left flex items-start gap-2.5 p-3 rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${on ? 'border-brand-red bg-rose-50/60 ring-1 ring-brand-red/20' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
            <span className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center ${on ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-500'}`}><o.icon className="w-3.5 h-3.5" aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className={`block text-[13px] font-bold ${on ? 'text-brand-red' : 'text-gray-800'}`}>{o.title}</span>
              <span className="block text-[11.5px] text-gray-500 leading-snug">{o.text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function randomCode(name: string) {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'SAVE';
  const digits = String(Math.floor(10 + Math.random() * 990));
  return (letters + digits).slice(0, 12);
}

function VoucherForm({ admin, editing, products, onClose, onSaved }: {
  admin: boolean; editing: ManagedVoucher | null; products: SellerProduct[]; onClose: () => void; onSaved: (message: string) => void;
}) {
  const locked = !!editing?.locked;
  const [scope, setScope] = useState<'platform' | 'shipping'>(editing?.scope === 'shipping' ? 'shipping' : 'platform');
  const [code, setCode] = useState(editing?.code ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<'fixed' | 'percent'>(editing?.discount_type ?? 'fixed');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [cap, setCap] = useState(editing?.max_discount != null ? String(editing.max_discount) : '');
  const [minSpend, setMinSpend] = useState(editing ? String(editing.min_spend) : '');
  const [total, setTotal] = useState(editing?.total_limit != null ? String(editing.total_limit) : '');
  const [perBuyer, setPerBuyer] = useState(editing ? String(editing.per_buyer_limit) : '1');
  const [claimable, setClaimable] = useState(editing?.claimable ?? true);
  const [appliesTo, setAppliesTo] = useState<'all' | 'products'>(editing?.applies_to ?? 'all');
  const [picked, setPicked] = useState<number[]>(editing?.product_ids ?? []);
  const [productQuery, setProductQuery] = useState('');
  const [start, setStart] = useState(() => (editing ? toInput(editing.starts_at) : toInput(new Date(Date.now() + 5 * 60000))));
  const [end, setEnd] = useState(() => (editing ? toInput(editing.ends_at) : toInput(new Date(Date.now() + 30 * DAY))));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const live = useMemo(() => products.filter((p) => p.status === 'active' || p.status === 'draft'), [products]);
  const listed = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return q ? live.filter((p) => p.name.toLowerCase().includes(q)) : live;
  }, [live, productQuery]);
  const effectiveScope = admin ? scope : 'store';

  const preview: WalletVoucher = {
    id: 0, code: code.trim().toUpperCase() || 'CODE', name, scope: effectiveScope,
    label: Number(amount) > 0 ? labelFor(effectiveScope, type, Number(amount), type === 'percent' && Number(cap) > 0 ? Number(cap) : null) : 'Your discount',
    discount_type: type, amount: Number(amount) || 0, max_discount: Number(cap) || null, min_spend: Number(minSpend) || 0,
    applies_to: admin ? 'all' : appliesTo, product_ids: picked, starts_at: fromInput(start).toISOString(), ends_at: fromInput(end).toISOString(),
    status: fromInput(start).getTime() > Date.now() ? 'upcoming' : 'ongoing', seller: null, claimed: false, fully_used: false,
  };

  const setDuration = (days: number) => {
    const from = fromInput(start);
    setEnd(toInput(new Date((Number.isNaN(from.getTime()) ? Date.now() : from.getTime()) + days * DAY)));
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!locked) {
      const c = code.trim().toUpperCase();
      if (!/^[A-Z0-9]{4,12}$/.test(c)) e.code = 'The code must be 4 to 12 letters and digits, with no spaces or symbols.';
      const nameProblem = displayNameError(name, 'The voucher name', 3, 80);
      if (nameProblem) e.name = nameProblem;
      const a = Number(amount);
      if (!amount || !Number.isFinite(a) || a <= 0) e.amount = 'The discount must be more than ₱0.';
      else if (type === 'percent' && (!Number.isInteger(a) || a < 1 || a > 99)) e.amount = 'The percentage must be a whole number from 1% to 99%.';
      else if (type === 'fixed' && effectiveScope !== 'shipping' && a > Number(minSpend || 0)) e.amount = 'The discount cannot be more than the minimum spend.';
      if (minSpend !== '' && !(Number(minSpend) >= 0)) e.min_spend = 'The minimum spend must be ₱0 or more.';
      if (type === 'percent' && cap !== '' && !(Number(cap) > 0)) e.max_discount = 'The cap must be more than ₱0.';
      if (total !== '' && (!/^\d+$/.test(total) || Number(total) < 1)) e.total_limit = 'The total usage limit must be at least 1.';
      if (!/^\d+$/.test(perBuyer) || Number(perBuyer) < 1) e.per_buyer_limit = 'The per-buyer limit must be at least 1.';
      else if (total !== '' && Number(perBuyer) > Number(total)) e.per_buyer_limit = 'The per-buyer limit cannot be more than the total usage limit.';
      if (!admin && appliesTo === 'products' && picked.length === 0) e.product_ids = 'Choose at least one product.';
    } else if (total !== '' && (!/^\d+$/.test(total) || Number(total) < 1)) {
      e.total_limit = 'The total usage limit must be at least 1.';
    }
    if (fromInput(end) <= fromInput(start)) e.ends_at = 'The end must be after the start.';
    setErrors(e);
    setSummary(Object.keys(e).length ? 'Some details need fixing. Check the fields marked in red.' : '');
    if (Object.keys(e).length) return;

    const payload: Record<string, unknown> = locked
      ? { ends_at: end, total_limit: total === '' ? null : Number(total) }
      : {
          code: code.trim().toUpperCase(), name: name.trim(), discount_type: type, amount: Number(amount),
          max_discount: type === 'percent' && cap !== '' ? Number(cap) : null, min_spend: minSpend === '' ? 0 : Number(minSpend),
          total_limit: total === '' ? null : Number(total), per_buyer_limit: Number(perBuyer), claimable,
          applies_to: admin ? 'all' : appliesTo, product_ids: !admin && appliesTo === 'products' ? picked : [],
          starts_at: start, ends_at: end, ...(admin ? { scope } : {}),
        };
    setBusy(true);
    try {
      const res = editing ? await updateVoucherApi(editing.id, payload, admin) : await createVoucherApi(payload, admin);
      onSaved(res.message);
    } catch (err) {
      const p = apiProblem(err, 'The voucher could not be saved.');
      const f: Record<string, string> = {};
      for (const [k, v] of Object.entries(p.fields)) f[k.startsWith('product_ids') ? 'product_ids' : k] = v;
      setErrors(f);
      setSummary(Object.keys(f).length ? 'Some details need fixing. Check the fields marked in red.' : p.message);
    } finally { setBusy(false); }
  };

  return (
    <SidePanel open onClose={onClose} width="max-w-2xl" title={editing ? `Edit ${editing.code}` : admin ? 'New platform voucher' : 'New store voucher'}
      subtitle={editing ? `${STATUS_PILL[editing.status].label} · ${editing.used_count} used · ${editing.claimed_count} claimed` : 'Buyers see it the way the preview shows.'}
      footer={<div className="flex items-center justify-end gap-2">
        <button type="button" className={BUTTON.ghost} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={BUTTON.primary} onClick={submit} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create voucher'}</button>
      </div>}>
      <div className="space-y-6">
        <div className="rounded-2xl bg-gradient-to-br from-gray-50 to-rose-50/40 border border-gray-200/80 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Preview</p>
          <VoucherTicket voucher={preview} action="claim" />
        </div>

        {locked && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900">
            <Lock className="w-4 h-4 mt-px shrink-0" aria-hidden="true" />
            Buyers have claimed this voucher, so only the end date (later) and the usage limit (higher) can change.
          </p>
        )}
        {summary && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{summary}</p>}

        <Section n={1} title="Basics">
          {admin && (
            <Choice value={scope} onChange={setScope} disabled={!!editing} options={[
              { value: 'platform', title: 'Whole order', text: 'Takes money off the items in the order.', icon: Sparkles },
              { value: 'shipping', title: 'Shipping', text: 'Takes money off the delivery fee only.', icon: Truck },
            ]} />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Code" htmlFor="v-code" error={errors.code} hint={editing ? 'A code cannot change.' : '4 to 12 letters and digits. Buyers type it at checkout.'}>
              <div className="flex gap-2">
                <input id="v-code" value={code} disabled={!!editing} maxLength={12} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  className={input(errors.code, !!editing) + ' font-mono uppercase tracking-wide'} placeholder="e.g. SAVE50" />
                {!editing && (
                  <button type="button" onClick={() => setCode(randomCode(name))} className="shrink-0 min-h-10 px-3 rounded-xl border border-gray-300 text-[12px] font-semibold text-gray-700 hover:border-gray-400 hover:bg-gray-50">
                    Suggest
                  </button>
                )}
              </div>
            </Field>
            <Field label="Name" htmlFor="v-name" error={errors.name} hint="Only you see it, to tell vouchers apart.">
              <input id="v-name" value={name} disabled={locked} maxLength={80} onChange={(e) => setName(e.target.value)} className={input(errors.name, locked)} placeholder="e.g. Payday sale" />
            </Field>
          </div>
        </Section>

        <Section n={2} title="Discount">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Type" error={undefined}>
              <div role="group" aria-label="Discount type" className="grid grid-cols-2 p-1 rounded-xl bg-gray-100/80">
                {(['fixed', 'percent'] as const).map((t) => (
                  <button key={t} type="button" disabled={locked} aria-pressed={type === t} onClick={() => setType(t)}
                    className={`min-h-8 rounded-lg text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed ${type === t ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}>
                    {t === 'fixed' ? (effectiveScope === 'shipping' ? 'Up to an amount' : 'Amount (₱)') : 'Percent (%)'}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={type === 'percent' ? 'Percentage off' : 'Amount off'} htmlFor="v-amount" error={errors.amount}>
              <div className="relative">
                {type === 'fixed' && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-gray-400">₱</span>}
                <input id="v-amount" inputMode="decimal" value={amount} disabled={locked} onChange={(e) => setAmount(e.target.value)}
                  className={input(errors.amount, locked) + (type === 'fixed' ? ' pl-7' : ' pr-8')} placeholder={type === 'percent' ? '10' : '50.00'} />
                {type === 'percent' && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-gray-400">%</span>}
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Minimum spend" htmlFor="v-min" error={errors.min_spend} hint="Counted on what the buyer pays, after sales. Leave empty for none.">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-gray-400">₱</span>
                <input id="v-min" inputMode="decimal" value={minSpend} disabled={locked} onChange={(e) => setMinSpend(e.target.value)} className={input(errors.min_spend, locked) + ' pl-7'} placeholder="300.00" />
              </div>
            </Field>
            {type === 'percent' && (
              <Field label="Cap" htmlFor="v-cap" error={errors.max_discount} hint="Optional. The most the percentage can take off.">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-gray-400">₱</span>
                  <input id="v-cap" inputMode="decimal" value={cap} disabled={locked} onChange={(e) => setCap(e.target.value)} className={input(errors.max_discount, locked) + ' pl-7'} placeholder="100.00" />
                </div>
              </Field>
            )}
          </div>
        </Section>

        <Section n={3} title="Limits">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Total uses" htmlFor="v-total" error={errors.total_limit} hint={locked ? 'Can only go up.' : 'Across every buyer. Leave empty for no limit.'}>
              <input id="v-total" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} className={input(errors.total_limit)} placeholder="No limit" />
            </Field>
            <Field label="Uses per buyer" htmlFor="v-per" error={errors.per_buyer_limit}>
              <input id="v-per" inputMode="numeric" value={perBuyer} disabled={locked} onChange={(e) => setPerBuyer(e.target.value)} className={input(errors.per_buyer_limit, locked)} />
            </Field>
          </div>
        </Section>

        <Section n={4} title="Schedule">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Starts" htmlFor="v-start" error={errors.starts_at} hint="Philippine time.">
              <input id="v-start" type="datetime-local" value={start} disabled={locked} onChange={(e) => setStart(e.target.value)} className={input(errors.starts_at, locked)} />
            </Field>
            <Field label="Ends" htmlFor="v-end" error={errors.ends_at} hint={locked ? 'Can only be extended.' : undefined}>
              <input id="v-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={input(errors.ends_at)} />
            </Field>
          </div>
          {!locked && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11.5px] text-gray-500 mr-1">Run for</span>
              {[3, 7, 14, 30].map((d) => (
                <button key={d} type="button" onClick={() => setDuration(d)} className="min-h-7 px-2.5 rounded-full border border-gray-200 text-[11.5px] font-semibold text-gray-600 hover:border-brand-red hover:text-brand-red">
                  {d} days
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section n={5} title={admin ? 'Visibility' : 'Visibility and products'}>
          <Choice value={claimable ? 'claim' : 'code'} onChange={(v) => setClaimable(v === 'claim')} disabled={locked} options={[
            { value: 'claim', title: 'Claimable', text: admin ? 'Listed on the vouchers page for buyers to claim.' : 'Shown on your shop and product pages for buyers to claim.', icon: Eye },
            { value: 'code', title: 'Code only', text: 'Never listed. Works when a buyer types the code.', icon: KeyRound },
          ]} />
          {!admin && (
            <Field label="Applies to" error={errors.product_ids}>
              <Choice value={appliesTo} onChange={setAppliesTo} disabled={locked} options={[
                { value: 'all', title: 'All my products', text: 'Any item from your shop counts toward it.', icon: Store },
                { value: 'products', title: 'Selected products', text: 'Only the items you pick below.', icon: Package },
              ]} />
              {appliesTo === 'products' && (
                <div className="mt-2 rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <Search className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                    <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search your products" aria-label="Search your products"
                      className="flex-1 min-w-0 bg-transparent text-[12.5px] outline-none" />
                    <span className="text-[11px] font-semibold text-gray-500 tabular-nums">{picked.length} picked</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                    {listed.length === 0 ? (
                      <p className="px-3 py-4 text-center text-[12.5px] text-gray-500">{live.length === 0 ? 'You have no active or draft products yet.' : 'No product matches.'}</p>
                    ) : listed.map((p) => {
                      const img = p.images?.find((i) => i.is_primary)?.url ?? p.images?.[0]?.url;
                      return (
                        <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer hover:bg-gray-50">
                          <input type="checkbox" disabled={locked} className="w-4 h-4 accent-brand-red" checked={picked.includes(p.id)}
                            onChange={() => setPicked((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]))} />
                          <span className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden shrink-0">{img && <img src={img} alt="" className="w-full h-full object-cover" />}</span>
                          <span className="truncate flex-1">{p.name}</span>
                          <span className="text-[11.5px] text-gray-500 tabular-nums shrink-0">{peso(Number(p.base_price))}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </Field>
          )}
        </Section>
      </div>
    </SidePanel>
  );
}
