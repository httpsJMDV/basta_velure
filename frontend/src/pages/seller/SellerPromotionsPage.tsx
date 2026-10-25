import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { BadgePercent, Zap, Layers, Gift, Plus, AlertTriangle, CalendarClock, Square } from 'lucide-react';
import { useMountAnim } from '../../hooks/useDashboardAnimations';
import { useToast } from '../../components/ui/Toast';
import { SidePanel, Dialog, BUTTON } from '../../components/ui/Overlay';
import CustomSelect from '../../components/ui/CustomSelect';
import { getSellerProductsApi } from '../../api/client';
import {
  createFlashSaleApi, createPromotionApi, createStoreSaleApi, endFlashSaleApi, endPromotionApi, endStoreSaleApi,
  getPromotionsApi, updateStoreSaleApi,
} from '../../api/sellerCatalog';
import type { PromoStatus, PromotionsOverview, StoreSaleRow } from '../../api/sellerCatalog';
import type { SellerProduct } from '../../types';
import { apiProblem } from '../../utils/apiError';
import { displayNameError } from '../../utils/accountRules';

type Tab = 'sales' | 'flash' | 'bundles' | 'bxgy';
const TZ = 'Asia/Manila';

// ─── Time helpers (the shop runs on Philippine time) ──────────────────────────

function manilaParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') === '24' ? '00' : get('hour'), min: get('minute') };
}

/** A value for <input type="datetime-local"> in Manila time. */
function toInput(d: Date | string) {
  const p = manilaParts(typeof d === 'string' ? new Date(d) : d);
  return `${p.y}-${p.m}-${p.d}T${p.h}:${p.min}`;
}

/** A sale or promotion runs at most 90 days (the server checks the same), so a mistyped year is caught. */
const MAX_RUN_DAYS = 90;
function tooLong(start: string, end: string): string | undefined {
  const last = new Date(fromInput(start).getTime() + MAX_RUN_DAYS * 86400000);
  return fromInput(end) > last ? `A sale can run for at most ${MAX_RUN_DAYS} days. Choose an end on or before ${when(last.toISOString())}.` : undefined;
}

/** The Manila wall time of a datetime-local value, as a Date. */
function fromInput(v: string): Date {
  return new Date(`${v}:00+08:00`);
}

function when(iso: string) {
  // The year shows when it is not this year, so a typo like 2027 for 2026 is easy to spot.
  const d = new Date(iso);
  const year = (x: Date) => x.toLocaleString('en-PH', { timeZone: TZ, year: 'numeric' });
  return d.toLocaleString('en-PH', { timeZone: TZ, month: 'short', day: 'numeric', ...(year(d) !== year(new Date()) && { year: 'numeric' }), hour: 'numeric', minute: '2-digit' });
}

const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Small pieces ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<PromoStatus, string> = {
  upcoming: 'bg-blue-50 text-blue-700 border-blue-100',
  ongoing: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  live: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  sold_out: 'bg-gray-100 text-gray-600 border-gray-200',
  ended: 'bg-gray-50 text-gray-400 border-gray-100',
};
const STATUS_LABEL: Record<PromoStatus, string> = { upcoming: 'Upcoming', ongoing: 'Ongoing', live: 'Live', sold_out: 'Sold out', ended: 'Ended' };

function StatusPill({ status }: { status: PromoStatus }) {
  return <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}

function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-stone-800">{label}</label>
      {children}
      {error ? <p role="alert" className="text-[11.5px] font-medium text-red-600">{error}</p> : hint ? <p className="text-[11.5px] text-stone-500">{hint}</p> : null}
    </div>
  );
}

function input(error?: string) {
  return [
    'w-full px-3.5 py-2.5 text-[13.5px] border rounded-xl outline-none bg-white focus:ring-2 focus:ring-red-100',
    error ? 'border-red-400' : 'border-stone-300 focus:border-brand-red',
  ].join(' ');
}

