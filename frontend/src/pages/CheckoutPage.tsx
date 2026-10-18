import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Check, UploadCloud, ShieldCheck, ShoppingBag, X, MapPin, Store, Banknote, Lock,
  Loader2, Truck, Gift, Ticket, CreditCard, Wallet, Zap, Tag,
} from 'lucide-react';
import { pesoCompact as peso } from '../utils/pricing';
import LovedItLogo from '../components/LovedItLogo';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { getAddressesApi } from '../api/client';
import { placeCheckoutOrderApi, quoteCheckoutApi } from '../api/commerce';
import type { CheckoutInput, CheckoutQuote, QuoteStore, WalletVoucher } from '../api/commerce';
import type { Address, Order } from '../types';
import { useShopPaymentInfo } from '../hooks/useShopDelivery';
import { GcashPayee, ReferenceField } from '../components/payments/GcashKit';
import { apiProblem } from '../utils/apiError';
import gcashMark from '../assets/brand/gcash-mark.svg';

type Method = 'cod' | 'gcash' | 'e_wallet' | 'card';
type PayErrors = { reference?: string; receipt?: string };
const NOTE_MAX = 200;

function newKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Checkout (B8, B9). Everything on the page comes from the server's quote, so what the buyer sees is what Place
 * Order charges: prices now, flash lines, shop promotions, one store voucher per shop plus one platform and one
 * shipping voucher (A2), shipping per shop for its route and weight (A20). If anything changes before the order is
 * placed (a price, a voucher ending), nothing is charged and the new total is shown to confirm.
 */
