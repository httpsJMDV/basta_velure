import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { getActivityApi, type ActivityScope } from '../../api/client';
import type { ActivityCategory, ActivityEntry } from '../../types';

/** Category accents: a dot and a word, never colour alone. */
const DOT: Record<string, string> = {
  pickups: 'bg-sky-500',
  hub: 'bg-gray-500',
  transfers: 'bg-violet-500',
  deliveries: 'bg-emerald-500',
  failed: 'bg-red-500',
  returns: 'bg-amber-500',
  cancellations: 'bg-rose-400',
  team: 'bg-blue-500',
  money: 'bg-lime-600',
  settings: 'bg-stone-400',
  other: 'bg-gray-300',
};

const DAY = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });

/**
 * The activity log of a hub, a courier company or a rider (newest first): parcel steps from the order timeline and
 * people's decisions from the audit log. Filter chips narrow it to one kind, the search box to one tracking or order
 * number, and Load older pages back. Read only.
 */
export default function ActivityLog({ scope, emptyHint }: { scope: ActivityScope; emptyHint: string }) {
  const [rows, setRows] = useState<ActivityEntry[] | null>(null);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (before?: string) => {
    setFailed(false);
    try {
      const res = await getActivityApi(scope, { category: category || undefined, search: applied || undefined, before });
      setCategories(res.meta.categories);
      setNext(res.meta.next_before);
      setRows((prev) => (before ? [...(prev ?? []), ...res.data] : res.data));
    } catch {
      setFailed(true);
    }
  }, [scope, category, applied]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  const more = async () => {
    if (!next) return;
    setLoadingMore(true);
    await load(next);
    setLoadingMore(false);
  };

  const days = useMemo(() => {
    const groups: { day: string; items: ActivityEntry[] }[] = [];
    for (const row of rows ?? []) {
      const day = DAY.format(new Date(row.at));
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(row);
      else groups.push({ day, items: [row] });
    }
    return groups;
  }, [rows]);

  return (
    <section aria-label="Activity log" className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
      <div className="flex flex-col gap-3 p-4 border-b border-gray-100 lg:flex-row lg:items-center">
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5 flex-1">
          {[{ key: '', label: 'Everything' }, ...categories].map((c) => {
            const on = category === c.key;
            return (
              <button
                key={c.key || 'all'}
                type="button"
                aria-pressed={on}
                onClick={() => { setRows(null); setCategory(c.key); }}
                className={`inline-flex items-center gap-1.5 px-3 min-h-9 rounded-full border text-xs font-semibold transition-colors ${
                  on ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
                }`}
              >
                {c.key && <span className={`w-1.5 h-1.5 rounded-full ${DOT[c.key] ?? DOT.other}`} aria-hidden="true" />}
                {c.label}
              </button>
            );
          })}
        </div>
        <form
          className="relative lg:w-72"
          onSubmit={(e) => { e.preventDefault(); setRows(null); setApplied(search.trim()); }}
        >
          <Search className="absolute w-4 h-4 text-gray-400 -translate-y-1/2 left-3 top-1/2" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); if (e.target.value === '' && applied) { setRows(null); setApplied(''); } }}
            placeholder="Tracking or order number"
            aria-label="Search by tracking or order number"
            className="w-full pl-9 pr-3 text-sm bg-white border border-gray-200 rounded-xl min-h-10 focus:border-gray-900 focus:outline-none"
          />
        </form>
      </div>

      {failed && !rows && (
        <div className="p-6 text-sm text-center text-gray-600">
          The activity could not be loaded.{' '}
          <button type="button" onClick={() => void load()} className="font-semibold underline underline-offset-2">Try again</button>
        </div>
      )}
      {!rows && !failed && (
        <ul className="divide-y divide-gray-50 animate-pulse" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex gap-4 px-4 py-3">
              <div className="w-12 h-3 bg-gray-100 rounded" />
              <div className="flex-1 space-y-2"><div className="w-1/3 h-3 bg-gray-200 rounded" /><div className="w-2/3 h-2.5 bg-gray-100 rounded" /></div>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length === 0 && (
        <p className="p-8 text-sm text-center text-gray-500">{applied || category ? 'Nothing matches these filters.' : emptyHint}</p>
      )}

      {days.map((group) => (
        <div key={group.day}>
          <h3 className="sticky top-0 z-[1] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500 bg-gray-50/95 border-b border-gray-100">
            {group.day}
          </h3>
          <ol className="divide-y divide-gray-50">
            {group.items.map((row) => (
              <li key={row.id} className="grid grid-cols-[56px_1fr] sm:grid-cols-[64px_1fr_auto] gap-x-4 gap-y-1 px-4 py-3">
                <time dateTime={row.at} className="pt-0.5 text-xs text-gray-500 tabular-nums">{TIME.format(new Date(row.at))}</time>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[row.category] ?? DOT.other}`} aria-hidden="true" />
                    {row.title}
                  </p>
                  {row.detail && <p className="mt-0.5 text-xs text-gray-600 break-words">{row.detail}</p>}
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {row.actor.name ? `${row.actor.name} · ${row.actor.role}` : row.actor.role}
                  </p>
                </div>
                {(row.tracking_number || row.order_number) && (
                  <p className="col-start-2 sm:col-start-3 sm:text-right font-mono text-[11px] text-gray-600 whitespace-nowrap">
                    {row.tracking_number}
                    {row.order_number && <span className="block text-gray-400">{row.order_number}</span>}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}

      {next && rows && rows.length > 0 && (
        <div className="p-3 text-center border-t border-gray-100">
          <button
            type="button"
            onClick={() => void more()}
            disabled={loadingMore}
            className="inline-flex items-center gap-1.5 px-4 text-xs font-semibold text-gray-700 rounded-xl min-h-10 hover:bg-gray-100 disabled:opacity-60"
          >
            {loadingMore && <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            Load older
          </button>
        </div>
      )}
    </section>
  );
}
