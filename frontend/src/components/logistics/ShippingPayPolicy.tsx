const shares = [
  { label: 'Pickup rider', percent: 20, color: 'bg-red-600' },
  { label: 'Delivery rider', percent: 20, color: 'bg-rose-400' },
  { label: 'Handling branch', percent: 15, color: 'bg-amber-400' },
  { label: 'Transport pool', percent: 20, color: 'bg-slate-500' },
  { label: 'Courier company', percent: 25, color: 'bg-stone-900' },
];

export default function ShippingPayPolicy() {
  return (
    <section aria-label="Shipping earnings policy" className="rounded-2xl border border-stone-200 bg-white p-5 space-y-4">
      <div><h2 className="text-sm font-bold text-stone-900">Every shipping peso, accounted for</h2>
        <p className="mt-1 text-xs leading-relaxed text-stone-500">New orders share their courier fee. Pickup and delivery receive equal percentages; previous orders keep their agreed earnings.</p></div>
      <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full">{shares.map(s => <span key={s.label} className={s.color} style={{ width: `${s.percent}%` }} />)}</div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">{shares.map(s => <div key={s.label} className="rounded-xl bg-stone-50 p-3"><dt className="text-[11px] text-stone-500">{s.label}</dt><dd className="mt-1 text-xl font-bold tabular-nums text-stone-900">{s.percent}%</dd></div>)}</dl>
      <p className="text-xs leading-relaxed text-stone-500">For a ₱50 courier fee: ₱10 pickup + ₱10 delivery + ₱7.50 branch + ₱10 transport + ₱12.50 company. Transport is divided across the planned route, including sea/air reserves. Return transport reserves up to ₱10 from the company’s ₱12.50, leaving at least ₱2.50 before other costs. Unused reserves stay with the company. Loved-IT’s merchandise commission is separate; company share is not guaranteed profit.</p>
    </section>
  );
}
