import { useEffect, useState } from 'react';
import { Clock, X } from 'lucide-react';
import { clearSearchHistoryApi, getSearchHistoryApi, type SearchHistoryEntry } from '../../api/client';

/**
 * The signed-in shopper's recent searches under the empty search box. Pick one to search it again, remove one, or
 * clear them all. Renders nothing for guests or when there are none.
 */
export default function RecentSearches({ open, onPick }: { open: boolean; onPick: (query: string) => void }) {
  const [rows, setRows] = useState<SearchHistoryEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getSearchHistoryApi().then((r) => { if (alive) setRows(r); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [open]);

  if (!open || !rows || rows.length === 0) return null;

  const remove = async (id?: number) => {
    try {
      setRows(await clearSearchHistoryApi(id));
    } catch {
      // Leave the list as it is; it reloads next time.
    }
  };

  return (
    <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden bg-white border shadow-lg top-full rounded-2xl border-stone-200">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Recent searches</p>
        {/* onMouseDown keeps the box focused, so the list stays open */}
        <button type="button" onMouseDown={(e) => { e.preventDefault(); void remove(); }} className="text-[11px] font-semibold text-stone-600 hover:text-stone-900">
          Clear all
        </button>
      </div>
      <ul className="pb-2">
        {rows.slice(0, 8).map((r) => (
          <li key={r.id} className="flex items-center group">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick(r.query); }}
              className="flex items-center flex-1 min-w-0 gap-3 px-4 py-2 text-sm text-left text-stone-800 hover:bg-stone-50"
            >
              <Clock className="w-4 h-4 text-stone-400 shrink-0" aria-hidden="true" />
              <span className="truncate">{r.query}</span>
            </button>
            <button
              type="button"
              aria-label={`Remove ${r.query}`}
              onMouseDown={(e) => { e.preventDefault(); void remove(r.id); }}
              className="p-2 mr-2 rounded-full text-stone-400 hover:text-stone-800 hover:bg-stone-100"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
