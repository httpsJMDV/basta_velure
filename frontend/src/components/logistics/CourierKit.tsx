// The courier console's own pieces, on top of the admin kit (PageHero, StatCard, listKit): figures on the dark hero
// band, a panel with a header, the parcel pipeline, and who among the riders can take a job right now.
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, Radio, WifiOff } from 'lucide-react';
import { getDispatchRidersApi, type DispatchRider } from '../../api/courierOps';
import { whole } from '../../utils/adminReports';

type Tone = 'default' | 'good' | 'warn' | 'bad';
const VALUE_TONE: Record<Tone, string> = { default: 'text-white', good: 'text-emerald-300', warn: 'text-amber-300', bad: 'text-red-300' };

/** Figures on the hero band: a label over a number, side by side. */
export function HeroStats({ items }: { items: { label: string; value: ReactNode; tone?: Tone }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-[88px] rounded-xl bg-white/[0.07] border border-white/10 px-3 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45 whitespace-nowrap">{i.label}</p>
          <p className={`text-[15px] font-black leading-tight tabular-nums ${VALUE_TONE[i.tone ?? 'default']}`}>
            {typeof i.value === 'number' ? whole(i.value) : i.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/** A white panel with a title row (icon, title, line under it) and room for actions on the right. */
export function Panel({ title, subtitle, icon: Icon, actions, children, className = '', bodyClassName = '' }: {
  title: ReactNode; subtitle?: ReactNode; icon?: React.ElementType; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={`bg-white border border-gray-200/80 rounded-2xl shadow-xs overflow-hidden ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && <span className="w-8 h-8 rounded-xl bg-rose-50 text-brand-red flex items-center justify-center shrink-0"><Icon className="w-4 h-4" aria-hidden="true" /></span>}
          <div className="min-w-0">
            <h2 className="text-[13.5px] font-bold text-gray-900 truncate">{title}</h2>
            {subtitle && <p className="text-[11.5px] text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

const STEP_TONE: Record<string, string> = {
  sky: 'bg-sky-50 text-sky-600 ring-sky-100', violet: 'bg-violet-50 text-violet-600 ring-violet-100', amber: 'bg-amber-50 text-amber-600 ring-amber-100',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100', red: 'bg-red-50 text-red-600 ring-red-100', gray: 'bg-gray-100 text-gray-600 ring-gray-200',
};

/** Where parcels are, as steps left to right; each step can open the page that works on it. */
export function Pipeline({ steps }: { steps: { label: string; value: number | null; hint?: string; icon: React.ElementType; tone: keyof typeof STEP_TONE; to?: string }[] }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {steps.map((s, i) => {
        const body = (
          <>
            <span className={`w-10 h-10 rounded-xl ring-1 flex items-center justify-center shrink-0 ${STEP_TONE[s.tone]}`}><s.icon className="w-5 h-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">{s.label}</span>
              <span className="block text-2xl font-black leading-tight tabular-nums text-gray-900">{s.value === null ? '—' : whole(s.value)}</span>
              {s.hint && <span className="block text-[11.5px] text-gray-500 truncate">{s.hint}</span>}
            </span>
            {s.to && <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-red shrink-0" aria-hidden="true" />}
          </>
        );
        const cls = 'group relative flex items-center gap-3 h-full rounded-2xl border border-gray-200/80 bg-white px-4 py-3.5 shadow-xs';
        return (
          <li key={s.label} className="relative">
            {s.to ? <Link to={s.to} className={`${cls} transition-colors hover:border-gray-300 hover:shadow-sm`}>{body}</Link> : <div className={cls}>{body}</div>}
            {i < steps.length - 1 && (
              <span className="hidden xl:flex absolute -right-[13px] top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-gray-50 border border-gray-200 items-center justify-center text-gray-400" aria-hidden="true">
                <ArrowRight className="w-3 h-3" />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The company's riders who can take a job now (Active, Online, under the job limit) and the rest, with why. */
export function useRiderAvailability() {
  const [state, setState] = useState<{ available: DispatchRider[]; unavailable: DispatchRider[]; max: number } | null>(null);
  const load = useCallback(() => {
    getDispatchRidersApi().then((r) => setState({ available: r.data, unavailable: r.unavailable, max: r.max_active_jobs })).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  return { riders: state, reload: load };
}

/** A strip that says how many riders can take a job, and what to do when none can. */
export function RiderAvailabilityStrip({ riders }: { riders: { available: DispatchRider[]; unavailable: DispatchRider[] } | null }) {
  if (!riders) return null;
  const total = riders.available.length + riders.unavailable.length;
  const online = riders.available.length;
  if (total === 0) {
    return (
      <p className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
        <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
        You have no active riders yet. <Link to="/logistics/riders" className="font-bold underline underline-offset-2">Add a rider</Link>
      </p>
    );
  }
  if (online === 0) {
    // Why nobody can: the API's reason per rider (Offline, the job limit, Suspended).
    const offline = riders.unavailable.filter((r) => !r.online && r.status !== 'SUSPENDED').length;
    const suspended = riders.unavailable.filter((r) => r.status === 'SUSPENDED').length;
    const full = total - offline - suspended;
    const why = [
      offline && `${offline} offline`,
      full && `${full} at the job limit`,
      suspended && `${suspended} suspended`,
    ].filter(Boolean).join(', ');
    return (
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
        <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>
          <b>No rider can take a job right now.</b> Of your {total} riders: {why}.
          {offline > 0 && ' A rider goes online in the rider app.'}
        </span>
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[12.5px] text-emerald-900">
      <Radio className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span><b>{online} of {total}</b> riders can take a job now: {riders.available.slice(0, 4).map((r) => r.name).join(', ')}{online > 4 ? ` and ${online - 4} more` : ''}.</span>
    </p>
  );
}
