import { useEffect, useId, useRef, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import type { HubReportDailyRow } from '../../../types';
import { formatDay } from './reportFormat';

interface Series {
  key: 'received' | 'delivered' | 'failed' | 'returned';
  label: string;
  color: string;
}

const SERIES: Series[] = [
  { key: 'received', label: 'Received', color: '#3b82f6' },
  { key: 'delivered', label: 'Delivered', color: '#10b981' },
  { key: 'failed', label: 'Failed attempts', color: '#ef4444' },
  { key: 'returned', label: 'Returned', color: '#f59e0b' },
];

const HEIGHT = 280;
const TOP = 12;
const BOTTOM = 32;
const AXIS_WIDTH = 34;
const GRID_LINES = 4;
const MIN_COLUMN = 18; // a long range scrolls sideways rather than squeezing the bars
const MAX_GROUP = 56;

/** A round step so the axis ends on a tidy number (1, 2, 5, 10, 20, 50 ...). */
function niceStep(value: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(Math.max(value, 1))));
  const fraction = value / exp;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * exp;
}

interface DailyChartProps {
  daily: HubReportDailyRow[];
  /** Hide the heading and the chart/table switch, for a chart inside another card. */
  bare?: boolean;
  height?: number;
}

/**
 * Parcels per day as grouped bars drawn with plain SVG (no chart library). The chart fills the width of its card (it
 * used to sit in a fixed 22 px per day and leave the right of the card empty); a long range scrolls sideways. The numbers
 * are also available as a table, which is what assistive technology and a printed copy should rely on.
 */
