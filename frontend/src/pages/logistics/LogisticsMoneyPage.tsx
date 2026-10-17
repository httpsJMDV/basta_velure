import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Banknote, Bike, Warehouse } from 'lucide-react';
import { PageHero } from '../../components/admin/dashboardKit';
import { StatusTabs, ListCard, ListEmpty, ListError, Avatar, Pill, SkeletonRows, TH, TD, formatShortDate } from '../../components/admin/listKit';
import {
  getCourierSettlementsApi, payCourierSettlementApi, confirmCourierSettlementApi,
  getCourierPayoutsApi, payCourierRiderApi, payCourierHubApi,
  getPayoutAccountApi, updatePayoutAccountApi,
} from '../../api/client';
import type { CourierPayoutRow, SettlementLine, SettlementWeeks as Weeks } from '../../types';
import { RecordPaymentDialog, PayoutAccountForm, peso } from '../../components/payments/GcashKit';
import { SettlementWeeks, shortDate } from '../../components/payments/SettlementWeeks';
import { useToast } from '../../components/ui/Toast';

type Tab = 'shops' | 'team' | 'account';
type Payees = { riders: CourierPayoutRow[]; hubs: CourierPayoutRow[] };
type PayingPerson = { kind: 'rider' | 'hub'; row: CourierPayoutRow };

const loadAccount = () => getPayoutAccountApi('logistics');
const saveAccount = (p: { gcash_number: string | null; gcash_name: string | null }) => updatePayoutAccountApi('logistics', p);

/**
 * The courier company's money: the weekly statement with each shop (the cash on delivery its riders collected,
 * minus the delivery fees), what it owes its riders and hubs for their share of those fees, and the GCash shops
 * pay it on.
 */
export default function LogisticsMoneyPage() {
  const [params, setParams] = useSearchParams();
  const tab = (['shops', 'team', 'account'] as Tab[]).find((t) => t === params.get('tab')) ?? 'shops';
  const { showToast } = useToast();

  const [weeks, setWeeks] = useState<Weeks | null>(null);
  const [payees, setPayees] = useState<Payees | null>(null);
  const [failed, setFailed] = useState(false);
  const [payingShop, setPayingShop] = useState<{ line: SettlementLine; weekStart: string } | null>(null);
  const [payingPerson, setPayingPerson] = useState<PayingPerson | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([getCourierSettlementsApi(), getCourierPayoutsApi()])
      .then(([w, p]) => { setWeeks(w); setPayees(p); })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const teamOwed = payees ? [...payees.riders, ...payees.hubs].reduce((s, r) => s + r.unpaid, 0) : null;

  return (
    <div className="pb-8 space-y-3">
      <PageHero icon={Banknote} eyebrow="Money" title="Settlements & pay"
        subtitle="Settle the cash your riders collect with each shop every week, and pay your riders and hubs their share of the delivery fees.">
        {weeks && (
          <div className="flex gap-2">
            <HeroFigure label="Shops owe you" value={weeks.totals.to_receive} />
            <HeroFigure label="You owe shops" value={weeks.totals.to_pay} />
            {teamOwed !== null && <HeroFigure label="Owed to your team" value={teamOwed} />}
          </div>
        )}
      </PageHero>

      <div className="bg-white border border-gray-200/80 rounded-2xl px-3 py-2.5 shadow-xs">
        <StatusTabs<Tab>
          label="Money sections"
          value={tab}
          onChange={(t) => setParams({ tab: t })}
          options={[
            { value: 'shops', label: 'Shop statements', count: weeks ? weeks.weeks.reduce((n, w) => n + w.lines.filter((l) => !l.settlement && l.direction !== 'none').length, 0) : null },
            { value: 'team', label: 'Rider & hub pay', count: payees ? [...payees.riders, ...payees.hubs].filter((r) => r.unpaid > 0).length : null },
            { value: 'account', label: 'Company GCash' },
          ]}
        />
      </div>

      {failed ? <ListError message="The money records could not be loaded." onRetry={load} /> : tab === 'shops' ? (
        !weeks ? <div className="h-64 rounded-2xl bg-gray-100 animate-pulse" /> : (
          <SettlementWeeks
            data={weeks}
            side="courier"
            empty="When your riders deliver orders from shops that take direct payment, each week's statement with each shop shows up here."
            onPay={(line, weekStart) => setPayingShop({ line, weekStart })}
            onConfirm={async (s) => {
              try { await confirmCourierSettlementApi(s.id); showToast('Marked as received'); load(); }
              catch { showToast('That did not go through. Try again.', 'error'); }
            }}
          />
        )
      ) : tab === 'team' ? (
        <div className="grid xl:grid-cols-2 gap-3">
          <PayeeTable title="Riders" icon={Bike} rows={payees?.riders ?? null} onPay={(row) => setPayingPerson({ kind: 'rider', row })}
            emptyHint="Riders show up here once they earn a share of a delivery fee." />
          <PayeeTable title="Hubs" icon={Warehouse} rows={payees?.hubs ?? null} onPay={(row) => setPayingPerson({ kind: 'hub', row })}
            emptyHint="Hubs show up here once parcels pass through them." />
        </div>
      ) : (
        <div className="max-w-2xl space-y-3">
          <PayoutAccountForm load={loadAccount} save={saveAccount} who="shops" tone="gray" />
          <p className="px-1 text-[12px] leading-relaxed text-gray-500">
            Shops send money here in weeks when your delivery fees are more than the cash you collected for them. Riders and hubs set their own GCash in their portals.
          </p>
        </div>
      )}

      {payingShop && (
        <RecordPaymentDialog
          title={`Pay ${payingShop.line.seller?.shop_name ?? 'the shop'}`}
          intro={<>For the week of {shortDate(payingShop.weekStart)}, your riders collected {peso(payingShop.line.cod_collected)} in cash for this shop. After your {peso(payingShop.line.courier_fees)} in delivery fees, send the shop the rest.</>}
          payee={payingShop.line.seller?.gcash ?? null}
          missingPayee="This shop has not set up GCash yet. Contact the shop for another way to send its money."
          amount={payingShop.line.net}
          onClose={() => setPayingShop(null)}
          onConfirm={async (reference) => {
            await payCourierSettlementApi({ seller_id: payingShop.line.seller!.id, week_start: payingShop.weekStart, reference });
            setPayingShop(null);
            showToast('Payment recorded. The shop will confirm it.');
            load();
          }}
        />
      )}

      {payingPerson && (
        <RecordPaymentDialog
          title={`Pay ${payingPerson.row.name}`}
          intro={<>{payingPerson.row.unpaid_count} unpaid {payingPerson.kind === 'rider' ? 'delivery share' : 'parcel share'}{payingPerson.row.unpaid_count === 1 ? '' : 's'}. Recording this marks all of them paid.</>}
          payee={payingPerson.row.gcash}
          missingPayee={`${payingPerson.row.name} has not added a GCash number yet. Ask them to add it in their ${payingPerson.kind} portal.`}
          amount={payingPerson.row.unpaid}
          onClose={() => setPayingPerson(null)}
          onConfirm={async (reference) => {
            if (payingPerson.kind === 'rider') await payCourierRiderApi(payingPerson.row.id, reference);
            else await payCourierHubApi(payingPerson.row.id, reference);
            setPayingPerson(null);
            showToast(`${payingPerson.row.name} marked as paid`);
            load();
          }}
        />
      )}
    </div>
  );
}

