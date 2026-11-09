// How report cells read on the website, the same words as the server's ReportDocument::display.
import type { ReportCellType } from '../types';

const manila = (iso: string, withTime: boolean) => new Date(iso.length === 10 ? `${iso}T00:00:00+08:00` : iso).toLocaleString('en-PH', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
});

/** The same words as the server's ReportDocument::display. A label in a total row ("Total") reads as text. */
export function displayCell(type: ReportCellType, value: string | number | null): string {
  if (value === null || value === '') return type === 'text' ? '' : '—';
  if (typeof value === 'string' && type !== 'text') {
    const fits = type === 'date' || type === 'datetime' ? /^\d{4}-\d{2}-\d{2}/.test(value) : !Number.isNaN(Number(value));
    if (!fits) return value;
  }
  const n = Number(value);
  switch (type) {
    case 'int': return n.toLocaleString('en-PH');
    case 'money': return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'percent': return `${Math.round(n * 100)}%`;
    case 'hours': return `${Math.round(n * 10) / 10} h`;
    case 'date': return manila(String(value), false);
    case 'datetime': return manila(String(value), true);
    default: return String(value);
  }
}
