import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  Copy,
  Check,
  Package,
  Truck,
  X,
  User,
  MapPin,
  QrCode,
  ShoppingBag,
  Printer,
  AlertTriangle,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import { useAuth } from '../../hooks/useAuth';
import {
  getSellerOrdersApi,
  confirmSellerOrderPaymentApi,
  rejectSellerOrderPaymentApi,
  updateSellerOrderStatusApi,
} from '../../api/client';
import type { SellerOrder } from '../../types';
import { useMountAnim } from '../../hooks/useDashboardAnimations';
import { getStatusLabel, getStatusBadgeClass, normalizeOrderStatus } from '../../utils/orderStatus';
import OrderStatusTimeline from '../../components/orders/OrderStatusTimeline';
import TrackPackageButton from '../../components/tracking/TrackPackageButton';
import PrintWaybillButton from '../../components/orders/PrintWaybillButton';
import { Dialog, BUTTON } from '../../components/ui/Overlay';
import { SELLER_CANCEL_REASONS, cancelSellerOrderApi, respondReturnApi, confirmReturnReceivedApi } from '../../api/commerce';
import { apiErrorMessage, apiProblem } from '../../utils/apiError';
import { useToast } from '../../components/ui/Toast';
import { useLiveRefresh } from '../../hooks/useLiveNotices';
import { sentenceError } from '../../utils/accountRules';

/** Seller tabs (A10): every order is in exactly one, and the counts follow the date range. */
type OrderTab = 'all' | 'new' | 'to_ship' | 'shipping' | 'completed' | 'cancelled' | 'return_refund';
const METHOD_LABEL: Record<string, string> = { cod: 'Cash on delivery', gcash: 'GCash', e_wallet: 'E-wallet', card: 'Card' };
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