function HeroFigure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/[0.07] border border-white/10 px-3 py-1.5">
      <p className="text-[10px] text-white/45 whitespace-nowrap">{label}</p>
      <p className={`text-[14px] font-bold tabular-nums ${value > 0 ? 'text-white' : 'text-white/35'}`}>{peso(value)}</p>
    </div>
  );
}

function PayeeTable({ title, icon, rows, onPay, emptyHint }: {
  title: string; icon: React.ElementType; rows: CourierPayoutRow[] | null; onPay: (row: CourierPayoutRow) => void; emptyHint: string;
}) {
  return (
    <ListCard title={title} count={rows?.length} busy={!rows}>
      <div className="overflow-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th scope="col" className={TH}>{title.slice(0, -1)}</th>
              <th scope="col" className={`${TH} hidden sm:table-cell`}>GCash</th>
              <th scope="col" className={`${TH} text-right`}>Unpaid</th>
              <th scope="col" className={`${TH} text-right`}><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {!rows && <SkeletonRows cols={4} rows={4} />}
            {rows && rows.length === 0 && <tr><td colSpan={4}><ListEmpty icon={icon} title={`No ${title.toLowerCase()} to pay`} hint={emptyHint} /></td></tr>}
            {rows?.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50/60">
                <td className={TD}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={r.name} src={r.avatar_url} icon={icon} />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{r.name}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {r.hub_name ?? (r.last_paid_at ? `Last paid ${formatShortDate(r.last_paid_at)}` : 'Not paid yet')}
                      </p>
                    </div>
                  </div>
                </td>
                <td className={`${TD} hidden sm:table-cell`}>
                  {r.gcash ? <span className="font-mono text-[12px] text-gray-700">{r.gcash.number}</span> : <Pill tone="amber">Not set</Pill>}
                </td>
                <td className={`${TD} text-right`}>
                  <p className={`font-bold tabular-nums ${r.unpaid > 0 ? 'text-gray-900' : 'text-gray-300'}`}>{peso(r.unpaid)}</p>
                  <p className="text-[11px] text-gray-400">{r.unpaid_count} share{r.unpaid_count === 1 ? '' : 's'}</p>
                </td>
                <td className={`${TD} text-right`}>
                  {r.unpaid > 0
                    ? <button type="button" onClick={() => onPay(r)} className="h-8 px-3.5 rounded-full bg-brand-red hover:bg-[#8e2424] text-white text-[12px] font-semibold whitespace-nowrap">Pay</button>
                    : <Pill tone="emerald">Paid up</Pill>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ListCard>
  );
}
