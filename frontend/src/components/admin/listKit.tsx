// The shared pieces of the admin list pages (applications, sellers, buyers, riders): one filter panel, status tabs,
// a table card with a sticky header, status pills, pagination and the empty, loading and error states, so every
// list reads like the Orders page and not like its own design.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Search, X, ChevronLeft, ChevronRight, AlertCircle, SearchX, LayoutGrid, List, CheckCircle2, Hourglass } from 'lucide-react';
import CustomSelect from '../ui/CustomSelect';
import { whole } from '../../utils/adminReports';

export interface ListMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatShortDate(iso);
}

/**
 * The text in a search box, committed after typing pauses. `committed` is the value in force (usually a URL
 * parameter); `onCommit` runs once the input has differed from it for `delay` ms.
 */
export function useDebouncedSearch(committed: string, onCommit: (value: string) => void, delay = 350) {
  const [input, setInput] = useState(committed);
  const commitRef = useRef(onCommit);
  useEffect(() => { commitRef.current = onCommit; });

  // Follow outside changes (a tab switch that clears the search, the back button).
  useEffect(() => { setInput(committed); }, [committed]);

  useEffect(() => {
    if (input.trim() === committed) return;
    const id = window.setTimeout(() => commitRef.current(input.trim()), delay);
    return () => window.clearTimeout(id);
  }, [input, committed, delay]);

  return [input, setInput] as const;
}

/** The white panel that holds a page's tabs, search box and dropdowns. */
export function FilterPanel({ children }: { children: ReactNode }) {
  return <div className="p-3 space-y-3 bg-white border shadow-xs border-gray-200/80 rounded-2xl">{children}</div>;
}

export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative flex-1">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={placeholder}
        className="w-full min-h-[44px] pl-10 pr-9 text-sm bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-transparent"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-700">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export interface TabOption<T extends string> {
  value: T;
  label: string;
  /** Shown in a small bubble; undefined hides it, null shows "…" while it loads. */
  count?: number | null;
}

