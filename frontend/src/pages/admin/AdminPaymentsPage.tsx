import { useEffect, useState, useCallback } from 'react';
import { getAdminPaymentsApi, markPaymentPaidApi } from '../../api/client';
import type { AdminPayment, PaymentStatus } from '../../types';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

const STATUS_OPTIONS: { label: string; value: PaymentStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Paid', value: 'paid' },
  { label: 'Failed', value: 'failed' },
];

function formatPHP(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Mark-paid modal ──────────────────────────────────────────────────────────

function MarkPaidModal({
  payment,
  onClose,
  onDone,
}: {
  payment: AdminPayment;
  onClose: () => void;
  onDone: (p: AdminPayment) => void;
}) {
  const [ref, setRef]       = useState(payment.reference_number ?? '');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const updated = await markPaymentPaidApi(payment.id, ref || undefined);
      onDone(updated);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <h2 className="text-[15px] font-bold text-brand-black">Mark as Paid</h2>
        <p className="text-[13px] text-gray-500">
          Order <span className="font-semibold text-brand-black">{payment.order?.order_number}</span>
          {' '}· {formatPHP(payment.amount)}
        </p>
        {payment.method === 'gcash' && (
          <div>
            <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">
              GCash Reference Number
            </label>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="e.g. 1234567890"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-red"
            />
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={loading} onClick={submit}>Confirm Paid</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPaymentsPage() {
  const [payments, setPayments]   = useState<AdminPayment[]>([]);
  const [meta, setMeta]           = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading]     = useState(false);
  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState<PaymentStatus | ''>('');
  const [page, setPage]           = useState(1);
  const [markPaid, setMarkPaid]   = useState<AdminPayment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAdminPaymentsApi({
        status: status || undefined,
        search: search || undefined,
        page,
      });
      setPayments(res.data);
      setMeta(res.meta);
    } finally {
      setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => { load(); }, [load]);

  function handleDone(updated: AdminPayment) {
    setPayments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setMarkPaid(null);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-brand-black">Payments &amp; Payouts</h1>

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
          onChange={(e) => { setStatus(e.target.value as PaymentStatus | ''); setPage(1); }}
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
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Method</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Amount</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wide">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-gray-400">Loading…</td></tr>
              )}
              {!loading && payments.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[13px] text-gray-400">No payments found.</td></tr>
              )}
              {!loading && payments.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold text-brand-black">
                    {p.order?.order_number ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.order?.buyer
                      ? `${p.order.buyer.first_name} ${p.order.buyer.last_name}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 uppercase text-gray-600 text-[12px] font-semibold">{p.method}</td>
                  <td className="px-4 py-3">
                    <Badge label={p.status} variant={p.status as never} />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-black">{formatPHP(p.amount)}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(p.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {(p.status === 'pending' || p.status === 'failed') && (
                      <button
                        onClick={() => setMarkPaid(p)}
                        className="text-[11px] font-semibold text-brand-red hover:underline"
                      >
                        Mark paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {meta.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-[12px] text-gray-400">{meta.total} payments</p>
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

      {markPaid && (
        <MarkPaidModal
          payment={markPaid}
          onClose={() => setMarkPaid(null)}
          onDone={handleDone}
        />
      )}
    </div>
  );
}
