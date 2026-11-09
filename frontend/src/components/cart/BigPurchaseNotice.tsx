// "This is a big purchase": shown once, right after an add to cart makes the cart a big purchase (backend
// OrderLimits::cartNotice). The app shows the same words in the same order.
import { BadgeCheck, Banknote, FileSignature, RotateCcw } from 'lucide-react';
import type { CartNotice } from '../../api/commerce';
import { BUTTON, Dialog } from '../ui/Overlay';
import { peso } from '../../utils/cartNotice';

export default function BigPurchaseNotice({ notice, onClose, onViewCart }: { notice: CartNotice | null; onClose: () => void; onViewCart: () => void }) {
  if (!notice) return null;
  const icons = [
    ...(notice.agreement ? [FileSignature] : []),
    ...(notice.no_cod ? [Banknote] : []),
    RotateCcw,
  ];

  return (
    <Dialog open onClose={onClose} size="max-w-md"
      title={<span className="flex items-center gap-2"><BadgeCheck className="w-5 h-5 text-amber-600" aria-hidden="true" />{notice.title}</span>}
      footer={(
        <>
          <button type="button" onClick={onClose} className={BUTTON.ghost}>Keep shopping</button>
          <button type="button" onClick={onViewCart} className={BUTTON.primary}>View cart</button>
        </>
      )}>
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-medium text-amber-900">Cart total</span>
        <span className="text-[20px] font-bold tabular-nums text-stone-900">{peso(notice.cart_total)}</span>
      </div>
      <ul className="mt-3 space-y-2.5">
        {notice.points.map((point, i) => {
          const Icon = icons[i] ?? RotateCcw;
          return (
            <li key={point} className="flex gap-3">
              <span className="mt-0.5 w-7 h-7 shrink-0 rounded-full bg-stone-100 flex items-center justify-center">
                <Icon className="w-3.5 h-3.5 text-stone-600" aria-hidden="true" />
              </span>
              <span className="text-[13px] leading-relaxed text-stone-700">{point}</span>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