function Row({ title, sub, status, right, actions }: { title: ReactNode; sub: ReactNode; status: PromoStatus; right?: ReactNode; actions?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
      <div className="flex-1 min-w-[220px]">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13.5px] font-semibold text-gray-900">{title}</p>
          <StatusPill status={status} />
        </div>
        <div className="mt-0.5 text-[12px] text-gray-500">{sub}</div>
      </div>
      {right && <div className="text-right">{right}</div>}
      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </li>
  );
}

const smallBtn = 'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition-colors';

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * The seller's promotions: scheduled store sales (one at a time per product, A28), two-hour flash sales whose price
 * wins over a store sale (A29), bundle discounts and buy-X-get-Y offers.
 */
export default function SellerPromotionsPage() {
  const pageRef = useMountAnim();
  const { showToast } = useToast();
  const [data, setData] = useState<PromotionsOverview | null>(null);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('sales');
  const [panel, setPanel] = useState<null | { kind: 'sale'; editing?: StoreSaleRow } | { kind: 'flash' } | { kind: 'bundle' } | { kind: 'bxgy' }>(null);
  const [ending, setEnding] = useState<null | { kind: 'sale' | 'flash' | 'promo'; id: number; name: string }>(null);
  const [endBusy, setEndBusy] = useState(false);

  const load = () => {
    setError('');
    Promise.all([getPromotionsApi(), getSellerProductsApi()])
      .then(([promos, rows]) => { setData(promos); setProducts(rows.filter((p) => p.status !== 'archived' || p.archived_by !== 'admin')); })
      .catch((e) => setError(apiProblem(e, 'Your promotions could not be loaded.').message));
  };
  useEffect(load, []);

  const reload = () => getPromotionsApi().then(setData).catch(() => undefined);

  const endNow = async () => {
    if (!ending) return;
    setEndBusy(true);
    try {
      const res = ending.kind === 'sale' ? await endStoreSaleApi(ending.id)
        : ending.kind === 'flash' ? await endFlashSaleApi(ending.id) : await endPromotionApi(ending.id);
      showToast(res.message);
      setEnding(null);
      reload();
    } catch (e) { showToast(apiProblem(e, 'It could not be ended.').message, 'error'); }
    finally { setEndBusy(false); }
  };

  const counts = {
    sales: data?.sales.filter((s) => s.status !== 'ended').length ?? 0,
    flash: data?.flash_sales.filter((s) => s.status !== 'ended').length ?? 0,
    bundles: data?.bundles.filter((s) => s.status !== 'ended').length ?? 0,
    bxgy: data?.bxgy.filter((s) => s.status !== 'ended').length ?? 0,
  };
  const TABS: { key: Tab; label: string; icon: React.ElementType; cta: string }[] = [
    { key: 'sales', label: 'Store sales', icon: BadgePercent, cta: 'New sale' },
    { key: 'flash', label: 'Flash sales', icon: Zap, cta: 'New flash sale' },
    { key: 'bundles', label: 'Bundles', icon: Layers, cta: 'New bundle' },
    { key: 'bxgy', label: 'Buy X Get Y', icon: Gift, cta: 'New offer' },
  ];
  const current = TABS.find((t) => t.key === tab)!;
  const openNew = () => setPanel(tab === 'sales' ? { kind: 'sale' } : tab === 'flash' ? { kind: 'flash' } : tab === 'bundles' ? { kind: 'bundle' } : { kind: 'bxgy' });

  const endButton = (kind: 'sale' | 'flash' | 'promo', id: number, name: string) => (
    <button type="button" onClick={() => setEnding({ kind, id, name })} className={`${smallBtn} text-gray-600 hover:text-red-700 hover:bg-red-50`}>
      <Square className="w-3 h-3" /> End now
    </button>
  );

  return (
    <div ref={pageRef} className="max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Promotions</h1>
          <p className="text-[13px] text-gray-500 mt-0.5 max-w-2xl">
            Discounts are priced on top of your regular prices and switch on and off by themselves. Times are Philippine time.
          </p>
        </div>
        <button type="button" onClick={openNew} disabled={!data}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-red text-white text-[13px] font-bold hover:bg-brand-red-dark transition-colors shadow-sm shadow-red-100 disabled:opacity-50">
          <Plus className="w-4 h-4" /> {current.cta}
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-700">
          <AlertTriangle className="w-4 h-4" /> <span className="flex-1">{error}</span>
          <button type="button" onClick={load} className="font-bold underline">Try again</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex gap-0.5 px-4 pt-4 overflow-x-auto" role="tablist" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = key === tab;
            return (
              <button key={key} type="button" role="tab" aria-selected={active} onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-[12.5px] font-semibold whitespace-nowrap border-b-2 transition-all ${active ? 'text-brand-red border-brand-red bg-red-50/50' : 'text-gray-500 border-transparent hover:text-gray-800 hover:bg-gray-50'}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
                {counts[key] > 0 && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-brand-red text-white' : 'bg-gray-100 text-gray-500'}`}>{counts[key]}</span>}
              </button>
            );
          })}
        </div>
        <div className="border-t border-gray-100" />

        {!data ? (
          <div className="p-5 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-gray-50 animate-pulse" />)}</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {tab === 'sales' && (data.sales.length ? data.sales.map((s) => (
              <Row key={s.id}
                title={s.product_name ?? 'Deleted product'}
                status={s.status}
                sub={<><CalendarClock className="inline w-3 h-3 mr-1 -mt-0.5" />{when(s.starts_at)} to {when(s.ends_at)}</>}
                right={<p className="text-[13px] font-bold text-brand-red">{s.discount_type === 'percent' ? `${s.discount_percent}% off` : `${peso(s.sale_price ?? 0)} sale price`}</p>}
                actions={s.status !== 'ended' && <>
                  <button type="button" onClick={() => setPanel({ kind: 'sale', editing: s })} className={`${smallBtn} text-gray-600 hover:bg-gray-100`}>Edit</button>
                  {endButton('sale', s.id, s.product_name ?? 'this sale')}
                </>}
              />
            )) : <Empty icon={BadgePercent} text="No store sales yet. A sale lowers a product's price for the dates you choose." />)}

            {tab === 'flash' && (data.flash_sales.length ? data.flash_sales.map((f) => (
              <Row key={f.id}
                title={<>{f.product_name ?? 'Deleted product'}{f.variant_label && f.variant_label !== 'Default' && <span className="font-normal text-gray-500"> · {f.variant_label}</span>}</>}
                status={f.status}
                sub={<><Zap className="inline w-3 h-3 mr-1 -mt-0.5" />{when(f.slot_start)} to {new Date(f.slot_end).toLocaleTimeString('en-PH', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })}</>}
                right={<>
                  <p className="text-[13px] font-bold text-brand-red tabular-nums">{peso(f.flash_price)} <span className="font-normal text-gray-400 line-through">{peso(f.regular_price)}</span></p>
                  <p className="text-[11.5px] text-gray-500 tabular-nums">{f.sold} sold · {f.remaining} of {f.quantity} left</p>
                </>}
                actions={f.status !== 'ended' && endButton('flash', f.id, f.product_name ?? 'this flash sale')}
              />
            )) : <Empty icon={Zap} text="No flash sales yet. A flash sale runs for one two-hour slot with a set quantity." />)}

            {tab === 'bundles' && (data.bundles.length ? data.bundles.map((b) => (
              <Row key={b.id} title={b.name} status={b.status}
                sub={<>Buy {b.min_quantity}+ of {b.products.map((p) => p.name).join(', ')} · {when(b.starts_at)} to {when(b.ends_at)}</>}
                right={<p className="text-[13px] font-bold text-brand-red">{b.discount_percent}% off</p>}
                actions={b.status !== 'ended' && endButton('promo', b.id, b.name)}
              />
            )) : <Empty icon={Layers} text="No bundles yet. A bundle gives a discount when a buyer takes several of the chosen products." />)}

            {tab === 'bxgy' && (data.bxgy.length ? data.bxgy.map((b) => (
              <Row key={b.id} title={b.name} status={b.status}
                sub={<>Buy {b.buy_quantity} × {b.buy_product?.name}, get {b.get_quantity} × {b.get_product?.name} free · {when(b.starts_at)} to {when(b.ends_at)}</>}
                actions={b.status !== 'ended' && endButton('promo', b.id, b.name)}
              />
            )) : <Empty icon={Gift} text="No buy-X-get-Y offers yet." />)}
          </ul>
        )}
      </div>

      {panel?.kind === 'sale' && (
        <SaleForm products={products} editing={panel.editing} onClose={() => setPanel(null)}
          onSaved={(m) => { showToast(m); setPanel(null); setTab('sales'); reload(); }} />
      )}
      {panel?.kind === 'flash' && data && (
        <FlashForm products={products} slots={data.slots} onClose={() => setPanel(null)}
          onSaved={(m) => { showToast(m); setPanel(null); setTab('flash'); reload(); }} />
      )}
      {(panel?.kind === 'bundle' || panel?.kind === 'bxgy') && (
        <PromoForm kind={panel.kind} products={products} onClose={() => setPanel(null)}
          onSaved={(m) => { showToast(m); setPanel(null); reload(); }} />
      )}

      <Dialog open={!!ending} onClose={() => !endBusy && setEnding(null)} title={`End ${ending?.name ?? ''} now?`}
        footer={<>
          <button type="button" className={BUTTON.ghost} disabled={endBusy} onClick={() => setEnding(null)}>Keep it</button>
          <button type="button" className={BUTTON.danger} disabled={endBusy} onClick={endNow}>{endBusy ? 'Ending…' : 'End now'}</button>
        </>}>
        <p className="text-[13.5px] text-stone-600">Buyers see the regular price straight away. Orders already placed keep the price they were placed at.</p>
      </Dialog>
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <li className="flex flex-col items-center gap-2 text-center py-14 px-6">
      <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center"><Icon className="w-6 h-6 text-gray-300" /></div>
      <p className="text-[13px] text-gray-500 max-w-sm">{text}</p>
    </li>
  );
}

