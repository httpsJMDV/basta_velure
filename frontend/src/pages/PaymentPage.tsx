import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, AlertCircle, CreditCard, Wallet, Loader2, Lock, Clock, FlaskConical } from 'lucide-react';
import { CheckoutBar } from './CheckoutPage';
import { completePaymentApi, getPaymentSessionApi, payAgainApi } from '../api/commerce';
import type { PaymentSessionView } from '../api/commerce';
import { pesoCompact as peso } from '../utils/pricing';
import { apiErrorMessage } from '../utils/apiError';
import { useCart } from '../hooks/useCart';

function useCountdown(iso: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!iso) return null;
  const left = Math.max(0, new Date(iso).getTime() - now);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return { left, text: `${m}:${String(s).padStart(2, '0')}` };
}

/**
 * Loved-IT's sandbox e-wallet and card gateway (B9). No real money moves: the page offers the outcomes a real
 * gateway can return. Paying marks the orders To Ship once; a decline keeps them To Pay with Pay Again; cancelling
 * goes back to the orders. Unpaid orders are cancelled 1 hour after they were placed.
 */
export default function PaymentPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { refresh } = useCart();
  const [session, setSession] = useState<PaymentSessionView | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const clock = useCountdown(session?.expires_at);

  useEffect(() => {
    getPaymentSessionApi(token).then(setSession).catch((e) => setError(apiErrorMessage(e, 'This payment was not found.')));
  }, [token]);

  const act = async (outcome: 'success' | 'decline' | 'cancel') => {
    if (busy) return;
    setBusy(outcome);
    setError('');
    try {
      const res = await completePaymentApi(token, outcome);
      setSession(res.data);
      setNotice(res.message);
      void refresh();
      if (outcome === 'cancel') navigate('/settings/orders?tab=to_pay', { replace: true });
    } catch (e) {
      setError(apiErrorMessage(e, 'The payment could not be completed.'));
      getPaymentSessionApi(token).then(setSession).catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  const retry = async () => {
    if (!session?.orders[0]) return;
    setBusy('retry');
    try {
      const next = await payAgainApi(session.orders[0].id);
      navigate(`/pay/${next.token}`, { replace: true });
    } catch (e) {
      setError(apiErrorMessage(e, 'This order can no longer be paid.'));
    } finally {
      setBusy(null);
    }
  };

  const Icon = session?.method === 'card' ? CreditCard : Wallet;
  const expired = session?.status === 'expired' || (clock !== null && clock.left === 0 && session?.status === 'pending');

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col">
      <CheckoutBar step={3} />
      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
            <FlaskConical className="w-3.5 h-3.5" /> Sandbox payment · no real money moves
          </p>
          <div className="rounded-3xl bg-white border border-stone-200 overflow-hidden">
            {!session && !error ? (
              <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
            ) : !session ? (
              <div className="p-8 text-center">
                <AlertCircle className="mx-auto w-8 h-8 text-brand-red" />
                <p className="mt-3 text-sm text-stone-700">{error}</p>
                <Link to="/settings/orders" className="mt-5 inline-flex h-10 px-5 rounded-full bg-stone-900 text-white text-sm font-semibold items-center">My orders</Link>
              </div>
            ) : (
              <>
                <div className="px-6 pt-6 pb-5 border-b border-stone-100">
                  <div className="flex items-center gap-3">
                    <span className="w-11 h-11 rounded-xl bg-stone-900 text-white flex items-center justify-center"><Icon className="w-5 h-5" /></span>
                    <div>
                      <p className="text-[13px] text-stone-500">{session.method === 'card' ? 'Card payment' : 'E-wallet payment'} to Loved-IT</p>
                      <p className="text-[28px] font-bold tracking-tight text-stone-900 tabular-nums">{peso(session.amount)}</p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-1 text-[13px] text-stone-600">
                    {session.orders.map((o) => (
                      <li key={o.id} className="flex justify-between"><span className="font-mono">#{o.order_number}</span><span className="tabular-nums">{peso(o.total)}</span></li>
                    ))}
                  </ul>
                </div>

                <div className="px-6 py-5">
                  {session.status === 'paid' ? (
                    <div className="text-center">
                      <CheckCircle2 className="mx-auto w-10 h-10 text-emerald-600" />
                      <p className="mt-2 text-[15px] font-semibold text-stone-900">Payment received</p>
                      <p className="mt-1 text-[13px] text-stone-500">Reference <span className="font-mono">{session.reference}</span>. Your order is now To Ship.</p>
                      <Link to="/settings/orders?tab=to_ship" className="mt-5 inline-flex h-11 px-6 rounded-full bg-brand-red text-white text-sm font-semibold items-center">Track my order</Link>
                    </div>
                  ) : expired ? (
                    <div className="text-center">
                      <Clock className="mx-auto w-9 h-9 text-stone-400" />
                      <p className="mt-2 text-[14px] font-semibold text-stone-900">The hour to pay is over</p>
                      <p className="mt-1 text-[13px] text-stone-500">Unpaid orders are cancelled 1 hour after they are placed, and their items and vouchers are released.</p>
                      <Link to="/settings/orders" className="mt-5 inline-flex h-10 px-5 rounded-full bg-stone-900 text-white text-sm font-semibold items-center">My orders</Link>
                    </div>
                  ) : session.status === 'failed' ? (
                    <div className="text-center">
                      <AlertCircle className="mx-auto w-9 h-9 text-brand-red" />
                      <p className="mt-2 text-[14px] font-semibold text-stone-900">Payment failed</p>
                      <p className="mt-1 text-[13px] text-stone-500">{session.failure ?? 'The payment was declined.'} Your order is still To Pay.</p>
                      <button type="button" onClick={retry} disabled={busy !== null} className="mt-5 inline-flex h-11 px-6 rounded-full bg-brand-red text-white text-sm font-semibold items-center gap-2 disabled:opacity-60">
                        {busy === 'retry' && <Loader2 className="w-4 h-4 animate-spin" />} Pay again
                      </button>
                    </div>
                  ) : (
                    <>
                      {clock && <p className="mb-4 flex items-center gap-1.5 text-[12.5px] text-stone-600"><Clock className="w-3.5 h-3.5" /> Pay within <span className="font-semibold tabular-nums text-stone-900">{clock.text}</span></p>}
                      <button type="button" onClick={() => act('success')} disabled={busy !== null}
                        className="w-full h-12 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                        {busy === 'success' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Pay {peso(session.amount)}
                      </button>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => act('decline')} disabled={busy !== null} className="h-10 rounded-full border border-stone-300 text-[13px] font-semibold text-stone-700 hover:border-stone-900 disabled:opacity-60">
                          Test a decline
                        </button>
                        <button type="button" onClick={() => act('cancel')} disabled={busy !== null} className="h-10 rounded-full border border-stone-300 text-[13px] font-semibold text-stone-700 hover:border-stone-900 disabled:opacity-60">
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                  {notice && session.status !== 'paid' && <p className="mt-4 text-[12.5px] text-stone-600 text-center">{notice}</p>}
                  {error && <p role="alert" className="mt-4 text-[12.5px] text-brand-red text-center">{error}</p>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
