import { useMemo } from 'react';

export interface PickupSlotChoice {
  pickup_date: string;
  pickup_window: 'morning' | 'afternoon';
}

const WINDOWS = [
  { key: 'morning' as const, start: 9, end: 12, label: '9 AM – 12 NN' },
  { key: 'afternoon' as const, start: 13, end: 17, label: '1 – 5 PM' },
];

/** Today in Manila as YYYY-MM-DD, and the current Manila hour as a decimal. */
function manilaNow(): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) + Number(parts.minute) / 60 };
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayName(ymd: string, offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-PH', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * When the rider should come: as soon as possible, or a morning or afternoon window from today to 3 days ahead
 * (the server checks the same rules). Windows ending within 30 minutes are not offered.
 */
export default function PickupTimePicker({
  value,
  onChange,
  id = 'pickup-time',
  label = 'When can the rider come?',
}: {
  value: PickupSlotChoice | null;
  onChange: (v: PickupSlotChoice | null) => void;
  id?: string;
  label?: string;
}) {
  const options = useMemo(() => {
    const now = manilaNow();
    const list: { value: string; label: string }[] = [];
    for (let offset = 0; offset <= 3; offset++) {
      const date = addDays(now.date, offset);
      for (const w of WINDOWS) {
        if (offset === 0 && w.end - 0.5 <= now.hour) continue;
        list.push({ value: `${date}|${w.key}`, label: `${dayName(date, offset)}, ${w.label}` });
      }
    }
    return list;
  }, []);

  const current = value ? `${value.pickup_date}|${value.pickup_window}` : '';

  return (
    <label htmlFor={id} className="block text-[11px] font-semibold text-gray-700">
      {label}
      <select
        id={id}
        value={current}
        onChange={(e) => {
          const [date, window] = e.target.value.split('|');
          onChange(date && window ? { pickup_date: date, pickup_window: window as PickupSlotChoice['pickup_window'] } : null);
        }}
        className="block w-full px-3 mt-1 text-xs font-normal text-gray-900 bg-white border border-gray-300 rounded-lg min-h-9 focus:border-gray-900 focus:outline-none"
      >
        <option value="">As soon as possible</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
