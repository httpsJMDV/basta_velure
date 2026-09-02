import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
} from 'lucide-react';
import Button from '../../components/ui/Button';
import {
  getSellerOrdersApi,
  confirmSellerOrderPaymentApi,
  rejectSellerOrderPaymentApi,
  updateSellerOrderStatusApi,
} from '../../api/client';
import type { SellerOrder } from '../../types';
import { useMountAnim } from '../../hooks/useDashboardAnimations';

type OrderTab = 'all' | 'pending_verification' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

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
  const [counts, setCounts] = useState<{ pending_verification: number; to_ship: number }>({
    pending_verification: 0,
    to_ship: 0,
  });
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
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const pageRef = useMountAnim();

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSellerOrdersApi({
        status: activeTab === 'all' ? undefined : activeTab,
        search: search.trim() || undefined,
        page,
      });
      setOrders(res.data || []);
      if (res.meta) {
        setTotalPages(res.meta.last_page);
        setTotalCount(res.meta.total);
      }
      if (res.counts) {
        setCounts(res.counts);
      }
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, page]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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
    navigator.clipboard.writeText(ref);
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
      fetchOrders();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to confirm payment.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectPayment = async () => {
    if (!selectedOrder || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      const res = await rejectSellerOrderPaymentApi(selectedOrder.id, rejectReason.trim());
      setOrders((prev) => prev.map((o) => (o.id === selectedOrder.id ? res.data : o)));
      setSelectedOrder(res.data);
      setShowRejectModal(false);
      setRejectReason('');
      showToast(`Payment rejected for Order #${res.data.order_number}.`);
      fetchOrders();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to reject payment.');
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
      fetchOrders();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update order status.');
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
                Store Orders &amp; Fulfillment Engine
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-spin' : 'bg-emerald-500 animate-pulse'}`} />
                {loading ? 'Syncing…' : 'Live Synced'}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Verify customer GCash transfers, dispatch ready-to-ship packages, and manage order deliveries
            </p>
          </div>
        </div>

        {/* Actionable alerts badge in hero */}
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          {counts.pending_verification > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
              <QrCode className="w-3.5 h-3.5" />
              {counts.pending_verification} Payment{counts.pending_verification !== 1 ? 's' : ''} to Verify
            </span>
          )}
          {counts.to_ship > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
              <Truck className="w-3.5 h-3.5" />
              {counts.to_ship} Ready to Ship
            </span>
          )}
        </div>
      </div>

      {toastMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {toastMessage}
        </div>
      )}

      {/* ── 2. Filters & Tabs Control Bar ── */}
      <div className="bg-white rounded-2xl p-4 border border-gray-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {[
              { key: 'all', label: 'All Orders' },
              {
                key: 'pending_verification',
                label: '⚠️ Pending GCash',
                count: counts.pending_verification,
              },
              { key: 'confirmed', label: 'To Ship', count: counts.to_ship },
              { key: 'shipped', label: 'In Transit' },
              { key: 'delivered', label: 'Delivered' },
              { key: 'cancelled', label: 'Cancelled / Returned' },
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

          {/* Search Box */}
          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search Order #, buyer name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red transition-all"
            />
          </div>
        </div>

        {/* ── High-Density Orders Table ── */}
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
                        <span className="text-[10px] text-gray-400">
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
                        {isGcash ? (
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
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                            o.status === 'confirmed'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : o.status === 'shipped'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : o.status === 'delivered'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}
                        >
                          {o.status.replace(/_/g, ' ')}
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

                          {o.status === 'confirmed' && (
                            <Button
                              variant="secondary"
                              onClick={() => handleUpdateStatus(o.id, 'shipped')}
                              disabled={actionLoading}
                              className="py-1 px-2.5 text-[11px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
                            >
                              <Truck className="w-3 h-3 inline mr-1" /> Mark Shipped
                            </Button>
                          )}

                          {o.status === 'shipped' && (
                            <Button
                              variant="secondary"
                              onClick={() => handleUpdateStatus(o.id, 'delivered')}
                              disabled={actionLoading}
                              className="py-1 px-2.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
                            >
                              <CheckCircle2 className="w-3 h-3 inline mr-1" /> Mark Delivered
                            </Button>
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
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-5 border border-gray-200 shadow-xl space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto [scrollbar-width:none]">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-brand-red" />
                <h3 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider">
                  Order Details: #{selectedOrder.order_number}
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

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
                        Qty: {it.quantity} × ₱{Number(it.unit_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <span className="font-bold text-gray-900">
                      ₱{(it.subtotal || it.quantity * it.unit_price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Total Summary */}
            <div className="pt-2 border-t border-gray-100 flex justify-between items-center text-xs">
              <span className="font-bold text-gray-600">Order Subtotal:</span>
              <span className="text-base font-black text-gray-900">
                ₱{Number(selectedOrder.order_total || selectedOrder.seller_subtotal || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <Button variant="secondary" onClick={() => setSelectedOrder(null)} className="py-1 px-3 text-xs">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. Reject Payment Modal ── */}
      {showRejectModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-4 border border-gray-200 shadow-xl space-y-3 animate-in fade-in zoom-in-95">
            <h3 className="text-xs sm:text-sm font-bold text-red-600 uppercase tracking-wider">
              Reject GCash Payment
            </h3>
            <p className="text-xs text-gray-600">
              Please specify the reason for rejection so the customer can upload a valid transfer slip or retry.
            </p>

            <textarea
              rows={3}
              placeholder="e.g. Reference number mismatch or blurry receipt image..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full p-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red resize-none"
            />

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setShowRejectModal(false)} className="py-1 px-3 text-xs">
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleRejectPayment}
                disabled={!rejectReason.trim() || actionLoading}
                className="py-1 px-3 text-xs font-bold bg-red-600 hover:bg-red-700"
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Image Zoom Lightbox ── */}
      {zoomImage && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 border border-gray-200 shadow-xl space-y-3 animate-in fade-in zoom-in-95">
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
        </div>
      )}
    </div>
  );
}
