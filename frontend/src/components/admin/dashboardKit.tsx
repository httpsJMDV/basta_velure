// The pieces of the admin dashboard's design language that other admin pages reuse (cards, count-up numbers, section
// headings, empty states), so the Orders and Reviews pages look like the dashboard and not like a second style.
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowRight, Activity } from 'lucide-react';
import { useCountUp } from '../../hooks/useDashboardAnimations';
import { NA, peso, whole } from '../../utils/adminReports';

export interface StatCardProps {
  icon: React.ElementType;
  label: string;
  /** A number is counted up and formatted; null or undefined shows "n/a"; a string is shown as is. */
  value: number | string | null | undefined;
  subtext?: string;
  /** Format the number as pesos. */
  money?: boolean;
  trendEl?: ReactNode;
  iconBg: string;
  iconColor: string;
  /** Makes the whole card a link (for example to the matching section of the reports page). */
  to?: string;
  /** Makes the whole card a button (for example a KPI that also filters a list). */
  onClick?: () => void;
  /** Marks a button card as the current filter. */
  active?: boolean;
  /** The line under the card when it is a link or a button. */
  actionLabel?: string;
  /** A smaller card for dense rows of figures. */
  compact?: boolean;
}

export function StatCard({ icon: Icon, label, value, subtext, money, trendEl, iconBg, iconColor, to, onClick, active, actionLabel, compact }: StatCardProps) {
  const numericTarget = typeof value === 'number' ? value : 0;
  const animated = useCountUp(numericTarget);
  const displayValue = typeof value === 'number'
    ? (money ? peso(animated) : whole(animated))
    : value ?? NA;

  const body = (
    <>
      <div>
        <div className={`flex items-center justify-between ${compact ? 'mb-1.5' : 'mb-2'}`}>
          <div className={`${compact ? 'w-6 h-6' : 'w-7 h-7'} rounded-lg flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
            <Icon className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} aria-hidden="true" />
          </div>
          {trendEl && <div>{trendEl}</div>}
        </div>
        <p className={`font-black leading-none tracking-tight text-gray-900 ${compact ? 'text-lg' : 'text-xl sm:text-2xl'}`}>{displayValue}</p>
        <p className={`font-bold text-gray-800 ${compact ? 'mt-1 text-[11px]' : 'mt-1 text-xs'}`}>{label}</p>
        {subtext && <p className={`text-gray-400 mt-0.5 truncate ${compact ? 'text-[10px]' : 'text-[11px]'}`}>{subtext}</p>}
      </div>
      {(to || onClick) && actionLabel && (
        <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] font-bold text-brand-red group-hover:text-[#801f1f]">
          <span>{actionLabel}</span>
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </div>
      )}
    </>
  );

  const cls = `flex flex-col justify-between ${compact ? 'p-2.5' : 'p-3.5'} bg-white border shadow-xs rounded-xl text-left`;
  const interactive = 'group transition-all duration-150 hover:shadow-sm hover:border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red';

  if (to) {
    return <Link to={to} className={`${cls} ${interactive} border-gray-200/80`}>{body}</Link>;
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={`${cls} ${interactive} ${active ? 'border-brand-red ring-1 ring-brand-red/30' : 'border-gray-200/80'}`}>
        {body}
      </button>
    );
  }
  return <div className={`${cls} border-gray-200/80`}>{body}</div>;
}

/** A placeholder with the shape of a StatCard, shown while the figures load. */
export function StatCardSkeleton() {
  return (
    <div className="bg-white border border-gray-200/80 rounded-xl p-3.5 h-[96px] animate-pulse flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div className="w-7 h-7 bg-gray-100 rounded-lg" />
        <div className="w-12 h-3.5 bg-gray-100 rounded" />
      </div>
      <div className="space-y-1.5">
        <div className="w-20 h-5 bg-gray-200 rounded" />
        <div className="w-28 h-2.5 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

export function SectionHeader({ title, to, icon: Icon }: { title: string; to?: string; icon?: React.ElementType }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <div className="flex items-center gap-2">
        <div className="w-1 h-3.5 rounded-full bg-brand-red" />
        {Icon && <Icon className="w-3.5 h-3.5 text-gray-500" aria-hidden="true" />}
        <h2 className="text-[11px] font-bold tracking-wider text-gray-800 uppercase">{title}</h2>
      </div>
      {to && (
        <Link to={to} className="text-[11px] font-bold text-brand-red hover:text-[#801f1f] flex items-center gap-1 transition-colors">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

export function ChartEmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-1.5 py-8 text-center">
      <div className="flex items-center justify-center w-8 h-8 border border-gray-100 rounded-xl bg-gray-50">
        <Activity className="w-4 h-4 text-gray-300" aria-hidden="true" />
      </div>
      <p className="text-[11px] font-semibold text-gray-500">{message}</p>
      {hint && <p className="max-w-sm text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

/** A button that sits on the dark hero band. */
export const HERO_BUTTON =
  'min-h-11 inline-flex items-center justify-center gap-2 px-3.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-semibold transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60';

/** The dark gradient band that opens an admin, hub or courier page. */
export function PageHero({ icon: Icon, eyebrow, title, subtitle, children, headingRef }: { icon: React.ElementType; eyebrow: string; title: string; subtitle?: ReactNode; children?: ReactNode; headingRef?: React.Ref<HTMLHeadingElement> }) {
  return (
    <div
      className="rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm border border-neutral-800 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0 border border-white/10">
          <Icon className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">{eyebrow}</p>
          <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="text-sm font-bold tracking-wider text-white uppercase sm:text-base focus:outline-none">{title}</h1>
          {subtitle && <p className="text-[11px] text-neutral-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

const HEADER_ACCENT = {
  rose: 'bg-rose-50 text-brand-red border-rose-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  violet: 'bg-violet-50 text-violet-600 border-violet-100',
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  sky: 'bg-sky-50 text-sky-600 border-sky-100',
  gray: 'bg-gray-50 text-gray-600 border-gray-200',
} as const;

export type HeaderAccent = keyof typeof HEADER_ACCENT;

const TAG_TONE = {
  blue: 'text-blue-700 bg-blue-50 border-blue-200',
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  rose: 'text-rose-700 bg-rose-50 border-rose-200',
  violet: 'text-violet-700 bg-violet-50 border-violet-200',
  gray: 'text-gray-500 bg-gray-50 border-gray-200',
} as const;

/** The small word in a stat card's corner ("To ship", "Live"), for StatCard's trendEl. */
export function CardTag({ tone = 'gray', children }: { tone?: keyof typeof TAG_TONE; children: ReactNode }) {
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${TAG_TONE[tone]}`}>{children}</span>;
}

/** A light header button (the seller portal's "Payouts"), and its red primary sibling. */
export const HEADER_BUTTON =
  'min-h-10 inline-flex items-center justify-center gap-2 px-3.5 rounded-xl bg-white border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40';
export const HEADER_BUTTON_PRIMARY =
  'min-h-10 inline-flex items-center justify-center gap-2 px-3.5 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/40';

/**
 * The light page header of the seller portal: a tinted icon tile, the title in small capitals with a live pill, a line
 * under it, and actions on the right. PageHero's light sibling, with the same props.
 */
export function PageHeader({ icon: Icon, title, subtitle, accent = 'rose', updatedAt, children, headingRef }: {
  icon: React.ElementType;
  title: string;
  subtitle?: ReactNode;
  accent?: HeaderAccent;
  /** When the page refreshes itself: the time of the last refresh, shown in the live pill (null while loading). */
  updatedAt?: Date | null;
  children?: ReactNode;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${HEADER_ACCENT[accent]}`}>
          <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider focus:outline-none">{title}</h1>
            {updatedAt !== undefined && <LiveSynced updatedAt={updatedAt} />}
          </div>
          {subtitle && <p className="text-[11.5px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

/** The light "Live" pill: the page refreshes itself; the time says when it last did. */
export function LiveSynced({ updatedAt }: { updatedAt: Date | null }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" role="status">
      <span className={`w-1.5 h-1.5 rounded-full ${updatedAt ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} aria-hidden="true" />
      {updatedAt ? 'Live' : 'Syncing…'}
      {updatedAt && (
        <span className="hidden font-medium text-emerald-600/80 sm:inline">
          · {updatedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })}
        </span>
      )}
    </span>
  );
}

/** "Live · updated 10:32:05": the page refreshes itself, so there is no refresh button. */
export function LiveStamp({ updatedAt }: { updatedAt: Date | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" role="status">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
      Live
      {updatedAt && (
        <span className="hidden font-medium text-emerald-200/80 sm:inline">
          · updated {updatedAt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Manila' })}
        </span>
      )}
    </span>
  );
}
