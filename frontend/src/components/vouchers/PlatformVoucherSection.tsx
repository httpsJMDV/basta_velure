import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Ticket } from 'lucide-react';
import { claimVoucherApi, getPlatformVouchersApi, type WalletVoucher } from '../../api/commerce';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../ui/Toast';
import { apiErrorMessage } from '../../utils/apiError';
import VoucherTicket from './VoucherTicket';

export default function PlatformVoucherSection() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [offers, setOffers] = useState<WalletVoucher[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setFailed(false);
    getPlatformVouchersApi().then(rows => { if (active) setOffers(rows); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [user?.id, retry]);

  async function claim(voucher: WalletVoucher) {
    if (!user) { navigate('/login'); return; }
    if (busy !== null) return;
    setBusy(voucher.id);
    try {
      const result = await claimVoucherApi({ voucher_id: voucher.id });
      setOffers(rows => rows?.map(row => row.id === voucher.id ? result.data : row) ?? null);
      showToast(result.message, 'success');
    } catch (error) { showToast(apiErrorMessage(error, 'Could not save this voucher.'), 'error'); }
    finally { setBusy(null); }
  }

  return <section aria-label="Loved-IT vouchers" className="max-w-[1536px] mx-auto px-4 sm:px-8 lg:px-12 pt-10 sm:pt-14">
    <div className="rounded-3xl border border-stone-200 bg-stone-50 p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-red"><Ticket className="w-4 h-4" /> From Loved-IT</p>
          <h2 className="mt-1 text-2xl font-serif font-bold text-stone-900">A little more off your next order</h2>
          <p className="mt-1 text-sm text-stone-500">Save platform and shipping vouchers, then choose them at checkout.</p></div>
        <Link to="/settings/vouchers?tab=collect" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-red">All vouchers <ArrowRight className="w-4 h-4" /></Link>
      </div>
      {failed ? <button type="button" onClick={() => setRetry(value => value + 1)} className="text-sm text-brand-red underline">Vouchers could not load. Try again</button>
        : offers === null ? <div role="status" className="h-24 animate-pulse rounded-2xl bg-stone-200">Loading offers…</div>
        : offers.length === 0 ? <p className="text-sm text-stone-500">New Loved-IT offers will appear here when a promotion starts.</p>
        : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{offers.slice(0, 6).map(voucher => <VoucherTicket key={voucher.id} voucher={voucher} action={voucher.used_up_by_you ? 'used' : voucher.claimed ? 'claimed' : 'claim'} busy={busy === voucher.id} onAction={() => void claim(voucher)} />)}</div>}
    </div>
  </section>;
}
