import { useState, useEffect, useCallback, type FormEvent } from 'react';
import {
  Wallet,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  X,
  Receipt,
  QrCode,
  ShieldCheck,
  Coins,
  Copy,
  Check,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import { useAuth } from '../../hooks/useAuth';
import {
  getSellerEarningsSummaryApi,
  getSellerOrderEarningsApi,
  getSellerPayoutsApi,
  requestSellerPayoutApi,
} from '../../api/client';
import type {
  SellerEarningsSummary,
  SellerOrderEarningsItem,
  PayoutRequest,
} from '../../types';
import { useCountUp, useMountAnim } from '../../hooks/useDashboardAnimations';

export default function SellerEarningsPage() {
  const { user } = useAuth();
  const pageRef = useMountAnim();

  const [summary, setSummary] = useState<SellerEarningsSummary>({
    available_balance: 0,
    pending_balance: 0,
    total_paid_out: 0,
    lifetime_earnings: 0,
    total_commission_paid: 0,
  });

  const [activeTab, setActiveTab] = useState<'payouts' | 'breakdown'>('payouts');
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [orderEarnings, setOrderEarnings] = useState<SellerOrderEarningsItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Request Payout Modal State
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState<string>('');
  const [gcashNumber, setGcashNumber] = useState<string>(user?.phone || '');
  const [gcashName, setGcashName] = useState<string>(
    user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : ''
  );
  const [submittingPayout, setSubmittingPayout] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSuccessMsg, setPayoutSuccessMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, payRes, earnRes] = await Promise.all([
        getSellerEarningsSummaryApi(),
        getSellerPayoutsApi(),
        getSellerOrderEarningsApi(),
      ]);
      setSummary(sumRes);
      setPayouts(payRes.data || []);
      setOrderEarnings(earnRes.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenPayoutModal = () => {
    setPayoutError(null);
    setPayoutSuccessMsg(null);
    setPayoutAmount(summary.available_balance > 0 ? String(summary.available_balance) : '');
    setGcashNumber(user?.phone || '');
    setGcashName(user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : '');
    setShowPayoutModal(true);
  };

  const handleMaxPayout = () => {
    setPayoutAmount(String(summary.available_balance));
  };

  const handleSubmitPayout = async (e: FormEvent) => {
    e.preventDefault();
    setPayoutError(null);

    const amountNum = parseFloat(payoutAmount);
    if (isNaN(amountNum) || amountNum < 100) {
      setPayoutError('Minimum withdrawal amount is ₱100.00.');
      return;
    }
    if (amountNum > summary.available_balance) {
      setPayoutError('Amount exceeds your current available balance.');
      return;
    }
    if (!gcashNumber.trim() || gcashNumber.trim().length < 10) {
      setPayoutError('Please provide a valid 11-digit GCash mobile number.');
      return;
    }
    if (!gcashName.trim()) {
      setPayoutError('Please provide your full GCash registered account name.');
      return;
    }

    setSubmittingPayout(true);
    try {
      const res = await requestSellerPayoutApi({
        amount: amountNum,
        gcash_number: gcashNumber.trim(),
        gcash_name: gcashName.trim(),
      });
      setPayoutSuccessMsg(res.message || 'Payout request submitted successfully.');
      loadData();
      setTimeout(() => {
        setShowPayoutModal(false);
      }, 1500);
    } catch (err: any) {
      setPayoutError(err.response?.data?.message || 'Failed to submit withdrawal request.');
    } finally {
      setSubmittingPayout(false);
    }
  };

  // Animated KPI numbers
  const animatedAvailable = useCountUp(summary.available_balance);
  const animatedPending = useCountUp(summary.pending_balance);
  const animatedPaidOut = useCountUp(summary.total_paid_out);
  const animatedLifetime = useCountUp(summary.lifetime_earnings);

  return (
    <div ref={pageRef} className="pb-8 space-y-4 w-full">
      {/* ── 1. Modern White / Pearl-Gray Executive Hero Command Bar ── */}
      <div className="bg-white border border-gray-200/80 rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-gray-900 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0 border border-emerald-100">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider">
                Store Earnings &amp; GCash Payouts
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-spin' : 'bg-emerald-500 animate-pulse'}`} />
                {loading ? 'Syncing…' : 'Live Synced'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Available merchant balance, escrow clearance window, and instant GCash disbursement requests
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          <Button
            variant="primary"
            onClick={handleOpenPayoutModal}
            disabled={summary.available_balance < 100 || loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-brand-red hover:bg-[#8e2424] shadow-xs rounded-xl"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            Request Payout
          </Button>
        </div>
      </div>

      {/* ── 2. Compact 4-Card Financial KPI Row ── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs h-24 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="w-7 h-7 bg-gray-100 rounded-lg" />
                <div className="w-12 h-3.5 bg-gray-100 rounded" />
              </div>
              <div className="space-y-1">
                <div className="w-20 h-5 bg-gray-200 rounded" />
                <div className="w-28 h-2.5 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Available Balance */}
          <div className="bg-white rounded-xl p-3.5 border border-emerald-200/80 bg-emerald-50/20 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                Ready
              </span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight leading-none">
                ₱{animatedAvailable.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Available for Payout</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Cleared and withdrawable funds</p>
            </div>
          </div>

          {/* Pending Balance */}
          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">7d SLA</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                ₱{animatedPending.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Pending Clearance</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Delivered orders in return window</p>
            </div>
          </div>

          {/* Total Paid Out */}
          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
                <QrCode className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-gray-400">GCash Direct</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                ₱{animatedPaidOut.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Total Disbursed</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Completed transfers to your GCash</p>
            </div>
          </div>

          {/* Lifetime Net Earnings */}
          <div className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold shrink-0">
                <Coins className="w-3.5 h-3.5" />
              </div>
              <span className="text-[10px] font-bold text-gray-400">All-Time</span>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">
                ₱{animatedLifetime.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs font-bold text-gray-800 mt-1">Lifetime Earnings</p>
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">Net revenue credited all-time</p>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. Segmented View Switcher Bar ── */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-gray-100">
          <div className="flex items-center gap-1.5 bg-gray-100/80 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('payouts')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'payouts'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Payout Requests ({payouts.length})
            </button>
            <button
              onClick={() => setActiveTab('breakdown')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'breakdown'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Order Take-Rate Breakdown ({orderEarnings.length})
            </button>
          </div>

          <div className="text-[11px] text-gray-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Payout disbursements are reviewed and credited within 24–48 hours
          </div>
        </div>

        {/* ── Tab 1: Payout Requests History Table ── */}
        {activeTab === 'payouts' && (
          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Payout Reference</th>
                  <th className="px-4 py-3">GCash Recipient</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Requested Date</th>
                  <th className="px-4 py-3 text-right">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-3.5"><div className="w-20 h-4 bg-gray-200 rounded font-mono" /></td>
                      <td className="px-4 py-3.5">
                        <div className="w-24 h-3.5 bg-gray-200 rounded mb-1" />
                        <div className="w-28 h-2.5 bg-gray-100 rounded" />
                      </td>
                      <td className="px-4 py-3.5"><div className="w-16 h-4 bg-gray-200 rounded" /></td>
                      <td className="px-4 py-3.5"><div className="w-16 h-4 bg-gray-100 rounded-full" /></td>
                      <td className="px-4 py-3.5"><div className="w-20 h-4 bg-gray-100 rounded" /></td>
                      <td className="px-4 py-3.5 text-right"><div className="w-14 h-4 bg-gray-100 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : payouts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      <Wallet className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      No payout requests logged yet. Click "Request Payout" above to withdraw available earnings.
                    </td>
                  </tr>
                ) : (
                  payouts.map((p) => {
                    const statusColors: Record<string, { bg: string; text: string; label: string }> = {
                      pending:    { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Pending Review' },
                      processing: { bg: 'bg-blue-50 border-blue-200',   text: 'text-blue-700',   label: 'Processing' },
                      completed:  { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Disbursed' },
                      rejected:   { bg: 'bg-rose-50 border-rose-200',   text: 'text-rose-700',   label: 'Rejected' },
                    };
                    const st = statusColors[p.status] || { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-700', label: p.status };

                    return (
                      <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-gray-900">{p.reference_code}</span>
                            <button
                              onClick={() => handleCopy(p.reference_code, `p-${p.id}`)}
                              className="text-gray-400 hover:text-gray-700"
                              title="Copy reference code"
                            >
                              {copiedId === `p-${p.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="font-bold text-gray-900 block">{p.gcash_name}</span>
                          <span className="text-[11px] font-mono text-gray-400">{p.gcash_number}</span>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap font-black text-gray-900">
                          ₱{Number(p.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.bg} ${st.text}`}>
                            {st.label}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap text-gray-500">
                          {new Date(p.created_at).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>

                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          {p.admin_notes ? (
                            <span className="text-[11px] text-gray-600 font-medium truncate max-w-xs inline-block" title={p.admin_notes}>
                              {p.admin_notes}
                            </span>
                          ) : (
                            <span className="text-gray-300 font-mono">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Tab 2: Order Earnings & Take-Rate Breakdown Table ── */}
        {activeTab === 'breakdown' && (
          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Order Number</th>
                  <th className="px-4 py-3">Product / Variant</th>
                  <th className="px-4 py-3">Item Subtotal</th>
                  <th className="px-4 py-3">Commission (% / Fee)</th>
                  <th className="px-4 py-3">Net Credited</th>
                  <th className="px-4 py-3 text-right">Escrow / Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-3.5"><div className="w-20 h-4 bg-gray-200 rounded font-mono" /></td>
                      <td className="px-4 py-3.5"><div className="w-28 h-3.5 bg-gray-200 rounded" /></td>
                      <td className="px-4 py-3.5"><div className="w-16 h-4 bg-gray-200 rounded" /></td>
                      <td className="px-4 py-3.5"><div className="w-16 h-4 bg-gray-100 rounded" /></td>
                      <td className="px-4 py-3.5"><div className="w-16 h-4 bg-emerald-100 rounded" /></td>
                      <td className="px-4 py-3.5 text-right"><div className="w-16 h-4 bg-gray-100 rounded ml-auto" /></td>
                    </tr>
                  ))
                ) : orderEarnings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      <Receipt className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      No fulfilled customer orders logged in your store earnings trail yet.
                    </td>
                  </tr>
                ) : (
                  orderEarnings.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="font-mono font-bold text-gray-900 block">{item.order_number}</span>
                        <span className="text-[10px] text-gray-400">
                          {item.order_date
                            ? new Date(item.order_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                            : '—'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="font-bold text-gray-900 block">{item.product_name}</span>
                        {item.variant_label && (
                          <span className="text-[10px] font-mono text-gray-400">{item.variant_label} · Qty: {item.quantity}</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap font-bold text-gray-900">
                        ₱{Number(item.item_subtotal).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap text-rose-600 font-semibold">
                        -₱{Number(item.commission_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        <span className="text-[10px] text-gray-400 block font-normal">({item.commission_pct ?? 10}%)</span>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap font-black text-emerald-600">
                        +₱{Number(item.seller_earnings).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                            item.payout_status === 'available' || item.payout_status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {item.payout_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 4. Request Withdrawal Modal ── */}
      {showPayoutModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-5 border border-gray-200 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Request GCash Payout
                </h3>
              </div>
              <button
                onClick={() => setShowPayoutModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {payoutSuccessMsg ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="text-xs font-bold text-emerald-800">{payoutSuccessMsg}</p>
                <p className="text-[11px] text-emerald-600">Your withdrawal request is now queued for administrative verification.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitPayout} className="space-y-3 text-xs">
                {payoutError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 font-medium">
                    {payoutError}
                  </div>
                )}

                {/* Available balance highlight */}
                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-emerald-700 block">Available to Withdraw</span>
                    <span className="text-base font-black text-emerald-800">
                      ₱{summary.available_balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleMaxPayout}
                    className="px-2.5 py-1 bg-white border border-emerald-300 text-emerald-700 font-bold rounded-lg text-xs hover:bg-emerald-100 transition-colors"
                  >
                    Withdraw Max
                  </button>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                    Withdrawal Amount (PHP) <span className="text-brand-red">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      min="100"
                      max={summary.available_balance}
                      placeholder="0.00"
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 text-xs font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red"
                      required
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 mt-0.5 block">Minimum withdrawal: ₱100.00 (No transfer fees)</span>
                </div>

                {/* GCash Phone */}
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                    GCash Mobile Number <span className="text-brand-red">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="0917XXXXXXX"
                    value={gcashNumber}
                    onChange={(e) => setGcashNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red font-mono"
                    required
                  />
                </div>

                {/* GCash Registered Name */}
                <div>
                  <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">
                    GCash Registered Name <span className="text-brand-red">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Full Legal Name on GCash"
                    value={gcashName}
                    onChange={(e) => setGcashName(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowPayoutModal(false)}
                    className="py-1.5 px-3 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={submittingPayout}
                    className="py-1.5 px-4 text-xs font-bold bg-brand-red hover:bg-[#8e2424]"
                  >
                    {submittingPayout ? 'Submitting...' : 'Confirm Request'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
