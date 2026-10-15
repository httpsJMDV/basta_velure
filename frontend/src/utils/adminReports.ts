// Small helpers shared by the admin dashboard and the Analytics & Reports page, so a figure is written and linked
// the same way on both.

/** What is shown when a figure is missing. Never a made-up zero or default. */
export const NA = 'n/a';

export function peso(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NA;
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function whole(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NA;
  return value.toLocaleString('en-PH');
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return NA;
  return `${value.toLocaleString('en-PH', { maximumFractionDigits: 2 })}%`;
}

/** The sections of /admin/reports the dashboard links to (the element ids on that page). */
export type ReportSection = 'sales' | 'commission' | 'orders' | 'activity' | 'payments' | 'trend' | 'pipeline' | 'sellers' | 'categories';

/** A link to /admin/reports carrying the date range as query parameters, optionally to one section of the page. */
export function reportsHref(range?: { from: string; to: string } | null, section?: ReportSection): string {
  const query = range ? `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` : '';
  return `/admin/reports${query}${section ? `#${section}` : ''}`;
}

/** Whole-number change from `previous` to `current`, or null when there is nothing to compare against. */
export function percentChange(current: number | null | undefined, previous: number | null | undefined): { pct: number; dir: 'up' | 'down' | 'flat' } | null {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  if (previous === 0) return current > 0 ? { pct: 100, dir: 'up' } : { pct: 0, dir: 'flat' };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

/** Today's date in Asia/Manila as YYYY-MM-DD (the timezone every admin report is counted in). */
export function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** A YYYY-MM-DD date moved by a number of days (calendar arithmetic, no timezone involved). */
export function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The last `days` Manila days, ending today. */
export function lastDays(days: number): { from: string; to: string } {
  const to = manilaToday();
  return { from: shiftDay(to, -(days - 1)), to };
}

/** A YYYY-MM-DD day as "Oct 16, 2026". */
export function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
}

/** A timestamp as "Oct 16, 2026" in Manila time. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
}