/** Status filters as pills with their counts. */
export function StatusTabs<T extends string>({ options, value, onChange, label }: { options: TabOption<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${
              active ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={`px-1.5 rounded-full text-[10px] ${active ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
                {o.count === null ? '…' : whole(o.count)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** The card around a list: optional title row, then the table (md and up) and the cards (below md). */
export function ListCard({ title, count, busy, children }: { title?: string; count?: number; busy?: boolean; children: ReactNode }) {
  return (
    <div className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl" aria-busy={busy}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-1 h-3.5 rounded-full bg-brand-red" />
            <h2 className="text-[11px] font-bold tracking-wider text-gray-800 uppercase">{title}</h2>
          </div>
          {count !== undefined && <span className="text-[11px] font-semibold text-gray-400">{whole(count)} total</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/** Header cell classes: sticky, small caps, on a light band. */
export const TH = 'sticky top-0 z-10 px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-100 whitespace-nowrap';
export const TD = 'px-4 py-2.5 align-middle';
export const ROW = 'cursor-pointer transition-colors hover:bg-red-50/40 focus:outline-none focus-visible:bg-red-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-red';

/** Lets a table row open its record with Enter or Space as well as a click. */
export function rowKeys(open: () => void) {
  return {
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
  };
}

export function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="animate-pulse">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-4 py-3.5"><div className={`h-3 bg-gray-100 rounded ${c === 0 ? 'w-40' : 'w-3/4'}`} /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 space-y-2 animate-pulse">
          <div className="w-1/2 h-3 bg-gray-100 rounded" />
          <div className="w-3/4 h-3 bg-gray-100 rounded" />
          <div className="w-1/3 h-3 bg-gray-100 rounded" />
        </div>
      ))}
    </>
  );
}

export function ListEmpty({ icon: Icon, title, hint, filtered, onClear }: { icon: React.ElementType; title: string; hint?: string; filtered?: boolean; onClear?: () => void }) {
  const Shown = filtered ? SearchX : Icon;
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <div className="flex items-center justify-center w-10 h-10 border border-gray-100 rounded-xl bg-gray-50">
        <Shown className="w-5 h-5 text-gray-300" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-gray-700">{filtered ? 'Nothing matches this search' : title}</p>
      <p className="max-w-sm text-xs text-gray-400">{filtered ? 'Try another name or email, or clear the search.' : hint}</p>
      {filtered && onClear && <button type="button" onClick={onClear} className="text-xs font-bold text-brand-red hover:underline">Clear search</button>}
    </div>
  );
}

export function ListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-red-800 border border-red-200 bg-red-50 rounded-xl">
      <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />{message}</span>
      <button type="button" onClick={onRetry} className="px-3 py-1 text-xs font-bold text-white rounded-lg bg-brand-red hover:bg-[#8e2424] shrink-0">Retry</button>
    </div>
  );
}

const PILL_TONES = {
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
} as const;

const DOT_TONES: Record<keyof typeof PILL_TONES, string> = {
  amber: 'bg-amber-500', emerald: 'bg-emerald-500', red: 'bg-red-500', gray: 'bg-gray-400', blue: 'bg-blue-500', violet: 'bg-violet-500',
};

export type PillTone = keyof typeof PILL_TONES;

/** A status as a dot and a word, never colour alone. */
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${PILL_TONES[tone]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${DOT_TONES[tone]}`} aria-hidden="true" />
      {children}
    </span>
  );
}

const AVATAR_TONES = ['bg-rose-100 text-rose-700', 'bg-amber-100 text-amber-700', 'bg-emerald-100 text-emerald-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-stone-200 text-stone-700'];

const AVATAR_SIZES = {
  sm: { box: 'w-8 h-8 rounded-lg', text: 'text-[11px]', icon: 'w-4 h-4' },
  md: { box: 'w-10 h-10 rounded-xl', text: 'text-xs', icon: 'w-5 h-5' },
  lg: { box: 'w-12 h-12 rounded-xl', text: 'text-sm', icon: 'w-5 h-5' },
  xl: { box: 'w-14 h-14 rounded-2xl', text: 'text-base', icon: 'w-6 h-6' },
} as const;

/**
 * The person's uploaded photo; without one (or when it fails to load) their initials on a colour picked from the
 * name, so the same person always gets the same one. `icon` replaces the initials (a shop or a hub).
 */
export function Avatar({ name, src, icon: Icon, size = 'sm' }: { name: string; src?: string | null; icon?: React.ElementType; size?: keyof typeof AVATAR_SIZES }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  const s = AVATAR_SIZES[size];

  if (src && !broken) {
    return <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className={`object-cover border border-gray-200 bg-gray-50 shrink-0 ${s.box}`} />;
  }
  const tone = AVATAR_TONES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  return (
    <div className={`flex items-center justify-center font-bold shrink-0 ${s.box} ${s.text} ${tone}`} aria-hidden="true">
      {Icon ? <Icon className={s.icon} /> : initials}
    </div>
  );
}

export type ViewMode = 'grid' | 'list';

/** Grid or list, remembered per page in this browser. */
export function useViewMode(key: string, fallback: ViewMode = 'grid') {
  const storageKey = `admin_view_${key}`;
  const [mode, setMode] = useState<ViewMode>(() => {
    try { const v = localStorage.getItem(storageKey); return v === 'grid' || v === 'list' ? v : fallback; } catch { return fallback; }
  });
  const change = (next: ViewMode) => {
    setMode(next);
    try { localStorage.setItem(storageKey, next); } catch { /* private window */ }
  };
  return [mode, change] as const;
}

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const opt = (v: ViewMode, Icon: React.ElementType, label: string) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={value === v}
      aria-label={label}
      title={label}
      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${
        value === v ? 'bg-white text-brand-red shadow-xs' : 'text-gray-400 hover:text-gray-700'
      }`}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
    </button>
  );
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-gray-100 border border-gray-200 shrink-0" role="group" aria-label="Layout">
      {opt('grid', LayoutGrid, 'Grid view')}
      {opt('list', List, 'List view')}
    </div>
  );
}

/** The white card of the left rail (overview figures, checklists). */
export function RailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="p-3 bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-1 h-3.5 rounded-full bg-brand-red" />
        <h2 className="text-[11px] font-bold tracking-wider text-gray-800 uppercase">{title}</h2>
      </div>
      {children}
    </div>
  );
}

/** A two-part bar (e.g. active against suspended) with its legend. */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="space-y-2">
      <div className="flex h-2 overflow-hidden bg-gray-100 rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
        {total > 0 && parts.map((p) => <div key={p.label} className={p.color} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <ul className="space-y-1">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-gray-600"><span className={`w-2 h-2 rounded-full ${p.color}`} aria-hidden="true" />{p.label}</span>
            <span className="font-semibold text-gray-800 tabular-nums">
              {whole(p.value)} <span className="font-normal text-gray-400">{total > 0 ? `${Math.round((p.value / total) * 100)}%` : ''}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A short list of what to check before deciding, shown beside a review queue. */
export function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-[11px] leading-relaxed text-gray-600">
          <CheckCircle2 className="w-3.5 h-3.5 mt-px text-emerald-500 shrink-0" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

/** How long an application has waited, coloured once it waits too long. */
export function WaitingBadge({ since }: { since: string | null | undefined }) {
  if (!since) return null;
  const days = Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000);
  const tone = days >= 5 ? 'bg-red-50 text-red-700 border-red-200' : days >= 2 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-500 border-gray-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${tone}`}>
      <Hourglass className="w-3 h-3" aria-hidden="true" />
      {days < 1 ? 'Waiting < 1 day' : `Waiting ${days} ${days === 1 ? 'day' : 'days'}`}
    </span>
  );
}

