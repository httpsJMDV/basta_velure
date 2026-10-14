import type { ElementType, ReactNode } from 'react';

/**
 * The rider portal's building blocks. They follow the seller dashboard: white cards with a hairline border, a small
 * colored icon chip, tight uppercase section headings, and brand red as the only accent.
 */

export type Tone = 'red' | 'emerald' | 'amber' | 'gray';

const TONE: Record<Tone, string> = {
  red: 'bg-rose-50 text-brand-red border-rose-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
};

export function IconChip({ icon: Icon, tone = 'red', size = 'md' }: { icon: ElementType; tone?: Tone; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'w-7 h-7 rounded-lg' : 'w-9 h-9 rounded-xl';
  return (
    <div className={`${box} ${TONE[tone]} border flex items-center justify-center shrink-0`}>
      <Icon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden="true" />
    </div>
  );
}

interface PageHeroProps {
  icon: ElementType;
  title: string;
  subtitle?: string;
  /** Buttons or a status chip, shown on the right on wide screens and below on phones. */
  actions?: ReactNode;
}

/** The bar at the top of every rider page. */
export function PageHero({ icon, title, subtitle, actions }: PageHeroProps) {
  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
      <div className="flex items-center gap-3 min-w-0">
        <IconChip icon={icon} />
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-gray-900 uppercase tracking-wider truncate">{title}</h1>
          {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">{actions}</div>}
    </div>
  );
}

interface KpiTileProps {
  icon: ElementType;
  tone?: Tone;
  label: string;
  value: string;
  hint?: string;
  /** A short pill in the corner, such as "Today". */
  tag?: string;
}

export function KpiTile({ icon, tone = 'red', label, value, hint, tag }: KpiTileProps) {
  return (
    <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between min-w-0">
      <div className="flex items-center justify-between mb-2">
        <IconChip icon={icon} tone={tone} size="sm" />
        {tag && <span className="text-[10px] font-bold text-gray-500">{tag}</span>}
      </div>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none truncate">{value}</p>
        <p className="text-xs font-bold text-gray-800 mt-1">{label}</p>
        {hint && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{hint}</p>}
      </div>
    </div>
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs h-24 flex flex-col justify-between">
          <div className="w-7 h-7 bg-gray-100 rounded-lg" />
          <div className="space-y-1">
            <div className="w-16 h-5 bg-gray-200 rounded" />
            <div className="w-24 h-2.5 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface SectionCardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function SectionCard({ title, subtitle, action, children, className = '', id }: SectionCardProps) {
  return (
    <section aria-labelledby={id} className={`bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3 ${className}`}>
      <div className="flex items-start justify-between gap-3 pb-2 border-b border-gray-100">
        <div className="min-w-0">
          <h2 id={id} className="text-xs font-bold text-gray-900 uppercase tracking-wider">
            {title}
          </h2>
          {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

interface TabDef<K extends string> {
  key: K;
  label: string;
  count?: number;
}

interface TabBarProps<K extends string> {
  tabs: TabDef<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  /** Gives each tab the id "<idPrefix>-<key>" so a panel can point back with aria-labelledby. */
  idPrefix?: string;
  /** The id of the tabpanel the tabs control (one id, or one per tab). */
  panelId?: string | ((key: K) => string);
}

/** Pill tabs: the active one is a white chip with red text, like the seller order tabs. */
export function TabBar<K extends string>({ tabs, value, onChange, label, idPrefix, panelId }: TabBarProps<K>) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 bg-gray-100 p-1 rounded-xl">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-${tab.key}` : undefined}
            aria-selected={active}
            aria-controls={typeof panelId === 'function' ? panelId(tab.key) : panelId}
            onClick={() => onChange(tab.key)}
            className={`flex-1 min-h-10 px-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
              active ? 'bg-white text-brand-red shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span className="truncate">{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black inline-flex items-center justify-center ${
                  active ? 'bg-brand-red text-white' : 'bg-white text-gray-600'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface StateCardProps {
  icon: ElementType;
  title: string;
  message: string;
  tone?: Tone;
  /** Announce the panel to screen readers (use for errors). */
  alert?: boolean;
  children?: ReactNode;
}

/** Empty and error panels: icon chip, one bold line, one sentence, an optional next action. */
export function StateCard({ icon, title, message, tone = 'gray', alert = false, children }: StateCardProps) {
  return (
    <div role={alert ? 'alert' : undefined} className="bg-white border border-gray-200/80 rounded-2xl p-8 sm:p-10 text-center shadow-xs space-y-3 max-w-lg mx-auto w-full">
      <div className="flex justify-center">
        <IconChip icon={icon} tone={tone} />
      </div>
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      <p className="text-xs text-gray-600 leading-relaxed">{message}</p>
      {children}
    </div>
  );
}
