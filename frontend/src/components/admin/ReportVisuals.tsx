import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartNoAxesCombined, Layers, Sparkles } from 'lucide-react';
import type { AdminReportOutlook, AdminRevenueChartPoint, CategoryBreakdownItem } from '../../types';
import { peso } from '../../utils/adminReports';

const tickMoney = (v: number) => `₱${v >= 1000000 ? `${(v / 1000000).toFixed(1)}m` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`;
const day = (iso: string) => new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
const tooltipStyle = { borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 11, boxShadow: '0 8px 24px #0000000d' };
const cardClass = 'min-w-0 rounded-2xl border border-gray-200/80 bg-white p-4 shadow-xs';
const emptyClass = 'flex h-56 items-center justify-center rounded-xl bg-stone-50 px-6 text-center text-xs leading-relaxed text-stone-500';

export default function ReportVisuals({ series, categories, outlook, loading }: {
  series: AdminRevenueChartPoint[]; categories: CategoryBreakdownItem[]; outlook: AdminReportOutlook | null; loading: boolean;
}) {
  const leaders = categories.slice(0, 6);
  const projection = outlook?.available ? [
    ...(outlook.history ?? []).map(p => ({ date: p.date, recorded: p.gmv, estimate: null as number | null })),
    { date: outlook.today!, recorded: null, estimate: null },
    ...outlook.points.map(p => ({ date: p.date, recorded: null, estimate: p.gmv })),
  ] : [];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-2">
        <section aria-label="Category sales chart" className={cardClass}>
          <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-xs font-bold uppercase tracking-wider text-gray-900">Where sales come from</h2><p className="mt-1 text-[11px] text-gray-400">Top six categories · merchandise sales, excluding shipping</p></div><Layers className="h-4 w-4 text-brand-red" /></div>
          {loading ? <div className="h-56 animate-pulse rounded-xl bg-stone-50" /> : !leaders.length ? <div className={emptyClass}>No category sales in this period.</div> : <div className="h-56 min-w-0">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={leaders} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
              <CartesianGrid horizontal={false} stroke="#f1f5f9" /><XAxis type="number" tickFormatter={tickMoney} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="category" width={110} tick={{ fontSize: 10, fill: '#57534e' }} tickFormatter={v => String(v).length > 17 ? `${String(v).slice(0, 16)}…` : String(v)} axisLine={false} tickLine={false} />
              <Tooltip formatter={v => [peso(Number(v)), 'Merchandise sales']} contentStyle={tooltipStyle} cursor={{ fill: '#fff1f2' }} />
              <Bar dataKey="gross_sales" fill="#c90024" radius={[0, 5, 5, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart></ResponsiveContainer>
          </div>}
        </section>
        <section aria-label="Seven-day estimated sales outlook" className={cardClass}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-900"><Sparkles className="h-4 w-4 text-brand-red" />Seven-day outlook</h2><p className="mt-1 text-[11px] text-gray-400">Weekday baseline · estimates shown separately from recorded sales</p></div><span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">Estimate</span></div>
          {loading ? <div className="h-56 animate-pulse rounded-xl bg-stone-50" /> : !outlook?.available ? <div className={emptyClass}>{outlook?.reason ?? 'Outlook is unavailable.'}</div> : <>
            <div className="mb-2 flex items-baseline justify-between gap-2"><span className="text-xl font-black tabular-nums text-gray-900">{peso(outlook.estimated_gmv)}</span><span className="text-[10px] text-gray-400">Estimated GMV · next seven days</span></div>
            <div className="h-44 min-w-0"><ResponsiveContainer width="100%" height="100%"><LineChart data={projection} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="#f1f5f9" strokeDasharray="3 3" /><XAxis dataKey="date" tickFormatter={day} minTickGap={38} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} /><YAxis tickFormatter={tickMoney} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip labelFormatter={v => day(String(v))} formatter={(v, name) => [peso(Number(v)), name]} contentStyle={tooltipStyle} /><Legend iconType="plainline" wrapperStyle={{ fontSize: 10 }} />
              <Line type="linear" dataKey="recorded" name="Recorded GMV" stroke="#64748b" dot={false} strokeWidth={2} isAnimationActive={false} /><Line type="linear" dataKey="estimate" name="Estimated GMV" stroke="#c90024" strokeDasharray="5 4" dot={{ r: 2 }} strokeWidth={2} isAnimationActive={false} />
            </LineChart></ResponsiveContainer></div>
          </>}
          <p className="mt-3 border-t border-stone-100 pt-3 text-[10px] leading-relaxed text-stone-500">{outlook?.method ?? 'Uses the average of each weekday over two complete weeks. Today’s partial activity is excluded. Estimates are not guaranteed results.'} Includes all recorded activity, including demo orders.</p>
        </section>
      </div>
      <section aria-label="Order activity bar chart" className={cardClass}>
        <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-xs font-bold uppercase tracking-wider text-gray-900">Order activity</h2><p className="mt-1 text-[11px] text-gray-400">All orders placed vs orders counted in sales · selected period and chart interval</p></div><ChartNoAxesCombined className="h-4 w-4 text-brand-red" /></div>
        {loading ? <div className="h-44 animate-pulse rounded-xl bg-stone-50" /> : !series.some(p => (p.orders_placed ?? 0) > 0) ? <div className="py-12 text-center text-xs text-stone-500">No order activity in this period.</div> : <div className="h-44 min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={series} margin={{ top: 0, right: 8, left: -24, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="#f1f5f9" /><XAxis dataKey="date" minTickGap={35} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} /><Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="orders_placed" name="Placed" fill="#cbd5e1" maxBarSize={16} radius={[3, 3, 0, 0]} isAnimationActive={false} /><Bar dataKey="orders_count" name="Counted in sales" fill="#c90024" maxBarSize={16} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart></ResponsiveContainer></div>}
      </section>
    </div>
  );
}
