import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  CheckCircle2,
  XCircle,
  Truck,
  Copy,
  Check,
  QrCode,
  ArrowUpRight,
  Clock,
  X,
  Eye,
  ChevronLeft,
  ChevronRight,
  Send,
  Wallet,
  ShieldCheck,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import {
  getAdminPaymentListApi,
  getAdminPayoutsApi,
  markAdminPayoutSentApi,
  completeAdminPayoutApi,
  rejectAdminPayoutApi,
} from '../../api/client';
import type {
  AdminPaymentListItem,
  PayoutRequest,
  PaymentStatus,
} from '../../types';

export default function AdminPaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'payouts' ? 'payouts' : 'payments';
  const [activeTab, setActiveTab] = useState<'payments' | 'payouts'>(initialTab);

  const [payments, setPayments] = useState<AdminPaymentListItem[]>([]);
  const [paymentMeta, setPaymentMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [paymentStats, setPaymentStats] = useState<Record<string, number>>({});
  const [paymentStatus, setPaymentStatus] = useState<string>('');
  const [paymentSearch, setPaymentSearch] = useState<string>('');
  const [paymentPage, setPaymentPage] = useState<number>(1);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<AdminPaymentListItem | null>(null);

  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [payoutMeta, setPayoutMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [payoutStatus, setPayoutStatus] = useState<string>('');
  const [payoutSearch, setPayoutSearch] = useState<string>('');
  const [payoutPage, setPayoutPage] = useState<number>(1);
  const [loadingPayouts, setLoadingPayouts] = useState(false);

  const [rejectingPayout, setRejectingPayout] = useState<PayoutRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [processingAction, setProcessingAction] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const res = await getAdminPaymentListApi({
        status: paymentStatus || undefined,
        search: paymentSearch.trim() || undefined,
        page: paymentPage,
      });
      setPayments(res.data);
      setPaymentMeta(res.meta);
      if (res.stats) setPaymentStats(res.stats);
    } catch {
    } finally {
      setLoadingPayments(false);
    }
  }, [paymentStatus, paymentSearch, paymentPage]);

  const loadPayouts = useCallback(async () => {
    setLoadingPayouts(true);
    try {
      const res = await getAdminPayoutsApi({
        status: payoutStatus || undefined,
        search: payoutSearch.trim() || undefined,
        page: payoutPage,
      });
      setPayouts(res.data);
      setPayoutMeta(res.meta);
    } catch {
    } finally {
      setLoadingPayouts(false);
    }
  }, [payoutStatus, payoutSearch, payoutPage]);

  useEffect(() => {
    if (activeTab === 'payments') {
      loadPayments();
    } else {
      loadPayouts();
    }
  }, [activeTab, loadPayments, loadPayouts]);

  const handleTabChange = (tab: 'payments' | 'payouts') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleMarkSent = async (payout: PayoutRequest) => {
    if (!window.confirm(`Mark payout ${payout.reference_code} for ₱${payout.amount.toLocaleString()} as Sent?`)) return;
    setProcessingAction(true);
    try {
      await markAdminPayoutSentApi(payout.id, 'GCash funds sent by Admin');
      loadPayouts();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update payout status.');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleComplete = async (payout: PayoutRequest) => {
    if (!window.confirm(`Confirm that payout ${payout.reference_code} for ₱${payout.amount.toLocaleString()} has been fully verified & completed?`)) return;
    setProcessingAction(true);
    try {
      await completeAdminPayoutApi(payout.id, 'Completed via GCash transfer');
      loadPayouts();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to complete payout.');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingPayout || !rejectionReason.trim()) return;
    setProcessingAction(true);
    try {
      await rejectAdminPayoutApi(rejectingPayout.id, rejectionReason.trim());
      setRejectingPayout(null);
      setRejectionReason('');
      loadPayouts();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to reject payout.');
    } finally {
      setProcessingAction(false);
    }
  };

  const getPaymentStatusBadge = (status: PaymentStatus, method: string) => {
    if (method === 'cod') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          <Truck className="w-2.5 h-2.5 text-blue-500" /> Cash on Delivery
        </span>
      );
    }
    switch (status) {
      case 'pending_verification':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Pending Verification
          </span>
        );
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" /> Payment Confirmed
          </span>
        );
      case 'verification_failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
            <XCircle className="w-2.5 h-2.5 text-red-500" /> Not Received
          </span>
        );
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">{status}</span>;
    }
  };

  const getPayoutStatusBadge = (status: PayoutRequest['status']) => {
    switch (status) {
      case 'pending': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-2.5 h-2.5 text-amber-500" /> Pending Review</span>;
      case 'processing': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200"><Send className="w-2.5 h-2.5 text-blue-500" /> Sent (Processing)</span>;
      case 'completed': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" /> Completed</span>;
      case 'rejected': return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200"><X className="w-2.5 h-2.5 text-red-500" /> Rejected</span>;
    }
  };

  return (
    <div className="pb-8 space-y-4">
      {/* ── 1. Compact Executive Hero Command Bar ── */}
      <div
        className="rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm border border-neutral-800 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d1515 60%, #3d1a1a 100%)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 shrink-0 border border-white/10">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">Payments &amp; Seller Payouts</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Synced
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">Audit incoming GCash and COD customer payments and disburse seller store revenue</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
          {['payments', 'payouts'].map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === tab
                  ? 'bg-brand-red text-white shadow-xs'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-neutral-700/60'
              }`}
            >
              {tab === 'payments' ? <QrCode className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
              {tab === 'payments' ? 'Platform Payments' : 'Seller Payouts'}
            </button>
          ))}
        </div>
      </div>

      {/* ── 2. Compact 4-Card KPI Stat Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Pending GCash Audits', value: paymentStats.pending_verification ?? 0, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', isAlert: (paymentStats.pending_verification ?? 0) > 0 },
          { label: 'Total GCash Volume', value: `₱${(paymentStats.gcash_volume ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: QrCode, color: 'text-[#007DFE]', bg: 'bg-[#007DFE]/10' },
          { label: 'Total COD Volume', value: `₱${(paymentStats.cod_volume ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: Truck, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Verified Platform Total', value: `₱${(paymentStats.total_volume ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-xl p-3.5 border border-gray-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-7 h-7 rounded-lg ${stat.bg} ${stat.color} flex items-center justify-center font-bold shrink-0`}>
                <stat.icon className="w-3.5 h-3.5" />
              </div>
              {stat.isAlert && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-50 text-brand-red border border-rose-100 animate-pulse">
                  Action Required
                </span>
              )}
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight leading-none">{stat.value}</p>
              <p className="text-xs font-bold text-gray-800 mt-1">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── 3. Main Data Container ── */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-4 space-y-3.5">
        {/* TAB 1: PAYMENTS */}
        {activeTab === 'payments' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: 'All Payments', value: '' },
                  { label: 'Pending Verification', value: 'pending_verification' },
                  { label: 'Confirmed / Paid', value: 'paid' },
                  { label: 'Not Received', value: 'verification_failed' },
                  { label: 'Cash on Delivery', value: 'cod' },
                ].map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => {
                      setPaymentStatus(tab.value);
                      setPaymentPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      paymentStatus === tab.value
                        ? 'bg-gray-900 text-white shadow-xs'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200/50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search order #, buyer, ref..."
                  value={paymentSearch}
                  onChange={(e) => {
                    setPaymentSearch(e.target.value);
                    setPaymentPage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red focus:ring-1 focus:ring-red-100 transition-all"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Order Number</th>
                    <th className="px-4 py-3">Buyer</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">GCash Reference</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Payment Status</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
              {loadingPayments ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5"><div className="w-20 h-4 bg-gray-200 rounded font-mono" /></td>
                    <td className="px-4 py-3.5">
                      <div className="w-28 h-3.5 bg-gray-200 rounded mb-1" />
                      <div className="w-36 h-2.5 bg-gray-100 rounded" />
                    </td>
                    <td className="px-4 py-3.5"><div className="w-14 h-4 bg-gray-100 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="w-24 h-4 bg-gray-100 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="w-16 h-4 bg-gray-200 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="w-20 h-4 bg-gray-100 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="w-16 h-3 bg-gray-100 rounded" /></td>
                    <td className="px-4 py-3.5 text-right"><div className="w-14 h-6 bg-gray-100 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    <QrCode className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    No payments found matching your filter.
                  </td>
                </tr>
              ) : (
                    payments.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-4 py-3.5">
                          <span className="font-mono font-bold text-gray-900 block">{p.order_number}</span>
                          <span className="text-[10px] text-gray-400 capitalize">{p.order_status}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-gray-900">{p.buyer?.name || 'Guest Buyer'}</p>
                          <p className="text-[11px] text-gray-400">{p.buyer?.email}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          {p.payment_method === 'gcash' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#007DFE]/10 text-[#007DFE]">
                              GCash
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700">
                              <Truck className="w-3 h-3" /> COD
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          {p.payment_reference ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md text-[11px]">
                                {p.payment_reference}
                              </span>
                              <button
                                onClick={() => handleCopy(p.payment_reference!, `pay-${p.id}`)}
                                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700"
                                title="Copy Reference"
                              >
                                {copiedText === `pay-${p.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-bold text-gray-900 text-sm">
                          ₱{p.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3.5">
                          {getPaymentStatusBadge(p.payment_status, p.payment_method)}
                        </td>
                        <td className="px-4 py-3.5 text-gray-500">
                          {p.created_at ? new Date(p.created_at).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          }) : ''}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => setSelectedPayment(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gray-100 hover:bg-brand-red hover:text-white transition-all text-gray-700"
                          >
                            <Eye className="w-3.5 h-3.5" /> Details
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {paymentMeta.last_page > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-gray-400">
                  Page {paymentMeta.current_page} of {paymentMeta.last_page} ({paymentMeta.total} total)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPaymentPage((p) => Math.max(1, p - 1))}
                    disabled={paymentPage <= 1}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPaymentPage((p) => Math.min(paymentMeta.last_page, p + 1))}
                    disabled={paymentPage >= paymentMeta.last_page}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PAYOUTS */}
        {activeTab === 'payouts' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: 'All Payouts', value: '' },
                  { label: 'Pending Review', value: 'pending' },
                  { label: 'Sent (Processing)', value: 'processing' },
                  { label: 'Completed', value: 'completed' },
                  { label: 'Rejected', value: 'rejected' },
                ].map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => {
                      setPayoutStatus(tab.value);
                      setPayoutPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      payoutStatus === tab.value
                        ? 'bg-gray-900 text-white shadow-xs'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200/50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search seller, ref, GCash..."
                  value={payoutSearch}
                  onChange={(e) => {
                    setPayoutSearch(e.target.value);
                    setPayoutPage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red focus:ring-1 focus:ring-red-100 transition-all"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Payout Ref</th>
                    <th className="px-4 py-3">Seller / Shop</th>
                    <th className="px-4 py-3">GCash Recipient</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Requested Date</th>
                    <th className="px-4 py-3 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingPayouts ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-4 py-3.5"><div className="w-20 h-4 bg-gray-200 rounded font-mono" /></td>
                        <td className="px-4 py-3.5">
                          <div className="w-28 h-3.5 bg-gray-200 rounded mb-1" />
                          <div className="w-36 h-2.5 bg-gray-100 rounded" />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="w-24 h-3.5 bg-gray-200 rounded mb-1" />
                          <div className="w-20 h-3 bg-gray-100 rounded" />
                        </td>
                        <td className="px-4 py-3.5"><div className="w-16 h-4 bg-gray-200 rounded" /></td>
                        <td className="px-4 py-3.5"><div className="w-20 h-4 bg-gray-100 rounded" /></td>
                        <td className="px-4 py-3.5"><div className="w-16 h-3 bg-gray-100 rounded" /></td>
                        <td className="px-4 py-3.5 text-right"><div className="w-16 h-6 bg-gray-100 rounded ml-auto" /></td>
                      </tr>
                    ))
                  ) : payouts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                        <ArrowUpRight className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        No payout requests found.
                      </td>
                    </tr>
                  ) : (
                    payouts.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-4 py-3.5 font-mono font-bold text-gray-900">{p.reference_code}</td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-gray-900">{p.seller?.shop_name || p.seller?.name}</p>
                          <p className="text-[11px] text-gray-400">{p.seller?.email}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-gray-900">{p.gcash_name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">
                              {p.gcash_number}
                            </span>
                            <button
                              onClick={() => handleCopy(p.gcash_number, `gcash-${p.id}`)}
                              className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700"
                              title="Copy GCash Number"
                            >
                              {copiedText === `gcash-${p.id}` ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-bold text-gray-900 text-sm">
                          ₱{p.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3.5">
                          {getPayoutStatusBadge(p.status)}
                          {p.rejection_reason && (
                            <p className="text-[10px] text-red-600 mt-1 max-w-[150px] truncate" title={p.rejection_reason}>
                              {p.rejection_reason}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-gray-500">
                          {p.created_at ? new Date(p.created_at).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          }) : ''}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {p.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleMarkSent(p)}
                                  disabled={processingAction}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white transition-all"
                                  title="Mark as Sent via GCash"
                                >
                                  <Send className="w-3 h-3 inline mr-1" /> Mark Sent
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectingPayout(p);
                                    setRejectionReason('');
                                  }}
                                  disabled={processingAction}
                                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-red-50 text-red-700 hover:bg-red-600 hover:text-white transition-all"
                                  title="Reject Request"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {p.status === 'processing' && (
                              <button
                                onClick={() => handleComplete(p)}
                                disabled={processingAction}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all"
                              >
                                <CheckCircle2 className="w-3 h-3 inline mr-1" /> Complete
                              </button>
                            )}

                            {(p.status === 'completed' || p.status === 'rejected') && (
                              <span className="text-[11px] text-gray-400">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {payoutMeta.last_page > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-gray-400">
                  Page {payoutMeta.current_page} of {payoutMeta.last_page} ({payoutMeta.total} total)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPayoutPage((p) => Math.max(1, p - 1))}
                    disabled={payoutPage <= 1}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPayoutPage((p) => Math.min(payoutMeta.last_page, p + 1))}
                    disabled={payoutPage >= payoutMeta.last_page}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment Details & Receipt Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-gray-200 shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900 text-sm">Payment Details</h2>
                <p className="text-xs text-gray-400 font-mono">Order #{selectedPayment.order_number}</p>
              </div>
              <button
                onClick={() => setSelectedPayment(null)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-gray-400 block">Buyer</span>
                <p className="font-semibold text-gray-900 mt-0.5">{selectedPayment.buyer?.name}</p>
                <p className="text-gray-500 font-mono text-[11px]">{selectedPayment.buyer?.email}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-gray-400 block">Seller</span>
                <p className="font-semibold text-gray-900 mt-0.5">{selectedPayment.seller?.shop_name}</p>
                <p className="text-gray-500 text-[11px]">{selectedPayment.seller?.name}</p>
              </div>
            </div>

            {selectedPayment.payment_method === 'gcash' && (
              <div className="space-y-2.5 p-3 bg-red-50/20 border border-red-100 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800">GCash Proof of Payment</span>
                  {getPaymentStatusBadge(selectedPayment.payment_status, 'gcash')}
                </div>

                <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-gray-200">
                  <span className="text-xs text-gray-500">Buyer Submitted Reference:</span>
                  <span className="font-mono font-bold text-gray-900 text-xs">{selectedPayment.payment_reference || 'N/A'}</span>
                </div>

                {selectedPayment.payment_proof_url ? (
                  <div className="space-y-1">
                    <span className="text-[11px] text-gray-500 block">Uploaded Receipt:</span>
                    <div
                      onClick={() => setPreviewImage(selectedPayment.payment_proof_url)}
                      className="cursor-pointer group relative rounded-xl overflow-hidden border border-gray-200 bg-gray-100 max-h-56 flex items-center justify-center"
                    >
                      <img
                        src={selectedPayment.payment_proof_url}
                        alt="GCash Receipt"
                        className="max-h-56 w-auto object-contain transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">
                        <Eye className="w-4 h-4" /> Click to Zoom
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No receipt image attached.</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <span className="text-xs font-bold text-gray-800">Order Items ({selectedPayment.items?.length || 0})</span>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden text-xs">
                {selectedPayment.items?.map((item) => (
                  <div key={item.id} className="p-2.5 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{item.product_name}</p>
                      <p className="text-[11px] text-gray-400">Qty: {item.quantity} × ₱{item.price.toLocaleString()}</p>
                    </div>
                    <span className="font-bold text-gray-900">₱{item.subtotal.toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2 font-bold text-xs text-gray-900 px-1">
                <span>Total Amount:</span>
                <span className="text-brand-red text-sm font-black">₱{selectedPayment.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Payout Modal */}
      {rejectingPayout && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-gray-200 shadow-2xl p-5 space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-sm">Reject Payout Request</h2>
              <button
                onClick={() => setRejectingPayout(null)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Provide a reason for rejecting payout <span className="font-bold text-gray-900">{rejectingPayout.reference_code}</span> (₱{rejectingPayout.amount.toLocaleString()}). The seller will receive this notification and their balance will be restored.
            </p>

            <form onSubmit={handleRejectSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-800 mb-1">Reason for Rejection *</label>
                <textarea
                  required
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Invalid GCash mobile number or account name mismatch..."
                  className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red focus:ring-1 focus:ring-red-100 transition-all resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setRejectingPayout(null)}
                  disabled={processingAction}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={processingAction || !rejectionReason.trim()}
                  className="text-xs font-bold bg-red-600 hover:bg-red-700 text-white"
                >
                  {processingAction ? 'Rejecting...' : 'Confirm Rejection'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={previewImage}
            alt="Enlarged Proof"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-2xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