export default function DailyChart({ daily, bare = false, height = HEIGHT }: DailyChartProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [hover, setHover] = useState<number | null>(null);
  const [available, setAvailable] = useState(0);
  const captionId = useId();
  const holderRef = useRef<HTMLDivElement | null>(null);

  // Measure the room the chart has, and follow the card as the window or sidebar changes size.
  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const measure = () => setAvailable(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [view]);

  const max = Math.max(0, ...daily.flatMap((d) => SERIES.map((s) => d[s.key])));
  const step = max <= GRID_LINES ? 1 : niceStep(max / GRID_LINES);
  const top = Math.max(step * GRID_LINES, GRID_LINES);
  const plotHeight = height - TOP - BOTTOM;
  const y = (value: number) => TOP + plotHeight - (value / top) * plotHeight;

  const count = Math.max(daily.length, 1);
  const plotWidth = Math.max(available - AXIS_WIDTH, count * MIN_COLUMN);
  const column = plotWidth / count;
  const group = Math.min(column * 0.76, MAX_GROUP);
  const bar = group / SERIES.length;
  const labelEvery = Math.max(1, Math.ceil(56 / column));

  const totals = SERIES.map((s) => ({ ...s, total: daily.reduce((sum, d) => sum + d[s.key], 0) }));
  const hovered = hover !== null ? daily[hover] : null;

  const body = daily.length === 0 ? (
    <p className="py-12 text-sm text-center text-gray-500">No days in this range.</p>
  ) : view === 'chart' ? (
    <div ref={holderRef} className="relative w-full">
      <div className="overflow-x-auto">
        <svg
          width={AXIS_WIDTH + plotWidth}
          height={height}
          role="img"
          aria-label={`Bar chart of parcels per day from ${formatDay(daily[0].date)} to ${formatDay(daily[daily.length - 1].date)}. Switch to Table for the exact numbers.`}
          onMouseLeave={() => setHover(null)}
        >
          {/* Value axis and gridlines */}
          {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
            const value = (top / GRID_LINES) * i;
            return (
              <g key={i}>
                <line x1={AXIS_WIDTH} x2={AXIS_WIDTH + plotWidth} y1={y(value)} y2={y(value)} stroke={i === 0 ? '#d1d5db' : '#f0f1f3'} strokeDasharray={i === 0 ? undefined : '3 4'} />
                <text x={AXIS_WIDTH - 8} y={y(value) + 3.5} textAnchor="end" fontSize="10.5" fill="#6b7280" aria-hidden="true">
                  {Math.round(value)}
                </text>
              </g>
            );
          })}

          {daily.map((d, i) => {
            const colX = AXIS_WIDTH + i * column;
            const x0 = colX + (column - group) / 2;
            const summary = `${formatDay(d.date)}: ${SERIES.map((s) => `${s.label} ${d[s.key]}`).join(', ')}`;
            return (
              <g key={d.date} onMouseEnter={() => setHover(i)}>
                <title>{summary}</title>
                <rect x={colX} y={TOP} width={column} height={plotHeight} fill={hover === i ? '#f9fafb' : 'transparent'} />
                {SERIES.map((s, j) =>
                  d[s.key] > 0 ? (
                    <rect key={s.key} x={x0 + j * bar + 0.5} y={y(d[s.key])} width={Math.max(bar - 1.5, 2)} height={TOP + plotHeight - y(d[s.key])} fill={s.color} rx={Math.min(3, bar / 2)} />
                  ) : null
                )}
                {i % labelEvery === 0 && (
                  <text x={colX + column / 2} y={height - 11} textAnchor="middle" fontSize="10.5" fill="#6b7280" aria-hidden="true">
                    {formatDay(d.date, false)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {hovered && hover !== null && (
        <div
          className="absolute z-10 px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl shadow-lg pointer-events-none top-2 min-w-[9.5rem]"
          style={{ left: Math.min(Math.max(AXIS_WIDTH + hover * column + column / 2 - 76, AXIS_WIDTH), Math.max(available - 160, AXIS_WIDTH)) }}
          aria-hidden="true"
        >
          <p className="mb-1 font-bold text-gray-900">{formatDay(hovered.date)}</p>
          {SERIES.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-4 text-gray-600">
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: s.color }} />{s.label}</span>
              <span className="font-bold tabular-nums text-gray-900">{hovered[s.key]}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  ) : (
    <div className="overflow-auto border border-gray-200 max-h-96 rounded-xl">
      <table className="w-full text-sm">
        <caption className="sr-only">Parcels per day, with a total row</caption>
        <thead className="sticky top-0 text-xs text-gray-600 bg-gray-50">
          <tr>
            <th scope="col" className="px-3 py-2 font-bold text-left">Date</th>
            {SERIES.map((s) => (
              <th key={s.key} scope="col" className="px-3 py-2 font-bold text-right">{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {daily.map((d) => (
            <tr key={d.date}>
              <th scope="row" className="px-3 py-1.5 font-semibold text-left text-gray-800 whitespace-nowrap">{formatDay(d.date)}</th>
              {SERIES.map((s) => (
                <td key={s.key} className={`text-right px-3 py-1.5 tabular-nums ${d[s.key] === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                  {d[s.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot className="font-bold bg-gray-50">
          <tr>
            <th scope="row" className="px-3 py-2 text-left">Total</th>
            {totals.map((s) => (
              <td key={s.key} className="px-3 py-2 text-right tabular-nums">{s.total}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const legend = (
    <ul className="flex flex-wrap text-xs text-gray-700 gap-x-4 gap-y-1" aria-label="Legend">
      {totals.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.color }} aria-hidden="true" />
          <span className="font-semibold">{s.label}</span>
          <span className="text-gray-500 tabular-nums">{s.total}</span>
        </li>
      ))}
    </ul>
  );

  if (bare) {
    return (
      <div className="space-y-3 print:break-inside-avoid">
        {legend}
        {body}
      </div>
    );
  }

  return (
    <section aria-labelledby={captionId} className="p-4 space-y-4 bg-white border shadow-xs border-gray-200/80 rounded-2xl sm:p-5 print:break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={captionId} className="text-sm font-black text-gray-900">Parcels per day</h2>
          <p className="text-xs text-gray-500">Each event is counted on the day it happened (Manila time).</p>
        </div>
        <div className="inline-flex p-1 bg-gray-100/80 rounded-xl print:hidden" role="group" aria-label="Show daily numbers as">
          {(
            [
              ['chart', 'Chart', BarChart3],
              ['table', 'Table', Table2],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={`min-h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${
                view === key ? 'bg-white text-brand-red shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {legend}
      {body}
    </section>
  );
}
