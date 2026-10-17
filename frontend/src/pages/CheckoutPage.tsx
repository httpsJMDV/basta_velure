import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, AlertCircle, Check, UploadCloud, ShieldCheck, ShoppingBag, X, MapPin, Store, Banknote, Lock, Loader2, Truck, Gift } from 'lucide-react';
import { pesoCompact as peso } from '../utils/pricing';
import LovedItLogo from '../components/LovedItLogo';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { getAddressesApi, placeOrderApi } from '../api/client';
import type { Address, Order } from '../types';
import { useShopPaymentInfo, shopDelivery } from '../hooks/useShopDelivery';
import { GcashPayee, ReferenceField } from '../components/payments/GcashKit';
import { DELIVERY_FEE } from '../utils/shipping';
import gcashMark from '../assets/brand/gcash-mark.svg';

type PayErrors = { reference?: string; receipt?: string };

export default function CheckoutPage() {
  const { user } = useAuth();
  const { items, clearCart } = useCart();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);

  // Address inputs
  const [shippingName, setShippingName] = useState(
    user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : ''
  );
  const [shippingPhone, setShippingPhone] = useState(user?.phone || '');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingProvince, setShippingProvince] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingBarangay, setShippingBarangay] = useState('');
  const [shippingProvinceCode, setShippingProvinceCode] = useState('');
  const [shippingCityCode, setShippingCityCode] = useState('');
  const [shippingBarangayCode, setShippingBarangayCode] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  // Payment. GCash goes straight to each shop's own account, so each shop gets its own reference and receipt.
  const [paymentMethod, setPaymentMethod] = useState<'gcash' | 'cod'>('cod');
  const [refs, setRefs] = useState<Record<number, string>>({});
  const [proofs, setProofs] = useState<Record<number, File>>({});
  const [payErrors, setPayErrors] = useState<Record<number, PayErrors>>({});
  const [placedMethod, setPlacedMethod] = useState<'gcash' | 'cod'>('cod');
  const shopRefs = useRef<Record<number, HTMLElement | null>>({});

  // State
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successOrders, setSuccessOrders] = useState<Order[] | null>(null);

  const selectedAddress = useMemo(
    () => addresses.find((a) => a.id === selectedAddressId),
    [addresses, selectedAddressId]
  );

  const selectedAddressNeedsUpdate = useMemo(() => {
    if (selectedAddress) {
      return Boolean(
        selectedAddress.address_needs_update ||
        !selectedAddress.barangay_code ||
        !selectedAddress.city_code ||
        !selectedAddress.province_code
      );
    }
    return !shippingBarangayCode || !shippingCityCode || !shippingProvinceCode;
  }, [selectedAddress, shippingBarangayCode, shippingCityCode, shippingProvinceCode]);

  // The shops in the cart, and how each gets paid (GCash details, free delivery minimum).
  const shopInfo = useShopPaymentInfo(items.map((i) => i.sellerId), true, user?.id);

  // Group items by shop: one order, one parcel and one delivery fee each (free when the shop's minimum is met).
  const shopGroups = useMemo(() => {
    const map: Record<string, { key: string; shopName: string; sellerId: number; items: typeof items; subtotal: number; shippingFee: number; freeFrom: number | null; total: number }> = {};
    items.forEach((item) => {
      const key = String(item.sellerId ?? item.shopName ?? 'shop');
      if (!map[key]) {
        map[key] = { key, shopName: item.shopName || (item.sellerId ? `Seller #${item.sellerId}` : 'Loved-IT shop'), sellerId: item.sellerId ?? 0, items: [], subtotal: 0, shippingFee: DELIVERY_FEE, freeFrom: null, total: 0 };
      }
      map[key].items.push(item);
      map[key].subtotal += item.price * item.quantity;
    });
    Object.values(map).forEach((g) => {
      const d = shopDelivery(g.subtotal, shopInfo[g.sellerId]);
      g.freeFrom = d.freeFrom;
      g.shippingFee = d.fee;
      g.total = g.subtotal + g.shippingFee;
    });
    return Object.values(map);
  }, [items, shopInfo]);

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalShippingFee = shopGroups.reduce((s, g) => s + g.shippingFee, 0);
  const total = subtotal + totalShippingFee;

  // GCash only works when every shop in the cart takes it.
  const infoLoaded = shopGroups.every((g) => shopInfo[g.sellerId]);
  const gcashBlockers = shopGroups.filter((g) => shopInfo[g.sellerId] && !shopInfo[g.sellerId].accepts_gcash);
  const gcashReady = infoLoaded && gcashBlockers.length === 0;
  const method: 'gcash' | 'cod' = paymentMethod === 'gcash' && gcashReady ? 'gcash' : 'cod';

  const proofPreviews = useMemo(() => Object.fromEntries(Object.entries(proofs).map(([id, f]) => [id, URL.createObjectURL(f)])), [proofs]);
  useEffect(() => () => Object.values(proofPreviews).forEach((u) => URL.revokeObjectURL(u)), [proofPreviews]);

  // Load buyer's addresses
  useEffect(() => {
    if (!user) return;
    getAddressesApi()
      .then((res: any) => {
        const list: Address[] = Array.isArray(res) ? res : res?.data || [];
        setAddresses(list);
        const def = list.find((a: Address) => a.is_default) || list[0];
        if (def) {
          setSelectedAddressId(def.id);
          setShippingName(def.recipient_name || def.full_name || '');
          setShippingPhone(def.phone_number || def.phone || '');
          setShippingAddress(def.street_address || def.address || '');
          setShippingProvince(def.province_name || def.province || '');
          setShippingCity(def.city_name || def.district || '');
          setShippingBarangay(def.barangay_name || def.ward || '');
          setShippingProvinceCode(def.province_code || '');
          setShippingCityCode(def.city_code || '');
          setShippingBarangayCode(def.barangay_code || '');
        }
      })
      .catch(() => {});
  }, [user]);

  const handleSelectAddress = (addr: Address) => {
    setSelectedAddressId(addr.id);
    setShippingName(addr.recipient_name || addr.full_name || '');
    setShippingPhone(addr.phone_number || addr.phone || '');
    setShippingAddress(addr.street_address || addr.address || '');
    setShippingProvince(addr.province_name || addr.province || '');
    setShippingCity(addr.city_name || addr.district || '');
    setShippingBarangay(addr.barangay_name || addr.ward || '');
    setShippingProvinceCode(addr.province_code || '');
    setShippingCityCode(addr.city_code || '');
    setShippingBarangayCode(addr.barangay_code || '');
  };

  const setShopError = (sellerId: number, patch: PayErrors) => setPayErrors((p) => ({ ...p, [sellerId]: { ...p[sellerId], ...patch } }));

  const pickProof = (sellerId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setShopError(sellerId, { receipt: 'The receipt must be an image (JPG or PNG).' }); return; }
    if (file.size > 5 * 1024 * 1024) { setShopError(sellerId, { receipt: 'That screenshot is over 5 MB. Crop it or take a smaller one.' }); return; }
    setProofs((p) => ({ ...p, [sellerId]: file }));
    setShopError(sellerId, { receipt: undefined });
  };

  const removeProof = (sellerId: number) => setProofs((p) => {
    const next = { ...p };
    delete next[sellerId];
    return next;
  });

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setPayErrors({});

    if (items.length === 0) {
      setErrorMsg('Your cart is empty. Please add items before checking out.');
      return;
    }

    if (!shippingName.trim() || !shippingPhone.trim() || !shippingAddress.trim()) {
      setErrorMsg('Please complete your shipping address details.');
      return;
    }

    if (selectedAddressNeedsUpdate || !shippingProvinceCode || !shippingCityCode || !shippingBarangayCode) {
      setErrorMsg('Selected delivery address is missing standard area codes. Please update or select a valid address in your Address Book.');
      return;
    }

    if (method === 'gcash') {
      // Shown under each shop's fields, and the page scrolls to the first shop with a problem.
      const errors: Record<number, PayErrors> = {};
      for (const g of shopGroups) {
        const ref = refs[g.sellerId] ?? '';
        const e: PayErrors = {};
        if (ref.length === 0) e.reference = 'Enter the reference number from your GCash receipt.';
        else if (ref.length !== 13) e.reference = `A GCash reference number has 13 digits; this one has ${ref.length}.`;
        if (!proofs[g.sellerId]) e.receipt = 'Upload the screenshot of your GCash receipt so the shop can check your payment.';
        if (e.reference || e.receipt) errors[g.sellerId] = e;
      }
      const first = shopGroups.find((g) => errors[g.sellerId]);
      if (first) {
        setPayErrors(errors);
        shopRefs.current[first.sellerId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('payment_method', method);
      formData.append('shipping_name', shippingName.trim());
      formData.append('shipping_phone', shippingPhone.trim());
      formData.append('shipping_address', shippingAddress.trim());
      if (shippingProvince) formData.append('shipping_province', shippingProvince.trim());
      if (shippingCity) formData.append('shipping_city', shippingCity.trim());
      if (shippingBarangay) formData.append('shipping_barangay', shippingBarangay.trim());
      formData.append('shipping_province_code', shippingProvinceCode.trim());
      formData.append('shipping_city_code', shippingCityCode.trim());
      formData.append('shipping_barangay_code', shippingBarangayCode.trim());
      if (orderNotes) formData.append('notes', orderNotes.trim());

      if (method === 'gcash') {
        for (const g of shopGroups) {
          formData.append(`gcash[${g.sellerId}][reference]`, refs[g.sellerId] ?? '');
          const proof = proofs[g.sellerId];
          if (proof) formData.append(`gcash_proof[${g.sellerId}]`, proof);
        }
      }

      items.forEach((item, index) => {
        formData.append(`items[${index}][product_id]`, String(item.productId));
        if (item.variantId) {
          formData.append(`items[${index}][variant_id]`, String(item.variantId));
        }
        formData.append(`items[${index}][quantity]`, String(item.quantity));
      });

      const res = await placeOrderApi(formData);
      setPlacedMethod(method);
      clearCart();
      const placedOrders = res.orders && res.orders.length > 0 ? res.orders : [res.data];
      setSuccessOrders(placedOrders);
    } catch (err: any) {
      const data = err.response?.data;
      const fieldErrors: Record<string, string[]> = data?.errors ?? {};
      // The server's per-shop errors go under that shop's fields; anything else shows by the button.
      const serverPay: Record<number, PayErrors> = {};
      for (const g of shopGroups) {
        const single = shopGroups.length === 1;
        const reference = fieldErrors[`gcash.${g.sellerId}.reference`]?.[0] ?? (single ? fieldErrors.payment_reference?.[0] : undefined);
        const receipt = fieldErrors[`gcash_proof.${g.sellerId}`]?.[0] ?? (single ? fieldErrors.payment_proof?.[0] : undefined);
        if (reference || receipt) serverPay[g.sellerId] = { reference, receipt };
      }
      const first = shopGroups.find((g) => serverPay[g.sellerId]);
      if (first) {
        setPayErrors(serverPay);
        shopRefs.current[first.sellerId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setErrorMsg(fieldErrors.gcash?.[0] || data?.message || 'Failed to place order. Please check your information and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const field = 'w-full h-11 px-3.5 text-[14px] bg-white border border-stone-300 rounded-xl outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 transition-colors placeholder:text-stone-400';
  const label = 'block text-[12px] font-medium text-stone-600 mb-1.5';

  // ── Order placed ──
  if (successOrders && successOrders.length > 0) {
    const isMultiShop = successOrders.length > 1;
    const paidTotal = successOrders.reduce((s, o) => s + Number(o.total), 0);

    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col">
        <CheckoutBar step={3} />
        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-stone-200 p-8 text-center">
            <span className="mx-auto w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </span>
            <h1 className="mt-5 text-[26px] font-serif font-bold tracking-tight text-[#1E1B18]">Thank you for your order</h1>
            <p className="mt-2 text-sm text-stone-500">
              {isMultiShop
                ? `Your cart became ${successOrders.length} orders, one per shop, each shipped as its own parcel.`
                : <>Order <span className="font-mono font-semibold text-stone-900">#{successOrders[0].order_number}</span> is placed.</>}
            </p>

            <ul className="mt-6 rounded-2xl border border-stone-200 divide-y divide-stone-100 text-left text-[13px]">
              {successOrders.map((ord) => (
                <li key={ord.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block font-mono font-semibold text-stone-900">#{ord.order_number}</span>
                    <span className="block text-[12px] text-stone-500">{ord.items?.length || 1} item{(ord.items?.length || 1) === 1 ? '' : 's'} · {ord.free_delivery ? 'free delivery' : `${peso(Number(ord.shipping_fee))} delivery`}{ord.courier ? ` · ${ord.courier.name}` : ''}</span>
                  </span>
                  <span className="font-semibold text-stone-900 tabular-nums">{peso(Number(ord.total))}</span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 px-4 py-3 bg-stone-50/70">
                <span className="text-stone-600">{placedMethod === 'gcash' ? 'Paid to the shops by GCash' : 'Pay on delivery'}</span>
                <span className="text-[16px] font-bold text-brand-red tabular-nums">{peso(paidTotal)}</span>
              </li>
            </ul>

            <p className={`mt-4 text-[13px] rounded-2xl px-4 py-3 text-left ${placedMethod === 'gcash' ? 'bg-amber-50 text-amber-900' : 'bg-sky-50 text-sky-900'}`}>
              {placedMethod === 'gcash'
                ? `${isMultiShop ? 'Each shop checks' : 'The shop checks'} your GCash receipt first. Once it is confirmed, your order is packed and handed to the courier.`
                : `Prepare ${peso(paidTotal)} in cash for the rider${isMultiShop ? 's (each parcel is paid separately)' : ''}. We will update you as your order moves.`}
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

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col">
      <CheckoutBar step={2} />

      <div className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-8 py-8">
        {items.length === 0 ? (
          <div className="max-w-md mx-auto text-center py-16">
            <span className="mx-auto w-16 h-16 rounded-full bg-white border border-stone-200 flex items-center justify-center text-stone-400"><ShoppingBag className="w-7 h-7" /></span>
            <h2 className="mt-4 text-lg font-semibold text-stone-900">Your cart is empty</h2>
            <p className="mt-1 text-sm text-stone-500">Add items to your cart before checking out.</p>
            <Link to="/" className="mt-5 inline-flex h-11 px-6 rounded-full bg-brand-red text-white text-sm font-semibold items-center">Start shopping</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmitOrder} noValidate className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-8 items-start">
            <div className="space-y-4">
              {/* 1 · Address */}
              <Section step={1} title="Delivery address" hint="Where should the rider bring your order?"
                aside={<Link to="/settings/addresses" className="text-[13px] font-semibold text-brand-red hover:underline shrink-0">Manage</Link>}>
                {addresses.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-2.5 mb-5" role="radiogroup" aria-label="Saved addresses">
                    {addresses.map((addr) => {
                      const needsUpdate = Boolean(addr.address_needs_update || !addr.barangay_code);
                      const on = selectedAddressId === addr.id;
                      return (
                        <button
                          key={addr.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => handleSelectAddress(addr)}
                          className={`relative text-left p-4 rounded-2xl border-[1.5px] transition-colors ${on ? (needsUpdate ? 'border-amber-500 bg-amber-50/40' : 'border-brand-red bg-rose-50/40') : 'border-stone-200 hover:border-stone-400'}`}
                        >
                          <span className="flex items-center gap-2 pr-6">
                            <MapPin className={`w-4 h-4 shrink-0 ${on ? 'text-brand-red' : 'text-stone-400'}`} />
                            <span className="text-[14px] font-semibold text-stone-900 truncate">{addr.recipient_name || addr.full_name}</span>
                            {addr.is_default && <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-red">Default</span>}
                          </span>
                          <span className="block mt-1.5 text-[12px] text-stone-600 leading-relaxed">
                            {addr.street_address || addr.address}, {addr.barangay_name || addr.ward}, {addr.city_name || addr.district}, {addr.province_name || addr.province}
                          </span>
                          <span className="block mt-1 text-[12px] text-stone-400">{addr.phone_number || addr.phone}</span>
                          {needsUpdate && <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700"><AlertCircle className="w-3 h-3" /> Needs an update</span>}
                          <span className={`absolute top-4 right-4 w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center ${on ? 'border-brand-red' : 'border-stone-300'}`}>
                            {on && <span className="w-2 h-2 rounded-full bg-brand-red" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedAddressNeedsUpdate && (
                  <div className="mb-5 flex items-start justify-between gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-[13px] text-amber-900">
                    <span className="flex items-start gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                      <span><span className="font-semibold">This address needs its barangay, city and province picked again.</span> Couriers route parcels by these, so update it in your address book first.</span>
                    </span>
                    <Link to="/settings/addresses" className="shrink-0 h-8 px-3 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-[12px] font-semibold flex items-center">Update</Link>
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className={label} htmlFor="ship-name">Recipient name</label>
                    <input id="ship-name" type="text" required value={shippingName} onChange={(e) => setShippingName(e.target.value)} placeholder="Full name" className={field} />
                  </div>
                  <div>
                    <label className={label} htmlFor="ship-phone">Phone number</label>
                    <input id="ship-phone" type="tel" required value={shippingPhone} onChange={(e) => setShippingPhone(e.target.value)} placeholder="09XXXXXXXXX" className={field} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={label} htmlFor="ship-street">Street, house or unit</label>
                    <input id="ship-street" type="text" required value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} placeholder="House/unit no., street, subdivision" className={field} />
                  </div>
                  <div className="sm:col-span-2 grid grid-cols-3 gap-3">
                    <div><label className={label} htmlFor="ship-brgy">Barangay</label><input id="ship-brgy" type="text" value={shippingBarangay} onChange={(e) => setShippingBarangay(e.target.value)} placeholder="Barangay" className={field} /></div>
                    <div><label className={label} htmlFor="ship-city">City / town</label><input id="ship-city" type="text" value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} placeholder="City" className={field} /></div>
                    <div><label className={label} htmlFor="ship-prov">Province</label><input id="ship-prov" type="text" value={shippingProvince} onChange={(e) => setShippingProvince(e.target.value)} placeholder="Province" className={field} /></div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={label} htmlFor="ship-notes">Note for the rider <span className="text-stone-400">(optional)</span></label>
                    <input id="ship-notes" type="text" value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} placeholder="Landmark, gate color, leave with the guard…" className={field} />
                  </div>
                </div>
              </Section>

              {/* 2 · Delivery: each parcel's courier is matched to its route after the order is placed, not chosen here */}
              <Section step={2} title="Delivery" hint={shopGroups.length > 1 ? `Your cart ships as ${shopGroups.length} parcels, one from each shop.` : 'Your order ships as one parcel.'}>
                <ul className="rounded-2xl border border-stone-200 divide-y divide-stone-100">
                  {shopGroups.map((group, gIdx) => {
                    const count = group.items.reduce((n, i) => n + i.quantity, 0);
                    return (
                      <li key={group.key + gIdx} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-9 h-9 rounded-xl bg-stone-100 text-stone-500 flex items-center justify-center shrink-0"><Store className="w-4 h-4" /></span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] font-semibold text-stone-900 truncate">{group.shopName}</span>
                          <span className="block text-[12px] text-stone-500">
                            {count} item{count === 1 ? '' : 's'} · Standard delivery
                            {group.freeFrom !== null && group.shippingFee > 0 && <> · <span className="text-emerald-700">add {peso(group.freeFrom - group.subtotal)} more for free delivery</span></>}
                          </span>
                        </span>
                        {group.shippingFee === 0
                          ? <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-700"><Gift className="w-3.5 h-3.5" /> Free</span>
                          : <span className="text-[13px] font-semibold text-stone-900 tabular-nums">{peso(group.shippingFee)}</span>}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 flex items-start gap-2.5 text-[13px] text-stone-600">
                  <Truck className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                  <span>Each parcel goes to the partner courier that serves the shop&apos;s area and yours. You will see the courier and tracking number in your orders once it ships.</span>
                </p>
              </Section>

              {/* 3 · Payment */}
              <Section step={3} title="Payment" hint="Choose how you want to pay.">
                <div className="grid sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Payment method">
                  {([
                    { key: 'gcash', title: 'GCash', text: gcashReady || !infoLoaded ? 'Pay each shop straight to its GCash' : 'Not every shop in your cart takes GCash', badge: <span className="w-11 h-11 rounded-xl bg-white ring-1 ring-stone-200 flex items-center justify-center shrink-0"><img src={gcashMark} alt="" className="w-8 h-8 object-contain" /></span> },
                    { key: 'cod', title: 'Cash on delivery', text: 'Pay the rider when your parcel arrives', badge: <span className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0"><Banknote className="w-5 h-5" /></span> },
                  ] as const).map((m) => {
                    const on = method === m.key;
                    const off = m.key === 'gcash' && !gcashReady;
                    return (
                      <button key={m.key} type="button" role="radio" aria-checked={on} aria-disabled={off} disabled={off} onClick={() => setPaymentMethod(m.key)}
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

                {gcashBlockers.length > 0 && (
                  <p className="mt-3 text-[12.5px] text-stone-500">
                    {gcashBlockers.map((g) => g.shopName).join(', ')} {gcashBlockers.length === 1 ? 'takes' : 'take'} cash on delivery only. To pay the others by GCash, check out their items separately.
                  </p>
                )}

                {method === 'gcash' ? (
                  <div className="mt-5 space-y-3">
                    <p className="text-[13px] leading-relaxed text-stone-600">
                      {shopGroups.length > 1
                        ? `Your money goes straight to each shop. Send ${shopGroups.length} GCash payments, one per shop, then add each reference and receipt.`
                        : 'Your money goes straight to the shop. Send it in GCash, then add the reference and the receipt.'}
                    </p>
                    {shopGroups.map((g, i) => {
                      const info = shopInfo[g.sellerId];
                      const err = payErrors[g.sellerId] ?? {};
                      const preview = proofPreviews[g.sellerId];
                      return (
                        <section key={g.key} ref={(el) => { shopRefs.current[g.sellerId] = el; }} className="rounded-2xl border border-stone-200 p-4 sm:p-5 space-y-4" aria-label={`GCash payment to ${g.shopName}`}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="flex items-center gap-2 text-[14px] font-semibold text-stone-900 min-w-0">
                              {shopGroups.length > 1 && <span className="w-6 h-6 rounded-full bg-stone-900 text-white text-[12px] flex items-center justify-center shrink-0">{i + 1}</span>}
                              <span className="truncate">{g.shopName}</span>
                            </p>
                            <span className="text-[12px] text-stone-500 shrink-0">{g.shippingFee === 0 ? 'Items · free delivery' : `Items + ${peso(g.shippingFee)} delivery`}</span>
                          </div>
                          {info?.gcash ? <GcashPayee account={info.gcash} amount={g.total} /> : <div className="h-28 rounded-2xl bg-stone-100 animate-pulse" />}
                          <ReferenceField
                            id={`gcash-ref-${g.sellerId}`}
                            value={refs[g.sellerId] ?? ''}
                            onChange={(v) => { setRefs((r) => ({ ...r, [g.sellerId]: v })); if (err.reference) setShopError(g.sellerId, { reference: undefined }); }}
                            error={err.reference}
                          />
                          <div>
                            <span className={label}>Receipt screenshot</span>
                            {preview ? (
                              <div className="flex items-center gap-4 p-3 rounded-2xl border border-emerald-200 bg-emerald-50/50">
                                <img src={preview} alt={`GCash receipt for ${g.shopName}`} className="w-16 h-16 rounded-xl object-cover ring-1 ring-emerald-200" />
                                <span className="flex-1 min-w-0 text-[13px]">
                                  <span className="flex items-center gap-1 font-semibold text-emerald-800"><CheckCircle2 className="w-4 h-4" /> Receipt attached</span>
                                  <span className="block text-[12px] text-stone-500 truncate">{proofs[g.sellerId]?.name}</span>
                                </span>
                                <button type="button" onClick={() => removeProof(g.sellerId)} className="h-8 px-3 rounded-full border border-stone-300 bg-white text-[12px] font-semibold text-stone-700 hover:border-stone-900 flex items-center gap-1">
                                  <X className="w-3.5 h-3.5" /> Remove
                                </button>
                              </div>
                            ) : (
                              <label className={`flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${err.receipt ? 'border-brand-red bg-rose-50/40' : 'border-stone-300 hover:border-brand-red hover:bg-rose-50/30'}`}>
                                <UploadCloud className={`w-6 h-6 shrink-0 ${err.receipt ? 'text-brand-red' : 'text-stone-400'}`} />
                                <span>
                                  <span className="block text-[13px] font-semibold text-brand-red">Upload the receipt</span>
                                  <span className="block text-[12px] text-stone-400">PNG or JPG screenshot from GCash, up to 5 MB</span>
                                </span>
                                {/* Not "required": a hidden required input cannot show the browser's message, so the check is ours. */}
                                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => pickProof(g.sellerId, e)} className="sr-only" aria-invalid={Boolean(err.receipt)} />
                              </label>
                            )}
                            {err.receipt && <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-brand-red"><AlertCircle className="w-3.5 h-3.5" />{err.receipt}</p>}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-5 flex items-start gap-3 p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-[13px] text-amber-900">
                    <Banknote className="w-5 h-5 text-amber-600 shrink-0" />
                    <span>Prepare <span className="font-semibold">{peso(total)}</span> in cash{shopGroups.length > 1 ? `. Each of the ${shopGroups.length} parcels is paid to its rider when it arrives` : ' for the rider'}. Exact change helps.</span>
                  </div>
                )}
              </Section>
            </div>

            {/* Summary */}
            <aside className="lg:sticky lg:top-24 rounded-3xl bg-white border border-stone-200 overflow-hidden">
              <div className="px-6 pt-6 pb-4">
                <h2 className="text-lg font-semibold text-stone-900">Your order</h2>
                <p className="text-[13px] text-stone-500">{items.reduce((s, i) => s + i.quantity, 0)} items · {shopGroups.length} parcel{shopGroups.length === 1 ? '' : 's'}</p>
              </div>
              <div className="max-h-[340px] overflow-y-auto px-6 space-y-4">
                {shopGroups.map((group, gIdx) => (
                  <div key={group.key + gIdx}>
                    <p className="flex items-center justify-between text-[12px] font-semibold text-stone-700 mb-2">
                      <span className="flex items-center gap-1.5 truncate"><Store className="w-3.5 h-3.5 text-stone-400" />{group.shopName}</span>
                      <span className={`font-normal shrink-0 ${group.shippingFee === 0 ? 'text-emerald-700' : 'text-stone-500'}`}>{group.shippingFee === 0 ? 'Free delivery' : `${peso(group.shippingFee)} delivery`}</span>
                    </p>
                    <ul className="space-y-2.5">
                      {group.items.map((item) => (
                        <li key={item.variantId} className="flex items-center gap-3">
                          <span className="relative shrink-0">
                            <img src={item.image || '/placeholder.png'} alt="" className="w-12 h-12 rounded-xl object-cover bg-stone-100 ring-1 ring-stone-200" />
                            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-stone-700 text-white text-[10px] font-semibold flex items-center justify-center">{item.quantity}</span>
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[13px] text-stone-900 truncate">{item.name}</span>
                            {item.variant && <span className="block text-[11px] text-stone-500 truncate">{item.variant}</span>}
                          </span>
                          <span className="text-[13px] font-semibold text-stone-900 tabular-nums">{peso(item.price * item.quantity)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="px-6 pt-4 pb-6 mt-4 border-t border-stone-200">
                <dl className="space-y-2 text-[14px]">
                  <div className="flex justify-between text-stone-600"><dt>Subtotal</dt><dd className="text-stone-900 tabular-nums">{peso(subtotal)}</dd></div>
                  <div className="flex justify-between text-stone-600">
                    <dt>Delivery {shopGroups.length > 1 && <span className="text-stone-400">({shopGroups.length} parcels)</span>}</dt>
                    <dd className="text-stone-900 tabular-nums">{peso(totalShippingFee)}</dd>
                  </div>
                  <div className="flex justify-between items-baseline pt-3 border-t border-stone-200">
                    <dt className="text-[15px] font-semibold text-stone-900">Total</dt>
                    <dd className="text-[26px] font-bold tracking-tight text-brand-red tabular-nums">{peso(total)}</dd>
                  </div>
                </dl>

                {errorMsg && (
                  <div role="alert" className="mt-4 flex items-start gap-2 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-[13px] text-brand-red">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{errorMsg}</span>
                  </div>
                )}

                <button type="submit" disabled={submitting || selectedAddressNeedsUpdate}
                  className="mt-5 w-full h-12 rounded-full bg-brand-red hover:bg-brand-red-dark text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Placing your order…</>
                    : selectedAddressNeedsUpdate ? 'Update your address to continue'
                    : <><Lock className="w-4 h-4" /> Place order · {peso(total)}</>}
                </button>
                <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-stone-500 text-center">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  {method === 'gcash' ? 'Paid straight to the shop. Not as described? Return it within 7 days.' : 'Pay the rider when your parcel arrives.'}
                </p>
              </div>
            </aside>
          </form>
        )}
      </div>
    </div>
  );
}

/** The slim checkout header: logo, the three steps, and a way back. */
function CheckoutBar({ step }: { step: 1 | 2 | 3 }) {
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
