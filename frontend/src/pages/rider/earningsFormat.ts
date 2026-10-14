import type { RiderEarningsPeriod } from '../../types';

export const MANILA_TZ = 'Asia/Manila';

/** Today's calendar date in Manila, YYYY-MM-DD, whatever time zone the phone is set to. */
export function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: MANILA_TZ });
}

/** Adds days to a YYYY-MM-DD date without involving the device time zone. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-PH', { timeZone: 'UTC', ...options });
}

/** "Wed, Oct 14, 2026", "Oct 12 – 18, 2026" or "October 2026". */
export function periodLabel(period: RiderEarningsPeriod): string {
  if (period.type === 'day') {
    return formatDate(period.start_date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (period.type === 'month') {
    return formatDate(period.start_date, { month: 'long', year: 'numeric' });
  }
  const sameMonth = period.start_date.slice(0, 7) === period.end_date.slice(0, 7);
  const start = formatDate(period.start_date, { month: 'short', day: 'numeric' });
  const end = formatDate(period.end_date, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
  return `${start} – ${end}, ${period.end_date.slice(0, 4)}`;
}

/** Amount strings are decimal ("1250.5"); they are formatted as text so no float ever touches the money. */
export function formatPeso(amount: string | null | undefined): string {
  const raw = (amount ?? '0').trim();
  const negative = raw.startsWith('-');
  const [whole = '0', fraction = ''] = raw.replace('-', '').split('.');
  const grouped = (whole || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}₱${grouped}.${(fraction + '00').slice(0, 2)}`;
}

export function toCents(amount: string | null | undefined): number {
  const raw = (amount ?? '0').trim();
  const sign = raw.startsWith('-') ? -1 : 1;
  const [whole = '0', fraction = ''] = raw.replace('-', '').split('.');
  return sign * (parseInt(whole || '0', 10) * 100 + parseInt((fraction + '00').slice(0, 2), 10));
}

export function fromCents(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Manila wall-clock time, e.g. "10:02 AM". */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PH', { timeZone: MANILA_TZ, hour: 'numeric', minute: '2-digit', hour12: true });
}

/** "Oct 14, 10:02 AM" in Manila time. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: MANILA_TZ,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function errorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message ? message : fallback;
}