function productOptions(products: SellerProduct[]) {
  return products.map((p) => ({ value: String(p.id), label: p.status === 'active' ? p.name : `${p.name} (${p.status === 'draft' ? 'draft' : 'not live'})` }));
}

function PanelFooter({ busy, onClose, label, onSubmit }: { busy: boolean; onClose: () => void; label: string; onSubmit: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className={BUTTON.ghost} onClick={onClose} disabled={busy}>Cancel</button>
      <button type="button" className={BUTTON.primary} onClick={onSubmit} disabled={busy}>{busy ? 'Saving…' : label}</button>
    </div>
  );
}

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{message}</p>;
}

// ─── Store sale ───────────────────────────────────────────────────────────────

function SaleForm({ products, editing, onClose, onSaved }: {
  products: SellerProduct[]; editing?: StoreSaleRow; onClose: () => void; onSaved: (message: string) => void;
}) {
  const running = editing?.status === 'ongoing';
  const [productId, setProductId] = useState(editing ? String(editing.product_id) : '');
  const [type, setType] = useState<'percent' | 'fixed'>(editing?.discount_type ?? 'percent');
  const [percent, setPercent] = useState(editing?.discount_percent ? String(editing.discount_percent) : '');
  const [salePrice, setSalePrice] = useState(editing?.sale_price ? String(editing.sale_price) : '');
  const [start, setStart] = useState(() => (editing ? toInput(editing.starts_at) : toInput(new Date(Date.now() + 5 * 60000))));
  const [end, setEnd] = useState(() => (editing ? toInput(editing.ends_at) : toInput(new Date(Date.now() + 7 * 86400000))));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);

  const product = products.find((p) => String(p.id) === productId);
  const prices = useMemo(() => [...new Set((product?.variants ?? []).map((v) => v.regular_price ?? v.price))], [product]);
  const onePrice = prices.length === 1 ? prices[0] : null;

  const preview = (product?.variants ?? []).slice(0, 8).map((v) => {
    const regular = v.regular_price ?? v.price;
    const sale = type === 'percent'
      ? Math.round(regular * (100 - Number(percent || 0))) / 100
      : Number(salePrice || 0);
    return { id: v.id, label: v.label, regular, sale };
  });

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!productId) e.product_id = 'Choose a product.';
    if (type === 'percent') {
      if (!/^\d+$/.test(percent) || Number(percent) < 1 || Number(percent) > 99) e.discount_percent = 'Use a whole percentage from 1% to 99%.';
    } else {
      if (onePrice === null && product) e.discount_type = 'This product has several prices. Use a percentage discount instead.';
      else if (!/^\d+(\.\d{1,2})?$/.test(salePrice) || Number(salePrice) < 1) e.sale_price = 'Enter a sale price of at least ₱1.00, with at most 2 decimals.';
      else if (onePrice !== null && Number(salePrice) >= onePrice) e.sale_price = `The sale price must be below the regular price of ${peso(onePrice)}.`;
    }
    if (!start) e.starts_at = 'Choose when the sale starts.';
    else if (!running && fromInput(start).getTime() < Date.now() - 60000) e.starts_at = 'The start cannot be in the past.';
    if (!end) e.ends_at = 'Choose when the sale ends.';
    else if (start && fromInput(end) <= fromInput(start)) e.ends_at = 'The end must be after the start.';
    else if (start && tooLong(start, end)) e.ends_at = tooLong(start, end)!;
    setErrors(e);
    setSummary('');
    if (Object.keys(e).length) return;

    setBusy(true);
    const payload = {
      product_id: Number(productId), discount_type: type,
      discount_percent: type === 'percent' ? Number(percent) : null,
      sale_price: type === 'fixed' ? Number(salePrice) : null,
      starts_at: start, ends_at: end,
    };
    try {
      const res = editing ? await updateStoreSaleApi(editing.id, payload) : await createStoreSaleApi(payload);
      onSaved(res.message);
    } catch (err) {
      const p = apiProblem(err, 'The sale could not be saved.');
      setErrors(p.fields);
      setSummary(Object.keys(p.fields).length ? '' : p.message);
    } finally { setBusy(false); }
  };

  return (
    <SidePanel open onClose={onClose} title={editing ? 'Edit sale' : 'New store sale'}
      subtitle={running ? 'This sale is running: you can change the discount and the end. New orders get the new price at once.' : 'A product can be in one store sale at a time.'}
      footer={<PanelFooter busy={busy} onClose={onClose} onSubmit={submit} label={editing ? 'Save sale' : 'Schedule sale'} />}>
      <FormError message={summary} />
      <div className="space-y-4">
        <Field label="Product" error={errors.product_id}>
          <CustomSelect value={productId} onChange={(v) => { setProductId(v); setErrors({}); }} options={productOptions(products)}
            placeholder="Choose a product" disabled={!!editing} error={errors.product_id} />
        </Field>

        <Field label="Discount" error={errors.discount_type}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(['percent', 'fixed'] as const).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => { setType(t); setErrors({}); }}
                className={`px-3 py-2.5 rounded-xl border text-[13px] font-semibold transition-colors ${type === t ? 'border-brand-red bg-red-50 text-brand-red' : 'border-stone-300 text-stone-700 hover:border-stone-500'}`}>
                {t === 'percent' ? 'Percentage off' : 'Fixed sale price'}
              </button>
            ))}
          </div>
        </Field>

        {type === 'percent' ? (
          <Field label="Percentage off" htmlFor="sale-pct" error={errors.discount_percent} hint="1% to 99%">
            <div className="relative">
              <input id="sale-pct" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} className={input(errors.discount_percent) + ' pr-9'} placeholder="e.g. 15" />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-stone-400">%</span>
            </div>
          </Field>
        ) : (
          <Field label="Sale price (₱)" htmlFor="sale-price" error={errors.sale_price}
            hint={onePrice !== null ? `Regular price ${peso(onePrice)}` : product ? 'Only for products with one price.' : undefined}>
            <input id="sale-price" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className={input(errors.sale_price)} placeholder="0.00" />
          </Field>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Starts" htmlFor="sale-start" error={errors.starts_at}>
            <input id="sale-start" type="datetime-local" value={start} disabled={running} onChange={(e) => setStart(e.target.value)} className={input(errors.starts_at) + ' disabled:bg-stone-50 disabled:text-stone-500'} />
          </Field>
          <Field label="Ends" htmlFor="sale-end" error={errors.ends_at}>
            <input id="sale-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={input(errors.ends_at)} />
          </Field>
        </div>

        {product && preview.length > 0 && (type === 'percent' ? Number(percent) > 0 : Number(salePrice) > 0) && (
          <div className="rounded-xl border border-stone-200">
            <p className="px-3 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500">Buyers will see</p>
            <ul className="divide-y divide-stone-100">
              {preview.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                  <span className="text-stone-700 truncate">{v.label === 'Default' ? product.name : v.label}</span>
                  <span className="tabular-nums"><span className="text-stone-400 line-through mr-2">{peso(v.regular)}</span><span className="font-semibold text-brand-red">{peso(v.sale)}</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </SidePanel>
  );
}

// ─── Flash sale ───────────────────────────────────────────────────────────────

function FlashForm({ products, slots, onClose, onSaved }: {
  products: SellerProduct[]; slots: PromotionsOverview['slots']; onClose: () => void; onSaved: (message: string) => void;
}) {
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [slot, setSlot] = useState(slots[0] ? `${slots[0].date}|${slots[0].hour}` : '');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);

  const product = products.find((p) => String(p.id) === productId);
  const variants = product?.variants ?? [];
  const variant = variants.length === 1 ? variants[0] : variants.find((v) => String(v.id) === variantId);
  const regular = variant ? variant.regular_price ?? variant.price : null;

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!productId) e.product_id = 'Choose a product.';
    else if (!variant) e.product_variant_id = 'Choose which variant goes on flash sale.';
    if (!slot) e.slot_hour = 'Choose a two-hour slot.';
    if (!/^\d+(\.\d{1,2})?$/.test(price) || Number(price) < 1) e.flash_price = 'Enter a flash price of at least ₱1.00, with at most 2 decimals.';
    else if (regular !== null && Number(price) >= regular) e.flash_price = `The flash price must be below the regular price of ${peso(regular)}.`;
    if (!/^\d+$/.test(qty) || Number(qty) < 1) e.quantity = 'Enter a whole number of at least 1.';
    else if (variant && Number(qty) > variant.stock_quantity) e.quantity = `The flash quantity cannot be more than the ${variant.stock_quantity} in stock.`;
    setErrors(e);
    setSummary('');
    if (Object.keys(e).length) return;

    const [slotDate, slotHour] = slot.split('|');
    setBusy(true);
    try {
      const res = await createFlashSaleApi({
        product_id: Number(productId), product_variant_id: variant?.id ?? null,
        slot_date: slotDate, slot_hour: Number(slotHour), flash_price: Number(price), quantity: Number(qty),
      });
      onSaved(res.message);
    } catch (err) {
      const p = apiProblem(err, 'The flash sale could not be saved.');
      setErrors(p.fields);
      setSummary(Object.keys(p.fields).length ? '' : p.message);
    } finally { setBusy(false); }
  };

  return (
    <SidePanel open onClose={onClose} title="New flash sale"
      subtitle="Runs for one two-hour slot. Its price wins over a store sale, and it stops when the quantity sells out."
      footer={<PanelFooter busy={busy} onClose={onClose} onSubmit={submit} label="Schedule flash sale" />}>
      <FormError message={summary} />
      <div className="space-y-4">
        <Field label="Product" error={errors.product_id}>
          <CustomSelect value={productId} onChange={(v) => { setProductId(v); setVariantId(''); setErrors({}); }}
            options={productOptions(products)} placeholder="Choose a product" error={errors.product_id} />
        </Field>
        {variants.length > 1 && (
          <Field label="Variant" error={errors.product_variant_id}>
            <CustomSelect value={variantId} onChange={setVariantId} placeholder="Choose a variant" error={errors.product_variant_id}
              options={variants.map((v) => ({ value: String(v.id), label: `${v.label} · ${peso(v.regular_price ?? v.price)} · ${v.stock_quantity} in stock` }))} />
          </Field>
        )}
        <Field label="Slot" error={errors.slot_hour} hint="Philippine time">
          <CustomSelect value={slot} onChange={setSlot} options={slots.map((s) => ({ value: `${s.date}|${s.hour}`, label: s.label }))}
            placeholder={slots.length ? 'Choose a slot' : 'No slots left today or tomorrow'} error={errors.slot_hour} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Flash price (₱)" htmlFor="fl-price" error={errors.flash_price} hint={regular !== null ? `Regular ${peso(regular)}` : undefined}>
            <input id="fl-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={input(errors.flash_price)} placeholder="0.00" />
          </Field>
          <Field label="Quantity" htmlFor="fl-qty" error={errors.quantity} hint={variant ? `${variant.stock_quantity} in stock` : undefined}>
            <input id="fl-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={input(errors.quantity)} placeholder="e.g. 20" />
          </Field>
        </div>
        <p className="text-[12px] text-stone-500">Buyers who follow your shop can ask to be reminded when the slot starts.</p>
      </div>
    </SidePanel>
  );
}

