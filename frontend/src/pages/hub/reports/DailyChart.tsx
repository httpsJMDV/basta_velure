import { useId, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import type { HubReportDailyRow } from '../../../types';
import { formatDay } from './reportFormat';

interface Series {
  key: 'received' | 'delivered' | 'failed' | 'returned';
  label: string;
  color: string;
}

const SERIES: Series[] = [
  { key: 'received', label: 'Received', color: '#2563eb' },
  { key: 'delivered', label: 'Delivered', color: '#059669' },
  { key: 'failed', label: 'Failed attempts', color: '#dc2626' },
  { key: 'returned', label: 'Returned', color: '#d97706' },
];

const HEIGHT = 220;
const TOP = 10;
const BOTTOM = 30;
const COLUMN = 22; // px per day
const BAR = 4;
const AXIS_WIDTH = 40;
const GRID_LINES = 4;

/** A round step so the axis ends on a tidy number (1, 2, 5, 10, 20, 50 ...). */
function niceStep(value: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(Math.max(value, 1))));
  const fraction = value / exp;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * exp;
}

interface DailyChartProps {
  daily: HubReportDailyRow[];
}

/**
 * Parcels per day as grouped bars drawn with plain SVG (no chart library). The numbers are also available as a table,
 * which is what assistive technology and a printed copy should rely on; the bars are a visual summary of the same data.
 */
export default function DailyChart({ daily }: DailyChartProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const captionId = useId();

  const max = Math.max(0, ...daily.flatMap((d) => SERIES.map((s) => d[s.key])));
  const step = max <= GRID_LINES ? 1 : niceStep(max / GRID_LINES);
  const top = Math.max(step * GRID_LINES, GRID_LINES);
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const y = (value: number) => TOP + plotHeight - (value / top) * plotHeight;
  const labelEvery = Math.max(1, Math.ceil(64 / COLUMN));
  const width = daily.length * COLUMN;

  const totals = SERIES.map((s) => ({ ...s, total: daily.reduce((sum, d) => sum + d[s.key], 0) }));

  return (
    <section aria-labelledby={captionId} className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-4 print:break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={captionId} className="text-sm font-black text-gray-900">Parcels per day</h2>
          <p className="text-xs text-gray-500">Each event is counted on the day it happened (Manila time).</p>
        </div>
        <div className="inline-flex rounded-xl border border-gray-200 p-0.5 print:hidden" role="group" aria-label="Show daily numbers as">
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
              className={`min-h-9 px-3 inline-flex items-center gap-1.5 rounded-[10px] text-xs font-bold ${
                view === key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700" aria-label="Legend">
        {totals.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} aria-hidden="true" />
            <span className="font-semibold">{s.label}</span>
            <span className="text-gray-500">{s.total}</span>
          </li>
        ))}
      </ul>

      {view === 'chart' ? (
        <div className="flex">
          {/* The value axis stays in place while a long range scrolls sideways. */}
          <svg width={AXIS_WIDTH} height={HEIGHT} aria-hidden="true" className="shrink-0">
            {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
              const value = (top / GRID_LINES) * i;
              return (
                <text key={i} x={AXIS_WIDTH - 6} y={y(value) + 3} textAnchor="end" fontSize="10" fill="#6b7280">
                  {Math.round(value)}
                </text>
              );
            })}
          </svg>

          <div className="overflow-x-auto flex-1">
            <svg
              width={width}
              height={HEIGHT}
              role="img"
              aria-label={`Bar chart of parcels per day from ${formatDay(daily[0].date)} to ${formatDay(daily[daily.length - 1].date)}. Switch to Table for the exact numbers.`}
            >
              {Array.from({ length: GRID_LINES + 1 }, (_, i) => (
                <line key={i} x1={0} x2={width} y1={y((top / GRID_LINES) * i)} y2={y((top / GRID_LINES) * i)} stroke={i === 0 ? '#9ca3af' : '#e5e7eb'} />
              ))}

              {daily.map((d, i) => {
                const x0 = i * COLUMN + (COLUMN - SERIES.length * BAR) / 2;
                const summary = `${formatDay(d.date)}: ${SERIES.map((s) => `${s.label} ${d[s.key]}`).join(', ')}`;
                return (
                  <g key={d.date}>
                    <title>{summary}</title>
                    <rect x={i * COLUMN} y={TOP} width={COLUMN} height={plotHeight} fill="transparent" />
                    {SERIES.map((s, j) =>
                      d[s.key] > 0 ? (
                        <rect key={s.key} x={x0 + j * BAR} y={y(d[s.key])} width={BAR - 0.5} height={TOP + plotHeight - y(d[s.key])} fill={s.color} rx={1} />
                      ) : null
                    )}
                    {i % labelEvery === 0 && (
                      <text x={i * COLUMN + COLUMN / 2} y={HEIGHT - 10} textAnchor="middle" fontSize="10" fill="#6b7280">
                        {formatDay(d.date, false)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      ) : (
        <div className="overflow-auto max-h-96 rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Parcels per day, with a total row</caption>
            <thead className="bg-gray-50 text-xs text-gray-600 sticky top-0">
              <tr>
                <th scope="col" className="text-left font-bold px-3 py-2">Date</th>
                {SERIES.map((s) => (
                  <th key={s.key} scope="col" className="text-right font-bold px-3 py-2">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {daily.map((d) => (
                <tr key={d.date}>
                  <th scope="row" className="text-left font-semibold text-gray-800 px-3 py-1.5 whitespace-nowrap">{formatDay(d.date)}</th>
                  {SERIES.map((s) => (
                    <td key={s.key} className={`text-right px-3 py-1.5 tabular-nums ${d[s.key] === 0 ? 'text-gray-400' : 'text-gray-900'}`}>
                      {d[s.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-bold">
              <tr>
                <th scope="row" className="text-left px-3 py-2">Total</th>
                {totals.map((s) => (
                  <td key={s.key} className="text-right px-3 py-2 tabular-nums">{s.total}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
