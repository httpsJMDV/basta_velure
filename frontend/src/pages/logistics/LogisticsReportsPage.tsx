import { useCallback, useEffect, useState } from 'react';
import { BarChart2, PackageCheck, AlertTriangle, Undo2, Timer, Inbox } from 'lucide-react';
import { PageHero, StatCard, StatCardSkeleton } from '../../components/admin/dashboardKit';
import { ListCard, ListError, SkeletonRows, TH, TD } from '../../components/admin/listKit';
import { getLogisticsReportsApi } from '../../api/client';
import type { LogisticsReport } from '../../types';
import { lastDays } from '../../utils/adminReports';
import { HeroStats } from '../../components/logistics/CourierKit';

const PRESETS = [7, 30, 90] as const;

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

/** A rate as a number and a short bar (green from 90%, amber from 70%, red below). */
function RateBar({ v, strong }: { v: number | null; strong?: boolean }) {
  if (v === null) return <span className="text-gray-400">—</span>;
  const p = Math.round(v * 100);
  const tone = p >= 90 ? 'bg-emerald-500' : p >= 70 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="hidden sm:block w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true"><span className={`block h-full ${tone}`} style={{ width: `${p}%` }} /></span>
      <span className={`tabular-nums ${strong ? 'font-bold' : ''}`}>{p}%</span>
    </span>
  );
}

/** Every hub of the network side by side over a period, with network totals. */
export default function LogisticsReportsPage() {
  const [days, setDays] = useState<(typeof PRESETS)[number]>(30);
  const [report, setReport] = useState<LogisticsReport | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setReport(null);
    const range = lastDays(days);
    getLogisticsReportsApi({ from: range.from, to: range.to }).then(setReport).catch(() => setFailed(true));
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const t = report?.totals;

  return (
    <div className="w-full pb-8 space-y-4">
      <PageHero icon={BarChart2} eyebrow="Insights" title="Network Reports" subtitle={report ? `${report.range.from} to ${report.range.to} · Philippine time` : 'Your hubs side by side'}>
        {t && (
          <HeroStats items={[
            { label: 'Delivered', value: t.delivered, tone: 'good' },
            { label: 'Success', value: pct(t.success_rate) },
            { label: 'On time', value: pct(t.on_time_rate) },
          ]} />
        )}
        <div className="inline-flex p-0.5 rounded-xl bg-white/10 border border-white/10" role="group" aria-label="Period">
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => setDays(p)} aria-pressed={days === p}
              className={`h-9 px-3 rounded-lg text-xs font-semibold transition-colors ${days === p ? 'bg-white text-gray-900' : 'text-white/80 hover:text-white'}`}>
              {p} days
            </button>
          ))}
        </div>
      </PageHero>

      {failed ? <ListError message="The report could not be loaded." onRetry={load} /> : (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
            {!t ? [1, 2, 3, 4, 5].map((i) => <StatCardSkeleton key={i} />) : (
              <>
                <StatCard compact icon={Inbox} label="Received at hubs" value={t.received} iconBg="bg-sky-50" iconColor="text-sky-600" />
                <StatCard compact icon={PackageCheck} label="Delivered" value={t.delivered} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
                <StatCard compact icon={AlertTriangle} label="Failed attempts" value={t.failed_attempts} iconBg="bg-red-50" iconColor="text-red-600" />
                <StatCard compact icon={Undo2} label="Returned" value={t.returned} iconBg="bg-amber-50" iconColor="text-amber-600" />
                <StatCard compact icon={Timer} label="On time" value={pct(t.on_time_rate)} subtext={`Within ${report?.sla_hours ?? 48} h of intake`} iconBg="bg-violet-50" iconColor="text-violet-600" />
              </>
            )}
          </div>

          <ListCard title="By hub" count={report?.hubs.length}>
            <div className="overflow-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>Hub</th>
                    <th scope="col" className={`${TH} text-right`}>Received</th>
                    <th scope="col" className={`${TH} text-right`}>Delivered</th>
                    <th scope="col" className={`${TH} text-right`}>Failed</th>
                    <th scope="col" className={`${TH} text-right`}>Returned</th>
                    <th scope="col" className={`${TH} text-right`}>Success</th>
                    <th scope="col" className={`${TH} text-right`}>On time</th>
                    <th scope="col" className={`${TH} text-right hidden md:table-cell`}>Avg delivery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {!report && <SkeletonRows cols={8} rows={4} />}
                  {report && report.hubs.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-[13px] text-gray-400">No active hubs yet.</td></tr>
                  )}
                  {report?.hubs.map((h) => (
                    <tr key={h.hub_id} className="hover:bg-gray-50/60">
                      <td className={`${TD} font-semibold text-gray-900`}>{h.hub_name}</td>
                      <td className={`${TD} text-right tabular-nums`}>{h.received}</td>
                      <td className={`${TD} text-right tabular-nums`}>{h.delivered}</td>
                      <td className={`${TD} text-right tabular-nums ${h.failed_attempts > 0 ? 'text-red-600' : ''}`}>{h.failed_attempts}</td>
                      <td className={`${TD} text-right tabular-nums`}>{h.returned}</td>
                      <td className={`${TD} text-right`}><RateBar v={h.success_rate} /></td>
                      <td className={`${TD} text-right`}><RateBar v={h.on_time_rate} strong /></td>
                      <td className={`${TD} text-right tabular-nums hidden md:table-cell text-gray-600`}>{h.avg_delivery_hours === null ? '—' : `${h.avg_delivery_hours} h`}</td>
                    </tr>
                  ))}
                </tbody>
                {t && report && report.hubs.length > 1 && (
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50/60">
                      <td className={`${TD} font-bold text-gray-900`}>Network</td>
                      <td className={`${TD} text-right tabular-nums font-semibold`}>{t.received}</td>
                      <td className={`${TD} text-right tabular-nums font-semibold`}>{t.delivered}</td>
                      <td className={`${TD} text-right tabular-nums font-semibold`}>{t.failed_attempts}</td>
                      <td className={`${TD} text-right tabular-nums font-semibold`}>{t.returned}</td>
                      <td className={`${TD} text-right tabular-nums font-semibold`}>{pct(t.success_rate)}</td>
                      <td className={`${TD} text-right tabular-nums font-bold`}>{pct(t.on_time_rate)}</td>
                      <td className={`${TD} hidden md:table-cell`} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </ListCard>
        </>
      )}
    </div>
  );
}
