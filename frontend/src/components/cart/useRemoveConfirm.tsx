import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { Dialog, BUTTON } from '../ui/Overlay';

interface Target { variantId: number; name: string; image?: string | null; variant?: string | null }

/**
 * "Remove this item?" before an item leaves the cart (the drawer, the cart page and a guest's cart all use it).
 * ask() opens the question; the item is removed only when the buyer confirms. Render `dialog` once in the component.
 */
export function useRemoveConfirm(remove: (variantId: number) => Promise<unknown> | void) {
  const [target, setTarget] = useState<Target | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => { if (!busy) setTarget(null); };
  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await remove(target.variantId);
    } finally {
      setBusy(false);
      setTarget(null);
    }
  };

  const dialog = (
    <Dialog open={target !== null} onClose={close} title="Remove this item?"
      footer={<>
        <button type="button" onClick={close} disabled={busy} className={BUTTON.quiet}>Keep it</button>
        <button type="button" onClick={() => void confirm()} disabled={busy} className={BUTTON.primary}>{busy ? 'Removing…' : 'Remove'}</button>
      </>}>
      {target && (
        <div className="flex items-center gap-3">
          <span className="w-14 h-14 rounded-xl overflow-hidden bg-stone-50 ring-1 ring-stone-200 shrink-0 flex items-center justify-center">
            {target.image ? <img src={target.image} alt="" className="w-full h-full object-cover" /> : <ShoppingBag className="w-5 h-5 text-stone-300" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-medium text-stone-900 line-clamp-2">{target.name}</span>
            {target.variant && <span className="block text-[12px] text-stone-500 truncate">{target.variant}</span>}
          </span>
        </div>
      )}
      <p className="mt-3 text-[13px] text-stone-500">It leaves your cart. You can add it again from the product page.</p>
    </Dialog>
  );

  return { ask: (t: Target) => setTarget(t), dialog };
}
