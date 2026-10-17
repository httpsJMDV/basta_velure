import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Percent } from 'lucide-react';
import { getAdminCommissionApi, confirmAdminCommissionApi, getAdminPaymentSettingsApi, updateAdminPaymentSettingsApi } from '../../api/client';
import type { AdminCommissionReport, PayoutAccount } from '../../types';
import { ListError, ListEmpty, Avatar, Pill, RowAction, TH, TD } from '../../components/admin/listKit';
import { PayoutAccountForm, formatReference } from '../../components/payments/GcashKit';
import { peso } from '../../utils/adminReports';

/** "2026-10" moved by n months. */
function shiftPeriod(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const loadPlatformGcash = (): Promise<PayoutAccount> =>
  getAdminPaymentSettingsApi().then((r) => ({ gcash_number: r.platform_gcash_number, gcash_name: r.platform_gcash_name }));

const savePlatformGcash = async (p: { gcash_number: string | null; gcash_name: string | null }): Promise<PayoutAccount> => {
  try {
    const r = await updateAdminPaymentSettingsApi({ platform_gcash_number: p.gcash_number, platform_gcash_name: p.gcash_name });
    return { gcash_number: r.platform_gcash_number, gcash_name: r.platform_gcash_name };
  } catch (err) {
    // The form reads gcash_number / gcash_name; the setting is stored as platform_gcash_*.
    const data = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data;
    if (data?.errors) data.errors = Object.fromEntries(Object.entries(data.errors).map(([k, v]) => [k.replace(/^platform_/, ''), v]));
    throw err;
  }
};

/**
 * Admin → Payments → Commission. Buyers pay shops directly, so each shop sends Loved-IT the commission on its
 * completed orders once a month. The admin checks each transfer in Loved-IT's GCash and confirms it here.
 */
export default function AdminCommissionPanel() {
  const [report, setReport] = useState<AdminCommissionReport | null>(null);
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    getAdminCommissionApi(period).then(setReport).catch(() => setFailed(true));
  }, [period]);
  useEffect(() => { load(); }, [load]);

  const confirm = async (id: number) => {
    setBusyId(id);
    try { await confirmAdminCommissionApi(id); load(); } finally { setBusyId(null); }
  };

  const current = report?.period;
  const waiting = report?.rows.filter((r) => r.payment && !r.payment.confirmed_at).length ?? 0;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
      <div className="space-y-3 min-w-0">
        <div className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => current && setPeriod(shiftPeriod(current, -1))} disabled={!current} aria-label="Previous month"
                className="w-8 h-8 rounded-full text-gray-500 hover:bg-gray-100 flex items-center justify-center disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
              <p className="min-w-[130px] text-center text-[14px] font-semibold text-gray-900">{report?.label ?? '…'}</p>
              <button type="button" onClick={() => current && setPeriod(shiftPeriod(current, 1))} disabled={!current || report?.in_progress} aria-label="Next month"
                className="w-8 h-8 rounded-full text-gray-500 hover:bg-gray-100 flex items-center justify-center disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            </div>
            {report?.in_progress
              ? <Pill tone="amber">Month in progress · shops pay after it ends</Pill>
              : waiting > 0 ? <Pill tone="blue">{waiting} payment{waiting === 1 ? '' : 's'} to check</Pill> : null}
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            {[
              { label: 'Commission earned', value: report?.totals.due, note: 'On completed direct orders' },
              { label: 'Shops say they paid', value: report?.totals.paid, note: 'Reference recorded' },
              { label: 'Confirmed received', value: report?.totals.confirmed, note: 'Checked in GCash' },
            ].map((c) => (
              <div key={c.label} className="px-4 py-3">
                <p className="text-[11px] font-semibold text-gray-500">{c.label}</p>
                <p className="mt-1 text-[20px] font-bold tracking-tight text-gray-900 tabular-nums">{c.value === undefined ? '…' : peso(c.value)}</p>
                <p className="text-[11px] text-gray-400">{c.note}</p>
              </div>
            ))}
          </div>
        </div>

        {failed ? <ListError message="The commission report could not be loaded." onRetry={load} /> : (
          <div className="overflow-hidden bg-white border shadow-xs border-gray-200/80 rounded-2xl" aria-busy={!report}>
            <div className="overflow-auto max-h-[68vh]">
              <table className="w-full text-[13px]">
                <thead><tr>
                  <th scope="col" className={TH}>Shop</th>
                  <th scope="col" className={`${TH} text-right`}>Commission</th>
                  <th scope="col" className={`${TH} hidden md:table-cell`}>GCash reference</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={`${TH} text-right`}><span className="sr-only">Action</span></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {!report && Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">{[0, 1, 2, 3, 4].map((c) => <td key={c} className={TD}><div className="w-3/4 h-3 bg-gray-100 rounded" /></td>)}</tr>
                  ))}
                  {report && report.rows.length === 0 && (
                    <tr><td colSpan={5}><ListEmpty icon={Percent} title="No commission this month" hint="Commission is counted when a buyer completes an order paid directly to a shop." /></td></tr>
                  )}
                  {report?.rows.map((r) => {
                    const p = r.payment;
                    return (
                      <tr key={r.seller_id} className="hover:bg-gray-50/60">
                        <td className={TD}>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar name={r.shop_name} src={r.logo_url} />
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 truncate max-w-[220px]">{r.shop_name}</p>
                              <p className="text-[11px] text-gray-500">{r.orders_count} completed order{r.orders_count === 1 ? '' : 's'}</p>
                            </div>
                          </div>
                        </td>
                        <td className={`${TD} text-right font-bold text-gray-900 tabular-nums whitespace-nowrap`}>{peso(r.amount)}</td>
                        <td className={`${TD} hidden md:table-cell`}>
                          {p ? <span className="font-mono text-[12px] text-gray-700">{formatReference(p.reference)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className={TD}>
                          {p?.confirmed_at ? <Pill tone="emerald">Confirmed</Pill>
                            : p ? <Pill tone="blue">Paid · check GCash</Pill>
                            : report.in_progress ? <Pill tone="gray">Not due yet</Pill>
                            : r.amount > 0 ? <Pill tone="amber">Not paid</Pill>
                            : <Pill tone="gray">Nothing due</Pill>}
                        </td>
                        <td className={`${TD} text-right`}>
                          {p && !p.confirmed_at && (
                            <RowAction tone="success" loading={busyId === p.id} onClick={() => confirm(p.id)} label={`Confirm ${r.shop_name}'s payment`}>Confirm received</RowAction>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Loved-IT's GCash</p>
        <PayoutAccountForm load={loadPlatformGcash} save={savePlatformGcash} who="shops" tone="gray"
          intro="Shops send their monthly commission here. It shows on every shop's Payments page." />
        <p className="px-1 text-[12px] leading-relaxed text-gray-500">
          Before you confirm, find the transfer in this GCash by its reference and check the amount.
        </p>
      </aside>
    </div>
  );
}
