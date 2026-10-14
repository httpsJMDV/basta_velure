/** Date presets and number formatting for the hub reports. Days are Asia/Manila calendar days, like the API. */

export type RangePreset = 'today' | 'last7' | 'last30' | 'month' | 'custom';

export const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
];

export const MAX_RANGE_DAYS = 366;

/** Today in Manila as YYYY-MM-DD, whatever the browser's own time zone is. */
export function manilaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(iso: string, days: number): string {
  const date = parseDay(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Inclusive number of days from `from` to `to`; NaN when either is not a real date. */
export function daysBetween(from: string, to: string): number {
  if (!isRealDay(from) || !isRealDay(to)) return Number.NaN;
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86400000) + 1;
}

export function isRealDay(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && parseDay(iso).toISOString().slice(0, 10) === iso;
}

export function presetRange(preset: Exclude<RangePreset, 'custom'>, today: string): { from: string; to: string } {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}

/** Mirrors the API's rules so most mistakes are caught before a request is sent. */
export function validateRange(from: string, to: string): { from?: string; to?: string } {
  const errors: { from?: string; to?: string } = {};
  if (!isRealDay(from)) errors.from = 'Enter a valid start date.';
  if (!isRealDay(to)) errors.to = 'Enter a valid end date.';
  if (errors.from || errors.to) return errors;

  const days = daysBetween(from, to);
  if (days < 1) errors.from = 'The start date must be on or before the end date.';
  else if (days > MAX_RANGE_DAYS) errors.to = `The date range cannot be longer than ${MAX_RANGE_DAYS} days.`;
  return errors;
}

/** A fraction (0 to 1) as a percentage, or "n/a" when there was nothing to measure. */
export function formatPercent(rate: number | null): string {
  return rate === null ? 'n/a' : `${(rate * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

export function formatHours(hours: number | null): string {
  if (hours === null) return 'n/a';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(1).replace(/\.0$/, '')} h`;
}

export function formatDay(iso: string, withWeekday = true): string {
  return parseDay(iso).toLocaleDateString('en-PH', {
    timeZone: 'UTC',
    weekday: withWeekday ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
  });
}

export function formatRange(from: string, to: string): string {
  const year = parseDay(to).getUTCFullYear();
  return from === to ? `${formatDay(from)}, ${year}` : `${formatDay(from, false)} to ${formatDay(to, false)}, ${year}`;
}