function peso(n: number | string | null | undefined): string {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

function getInitials(name?: string): string {
  if (!name) return 'CU';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function SellerOrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = (searchParams.get('tab') as OrderTab) || 'all';

  const [activeTab, setActiveTab] = useState<OrderTab>(tabParam);
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rangeError, setRangeError] = useState('');
  const [cancelTarget, setCancelTarget] = useState<SellerOrder | null>(null);
  const [rejectReturnOpen, setRejectReturnOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Verification & Details Modal State
  const [selectedOrder, setSelectedOrder] = useState<SellerOrder | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  // The app's toast floats above the order panel, so a result is seen even with a dialog open.
  const { showToast } = useToast();

  const { user } = useAuth();
  const addressNeedsUpdate = Boolean(user?.seller_profile?.address_needs_update);

  const pageRef = useMountAnim();

  // Esc closes the topmost overlay, and the page behind an open modal does not scroll.
  useEffect(() => {
    if (!selectedOrder && !zoomImage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (zoomImage) setZoomImage(null);
      else if (showRejectModal) setShowRejectModal(false);
      else setSelectedOrder(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedOrder, zoomImage, showRejectModal]);

  // `silent` is the live refresh: no "Syncing…" flicker, and a failed attempt keeps the list on screen.
  const fetchOrders = useCallback(async (silent = false) => {
    if (from && to && to < from) {
      setRangeError('The end date cannot be before the start date.');
      setOrders([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      setRangeError('');
      const res = await getSellerOrdersApi({
        tab: activeTab === 'all' ? undefined : activeTab,
        search: search.trim() || undefined,
        page,
        from: from || undefined,
        to: to || undefined,
      });
      setOrders(res.data || []);
      if (res.meta) {
        setTotalPages(res.meta.last_page);
        setTotalCount(res.meta.total);
      }
      if (res.counts) {
        setCounts(res.counts);
      }
    } catch (e) {
      if (silent) return;
      setOrders([]);
      const p = apiProblem(e, 'Your orders could not be loaded. Check your connection.');
      if (p.fields.to || p.fields.from) setRangeError(p.fields.to ?? p.fields.from);
      else showToast(p.message, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeTab, search, page, from, to, showToast]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  // Live: a new order or a buyer's change is pushed to the seller over Reverb (the bell's channel); the poll is the
  // fallback. The list refreshes quietly; an open order panel keeps showing what the seller is looking at.
  useLiveRefresh(() => void fetchOrders(true), 30_000);

  const handleTabChange = (tab: OrderTab) => {
    setActiveTab(tab);
    setPage(1);
    const next = new URLSearchParams(searchParams);
    if (tab !== 'all') {
      next.set('tab', tab);
    } else {
      next.delete('tab');
    }
    setSearchParams(next);
  };

  const handleCopyRef = (ref: string, key: string) => {
    void navigator.clipboard?.writeText(ref).catch(() => {});
    setCopiedRef(key);
    setTimeout(() => setCopiedRef(null), 2000);
  };

  const handleConfirmPayment = async (orderId: number) => {
    setActionLoading(true);
    try {
      const res = await confirmSellerOrderPaymentApi(orderId);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(res.data);
      }
      showToast(`Order #${res.data.order_number} payment verified & confirmed.`);
      void fetchOrders(true);
    } catch (err) {
      showToast(apiErrorMessage(err, 'The payment could not be confirmed.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const onCancelled = (o: SellerOrder, message: string) => {
    setOrders((prev) => prev.map((x) => (x.id === o.id ? o : x)));
    if (selectedOrder?.id === o.id) setSelectedOrder(o);
    setCancelTarget(null);
    showToast(message);
    void fetchOrders(true);
  };

  const rejectReasonError = sentenceError(rejectReason, 'The reason', { min: 10, max: 500 });

  const handleRejectPayment = async () => {
    if (!selectedOrder || rejectReasonError) return;
    setActionLoading(true);
    try {
      const res = await rejectSellerOrderPaymentApi(selectedOrder.id, rejectReason.trim());
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? res.data : o)));
      setSelectedOrder(res.data);
      setShowRejectModal(false);
      setRejectReason('');
      showToast(`Payment rejected for Order #${res.data.order_number}.`);
      void fetchOrders(true);
    } catch (err) {
      showToast(apiErrorMessage(err, 'The payment could not be rejected.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId: number, status: string) => {
    setActionLoading(true);
    try {
      const res = await updateSellerOrderStatusApi(orderId, status);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(res.data);
      }
      showToast(`Order #${res.data.order_number} updated to ${status.replace(/_/g, ' ')}.`);
      void fetchOrders(true);
    } catch (err) {
      showToast(apiErrorMessage(err, 'The order could not be updated.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReturned = async () => {
    if (!selectedOrder) return;
    setActionLoading(true);
    try {
      const res = await confirmReturnReceivedApi<SellerOrder>(selectedOrder.id);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? res.data : o)));
      setSelectedOrder(res.data);
      showToast(res.message);
    } catch (err) {
      showToast(apiErrorMessage(err, 'The return could not be confirmed.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRespondReturn = async (action: 'approve' | 'reject', reason?: string) => {
    if (!selectedOrder) return;
    setActionLoading(true);
    try {
      const res = await respondReturnApi<SellerOrder>(selectedOrder.id, action, reason);
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? res.data : o)));
      setSelectedOrder(res.data);
      setRejectReturnOpen(false);
      showToast(res.message);
      void fetchOrders(true);
    } catch (err) {
      showToast(apiErrorMessage(err, 'The return could not be answered.'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div ref={pageRef} className="pb-8 space-y-4 w-full">
      {/* ── 1. Modern White / Pearl-Gray Executive Hero Command Bar ── */}
      <div className="bg-white border border-gray-200/80 rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 text-gray-900 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 border border-blue-100">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider">
                Orders
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-spin' : 'bg-emerald-500 animate-pulse'}`} />
                {loading ? 'Syncing…' : 'Live Synced'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Accept and pack new orders, hand parcels to the courier, and answer returns
            </p>
          </div>
        </div>

        {/* Actionable alerts badge in hero */}
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          {(counts.pending_verification ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
              <QrCode className="w-3.5 h-3.5" />
              {counts.pending_verification} Payment{counts.pending_verification !== 1 ? 's' : ''} to Verify
            </span>
          )}
          {(counts.to_ship ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
              <Truck className="w-3.5 h-3.5" />
              {counts.to_ship} to ship
            </span>
          )}
        </div>
      </div>

      {addressNeedsUpdate && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Pickup Address Update Required</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Re-select your shop address so couriers can match your pickup area.
              </p>
            </div>
          </div>
          <Link
            to="/seller/shop-profile"
            className="text-xs font-semibold text-brand-red hover:underline shrink-0 self-center"
          >
            Update Shop Address &rarr;
          </Link>
        </div>
      )}

      {/* ── 2. Filters & Tabs Control Bar ── */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {[
              { key: 'all', label: 'All', count: counts.all },
              { key: 'new', label: 'New', count: counts.new },
              { key: 'to_ship', label: 'To ship', count: counts.to_ship },
              { key: 'shipping', label: 'Shipping', count: counts.shipping },
              { key: 'completed', label: 'Completed', count: counts.completed },
              { key: 'cancelled', label: 'Cancelled', count: counts.cancelled },
              { key: 'return_refund', label: 'Return / refund', count: counts.return_refund },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key as OrderTab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  activeTab === tab.key
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      activeTab === tab.key ? 'bg-brand-red text-white' : 'bg-rose-100 text-brand-red'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
            <label className="inline-flex items-center gap-1">From
              <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="px-2 py-1 border border-gray-200 rounded-lg text-xs" />
            </label>
            <label className="inline-flex items-center gap-1">to
              <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={`px-2 py-1 border rounded-lg text-xs ${rangeError ? 'border-brand-red' : 'border-gray-200'}`} />
            </label>
            {(from || to) && <button type="button" onClick={() => { setFrom(''); setTo(''); }} className="font-semibold text-gray-600 hover:text-gray-900">Clear</button>}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Order number or ID, buyer name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red transition-all"
            />
          </div>
        </div>

        {rangeError && <p role="alert" className="text-xs font-medium text-brand-red">{rangeError}</p>}

        {/* ── Orders table ── */}
        <div className="overflow-x-auto border border-gray-100 rounded-xl">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Order Number</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Items Summary</th>
                <th className="px-4 py-3">Order Total</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5"><div className="w-20 h-4 bg-gray-200 rounded font-mono" /></td>
                    <td className="px-4 py-3.5"><div className="w-28 h-3.5 bg-gray-200 rounded mb-1" /><div className="w-36 h-2.5 bg-gray-100 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="w-32 h-3.5 bg-gray-100 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="w-16 h-4 bg-gray-200 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="w-20 h-4 bg-gray-100 rounded" /></td>
                    <td className="px-4 py-3.5"><div className="w-20 h-4 bg-gray-100 rounded" /></td>
                    <td className="px-4 py-3.5 text-right"><div className="w-16 h-6 bg-gray-100 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    No orders found matching the selected filter criteria.
                  </td>
                </tr>
              ) : (
                orders.map((o) => {
                  const isGcash = o.payment_method === 'gcash';
                  const needsVerification = o.payment_status === 'pending' && isGcash;

                  return (
                    <tr key={o.id} className="hover:bg-gray-50/70 transition-colors group">
                      {/* Order Ref */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-gray-900">{o.order_number}</span>
                          <button
                            onClick={() => handleCopyRef(o.order_number, `ord-${o.id}`)}
                            className="text-gray-400 hover:text-gray-700"
                            title="Copy Order Number"
                          >
                            {copiedRef === `ord-${o.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        {o.tracking_number && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[10px] font-mono font-bold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.2 rounded">
                              {o.tracking_number}
                            </span>
                            <button
                              onClick={() => handleCopyRef(o.tracking_number!, `trk-${o.id}`)}
                              className="text-gray-400 hover:text-gray-700"
                              title="Copy Tracking Number"
                            >
                              {copiedRef === `trk-${o.id}` ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
                            </button>
                          </div>
                        )}
                        <span className="text-[10px] text-gray-400 block mt-0.5">
                          {new Date(o.created_at).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-neutral-900 text-white flex items-center justify-center font-bold text-[9px] shrink-0">
                            {getInitials(o.buyer?.name || o.shipping_name || 'Buyer')}
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 block leading-tight">
                              {o.buyer?.name || o.shipping_name || 'Customer'}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono">{o.buyer?.phone || o.shipping_phone || o.buyer?.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Items */}
                      <td className="px-4 py-3.5 max-w-xs">
                        <p className="font-medium text-gray-800 truncate" title={o.items?.map((it) => it.product_name).join(', ')}>
                          {o.items?.[0]?.product_name || 'Item'}
                          {(o.items?.length ?? 0) > 1 && ` +${(o.items?.length ?? 0) - 1} more`}
                        </p>
                        <span className="text-[10px] text-gray-400">
                          {o.items?.reduce((sum, it) => sum + it.quantity, 0)} total unit(s)
                        </span>
                      </td>

                      {/* Total */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-black text-gray-900">
                        ₱{Number(o.order_total || o.seller_subtotal || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Payment */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {o.payment_method === 'e_wallet' || o.payment_method === 'card' ? (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded border ${o.payment_status === 'paid' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                            {METHOD_LABEL[o.payment_method]} · {o.payment_status === 'paid' ? 'paid' : 'unpaid'}
                          </span>
                        ) : isGcash ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#007DFE] bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                              <QrCode className="w-2.5 h-2.5" /> GCash
                            </span>
                            {o.payment_proof_url && (
                              <button
                                onClick={() => setSelectedOrder(o)}
                                className="block text-[10px] text-brand-red font-bold hover:underline"
                              >
                                View Slip
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            <Truck className="w-2.5 h-2.5" /> COD
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${getStatusBadgeClass(o.status)}`}
                        >
                          {getStatusLabel(o.status)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {needsVerification && (
                            <Button
                              variant="primary"
                              onClick={() => setSelectedOrder(o)}
                              className="py-1 px-2.5 text-[11px] font-bold bg-amber-600 hover:bg-amber-700"
                            >
                              Verify Slip
                            </Button>
                          )}

                          {o.awaiting_payment && (
                            <span className="text-[10px] font-semibold text-amber-700">Waiting for payment</span>
                          )}

                          {normalizeOrderStatus(o.status) === 'PLACED' && !isGcash && !o.awaiting_payment && (
                            <Button
                              variant="primary"
                              onClick={() => handleUpdateStatus(o.id, 'CONFIRMED')}
                              disabled={actionLoading}
                              className="py-1 px-2.5 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="w-3 h-3 inline mr-1" /> Confirm Order
                            </Button>
                          )}

                          {normalizeOrderStatus(o.status) === 'CONFIRMED' && (
                            <Button
                              variant="secondary"
                              onClick={() => handleUpdateStatus(o.id, 'PREPARING')}
                              disabled={actionLoading}
                              className="py-1 px-2.5 text-[11px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200"
                            >
                              <Package className="w-3 h-3 inline mr-1" /> Start Preparing
                            </Button>
                          )}

                          {normalizeOrderStatus(o.status) === 'PREPARING' && (
                            <Button
                              variant="secondary"
                              onClick={() => handleUpdateStatus(o.id, 'READY_FOR_PICKUP')}
                              disabled={actionLoading}
                              className="py-1 px-2.5 text-[11px] font-bold bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-200"
                            >
                              <CheckCircle2 className="w-3 h-3 inline mr-1" /> Ready for Pickup
                            </Button>
                          )}

                          {normalizeOrderStatus(o.status) === 'DISPUTED' && (
                            <Button
                              variant="secondary"
                              onClick={() => setSelectedOrder(o)}
                              className="py-1 px-2.5 text-[11px] font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200"
                            >
                              Respond to Return
                            </Button>
                          )}

                          {['READY_FOR_PICKUP', 'PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(normalizeOrderStatus(o.status)) && (
                            <PrintWaybillButton
                              orderId={o.id}
                              onError={showToast}
                              className="inline-flex items-center gap-1 py-1 px-2 text-[11px] font-bold bg-white text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-lg shadow-xs transition-colors disabled:opacity-60"
                            >
                              Waybill
                            </PrintWaybillButton>
                          )}

                          <button
                            onClick={() => setSelectedOrder(o)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                            title="View order details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination Bar ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 text-xs">
            <span className="text-gray-500 font-medium">
              Showing page <strong className="text-gray-900">{page}</strong> of{' '}
              <strong className="text-gray-900">{totalPages}</strong> ({totalCount} total orders)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                className="py-1 px-3 text-xs"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                className="py-1 px-3 text-xs"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Verification & Order Details Modal ── */}
      {/* Rendered on <body>: the page root keeps a transform from its entry animation, which would otherwise pin these
          "fixed" overlays to the page card instead of the screen (the modal was cut off and the backdrop half drawn). */}
      {selectedOrder && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setSelectedOrder(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Order ${selectedOrder.order_number}`}
        >
          <div
            className="flex flex-col w-full max-w-lg max-h-[calc(100vh-2rem)] bg-white border border-gray-200 shadow-2xl rounded-2xl animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                  <ShoppingBag className="w-3.5 h-3.5 text-brand-red" aria-hidden="true" /> Order details
                </p>
                <h3 className="mt-0.5 font-mono text-sm font-bold text-gray-900 truncate">#{selectedOrder.order_number}</h3>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(selectedOrder.status)}`}>
                    {getStatusLabel(selectedOrder.status)}
                  </span>
                  <span className="text-[11px] font-semibold text-gray-500">
                    {METHOD_LABEL[selectedOrder.payment_method] ?? selectedOrder.payment_method}
                    {selectedOrder.courier && <> · {selectedOrder.courier.name}</>}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                aria-label="Close order details"
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="flex-1 min-h-0 px-5 py-4 space-y-4 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>

            {/* Customer & Address Details */}
            <div className="p-3 bg-gray-50 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  {selectedOrder.buyer?.name || selectedOrder.shipping_name || 'Customer'}
                </span>
                <span className="text-gray-500 font-mono">{selectedOrder.buyer?.phone || selectedOrder.shipping_phone}</span>
              </div>
              {(selectedOrder.shipping_address || selectedOrder.shipping_city) && (
                <div className="flex items-start gap-1.5 text-gray-600 border-t border-gray-200/60 pt-1.5">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                  <span>
                    {[
                      selectedOrder.shipping_address,
                      selectedOrder.shipping_barangay,
                      selectedOrder.shipping_city,
                      selectedOrder.shipping_province,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </div>
              )}
            </div>

            {/* GCash Verification Section (If GCash) */}
            {selectedOrder.payment_method === 'gcash' && (
              <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#007DFE] flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5" /> GCash Transfer Verification
                  </span>
                  <span className="font-mono font-bold text-gray-800">
                    Ref: {selectedOrder.payment_reference || 'Pending upload'}
                  </span>
                </div>

                {selectedOrder.checkout_orders_count && selectedOrder.checkout_orders_count > 1 && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] leading-relaxed">
                    This payment proof covers a combined checkout of ₱{Number(selectedOrder.checkout_group_total || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })} across {selectedOrder.checkout_orders_count} orders. Your order total is ₱{Number(selectedOrder.order_total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}.
                  </div>
                )}

                {selectedOrder.payment_proof_url ? (
                  <div className="pt-1">
                    <span className="text-[10px] font-bold text-gray-500 block mb-1">Customer Receipt Slip:</span>
                    <div
                      onClick={() => setZoomImage(selectedOrder.payment_proof_url!)}
                      className="cursor-pointer rounded-lg overflow-hidden border border-blue-200 bg-white max-h-48 flex items-center justify-center relative group"
                    >
                      <img
                        src={selectedOrder.payment_proof_url}
                        alt="Receipt"
                        className="max-h-48 w-auto object-contain"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">
                        Click to enlarge
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500 italic">No receipt slip image was uploaded by buyer.</p>
                )}

                {selectedOrder.payment_status === 'pending' && (
                  <div className="flex items-center gap-2 pt-2 border-t border-blue-200">
                    <Button
                      variant="primary"
                      onClick={() => handleConfirmPayment(selectedOrder.id)}
                      disabled={actionLoading}
                      className="flex-1 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Check className="w-3.5 h-3.5 mr-1 inline" /> Approve Payment
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setShowRejectModal(true)}
                      disabled={actionLoading}
                      className="py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 border-red-200"
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1 inline" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Items Summary Table */}
            <div className="space-y-1.5 text-xs">
              <span className="font-bold text-gray-700 block text-[10px] uppercase tracking-wider">
                Order Items ({selectedOrder.items?.length || 0})
              </span>
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                {selectedOrder.items?.map((it) => (
                  <div key={it.id} className="p-2.5 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-gray-900">{it.product_name}</p>
                      <p className="text-[10px] text-gray-400">
                        {it.variant_label ? `${it.variant_label} · ` : ''}Qty: {it.quantity} × ₱{Number(it.unit_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        {it.price_source === 'flash' ? ' · flash price' : it.price_source === 'sale' ? ' · sale price' : ''}
                        {it.is_gift ? ' · free with a promotion' : ''}
                      </p>
                    </div>
                    <span className="font-bold text-gray-900">
                      ₱{(it.subtotal || it.quantity * it.unit_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals: the items, the delivery fee, and what the buyer pays */}
            <dl className="pt-2 space-y-1 text-xs border-t border-gray-100">
              <div className="flex items-center justify-between text-gray-600">
                <dt>Items subtotal</dt>
                <dd className="tabular-nums">{peso(selectedOrder.seller_subtotal)}</dd>
              </div>
              {(selectedOrder.promo_discount ?? 0) > 0 && (
                <div className="flex items-center justify-between text-gray-600"><dt>Your promotions</dt><dd className="tabular-nums">−{peso(selectedOrder.promo_discount)}</dd></div>
              )}
              {(selectedOrder.store_voucher_discount ?? 0) > 0 && (
                <div className="flex items-center justify-between text-gray-600"><dt>Your voucher {selectedOrder.store_voucher_code}</dt><dd className="tabular-nums">−{peso(selectedOrder.store_voucher_discount)}</dd></div>
              )}
              <div className="flex items-center justify-between text-gray-600">
                <dt>Delivery fee{selectedOrder.chargeable_weight_kg ? ` · ${selectedOrder.chargeable_weight_kg} kg${selectedOrder.shipping_route ? `, ${selectedOrder.shipping_route}` : ''}` : ''}</dt>
                <dd className="tabular-nums">{peso(selectedOrder.shipping_fee)}</dd>
              </div>
              {((selectedOrder.platform_voucher_discount ?? 0) > 0 || (selectedOrder.shipping_voucher_discount ?? 0) > 0) && (
                <div className="flex items-center justify-between text-gray-500">
                  <dt>Loved-IT vouchers <span className="text-[10px]">(paid by Loved-IT, not from your earnings)</span></dt>
                  <dd className="tabular-nums">−{peso((selectedOrder.platform_voucher_discount ?? 0) + (selectedOrder.shipping_voucher_discount ?? 0))}</dd>
                </div>
              )}
              <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-dashed border-gray-200">
                <dt className="font-bold text-gray-900">
                  Order total {selectedOrder.payment_method === 'cod' && <span className="font-normal text-gray-500">(collected on delivery)</span>}
                </dt>
                <dd className="text-base font-black text-gray-900 tabular-nums">{peso(selectedOrder.order_total)}</dd>
              </div>
              <div className="flex items-center justify-between text-gray-600 pt-1">
                <dt>Commission (5%) · your earnings</dt>
                <dd className="tabular-nums">−{peso(selectedOrder.seller_commission)} · <span className="font-bold text-gray-900">{peso(selectedOrder.seller_earnings)}</span></dd>
              </div>
            </dl>

            {selectedOrder.notes && (
              <p className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl text-xs text-amber-900"><span className="font-bold">Buyer's note:</span> {selectedOrder.notes}</p>
            )}

            {selectedOrder.return_to_sender && (
              <div className={`p-3 rounded-xl border text-xs ${selectedOrder.return_to_sender.state === 'confirmed' ? 'bg-gray-50 border-gray-200 text-gray-700' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                <p className="font-bold">
                  {selectedOrder.return_to_sender.state === 'on_the_way' && 'Failed delivery: the courier is bringing the parcel back to you.'}
                  {selectedOrder.return_to_sender.state === 'awaiting_confirmation' && 'Returned: confirm the parcel reached your shop.'}
                  {selectedOrder.return_to_sender.state === 'confirmed' && `You confirmed the parcel came back${selectedOrder.return_to_sender.confirmed_at ? ` on ${when(selectedOrder.return_to_sender.confirmed_at)}` : ''}. The items are back in stock.`}
                </p>
                {selectedOrder.return_to_sender.state === 'awaiting_confirmation' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="flex-1 min-w-[180px]">The stock goes back on sale only after you confirm. You earn nothing on this order.</span>
                    <Button variant="primary" onClick={() => void handleConfirmReturned()} disabled={actionLoading} className="py-1.5 px-3 text-xs bg-brand-red">
                      Parcel received
                    </Button>
                  </div>
                )}
              </div>
            )}

            {normalizeOrderStatus(selectedOrder.status) === 'CANCELLED' && !selectedOrder.return_to_sender && (
              <p className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700">
                <span className="font-bold">Cancelled by {selectedOrder.cancelled_by === 'seller' ? 'you' : selectedOrder.cancelled_by === 'buyer' ? 'the buyer' : 'Loved-IT'}</span>{selectedOrder.cancel_reason ? `: ${selectedOrder.cancel_reason}` : ''}
                {selectedOrder.refund_status && <span className="block mt-0.5">Refund {selectedOrder.refund_status === 'refunded' ? 'sent' : 'to send from your GCash'}: {peso(selectedOrder.refund_amount)}</span>}
              </p>
            )}

            {selectedOrder.awaiting_payment && (
              <p className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">The buyer has not paid yet. You can accept the order once it is paid; unpaid orders cancel at {when(selectedOrder.payment_due_at)}.</p>
            )}

            {/* Merchant Fulfillment Actions */}
            {normalizeOrderStatus(selectedOrder.status) === 'PLACED' && (selectedOrder.payment_method === 'cod' || ((selectedOrder.payment_method === 'e_wallet' || selectedOrder.payment_method === 'card') && selectedOrder.payment_status === 'paid')) && (
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1.5 text-xs">
                <span className="font-bold text-emerald-900 block">Fulfillment Next Step:</span>
                <p className="text-[11px] text-emerald-700">{selectedOrder.payment_method === 'cod' ? 'Cash on delivery: the rider collects the total.' : 'Paid online.'} Accept the order to start packing.</p>
                <Button
                  variant="primary"
                  onClick={() => handleUpdateStatus(selectedOrder.id, 'CONFIRMED')}
                  disabled={actionLoading}
                  className="w-full py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> Accept order
                </Button>
              </div>
            )}

            {normalizeOrderStatus(selectedOrder.status) === 'CONFIRMED' && (
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-1.5 text-xs">
                <span className="font-bold text-indigo-900 block">Fulfillment Next Step:</span>
                <p className="text-[11px] text-indigo-700">Payment is confirmed. Start picking and packing items.</p>
                <Button
                  variant="primary"
                  onClick={() => handleUpdateStatus(selectedOrder.id, 'PREPARING')}
                  disabled={actionLoading}
                  className="w-full py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700"
                >
                  <Package className="w-3.5 h-3.5 inline mr-1" /> Start Preparing Package
                </Button>
              </div>
            )}

            {normalizeOrderStatus(selectedOrder.status) === 'PREPARING' && (
              <div className="p-3 bg-violet-50/70 border border-violet-200 rounded-xl space-y-1.5 text-xs">
                <span className="font-bold text-violet-900 block">Fulfillment Next Step:</span>
                <p className="text-[11px] text-violet-700">Package is prepared. Mark as ready for courier pickup.</p>
                <Button
                  variant="primary"
                  onClick={() => handleUpdateStatus(selectedOrder.id, 'READY_FOR_PICKUP')}
                  disabled={actionLoading}
                  className="w-full py-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-700"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> Ready for Pickup
                </Button>
              </div>
            )}

            {['READY_FOR_PICKUP', 'PICKED_UP', 'AT_SORTING_CENTER', 'SORTED', 'ASSIGNED_TO_RIDER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'].includes(normalizeOrderStatus(selectedOrder.status)) && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900 block">Logistics Shipping Label:</span>
                  {selectedOrder.tracking_number && (
                    <span className="font-mono font-bold text-violet-700 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded text-[11px]">
                      {selectedOrder.tracking_number}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-600">Print the standard A6 shipping label to attach to the package for courier pickup.</p>
                {selectedOrder.tracking_number && (
                  <TrackPackageButton trackingNumber={selectedOrder.tracking_number} variant="button" className="w-full" />
                )}
                <PrintWaybillButton
                  orderId={selectedOrder.id}
                  onError={showToast}
                  className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-bold text-white bg-gray-900 hover:bg-black rounded-xl shadow-xs transition-colors disabled:opacity-60"
                >
                  Print waybill (A6)
                </PrintWaybillButton>
                <a
                  href={`/seller/orders/${selectedOrder.id}/waybill`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-800"
                >
                  <Printer className="w-3 h-3" aria-hidden="true" /> Preview full page
                </a>
              </div>
            )}

            {selectedOrder.dispute && (
              <div className="p-3 bg-rose-50/80 border border-rose-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-rose-900">Return request · {selectedOrder.dispute.reason}</span>
                  <span className="text-[10px] font-bold uppercase text-rose-700">{selectedOrder.dispute.status === 'escalated' ? 'In dispute' : selectedOrder.dispute.status}</span>
                </div>
                <p className="text-[12px] text-rose-900">{selectedOrder.dispute.description}</p>
                {selectedOrder.dispute.photos.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedOrder.dispute.photos.map((src) => (
                      <button key={src} type="button" onClick={() => setZoomImage(src)} className="rounded-lg overflow-hidden border border-rose-200"><img src={src} alt="Return evidence" className="w-14 h-14 object-cover" /></button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-rose-700">Amount: {peso(selectedOrder.order_total)}</p>
                {selectedOrder.dispute.status === 'pending' && (
                  <>
                    <p className="text-[11px] font-semibold text-rose-800">Answer by {when(selectedOrder.dispute.respond_by)}. With no answer, the return is approved automatically.</p>
                    <div className="flex gap-2">
                      <Button variant="primary" onClick={() => handleRespondReturn('approve')} disabled={actionLoading} className="flex-1 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700">Approve return</Button>
                      <Button variant="secondary" onClick={() => setRejectReturnOpen(true)} disabled={actionLoading} className="flex-1 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 border-red-200">Reject with a reason</Button>
                    </div>
                  </>
                )}
                {selectedOrder.dispute.status === 'rejected' && <p className="text-[11px] text-rose-800">You rejected it: {selectedOrder.dispute.seller_reason} The buyer can escalate it to Loved-IT until {when(selectedOrder.dispute.escalate_by)}.</p>}
                {selectedOrder.dispute.status === 'escalated' && <p className="text-[11px] text-rose-800">The buyer escalated the request. Loved-IT will decide; you can no longer approve or reject it.</p>}
                {selectedOrder.dispute.status === 'approved' && <p className="text-[11px] text-emerald-800">Approved{selectedOrder.dispute.auto_approved ? ' automatically after 3 days' : ''}. The buyer was refunded {peso(selectedOrder.dispute.refund_amount)}; this order is not in your earnings.</p>}
              </div>
            )}

            {selectedOrder.can_cancel && (
              <button type="button" onClick={() => setCancelTarget(selectedOrder)} className="w-full py-2 text-xs font-bold text-red-700 border border-red-200 rounded-xl hover:bg-red-50">Cancel this order</button>
            )}

            {/* Tracking History Timeline */}
            <div className="pt-2 border-t border-gray-100">
              <span className="font-bold text-gray-700 block text-[10px] uppercase tracking-wider mb-2">
                Order Status Tracking History
              </span>
              <OrderStatusTimeline history={selectedOrder.status_history} currentStatus={selectedOrder.status} />
            </div>
            </div>

            <footer className="flex justify-end px-5 py-3 border-t border-gray-100 shrink-0">
              <Button variant="secondary" onClick={() => setSelectedOrder(null)} className="py-1 px-3 text-xs">
                Close
              </Button>
            </footer>
          </div>
        </div>,
        document.body
      )}

      <SellerCancelDialog order={cancelTarget} onClose={() => setCancelTarget(null)} onDone={onCancelled} />

      <RejectReturnDialog open={rejectReturnOpen} busy={actionLoading} onClose={() => setRejectReturnOpen(false)} onConfirm={(r) => handleRespondReturn('reject', r)} />

      {/* ── 4. Reject Payment Modal ── */}
      {showRejectModal && selectedOrder && createPortal(
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-4 border border-gray-200 shadow-xl space-y-3 animate-in fade-in zoom-in-95">
            <h3 className="text-xs sm:text-sm font-bold text-red-600 uppercase tracking-wider">
              Reject GCash Payment
            </h3>
            <p className="text-xs text-gray-600">
              Please specify the reason for rejection so the customer can upload a valid transfer slip or retry.
            </p>

            <textarea
              rows={3}
              maxLength={500}
              placeholder="e.g. Reference number mismatch or blurry receipt image..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              aria-invalid={rejectReason.trim() !== '' && rejectReasonError ? true : undefined}
              className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red resize-none"
            />
            <p className={`text-[11px] tabular-nums ${rejectReason.trim() !== '' && rejectReasonError ? 'text-red-600' : 'text-gray-400'}`}>
              {rejectReason.trim() !== '' && rejectReasonError ? rejectReasonError : `${rejectReason.trim().length}/500 · at least 10 characters, in words`}
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setShowRejectModal(false)} className="py-1 px-3 text-xs">
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleRejectPayment}
                disabled={!!rejectReasonError || actionLoading}
                className="py-1 px-3 text-xs font-bold bg-red-600 hover:bg-red-700"
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── 5. Image Zoom Lightbox ── */}
      {zoomImage && createPortal(
        <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4 backdrop-blur-xs" onClick={() => setZoomImage(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-4 border border-gray-200 shadow-xl space-y-3 animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Receipt Inspection</h3>
              <button
                onClick={() => setZoomImage(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl overflow-hidden border border-gray-100 max-h-96 flex items-center justify-center bg-gray-50">
              <img src={zoomImage} alt="Enlarged Slip" className="max-h-96 w-auto object-contain" />
            </div>

            <div className="flex justify-end pt-1">
              <Button variant="secondary" onClick={() => setZoomImage(null)} className="py-1 px-3 text-xs">
                Close
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/** Cancelling needs a reason the buyer sees (S8); stock and vouchers go back and a paid order is refunded. */
function SellerCancelDialog({ order, onClose, onDone }: { order: SellerOrder | null; onClose: () => void; onDone: (o: SellerOrder, message: string) => void }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const other = reason === 'Other';
  const detailsError = other ? sentenceError(details, 'The explanation', { min: 10, max: 300 }) : undefined;
  const detailsOk = !detailsError;

  useEffect(() => { if (order) { setReason(''); setDetails(''); setError(''); } }, [order]);

  const submit = async () => {
    if (!order || busy) return;
    if (!reason) { setError('Choose a reason. The buyer will see it.'); return; }
    if (detailsError) { setError(detailsError); return; }
    setBusy(true);
    try {
      const res = await cancelSellerOrderApi<SellerOrder>(order.id, reason, other ? details.trim() : undefined);
      onDone(res.data, res.message);
    } catch (e) {
      setError(apiErrorMessage(e, 'The order could not be cancelled.'));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!order} onClose={() => !busy && onClose()} title={`Cancel order #${order?.order_number ?? ''}?`}
      footer={<>
        <button type="button" className={BUTTON.quiet} onClick={onClose} disabled={busy}>Keep the order</button>
        <button type="button" className={BUTTON.danger} onClick={submit} disabled={busy || !reason || !detailsOk}>{busy ? 'Cancelling…' : 'Cancel order'}</button>
      </>}>
      <p className="text-[13px] text-stone-600 mb-3">The buyer is told why. The stock goes back to your products and any voucher returns to the buyer{order?.payment_status === 'paid' ? '; the amount paid is refunded' : ''}.</p>
      <div className="space-y-1.5" role="radiogroup" aria-label="Reason">
        {SELLER_CANCEL_REASONS.map((r) => (
          <label key={r} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer text-[13px] ${reason === r ? 'border-brand-red bg-rose-50/40' : 'border-stone-200 hover:border-stone-400'}`}>
            <input type="radio" name="seller-cancel" checked={reason === r} onChange={() => { setReason(r); setError(''); }} className="accent-brand-red" /> {r}
          </label>
        ))}
      </div>
      {other && (
        <div className="mt-3">
          <textarea rows={3} maxLength={300} value={details} onChange={(e) => { setDetails(e.target.value); setError(''); }} placeholder="Explain the reason to the buyer"
            className="w-full px-3 py-2 text-[13px] rounded-xl border border-stone-300 outline-none focus:border-brand-red resize-none" />
          <p className={`text-[11px] tabular-nums ${details.trim() && detailsError ? 'text-brand-red' : 'text-stone-400'}`}>
            {details.trim() && detailsError ? detailsError : `${details.trim().length}/300 · at least 10 characters, in words`}
          </p>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[12.5px] text-brand-red">{error}</p>}
    </Dialog>
  );
}

function RejectReturnDialog({ open, busy, onClose, onConfirm }: { open: boolean; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  const n = reason.trim().length;
  const problem = sentenceError(reason, 'The reason', { min: 10, max: 300 });

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title="Reject the return"
      footer={<>
        <button type="button" className={BUTTON.quiet} onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className={BUTTON.danger} onClick={() => onConfirm(reason.trim())} disabled={busy || !!problem}>{busy ? 'Saving…' : 'Reject return'}</button>
      </>}>
      <p className="text-[13px] text-stone-600 mb-2">The buyer sees your reason and can escalate it to Loved-IT once, within 3 days.</p>
      <label htmlFor="reject-return-reason" className="block text-[13px] font-medium text-stone-700">Reason</label>
      <textarea id="reject-return-reason" rows={4} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Item shows signs of use and the tag is removed."
        className="mt-1 w-full px-3 py-2 text-[13px] rounded-xl border border-stone-300 outline-none focus:border-brand-red resize-none" />
      <p className={`text-[11px] tabular-nums ${n > 0 && problem ? 'text-brand-red' : 'text-stone-400'}`}>{n > 0 && problem ? problem : `${n}/300 · at least 10 characters, in words`}</p>
    </Dialog>
  );
}
