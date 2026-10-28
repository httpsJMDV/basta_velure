import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { clampQuantity } from '../../utils/quantity';

/**
 * The cart drawer's − [qty] + control. The number can be typed: it is saved on Enter or when the box loses focus, and
 * a number above what can be bought (`max`) becomes the max with a short note. − at 1 asks to remove the item.
 */
export default function QuantityInput({ value, max, label, onCommit, onRemove }: {
  value: number;
  max?: number;
  label: string;
  onCommit: (qty: number) => Promise<string | undefined | void> | void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(String(value));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setText(String(value)); }, [value]);

  const save = async (raw: string | number) => {
    const next = clampQuantity(raw, max);
    if (!next) { setText(String(value)); setNote('Enter a quantity of at least 1.'); return; }
    setText(String(next.qty));
    setNote(next.clamped ? `Only ${next.qty} available` : '');
    if (next.qty === value) return;
    setBusy(true);
    const problem = await onCommit(next.qty);
    setBusy(false);
    if (problem) { setText(String(value)); setNote(problem); }
  };

  const atMax = max !== undefined && max > 0 && value >= max;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center h-8 rounded-full border border-stone-300 bg-white">
        <button type="button" disabled={busy} onClick={() => (value > 1 ? void save(value - 1) : onRemove())}
          className="w-8 h-full flex items-center justify-center text-stone-600 hover:text-stone-900 disabled:opacity-40" aria-label="Fewer">
          <Minus className="w-3.5 h-3.5" />
        </button>
        <input
          type="text" inputMode="numeric" value={text} aria-label={`Quantity of ${label}`} disabled={busy}
          onChange={(e) => { setText(e.target.value.replace(/[^\d]/g, '').slice(0, 6)); setNote(''); }}
          onBlur={() => { if (text !== String(value)) void save(text); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="w-9 text-center text-[13px] font-semibold tabular-nums bg-transparent outline-none"
        />
        <button type="button" disabled={busy || atMax} onClick={() => void save(value + 1)}
          className="w-8 h-full flex items-center justify-center text-stone-600 hover:text-stone-900 disabled:text-stone-300" aria-label="More">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      {note && <p role="status" className="text-[11px] font-medium text-amber-800">{note}</p>}
    </div>
  );
}
