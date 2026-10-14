import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { HubReportRiderRow, HubReportRiderSort, HubReportSortDirection } from '../../../types';
import { formatHours, formatPercent } from './reportFormat';

interface Column {
  key: HubReportRiderSort;
  label: string;
  align: 'left' | 'right';
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Rider', align: 'left' },
  { key: 'delivered', label: 'Delivered', align: 'right' },
  { key: 'failed_attempts', label: 'Failed attempts', align: 'right' },
  { key: 'success_rate', label: 'Success rate', align: 'right' },
  { key: 'avg_delivery_hours', label: 'Avg delivery time', align: 'right' },
  { key: 'on_time_rate', label: 'On time', align: 'right' },
];

interface RidersTableProps {
  riders: HubReportRiderRow[];
  sort: HubReportRiderSort;
  direction: HubReportSortDirection;
  onSort: (key: HubReportRiderSort) => void;
  /** A new sort is being fetched; the current rows stay visible but dimmed. */
  busy?: boolean;
}

function NA() {
  return (
    <span className="text-gray-400" title="Nothing to measure in this period">
      n/a
    </span>
  );
}

/** Per-rider efficiency. Values that cannot be computed show "n/a", never 0%. */
export default function RidersTable({ riders, sort, direction, onSort, busy = false }: RidersTableProps) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-gray-200 transition-opacity ${busy ? 'opacity-60' : ''}`} aria-busy={busy}>
      <table className="w-full text-sm">
        <caption className="sr-only">Rider efficiency for the selected period. Use the column headers to sort.</caption>
        <thead className="bg-gray-50 text-xs text-gray-600">
          <tr>
            {COLUMNS.map((c) => {
              const active = sort === c.key;
              const Icon = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={`px-3 py-2 font-bold ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    className={`inline-flex items-center gap-1 min-h-9 rounded-md hover:text-gray-900 ${active ? 'text-gray-900' : ''}`}
                  >
                    {c.label}
                    <Icon className={`w-3 h-3 ${active ? '' : 'text-gray-400'}`} aria-hidden="true" />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {riders.map((r) => (
            <tr key={r.rider_id}>
              <th scope="row" className="text-left px-3 py-2 font-semibold text-gray-900">
                {r.name}
                {r.status !== 'ACTIVE' && (
                  <span className="ml-2 text-[10px] font-bold uppercase text-gray-500 border border-gray-300 rounded px-1">{r.status.toLowerCase()}</span>
                )}
              </th>
              <td className="px-3 py-2 text-right tabular-nums">{r.delivered}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.failed_attempts}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.success_rate === null ? <NA /> : formatPercent(r.success_rate)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.avg_delivery_hours === null ? <NA /> : formatHours(r.avg_delivery_hours)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {r.on_time_rate === null ? (
                  <NA />
                ) : (
                  <>
                    {formatPercent(r.on_time_rate)}
                    <span className="block text-[10px] text-gray-500">
                      {r.on_time_deliveries} of {r.delivered}
                    </span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
