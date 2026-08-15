import { useEffect, useState, useCallback } from 'react';
import { getAdminOrdersApi, getAdminOrderApi, updateAdminOrderStatusApi } from '../../api/client';
import type { AdminOrder, OrderStatus } from '../../types';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Search, X, ChevronLeft, ChevronRight, Package } from 'lucide-react';

const STATUS_OPTIONS: { label: string; value: OrderStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Packed', value: 'packed' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Out for Delivery', value: 'out_for_delivery' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Returned', value: 'returned' },
];

const NEXT_STATUSES: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending:          ['confirmed', 'cancelled'],
  confirmed:        ['packed', 'cancelled'],
  packed:           ['shipped'],
  shipped:          ['out_for_delivery'],
  out_for_delivery: ['delivered'],
};

function formatPHP(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

function OrderDetailDrawer({
  orderId,
  onClose,
  onUpdated,
}: {
  orderId: number;
  onClose: () => void;
  onUpdated: (o: AdminOrder) => void;
}) {
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setLoading(true);
    getAdminOrderApi(orderId).then(setOrder).finally(() => setLoading(false));
  }, [orderId]);

  async function handleStatus(status: OrderStatus) {
    if (!order) return;
    setUpdating(true);
    try {
      const updated = await updateAdminOrderStatusApi(order.id, status);
      setOrder(updated);
      onUpdated(updated);
    } finally {
      setUpdating(false);
    }
  }

  const nextStatuses = order ? (NEXT_STATUSES[order.status] ?? []) : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full flex flex-col shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <p className="text-[14px] font-bold text-brand-black">
            {order ? `Order ${order.order_number}` : 'Order Detail'}
          </p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-400">Loading…</p>
          </div>
        )}

        {!loading && order && (
          <div className="flex-1 px-5 py-4 space-y-5">
            {/* Status + actions */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge label={order.status.replace(/_/g, ' ')} variant={order.status as never} />
              <Badge label={order.payment_status} variant={order.payment_status as never} />
            </div>

            {nextStatuses.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((s) => (
                  <Button
                    key={s}
                    variant="primary"
                    loading={updating}
                    onClick={() => handleStatus(s)}
                    className="text-[12px] py-1.5 px-3"
                  >
                    Mark as {s.replace(/_/g, ' ')}
                  </Button>
                ))}
              </div>
            )}

            {/* Buyer */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Buyer</p>
              {order.buyer ? (
                <p className="text-[13px] text-brand-black">
                  {order.buyer.first_name} {order.buyer.last_name}
                  <span className="text-gray-400 ml-1">· {order.buyer.email}</span>
                </p>
              ) : (
                <p className="text-[13px] text-gray-400">—</p>
              )}
            </div>

            {/* Items */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Items</p>
              <div className="space-y-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.product_name} className="w-10 h-10 rounded-md object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-gray-200 flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-brand-black truncate">{item.product_name}</p>
                      <p className="text-[11px] text-gray-400">{item.variant_label} · qty {item.quantity}</p>
                    </div>
                    <p className="text-[12px] font-semibold text-brand-black shrink-0">{formatPHP(item.subtotal)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="border-t border-gray-100 pt-3 space-y-1.5">
              <div className="flex justify-between text-[12px] text-gray-500">
                <span>Subtotal</span><span>{formatPHP(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-[12px] text-gray-500">
                <span>Shipping</span><span>{formatPHP(order.shipping_fee)}</span>
              </div>
              <div className="flex justify-between text-[13px] font-bold text-brand-black">
                <span>Total</span><span>{formatPHP(order.total)}</span>
              </div>
            </div>

            {/* Payment */}
            {order.payment && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Payment</p>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-gray-500">Method</span>
                    <span className="font-semibold text-brand-black uppercase">{order.payment.method}</span>
                  </div>
                  {order.payment.reference_number && (
                    <div className="flex justify-between text-[12px]">
                      <span className="text-gray-500">Reference</span>
                      <span className="font-mono text-brand-black">{order.payment.reference_number}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[12px]">
                    <span className="text-gray-500">Status</span>
                    <Badge label={order.payment.status} variant={order.payment.status as never} />
                  </div>
                  {order.payment.paid_at && (
                    <div className="flex justify-between text-[12px]">
                      <span className="text-gray-500">Paid at</span>
                      <span className="text-brand-black">{formatDate(order.payment.paid_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <p className="text-[11px] text-gray-400">Placed {formatDate(order.created_at)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminOrdersPage() {
  const [orders, setOrders]       = useState<AdminOrder[]>([]);
  const [meta, setMeta]           = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState<OrderStatus | ''>('');
  const [page, setPage]           = useState(1);
  const [selected, setSelected]   = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminOrdersApi({
        status: status || undefined,
        search: search || undefined,
        page,
      });
      setOrders(res.data);
      setMeta(res.meta);
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => { load(); }, [load]);

  function handleUpdated(updated: AdminOrder) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-brand-black">Orders</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Order # or buyer…"
            className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red bg-white"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as OrderStatus | ''); setPage(1); }}
          className="text-[13px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-red"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Order</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Buyer</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Payment</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Total</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px] text-gray-400">Loading…</td></tr>
              )}
              {!loading && orders.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px] text-gray-400">No orders found.</td></tr>
              )}
              {!loading && orders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => setSelected(o.id)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono font-semibold text-brand-black">{o.order_number}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {o.buyer ? `${o.buyer.first_name} ${o.buyer.last_name}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={o.status.replace(/_/g, ' ')} variant={o.status as never} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={o.payment_status} variant={o.payment_status as never} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-black">{formatPHP(o.total)}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-[12px] text-gray-400">{meta.total} orders</p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
              </button>
              <span className="text-[12px] text-gray-500">{page} / {meta.last_page}</span>
              <button
                disabled={page >= meta.last_page}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selected !== null && (
        <OrderDetailDrawer
          orderId={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
