// The weekly courier ↔ shop statement, drawn the same way from both sides. Each line is one courier and one shop in
// one week: the cash on delivery the courier collected for the shop, minus the delivery fees the courier earned.
// Whoever ends up owing sends the difference by GCash and records the reference; the other side confirms it.
import { useState } from 'react';
import { CheckCircle2, Clock, Loader2, Store, Truck } from 'lucide-react';
import type { SettlementLine, SettlementRecord, SettlementWeeks as Weeks } from '../../types';
import { peso, formatReference } from './GcashKit';

export type SettlementSide = 'seller' | 'courier';

/** Today in Manila as YYYY-MM-DD, the calendar the statements are cut on. */
export function manilaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export function shortDate(d: string): string {
  return new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

/** Does this side send the money for this line? */
export function iPay(line: SettlementLine, side: SettlementSide): boolean {
  return side === 'seller' ? line.direction === 'seller_pays' : line.direction === 'courier_pays';
}

export function SettlementWeeks({ data, side, onPay, onConfirm, empty }: {
  data: Weeks;
  side: SettlementSide;
  onPay: (line: SettlementLine, weekStart: string) => void;
  onConfirm: (settlement: SettlementRecord) => Promise<void>;
  empty: string;
}) {
  const today = manilaToday();

  if (data.weeks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
        <span className="mx-auto w-11 h-11 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center"><Clock className="w-5 h-5" /></span>
        <p className="mt-3 text-[14px] font-semibold text-gray-900">No statements yet</p>
        <p className="mt-1 text-[13px] text-gray-500 max-w-sm mx-auto">{empty}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.weeks.map((week) => {
        const current = week.end >= today;
        const parcels = week.lines.reduce((s, l) => s + l.orders_count, 0);
        return (
          <section key={week.start} className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-gray-100 bg-gray-50/70">
              <p className="text-[13px] font-semibold text-gray-900">
                {shortDate(week.start)} – {shortDate(week.end)}
                <span className="ml-2 font-normal text-gray-500">{parcels} parcel{parcels === 1 ? '' : 's'} delivered</span>
              </p>
              {current && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> This week · settles after Sunday
                </span>
              )}
            </header>
            <ul className="divide-y divide-gray-100">
              {week.lines.map((line) => (
                <StatementLine key={`${line.company?.id ?? 0}-${line.seller?.id ?? 0}`} line={line} side={side} current={current}
                  onPay={() => onPay(line, week.start)} onConfirm={onConfirm} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function StatementLine({ line, side, current, onPay, onConfirm }: {
  line: SettlementLine; side: SettlementSide; current: boolean; onPay: () => void; onConfirm: (s: SettlementRecord) => Promise<void>;
}) {
  const other = side === 'seller'
    ? { name: line.company?.name ?? 'Courier', logo: line.company?.logo_url ?? null, Icon: Truck }
    : { name: line.seller?.shop_name ?? 'Shop', logo: line.seller?.logo_url ?? null, Icon: Store };
  const paying = iPay(line, side);
  const even = line.direction === 'none';

  return (
    <li className="flex flex-col md:flex-row md:items-center gap-3 px-4 sm:px-5 py-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center text-gray-400 shrink-0">
          {other.logo ? <img src={other.logo} alt="" className="w-full h-full object-cover" /> : <other.Icon className="w-4 h-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-gray-900 truncate">{other.name}</p>
          <p className="text-[12px] text-gray-500 tabular-nums">
            {line.orders_count} parcel{line.orders_count === 1 ? '' : 's'} · {peso(line.cod_collected)} cash collected − {peso(line.courier_fees)} delivery
          </p>
        </div>
      </div>

      <div className="md:w-36 md:text-right flex md:block items-baseline justify-between">
        <p className="md:order-none order-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
          {even ? 'Even' : paying ? 'You send' : 'You receive'}
        </p>
        <p className={`text-[17px] font-bold tabular-nums ${even ? 'text-gray-400' : paying ? 'text-gray-900' : 'text-emerald-700'}`}>{peso(line.net)}</p>
      </div>

      <div className="md:w-[250px] md:flex md:justify-end">
        <LineStatus line={line} paying={paying} even={even} current={current} otherName={other.name} onPay={onPay} onConfirm={onConfirm} />
      </div>
    </li>
  );
}

function LineStatus({ line, paying, even, current, otherName, onPay, onConfirm }: {
  line: SettlementLine; paying: boolean; even: boolean; current: boolean; otherName: string;
  onPay: () => void; onConfirm: (s: SettlementRecord) => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const s = line.settlement;
  const note = 'text-[12px] text-gray-500';

  if (even) return <p className={note}>Fees match the cash. Nothing to send.</p>;

  if (!s) {
    if (current) return <p className={note}>{paying ? 'You can pay once the week ends.' : 'Due once the week ends.'}</p>;
    if (paying) {
      return (
        <button type="button" onClick={onPay} className="h-9 px-4 rounded-full bg-brand-red hover:bg-[#8e2424] text-white text-[13px] font-semibold w-full md:w-auto">
          Send {peso(line.net)}
        </button>
      );
    }
    return <p className={`${note} flex items-center gap-1.5`}><Clock className="w-3.5 h-3.5 text-amber-500" /> Waiting for {otherName} to send it</p>;
  }

  const ref = <span className="font-mono">{formatReference(s.reference)}</span>;

  if (s.confirmed_at) {
    return (
      <p className="text-[12px] text-gray-600 md:text-right">
        <span className="flex md:justify-end items-center gap-1 font-semibold text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Settled</span>
        Ref {ref}
      </p>
    );
  }

  if (paying) {
    return (
      <p className="text-[12px] text-gray-600 md:text-right">
        <span className="block font-semibold text-gray-900">Sent {s.paid_at ? shortDate(s.paid_at) : ''}</span>
        Ref {ref} · waiting for {otherName} to confirm
      </p>
    );
  }

  if (asking) {
    return (
      <div className="w-full md:w-auto rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5">
        <p className="text-[12px] text-emerald-900">Is {peso(s.amount)} in your GCash with ref {ref}?</p>
        <div className="mt-2 flex gap-1.5">
          <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(s); } finally { setBusy(false); setAsking(false); } }}
            className="h-8 px-3 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Yes, received
          </button>
          <button type="button" disabled={busy} onClick={() => setAsking(false)} className="h-8 px-3 rounded-full text-[12px] font-semibold text-gray-600 hover:bg-white">Not yet</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex md:flex-col md:items-end items-center justify-between gap-2 w-full md:w-auto">
      <p className="text-[12px] text-gray-600 md:text-right">{otherName} sent it · Ref {ref}</p>
      <button type="button" onClick={() => setAsking(true)} className="h-8 px-3.5 rounded-full border border-emerald-300 bg-white text-emerald-800 text-[12px] font-semibold hover:bg-emerald-50 shrink-0">
        Confirm received
      </button>
    </div>
  );
}
