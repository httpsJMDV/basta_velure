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
}

export function StatCard({ icon: Icon, label, value, subtext, money, trendEl, iconBg, iconColor, to, onClick, active, actionLabel }: StatCardProps) {
  const numericTarget = typeof value === 'number' ? value : 0;
  const animated = useCountUp(numericTarget);
  const displayValue = typeof value === 'number'
    ? (money ? peso(animated) : whole(animated))
    : value ?? NA;

  const body = (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          </div>
          {trendEl && <div>{trendEl}</div>}
        </div>
        <p className="text-xl font-black leading-none tracking-tight text-gray-900 sm:text-2xl">{displayValue}</p>
        <p className="mt-1 text-xs font-bold text-gray-800">{label}</p>
        {subtext && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{subtext}</p>}
      </div>
      {(to || onClick) && actionLabel && (
        <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] font-bold text-brand-red group-hover:text-[#801f1f]">
          <span>{actionLabel}</span>
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </div>
      )}
    </>
  );

  const cls = 'flex flex-col justify-between p-3.5 bg-white border shadow-xs rounded-xl text-left';
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

/** The dark gradient band that opens an admin page. */
export function PageHero({ icon: Icon, eyebrow, title, subtitle, children }: { icon: React.ElementType; eyebrow: string; title: string; subtitle?: ReactNode; children?: ReactNode }) {
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
          <h1 className="text-sm font-bold tracking-wider text-white uppercase sm:text-base">{title}</h1>
          {subtitle && <p className="text-[11px] text-neutral-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