export default function CheckoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { refresh: refreshCart } = useCart();
  const [params] = useSearchParams();
  const buyVariant = Number(params.get('buy') || 0);
  const buyQty = Math.max(1, Number(params.get('qty') || 1));

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [storeCodes, setStoreCodes] = useState<Record<number, string>>({});
  const [platformCode, setPlatformCode] = useState<string | null>(null);
  const [shippingCode, setShippingCode] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [method, setMethod] = useState<Method>('cod');
  const [refs, setRefs] = useState<Record<number, string>>({});
  const [proofs, setProofs] = useState<Record<number, File>>({});
  const [payErrors, setPayErrors] = useState<Record<number, PayErrors>>({});

  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [quoting, setQuoting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [changeNotice, setChangeNotice] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ orders: Order[]; method: Method } | null>(null);
  const idempotency = useRef(newKey());
  const shopRefs = useRef<Record<number, HTMLElement | null>>({});

  const input = useMemo<CheckoutInput>(() => ({
    source: buyVariant ? 'buy_now' : 'cart',
    items: buyVariant ? [{ variant_id: buyVariant, quantity: buyQty }] : undefined,
    address_id: addressId ?? undefined,
    vouchers: { store: storeCodes, platform: platformCode, shipping: shippingCode },
  }), [buyVariant, buyQty, addressId, storeCodes, platformCode, shippingCode]);

  useEffect(() => {
    if (!user) return;
    getAddressesApi()
      .then((res: unknown) => {
        const list: Address[] = Array.isArray(res) ? res : ((res as { data?: Address[] })?.data ?? []);
        setAddresses(list);
        const def = list.find((a) => a.is_default && a.barangay_code) ?? list.find((a) => a.barangay_code) ?? list[0];
        if (def) setAddressId(def.id);
        else setQuoting(false);
      })
      .catch(() => setQuoting(false));
  }, [user]);

  // Re-price whenever the address or a voucher changes.
  const reprice = useCallback(async () => {
    setQuoting(true);
    try {
      setQuote(await quoteCheckoutApi(input));
      setErrorMsg(null);
    } catch (e) {
      setErrorMsg(apiProblem(e, 'Checkout could not be loaded. Refresh the page.').message);
    } finally {
      setQuoting(false);
    }
  }, [input]);
  useEffect(() => {
    const t = window.setTimeout(() => { void reprice(); }, 150);
    return () => window.clearTimeout(t);
  }, [reprice]);

  const stores = quote?.stores ?? [];
  const shopInfo = useShopPaymentInfo(stores.map((s) => s.seller.id), method === 'gcash', user?.id);
  const gcashBlockers = stores.filter((s) => !s.seller.accepts_gcash);
  const address = addresses.find((a) => a.id === addressId);
  const addressNeedsUpdate = !!address && (address.address_needs_update || !address.barangay_code);
  const proofPreviews = useMemo(() => Object.fromEntries(Object.entries(proofs).map(([id, f]) => [id, URL.createObjectURL(f)])), [proofs]);
  useEffect(() => () => Object.values(proofPreviews).forEach((u) => URL.revokeObjectURL(u)), [proofPreviews]);

  const noteError = (sellerId: number) => ((notes[sellerId] ?? '').length > NOTE_MAX ? `A note can be at most ${NOTE_MAX} characters.` : undefined);
  const blocking = (quote?.problems ?? []).filter((p) => p.type !== 'address' || !addressId);
  const canPlace = !!quote?.can_place && !quoting && !submitting && !addressNeedsUpdate && stores.every((s) => !noteError(s.seller.id))
    && (method !== 'gcash' || gcashBlockers.length === 0);

  const setShopError = (sellerId: number, patch: PayErrors) => setPayErrors((p) => ({ ...p, [sellerId]: { ...p[sellerId], ...patch } }));
  const pickProof = (sellerId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setShopError(sellerId, { receipt: 'The receipt must be a JPG or PNG image.' }); return; }
    if (file.size > 5 * 1024 * 1024) { setShopError(sellerId, { receipt: 'That screenshot is over 5 MB. Crop it or take a smaller one.' }); return; }
    setProofs((p) => ({ ...p, [sellerId]: file }));
    setShopError(sellerId, { receipt: undefined });
  };

  const place = async () => {
    if (!quote || !canPlace) return;
    setErrorMsg(null);
    setChangeNotice(null);
    setPayErrors({});

    if (method === 'gcash') {
      const errors: Record<number, PayErrors> = {};
      for (const s of stores) {
        const ref = refs[s.seller.id] ?? '';
        const err: PayErrors = {};
        if (!ref) err.reference = 'Enter the reference number from your GCash receipt.';
        else if (ref.length !== 13) err.reference = `A GCash reference number has 13 digits; this one has ${ref.length}.`;
        if (!proofs[s.seller.id]) err.receipt = 'Upload the screenshot of your GCash receipt so the shop can check your payment.';
        if (err.reference || err.receipt) errors[s.seller.id] = err;
      }
      const first = stores.find((s) => errors[s.seller.id]);
      if (first) {
        setPayErrors(errors);
        shopRefs.current[first.seller.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    const fields: Record<string, unknown> = {
      ...input, payment_method: method, expected_total: quote.totals.total,
      notes: Object.fromEntries(Object.entries(notes).filter(([, n]) => n.trim() !== '')),
    };
    let body: Record<string, unknown> | FormData = fields;
    if (method === 'gcash') {
      const fd = new FormData();
      fd.append('source', input.source);
      input.items?.forEach((it, i) => { fd.append(`items[${i}][variant_id]`, String(it.variant_id)); fd.append(`items[${i}][quantity]`, String(it.quantity)); });
      if (addressId) fd.append('address_id', String(addressId));
      Object.entries(storeCodes).forEach(([sid, code]) => code && fd.append(`vouchers[store][${sid}]`, code));
      if (platformCode) fd.append('vouchers[platform]', platformCode);
      if (shippingCode) fd.append('vouchers[shipping]', shippingCode);
      Object.entries(notes).forEach(([sid, n]) => n.trim() && fd.append(`notes[${sid}]`, n.trim()));
      fd.append('payment_method', 'gcash');
      fd.append('expected_total', String(quote.totals.total));
      for (const s of stores) {
        fd.append(`gcash[${s.seller.id}][reference]`, refs[s.seller.id] ?? '');
        const proof = proofs[s.seller.id];
        if (proof) fd.append(`gcash_proof[${s.seller.id}]`, proof);
      }
      body = fd;
    }

    setSubmitting(true);
    try {
      const res = await placeCheckoutOrderApi<Order>(body, idempotency.current);
      void refreshCart();
      if (res.payment && (method === 'e_wallet' || method === 'card')) {
        navigate(`/pay/${res.payment.token}`, { replace: true });
        return;
      }
      setPlaced({ orders: res.orders.length ? res.orders : [res.data], method });
    } catch (err) {
      const res = (err as { response?: { status?: number; data?: { code?: string; message?: string; quote?: CheckoutQuote; errors?: Record<string, string[]> } } })?.response;
      if (res?.status === 409 && res.data?.quote) {
        // Nothing was charged: show the new total for the buyer to confirm, with a fresh key for the retry.
        setQuote(res.data.quote);
        setChangeNotice(res.data.message ?? 'Something changed. Check the new total and place the order again.');
        idempotency.current = newKey();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const fieldErrors = res?.data?.errors ?? {};
        const serverPay: Record<number, PayErrors> = {};
        for (const s of stores) {
          const single = stores.length === 1;
          const reference = fieldErrors[`gcash.${s.seller.id}.reference`]?.[0] ?? (single ? fieldErrors.payment_reference?.[0] : undefined);
          const receipt = fieldErrors[`gcash_proof.${s.seller.id}`]?.[0] ?? (single ? fieldErrors.payment_proof?.[0] : undefined);
          if (reference || receipt) serverPay[s.seller.id] = { reference, receipt };
        }
        if (Object.keys(serverPay).length) setPayErrors(serverPay);
        setErrorMsg(apiProblem(err, 'The order could not be placed. Check the details and try again.').message);
        idempotency.current = newKey();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (placed) return <Placed orders={placed.orders} method={placed.method} />;

  const empty = !quoting && quote && stores.length === 0;

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col">
      <CheckoutBar step={2} />

      <div className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-8 py-8">
        {empty ? (
          <div className="max-w-md mx-auto text-center py-16">
            <span className="mx-auto w-16 h-16 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-400"><ShoppingBag className="w-7 h-7" /></span>
            <h2 className="mt-4 text-lg font-semibold text-stone-900">Nothing to check out</h2>
            <p className="mt-1 text-sm text-stone-500">Select the items you want in your cart, then come back here.</p>
            <Link to="/cart" className="mt-5 inline-flex h-11 px-6 rounded-full bg-brand-red text-white text-sm font-semibold items-center">Go to my cart</Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-8 items-start">
            <div className="space-y-4">
              {changeNotice && (
                <div role="alert" className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-300 text-[13.5px] text-amber-900">
                  <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
                  <span><span className="font-semibold">Your order was not placed.</span> {changeNotice}</span>
                </div>
              )}

              <Section step={1} title="Delivery address" hint="Where should the rider bring your order?"
                aside={<Link to="/settings/addresses" className="text-[13px] font-semibold text-brand-red hover:underline shrink-0">Manage</Link>}>
                {addresses.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-dashed border-stone-300">
                    <span className="text-[13px] text-stone-600">Add a delivery address to see shipping and check out.</span>
                    <Link to="/settings/addresses" className="h-9 px-4 rounded-full bg-stone-900 text-white text-[13px] font-semibold flex items-center">Add address</Link>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Saved addresses">
                    {addresses.map((a) => {
                      const needs = Boolean(a.address_needs_update || !a.barangay_code);
                      const on = addressId === a.id;
                      return (
                        <button key={a.id} type="button" role="radio" aria-checked={on} onClick={() => setAddressId(a.id)}
                          className={`relative text-left p-4 rounded-2xl border-[1.5px] transition-colors ${on ? (needs ? 'border-amber-500 bg-amber-50/40' : 'border-brand-red bg-rose-50/40') : 'border-stone-200 hover:border-stone-400'}`}>
                          <span className="flex items-center gap-2 pr-6">
                            <MapPin className={`w-4 h-4 shrink-0 ${on ? 'text-brand-red' : 'text-stone-400'}`} />
                            <span className="text-[14px] font-semibold text-stone-900 truncate">{a.full_name || a.recipient_name}</span>
                            {a.is_default && <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-red">Default</span>}
                          </span>
                          <span className="block mt-1.5 text-[12px] text-stone-600 leading-relaxed">
                            {[a.floor_unit, a.address || a.street_address, a.ward || a.barangay_name, a.district || a.city_name, a.province || a.province_name].filter(Boolean).join(', ')}
                          </span>
                          <span className="block mt-1 text-[12px] text-stone-400">{a.phone || a.phone_number}</span>
                          {needs && <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"><AlertCircle className="w-3 h-3" /> Needs an update</span>}
                          <span className={`absolute top-4 right-4 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center ${on ? 'border-brand-red' : 'border-stone-300'}`}>
                            {on && <span className="w-2 h-2 rounded-full bg-brand-red" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {addressNeedsUpdate && (
                  <p className="mt-3 text-[13px] text-amber-800">This address needs its barangay, city and province picked again. Update it in your address book first.</p>
                )}
              </Section>

              <Section step={2} title="Items and delivery" hint={stores.length > 1 ? `Ships as ${stores.length} parcels, one from each shop.` : 'Ships as one parcel.'}>
                {quoting && !quote ? (
                  <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-32 rounded-2xl bg-stone-100 animate-pulse" />)}</div>
                ) : (
                  <div className="space-y-4">
                    {stores.map((s) => (
                      <StoreBlock key={s.seller.id} store={s} wallet={(quote?.wallet ?? []).filter((v) => v.scope === 'store' && v.seller?.id === s.seller.id)}
                        code={storeCodes[s.seller.id] ?? ''} onCode={(code) => setStoreCodes((c) => ({ ...c, [s.seller.id]: code }))}
                        note={notes[s.seller.id] ?? ''} onNote={(n) => setNotes((x) => ({ ...x, [s.seller.id]: n }))} noteError={noteError(s.seller.id)} />
                    ))}
                  </div>
                )}
              </Section>

              <Section step={3} title="Loved-IT vouchers" hint="One platform voucher and one shipping voucher per order. Loved-IT pays for these.">
                <div className="grid sm:grid-cols-2 gap-4">
                  <VoucherPicker label="Platform voucher" wallet={(quote?.wallet ?? []).filter((v) => v.scope === 'platform')}
                    code={platformCode ?? ''} onCode={(c) => setPlatformCode(c || null)} result={quote?.platform_voucher ?? null} />
                  <VoucherPicker label="Shipping voucher" wallet={(quote?.wallet ?? []).filter((v) => v.scope === 'shipping')}
                    code={shippingCode ?? ''} onCode={(c) => setShippingCode(c || null)} result={quote?.shipping_voucher ?? null} />
                </div>
              </Section>

              <Section step={4} title="Payment" hint="Choose how you want to pay.">
                <div className="grid sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Payment method">
                  {([
                    { key: 'cod', title: 'Cash on delivery', text: 'Pay the rider when your parcel arrives', badge: <span className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0"><Banknote className="w-5 h-5" /></span> },
                    { key: 'e_wallet', title: 'E-wallet', text: 'Pay now on the secure payment page', badge: <span className="w-11 h-11 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0"><Wallet className="w-5 h-5" /></span> },
                    { key: 'card', title: 'Credit or debit card', text: 'Pay now on the secure payment page', badge: <span className="w-11 h-11 rounded-xl bg-stone-900 text-white flex items-center justify-center shrink-0"><CreditCard className="w-5 h-5" /></span> },
                    { key: 'gcash', title: 'GCash to the shop', text: gcashBlockers.length ? 'Not every shop in this order takes GCash' : 'Send to each shop, then upload the receipt', badge: <span className="w-11 h-11 rounded-xl bg-white ring-1 ring-stone-200 flex items-center justify-center shrink-0"><img src={gcashMark} alt="" className="w-8 h-8 object-contain" /></span> },
                  ] as const).map((m) => {
                    const on = method === m.key;
                    const off = m.key === 'gcash' && gcashBlockers.length > 0;
                    return (
                      <button key={m.key} type="button" role="radio" aria-checked={on} disabled={off} onClick={() => setMethod(m.key)}
                        className={`flex items-center gap-3 p-3.5 text-left rounded-2xl border-[1.5px] transition-colors disabled:opacity-55 disabled:cursor-not-allowed ${on ? 'border-brand-red bg-rose-50/40' : 'border-stone-200 hover:border-stone-400'}`}>
                        {m.badge}
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] font-semibold text-stone-900">{m.title}</span>
                          <span className="block text-[12px] text-stone-500">{m.text}</span>
                        </span>
                        <span className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'border-brand-red' : 'border-stone-300'}`}>
                          {on && <span className="w-2 h-2 rounded-full bg-brand-red" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {(method === 'e_wallet' || method === 'card') && (
                  <p className="mt-4 flex items-start gap-2.5 p-4 rounded-2xl bg-sky-50 border border-sky-100 text-[13px] text-sky-900">
                    <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>After you place the order you go to the payment page. Pay within 1 hour, or the order is cancelled and its items and vouchers are released.</span>
                  </p>
                )}
                {method === 'gcash' && (
                  <div className="mt-5 space-y-3">
                    {stores.map((s, i) => {
                      const info = shopInfo[s.seller.id];
                      const err = payErrors[s.seller.id] ?? {};
                      const preview = proofPreviews[s.seller.id];
                      return (
                        <section key={s.seller.id} ref={(el) => { shopRefs.current[s.seller.id] = el; }} className="rounded-2xl border border-stone-200 p-4 sm:p-5 space-y-4" aria-label={`GCash payment to ${s.seller.shop_name}`}>
                          <p className="flex items-center gap-2 text-[14px] font-semibold text-stone-900 min-w-0">
                            {stores.length > 1 && <span className="w-6 h-6 rounded-full bg-stone-900 text-white text-[12px] flex items-center justify-center shrink-0">{i + 1}</span>}
                            <span className="truncate">{s.seller.shop_name}</span>
                          </p>
                          {info?.gcash ? <GcashPayee account={info.gcash} amount={s.total} /> : <div className="h-28 rounded-2xl bg-stone-100 animate-pulse" />}
                          <ReferenceField id={`gcash-ref-${s.seller.id}`} value={refs[s.seller.id] ?? ''} error={err.reference}
                            onChange={(v) => { setRefs((r) => ({ ...r, [s.seller.id]: v })); if (err.reference) setShopError(s.seller.id, { reference: undefined }); }} />
                          <div>
                            <span className="block text-[12px] font-medium text-stone-600 mb-1.5">Receipt screenshot</span>
                            {preview ? (
                              <div className="flex items-center gap-4 p-3 rounded-2xl border border-emerald-200 bg-emerald-50/50">
                                <img src={preview} alt={`GCash receipt for ${s.seller.shop_name}`} className="w-16 h-16 rounded-xl object-cover ring-1 ring-emerald-200" />
                                <span className="flex-1 min-w-0 text-[13px]"><span className="flex items-center gap-1 font-semibold text-emerald-800"><CheckCircle2 className="w-4 h-4" /> Receipt attached</span></span>
                                <button type="button" onClick={() => setProofs((p) => { const n = { ...p }; delete n[s.seller.id]; return n; })} className="h-8 px-3 rounded-full border border-stone-300 bg-white text-[12px] font-semibold text-stone-700 hover:border-stone-900 flex items-center gap-1">
                                  <X className="w-3.5 h-3.5" /> Remove
                                </button>
                              </div>
                            ) : (
                              <label className={`flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${err.receipt ? 'border-brand-red bg-rose-50/40' : 'border-stone-300 hover:border-brand-red hover:bg-rose-50/30'}`}>
                                <UploadCloud className={`w-6 h-6 shrink-0 ${err.receipt ? 'text-brand-red' : 'text-stone-400'}`} />
                                <span><span className="block text-[13px] font-semibold text-brand-red">Upload the receipt</span><span className="block text-[12px] text-stone-400">JPG or PNG screenshot, up to 5 MB</span></span>
                                <input type="file" accept="image/png,image/jpeg" onChange={(e) => pickProof(s.seller.id, e)} className="sr-only" />
                              </label>
                            )}
                            {err.receipt && <p role="alert" className="mt-1.5 text-[12px] font-medium text-brand-red">{err.receipt}</p>}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </Section>
            </div>

            <aside className="lg:sticky lg:top-24 rounded-3xl bg-white border border-stone-200 overflow-hidden">
              <div className="px-6 pt-6 pb-2">
                <h2 className="text-lg font-semibold text-stone-900">Summary</h2>
                <p className="text-[13px] text-stone-500 tabular-nums">{quote?.totals.items ?? 0} items · {stores.length} parcel{stores.length === 1 ? '' : 's'}</p>
              </div>
              <div className="px-6 pb-6">
                <dl className="mt-3 space-y-2 text-[14px]">
                  <Row label="Merchandise" value={peso(quote?.totals.merchandise ?? 0)} />
                  {(quote?.totals.promo_discount ?? 0) > 0 && <Row label="Shop promotions" value={`−${peso(quote!.totals.promo_discount)}`} tone="good" />}
                  {(quote?.totals.store_discount ?? 0) > 0 && <Row label="Store vouchers" value={`−${peso(quote!.totals.store_discount)}`} tone="good" />}
                  {(quote?.totals.platform_discount ?? 0) > 0 && <Row label="Platform voucher" value={`−${peso(quote!.totals.platform_discount)}`} tone="good" />}
                  <Row label={`Shipping${stores.length > 1 ? ` (${stores.length} parcels)` : ''}`} value={addressId ? peso(quote?.totals.shipping ?? 0) : '—'} />
                  {(quote?.totals.shipping_discount ?? 0) > 0 && <Row label="Shipping voucher" value={`−${peso(quote!.totals.shipping_discount)}`} tone="good" />}
                  <div className="flex justify-between items-baseline pt-3 border-t border-stone-200">
                    <dt className="text-[15px] font-semibold text-stone-900">Total</dt>
                    <dd className="text-[26px] font-bold tracking-tight text-brand-red tabular-nums">{quoting ? <Loader2 className="w-5 h-5 animate-spin inline" /> : peso(quote?.totals.total ?? 0)}</dd>
                  </div>
                </dl>

                {blocking.length > 0 && !quoting && (
                  <ul role="alert" className="mt-4 space-y-1.5 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-[12.5px] text-brand-red">
                    {blocking.map((p, i) => <li key={i} className="flex gap-2"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{p.message}</li>)}
                  </ul>
                )}
                {errorMsg && (
                  <div role="alert" className="mt-4 flex items-start gap-2 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-[13px] text-brand-red">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{errorMsg}</span>
                  </div>
                )}

                <button type="button" onClick={place} disabled={!canPlace}
                  className="mt-5 w-full h-12 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing your order…</>
                    : <><Lock className="w-4 h-4" /> {changeNotice ? 'Confirm and place order' : 'Place order'} · {peso(quote?.totals.total ?? 0)}</>}
                </button>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-stone-500 text-center">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" /> Not as described? Request a return within 7 days of delivery.
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
  return (
    <div className={`flex justify-between ${tone === 'good' ? 'text-emerald-700' : 'text-stone-600'}`}>
      <dt>{label}</dt><dd className={`tabular-nums ${tone === 'good' ? '' : 'text-stone-900'}`}>{value}</dd>
    </div>
  );
}

function StoreBlock({ store, wallet, code, onCode, note, onNote, noteError }: {
  store: QuoteStore; wallet: WalletVoucher[]; code: string; onCode: (c: string) => void; note: string; onNote: (n: string) => void; noteError?: string;
}) {
  const ship = store.shipping;
  return (
    <section className="rounded-2xl border border-stone-200 overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-stone-50/70 border-b border-stone-100">
        <span className="flex items-center gap-2 min-w-0 text-[14px] font-semibold text-stone-900"><Store className="w-4 h-4 text-stone-400" /><span className="truncate">{store.seller.shop_name}</span></span>
        <span className="text-[12px] text-stone-500 shrink-0 tabular-nums">{peso(store.total)}</span>
      </header>
      <ul className="divide-y divide-stone-100">
        {store.lines.map((l) => (
          <li key={l.key} className="flex items-center gap-3 px-4 py-3">
            <span className="relative shrink-0">
              {l.image_url ? <img src={l.image_url} alt="" className="w-12 h-12 rounded-xl object-cover bg-stone-100 ring-1 ring-stone-200" /> : <span className="w-12 h-12 rounded-xl bg-stone-100 block" />}
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-stone-700 text-white text-[10px] font-semibold flex items-center justify-center">{l.quantity}</span>
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] text-stone-900 truncate">{l.name}</span>
              <span className="block text-[11.5px] text-stone-500">
                {l.variant_label && <>{l.variant_label} · </>}
                {l.quantity} × {peso(l.unit_price)}
                {l.price_source === 'flash' && <span className="ml-1 inline-flex items-center gap-0.5 font-semibold text-stone-800"><Zap className="w-3 h-3 text-amber-500 fill-amber-500" />Flash</span>}
                {l.price_source === 'sale' && <span className="ml-1 font-semibold text-brand-red">Sale</span>}
              </span>
              {l.free_quantity > 0 && <span className="block text-[11.5px] font-semibold text-emerald-700"><Gift className="inline w-3 h-3 -mt-0.5" /> {l.free_quantity} free</span>}
              {l.status !== 'available' && l.message && <span className="block text-[11.5px] font-medium text-brand-red">{l.message}</span>}
            </span>
            <span className="text-[13px] font-semibold text-stone-900 tabular-nums">{peso(l.subtotal - l.promo_share)}</span>
          </li>
        ))}
      </ul>
      <div className="px-4 py-3 space-y-3 border-t border-stone-100">
        {store.promotions.map((p) => (
          <p key={p.id} className="flex justify-between text-[12.5px] text-emerald-700"><span className="inline-flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" />{p.name}</span><span className="tabular-nums">−{peso(p.discount)}</span></p>
        ))}
        <VoucherPicker label="Shop voucher" compact wallet={wallet} code={code} onCode={onCode} result={store.store_voucher} />
        <p className="flex items-start justify-between gap-3 text-[13px]">
          <span className="flex items-start gap-2 text-stone-600">
            <Truck className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
            {ship.serviceable
              ? <span>{ship.route ?? 'Standard delivery'} · {ship.chargeable_kg} kg charged{ship.weight_grams > 0 ? ` (${(ship.weight_grams / 1000).toLocaleString()} kg)` : ''}</span>
              : <span className="text-brand-red font-medium">{ship.message}</span>}
          </span>
          {ship.serviceable && (ship.free_delivery
            ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 shrink-0"><Gift className="w-3.5 h-3.5" /> Free</span>
            : <span className="font-semibold text-stone-900 tabular-nums shrink-0">{peso(ship.fee)}</span>)}
        </p>
        <div>
          <label htmlFor={`note-${store.seller.id}`} className="block text-[12px] font-medium text-stone-600 mb-1">Note to the shop <span className="text-stone-400">(optional)</span></label>
          <input id={`note-${store.seller.id}`} type="text" value={note} onChange={(e) => onNote(e.target.value)} placeholder="e.g. Paki-wrap po as gift"
            aria-invalid={!!noteError}
            className={`w-full h-10 px-3 text-[13px] bg-white border rounded-xl outline-none focus:ring-2 focus:ring-brand-red/10 ${noteError ? 'border-brand-red' : 'border-stone-300 focus:border-brand-red'}`} />
          <p className={`mt-1 text-[11px] tabular-nums ${noteError ? 'text-brand-red font-medium' : 'text-stone-400'}`}>{noteError ?? `${note.length}/${NOTE_MAX}`}</p>
        </div>
      </div>
    </section>
  );
}

/**
 * Picks one voucher of a kind: from the wallet (with what each would take off this order) or by typing a code. A new
 * choice replaces the old one (A2). The server's verdict on the chosen code is shown under it.
 */
function VoucherPicker({ label, wallet, code, onCode, result, compact }: {
  label: string; wallet: WalletVoucher[]; code: string; onCode: (c: string) => void;
  result: { code: string; applied: boolean; discount: number; message: string | null } | null; compact?: boolean;
}) {
  const [typed, setTyped] = useState('');
  const active = code.toUpperCase();

  return (
    <div className={compact ? '' : 'rounded-2xl border border-stone-200 p-4'}>
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-stone-800"><Ticket className="w-3.5 h-3.5 text-brand-red" /> {label}</p>
      {wallet.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {wallet.map((v) => {
            const on = active === v.code;
            return (
              <button key={v.id} type="button" onClick={() => onCode(on ? '' : v.code)} disabled={!v.applicable && !on} aria-pressed={on}
                title={v.applicable ? `Saves ${peso(v.discount ?? 0)}` : v.message ?? undefined}
                className={`px-2.5 py-1.5 rounded-xl border text-left text-[12px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${on ? 'border-brand-red bg-rose-50 text-brand-red' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-500'}`}>
                <span className="block font-semibold">{v.label}</span>
                <span className="block text-[10.5px] text-stone-500">{v.code} · min. {peso(v.min_spend)}{!v.applicable && v.message ? ` · ${v.message}` : ''}</span>
              </button>
            );
          })}
        </div>
      )}
      <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) { onCode(typed.trim()); setTyped(''); } }}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Enter a voucher code" aria-label={`${label} code`}
          className="flex-1 min-w-0 h-9 px-3 text-[13px] uppercase border border-stone-300 rounded-xl outline-none focus:border-brand-red" />
        <button type="submit" className="h-9 px-3 rounded-xl bg-stone-900 text-white text-[12px] font-semibold">Apply</button>
      </form>
      {result && (
        <p role="status" className={`mt-1.5 flex items-center justify-between gap-2 text-[12px] ${result.applied ? 'text-emerald-700' : 'text-brand-red'}`}>
          <span>{result.code}: {result.applied ? `−${peso(result.discount)}` : result.message}</span>
          <button type="button" onClick={() => onCode('')} className="text-stone-500 hover:text-stone-900" aria-label={`Remove ${result.code}`}><X className="w-3.5 h-3.5" /></button>
        </p>
      )}
    </div>
  );
}

function Placed({ orders, method }: { orders: Order[]; method: Method }) {
  const total = orders.reduce((s, o) => s + Number(o.total), 0);
  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col">
      <CheckoutBar step={3} />
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg rounded-3xl bg-white border border-stone-200 p-8 text-center">
          <span className="mx-auto w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCircle2 className="w-8 h-8" /></span>
          <h1 className="mt-5 text-[26px] font-serif font-bold tracking-tight text-[#1E1B18]">Thank you for your order</h1>
          <p className="mt-2 text-sm text-stone-500">
            {orders.length > 1 ? `Your checkout became ${orders.length} orders, one per shop.` : <>Order <span className="font-mono font-semibold text-stone-900">#{orders[0].order_number}</span> is placed.</>}
          </p>
          <ul className="mt-6 rounded-2xl border border-stone-200 divide-y divide-stone-100 text-left text-[13px]">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="font-mono font-semibold text-stone-900">#{o.order_number}</span>
                <span className="font-semibold text-stone-900 tabular-nums">{peso(Number(o.total))}</span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 px-4 py-3 bg-stone-50/70">
              <span className="text-stone-600">{method === 'gcash' ? 'Paid to the shops by GCash' : 'Pay on delivery'}</span>
              <span className="text-[16px] font-bold text-brand-red tabular-nums">{peso(total)}</span>
            </li>
          </ul>
          <p className={`mt-4 text-[13px] rounded-2xl px-4 py-3 text-left ${method === 'gcash' ? 'bg-amber-50 text-amber-900' : 'bg-sky-50 text-sky-900'}`}>
            {method === 'gcash'
              ? 'The shop checks your GCash receipt first. Once it is confirmed, your order is packed and handed to the courier.'
              : `Prepare ${peso(total)} in cash for the rider${orders.length > 1 ? 's (each parcel is paid separately)' : ''}.`}
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2">
            <Link to="/settings/orders" className="flex-1 h-11 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold flex items-center justify-center transition-colors">Track my orders</Link>
            <Link to="/" className="flex-1 h-11 rounded-full border border-stone-300 text-sm font-semibold text-stone-800 hover:border-stone-900 flex items-center justify-center">Keep shopping</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The slim checkout header: logo, the three steps, and a way back. */
export function CheckoutBar({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Cart', 'Checkout', 'Done'];
  return (
    <div className="bg-white border-b border-stone-200 sticky top-0 z-30">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="shrink-0"><LovedItLogo variant="light" type="full" size="custom" imgClassName="h-8 sm:h-9 object-contain" /></Link>
        <ol className="hidden sm:flex items-center gap-2 text-[13px]">
          {steps.map((s, i) => {
            const n = i + 1;
            const done = n < step;
            const current = n === step;
            return (
              <li key={s} className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 ${current ? 'text-stone-900 font-semibold' : done ? 'text-stone-600' : 'text-stone-400'}`}>
                  <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center ${current ? 'bg-brand-red text-white' : done ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-500'}`}>
                    {done ? <Check className="w-3 h-3" /> : n}
                  </span>
                  {n === 1 && step > 1 ? <Link to="/cart" className="hover:text-brand-red">{s}</Link> : s}
                </span>
                {n < steps.length && <span className="w-8 h-px bg-stone-300" />}
              </li>
            );
          })}
        </ol>
        {step < 3
          ? <Link to="/cart" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-stone-600 hover:text-brand-red"><ArrowLeft className="w-4 h-4" /> Back to cart</Link>
          : <span className="inline-flex items-center gap-1.5 text-[12px] text-stone-500"><Lock className="w-3.5 h-3.5" /> Secure checkout</span>}
      </div>
    </div>
  );
}

/** A numbered section of the checkout. */
function Section({ step, title, hint, aside, children }: { step: number; title: string; hint?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white border border-stone-200 p-5 sm:p-6">
      <header className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-start gap-3">
          <span className="w-7 h-7 rounded-full bg-stone-900 text-white text-[13px] font-semibold flex items-center justify-center shrink-0 mt-0.5">{step}</span>
          <div>
            <h2 className="text-[17px] font-semibold text-stone-900">{title}</h2>
            {hint && <p className="text-[13px] text-stone-500 mt-0.5">{hint}</p>}
          </div>
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}
