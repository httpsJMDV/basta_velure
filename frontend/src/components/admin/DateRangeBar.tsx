import type { ReactNode } from 'react';
import { CalendarRange } from 'lucide-react';
import DatePicker from '../ui/DatePicker';

export interface RangePreset {
  value: string;
  label: string;
}

/**
 * The period control of the admin report pages: a segmented set of presets and, beside it, the two dates the range
 * covers. The dates always show the days in force, so a preset is visible as dates; picking either date makes the
 * range custom. The dates use the shared DatePicker.
 */
export default function DateRangeBar({
  presets,
  preset,
  from,
  to,
  today,
  onPreset,
  onRange,
  trailing,
  fromPlaceholder = 'Start date',
  toPlaceholder = 'End date',
}: {
  presets: RangePreset[];
  /** The active preset's value, or '' when the range is custom. */
  preset: string;
  /** The range in force (YYYY-MM-DD), or '' for an open end such as "All time". */
  from: string;
  to: string;
  /** Today in Manila (YYYY-MM-DD): no date after it can be picked. */
  today: string;
  onPreset: (value: string) => void;
  /** Called when the person picks a date. Always a complete range. */
  onRange: (from: string, to: string) => void;
  /** Anything to show at the far end (a count, a note). */
  trailing?: ReactNode;
  fromPlaceholder?: string;
  toPlaceholder?: string;
}) {
  return (
    <div className="flex flex-col gap-3 p-2.5 bg-white border shadow-xs border-gray-200/80 rounded-2xl lg:flex-row lg:items-center">
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex items-center justify-center w-9 h-9 text-brand-red rounded-xl bg-red-50 shrink-0">
          <CalendarRange className="w-4 h-4" aria-hidden="true" />
        </span>
        <div role="group" aria-label="Period" className="flex flex-wrap items-center gap-0.5 p-1 bg-gray-100/80 rounded-xl">
          {presets.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onPreset(p.value)}
              aria-pressed={preset === p.value}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red ${
                preset === p.value ? 'bg-white text-brand-red shadow-xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
        <div className="relative w-full sm:w-52" role="group" aria-label="From date">
          <DatePicker
            value={from}
            maxDate={to || today}
            placeholder={fromPlaceholder}
            onChange={(v) => onRange(v, to && to >= v ? to : today)}
          />
        </div>
        <span className="hidden text-xs font-semibold text-gray-400 sm:block" aria-hidden="true">to</span>
        <div className="relative w-full sm:w-52" role="group" aria-label="To date">
          <DatePicker
            value={to}
            minDate={from || undefined}
            maxDate={today}
            placeholder={toPlaceholder}
            onChange={(v) => onRange(from && from <= v ? from : v, v)}
          />
        </div>
        {trailing}
      </div>
    </div>
  );
}