/** A small document or detail tag on a queue card. */
export function DocChip({ icon: Icon, label, ok = true }: { icon: React.ElementType; label: string; ok?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${ok ? 'bg-gray-50 text-gray-600 border-gray-200' : 'bg-white text-gray-300 border-dashed border-gray-200 line-through'}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />{label}
    </span>
  );
}

/** The grid that holds profile or queue cards. */
export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 2xl:grid-cols-3">{children}</div>;
}

/** The outer card shape every profile and queue card shares. */
export function TileShell({ onOpen, dimmed, children }: { onOpen: () => void; dimmed?: boolean; children: ReactNode }) {
  return (
    <div
      {...rowKeys(onOpen)}
      className={`group flex flex-col bg-white border border-gray-200/80 rounded-2xl shadow-xs cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-brand-red/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${dimmed ? 'opacity-60' : ''}`}
    >
      {children}
    </div>
  );
}

export function SkeletonTiles({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 space-y-3 bg-white border border-gray-200/80 rounded-2xl animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-100 rounded-xl" />
            <div className="flex-1 space-y-1.5"><div className="w-2/3 h-3 bg-gray-200 rounded" /><div className="w-1/2 h-2.5 bg-gray-100 rounded" /></div>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded" />
          <div className="w-3/4 h-2.5 bg-gray-100 rounded" />
        </div>
      ))}
    </>
  );
}

/** A small outlined row action, so a column of them does not shout. */
export function RowAction({ children, onClick, tone = 'brand', loading, label }: { children: ReactNode; onClick: () => void; tone?: 'brand' | 'danger' | 'success'; loading?: boolean; label?: string }) {
  const tones = {
    brand: 'text-brand-red border-brand-red/30 hover:bg-brand-red hover:text-white hover:border-brand-red',
    danger: 'text-red-700 border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600',
    success: 'text-emerald-700 border-emerald-200 hover:bg-emerald-600 hover:text-white hover:border-emerald-600',
  };
  return (
    <button
      type="button"
      aria-label={label}
      disabled={loading}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onKeyDown={(e) => e.stopPropagation()}
      className={`inline-flex items-center justify-center gap-1 min-h-[32px] px-3 rounded-lg border bg-white text-xs font-bold transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${tones[tone]}`}
    >
      {loading ? '…' : children}
    </button>
  );
}

/** The footer of a list card: the range shown, rows per page and the page buttons. */
export function ListPager({ meta, perPage, perPageOptions, onPage, onPerPage, noun }: {
  meta: ListMeta; perPage: number; perPageOptions: number[]; onPage: (p: number) => void; onPerPage: (n: number) => void; noun: [string, string];
}) {
  const { current_page, last_page, total, from, to } = meta;
  if (total === 0) return null;

  const pages: (number | '…')[] = [];
  if (last_page <= 7) {
    for (let i = 1; i <= last_page; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current_page > 3) pages.push('…');
    for (let i = Math.max(2, current_page - 1); i <= Math.min(last_page - 1, current_page + 1); i++) pages.push(i);
    if (current_page < last_page - 2) pages.push('…');
    pages.push(last_page);
  }

  const btn = 'w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red';

  return (
    <div className="flex flex-col items-center justify-between gap-2 px-4 py-2.5 border-t border-gray-100 sm:flex-row">
      <p className="text-[12px] text-gray-500">
        Showing <span className="font-semibold text-gray-800">{from ?? 0}–{to ?? 0}</span> of{' '}
        <span className="font-semibold text-gray-800">{whole(total)}</span> {total === 1 ? noun[0] : noun[1]}
      </p>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-500">Rows</span>
          <CustomSelect
            value={String(perPage)}
            onChange={(v) => onPerPage(Number(v))}
            options={perPageOptions.map((n) => ({ value: String(n), label: String(n) }))}
            className="w-20"
          />
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onPage(current_page - 1)} disabled={current_page <= 1} aria-label="Previous page" className={`${btn} border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40`}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`e-${i}`} className="flex items-center justify-center w-8 h-8 text-xs text-gray-400">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p)}
                aria-current={p === current_page ? 'page' : undefined}
                className={`${btn} ${p === current_page ? 'bg-brand-red text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" onClick={() => onPage(current_page + 1)} disabled={current_page >= last_page} aria-label="Next page" className={`${btn} border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40`}>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