// ─── Bundle and buy-X-get-Y ───────────────────────────────────────────────────

function PromoForm({ kind, products, onClose, onSaved }: {
  kind: 'bundle' | 'bxgy'; products: SellerProduct[]; onClose: () => void; onSaved: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [minQty, setMinQty] = useState('2');
  const [percent, setPercent] = useState('');
  const [buyId, setBuyId] = useState('');
  const [buyQty, setBuyQty] = useState('1');
  const [getId, setGetId] = useState('');
  const [getQty, setGetQty] = useState('1');
  const [start, setStart] = useState(() => toInput(new Date(Date.now() + 5 * 60000)));
  const [end, setEnd] = useState(() => toInput(new Date(Date.now() + 7 * 86400000)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);

  const whole = (v: string, min: number, max: number) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max;

  const submit = async () => {
    const e: Record<string, string> = {};
    const n = name.trim();
    const nameProblem = displayNameError(name, 'The name', 3, 80);
    if (nameProblem) e.name = nameProblem;
    if (kind === 'bundle') {
      if (picked.length === 0) e.product_ids = 'Choose at least one product.';
      if (!whole(minQty, 2, 99)) e.min_quantity = 'Use a whole number from 2 to 99.';
      if (!whole(percent, 1, 99)) e.discount_percent = 'Use a whole percentage from 1% to 99%.';
    } else {
      if (!buyId) e.buy_product_id = 'Choose the product to buy.';
      if (!whole(buyQty, 1, 99)) e.buy_quantity = 'Use a whole number from 1 to 99.';
      if (!getId) e.get_product_id = 'Choose the free product.';
      if (!whole(getQty, 1, 99)) e.get_quantity = 'Use a whole number from 1 to 99.';
    }
    // A cleared date is an Invalid Date, which compares false both ways: check that it is there first.
    if (!start) e.starts_at = 'Choose when the promotion starts.';
    else if (fromInput(start).getTime() < Date.now() - 60000) e.starts_at = 'The start cannot be in the past.';
    if (!end) e.ends_at = 'Choose when the promotion ends.';
    else if (start && fromInput(end) <= fromInput(start)) e.ends_at = 'The end must be after the start.';
    else if (start && tooLong(start, end)) e.ends_at = tooLong(start, end)!;
    setErrors(e);
    setSummary('');
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      const res = await createPromotionApi(kind === 'bundle'
        ? { type: 'bundle', name: n, product_ids: picked, min_quantity: Number(minQty), discount_percent: Number(percent), starts_at: start, ends_at: end }
        : { type: 'bxgy', name: n, buy_product_id: Number(buyId), buy_quantity: Number(buyQty), get_product_id: Number(getId), get_quantity: Number(getQty), starts_at: start, ends_at: end });
      onSaved(res.message);
    } catch (err) {
      const p = apiProblem(err, 'The promotion could not be saved.');
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(p.fields)) fields[k.startsWith('product_ids') ? 'product_ids' : k] = v;
      setErrors(fields);
      setSummary(Object.keys(fields).length ? '' : p.message);
    } finally { setBusy(false); }
  };

  const options = productOptions(products);

  return (
    <SidePanel open onClose={onClose} title={kind === 'bundle' ? 'New bundle' : 'New buy X get Y'}
      subtitle={kind === 'bundle' ? 'A discount when a buyer takes the minimum quantity from the chosen products in one order.' : 'The free item is added at ₱0 when the buyer orders the required quantity.'}
      footer={<PanelFooter busy={busy} onClose={onClose} onSubmit={submit} label="Save promotion" />}>
      <FormError message={summary} />
      <div className="space-y-4">
        <Field label="Name" htmlFor="pr-name" error={errors.name} hint="Buyers see this name. 3 to 80 characters.">
          <input id="pr-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={input(errors.name)} placeholder={kind === 'bundle' ? 'e.g. Skincare set' : 'e.g. Buy 2 get 1 free'} />
        </Field>

        {kind === 'bundle' ? (
          <>
            <Field label="Products" error={errors.product_ids} hint={`${picked.length} chosen`}>
              <div className="max-h-56 overflow-y-auto rounded-xl border border-stone-300 divide-y divide-stone-100">
                {products.map((p) => {
                  const on = picked.includes(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer hover:bg-stone-50">
                      <input type="checkbox" checked={on} className="w-4 h-4 accent-brand-red"
                        onChange={() => setPicked((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))} />
                      <span className="flex-1 text-stone-800 truncate">{p.name}</span>
                      {p.status !== 'active' && <span className="text-[11px] text-stone-400">{p.status === 'draft' ? 'draft' : 'not live'}</span>}
                    </label>
                  );
                })}
                {products.length === 0 && <p className="px-3 py-3 text-[13px] text-stone-500">Add products first.</p>}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Minimum items" htmlFor="pr-min" error={errors.min_quantity} hint="2 to 99">
                <input id="pr-min" inputMode="numeric" value={minQty} onChange={(e) => setMinQty(e.target.value)} className={input(errors.min_quantity)} />
              </Field>
              <Field label="Discount (%)" htmlFor="pr-pct" error={errors.discount_percent} hint="1% to 99%">
                <input id="pr-pct" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} className={input(errors.discount_percent)} placeholder="e.g. 10" />
              </Field>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_96px] gap-3">
              <Field label="Buy" error={errors.buy_product_id}>
                <CustomSelect value={buyId} onChange={setBuyId} options={options} placeholder="Product" error={errors.buy_product_id} />
              </Field>
              <Field label="Quantity" htmlFor="pr-bq" error={errors.buy_quantity}>
                <input id="pr-bq" inputMode="numeric" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} className={input(errors.buy_quantity)} />
              </Field>
            </div>
            <div className="grid grid-cols-[1fr_96px] gap-3">
              <Field label="Get free" error={errors.get_product_id}>
                <CustomSelect value={getId} onChange={setGetId} options={options} placeholder="Product" error={errors.get_product_id} />
              </Field>
              <Field label="Quantity" htmlFor="pr-gq" error={errors.get_quantity}>
                <input id="pr-gq" inputMode="numeric" value={getQty} onChange={(e) => setGetQty(e.target.value)} className={input(errors.get_quantity)} />
              </Field>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Starts" htmlFor="pr-start" error={errors.starts_at}>
            <input id="pr-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={input(errors.starts_at)} />
          </Field>
          <Field label="Ends" htmlFor="pr-end" error={errors.ends_at}>
            <input id="pr-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={input(errors.ends_at)} />
          </Field>
        </div>
      </div>
    </SidePanel>
  );
}

