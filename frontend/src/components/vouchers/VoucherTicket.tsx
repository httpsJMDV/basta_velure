import { Ticket, Truck, Store } from 'lucide-react';
import type { WalletVoucher } from '../../api/commerce';
import { pesoCompact as peso } from '../../utils/pricing';

const until = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * A voucher as a ticket: what it takes off, its minimum spend and end date, and one action (Claim, Claimed, Use).
 * Store vouchers are the shop's red; Loved-IT's platform and shipping vouchers are dark.
 */
export default function VoucherTicket({ voucher: v, action, busy, onAction }: {
  voucher: WalletVoucher;
  action?: 'claim' | 'claimed' | 'used' | 'use';
  busy?: boolean;
  onAction?: () => void;
}) {
  const store = v.scope === 'store';
  const Icon = v.scope === 'shipping' ? Truck : store ? Store : Ticket;
  const label = { claim: 'Claim', claimed: 'Claimed', used: 'Used', use: 'Use' }[action ?? 'claim'];
  const disabled = busy || action === 'claimed' || action === 'used';

  return (
    <div className={`relative flex items-stretch rounded-2xl border overflow-hidden bg-white ${store ? 'border-brand-red/30' : 'border-stone-300'}`}>
      <div className={`w-16 shrink-0 flex flex-col items-center justify-center gap-1 text-white ${store ? 'bg-brand-red' : 'bg-stone-900'}`}>
        <Icon className="w-5 h-5" />
        <span className="text-[9.5px] font-semibold uppercase tracking-wide">{v.scope === 'shipping' ? 'Shipping' : store ? 'Shop' : 'Loved-IT'}</span>
      </div>
      <div className="flex-1 min-w-0 px-3.5 py-2.5 border-l border-dashed border-stone-200">
        <p className="text-[14px] font-semibold text-stone-900">{v.label}</p>
        <p className="text-[11.5px] text-stone-500">
          Min. spend {peso(v.min_spend)}{v.applies_to === 'products' ? ' · selected items' : ''}
        </p>
        <p className="text-[11px] text-stone-400 truncate">
          {v.seller?.shop_name ? `${v.seller.shop_name} · ` : ''}{v.status === 'upcoming' ? `Starts ${until(v.starts_at)}` : `Until ${until(v.ends_at)}`} · <span className="font-mono">{v.code}</span>
        </p>
      </div>
      {onAction && (
        <div className="flex items-center pr-3">
          <button type="button" onClick={onAction} disabled={disabled}
            className={`h-8 px-3.5 rounded-full text-[12px] font-semibold transition-colors disabled:cursor-default ${disabled ? 'bg-stone-100 text-stone-500' : store ? 'bg-brand-red text-white hover:bg-brand-red-dark' : 'bg-stone-900 text-white hover:bg-black'}`}>
            {label}
          </button>
        </div>
      )}
    </div>
  );
}
