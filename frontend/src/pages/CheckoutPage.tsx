import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  UploadCloud,
  ShieldCheck,
  ShoppingBag,
  CreditCard,
  Truck,
  X,
  QrCode,
} from 'lucide-react';
import Button from '../components/ui/Button';
import LovedItLogo from '../components/LovedItLogo';
import { useAuth } from '../hooks/useAuth';
import { useCart } from '../hooks/useCart';
import { getAddressesApi, placeOrderApi } from '../api/client';
import type { Address } from '../types';

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
  const [orderNotes, setOrderNotes] = useState('');

  // Payment method: 'gcash' | 'cod'
  const [paymentMethod, setPaymentMethod] = useState<'gcash' | 'cod'>('gcash');
  const [gcashReference, setGcashReference] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [copiedNumber, setCopiedNumber] = useState(false);

  // State
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<{ id: number; order_number: string; payment_status: string } | null>(null);

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const shippingFee = subtotal > 0 ? 99 : 0;
  const total = subtotal + shippingFee;

  const GCASH_NUMBER = '0917-835-8731';
  const GCASH_NAME = 'LOVED-IT OFFICIAL';

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
          setShippingProvince(def.province_name || def.province_code || def.province || '');
          setShippingCity(def.city_name || def.city_code || def.district || '');
          setShippingBarangay(def.barangay_name || def.barangay_code || def.ward || '');
        }
      })
      .catch(() => {});
  }, [user]);

  const handleSelectAddress = (addr: Address) => {
    setSelectedAddressId(addr.id);
    setShippingName(addr.recipient_name || addr.full_name || '');
    setShippingPhone(addr.phone_number || addr.phone || '');
    setShippingAddress(addr.street_address || addr.address || '');
    setShippingProvince(addr.province_name || addr.province_code || addr.province || '');
    setShippingCity(addr.city_name || addr.city_code || addr.district || '');
    setShippingBarangay(addr.barangay_name || addr.barangay_code || addr.ward || '');
  };

  const handleCopyNumber = () => {
    navigator.clipboard.writeText('09178358731');
    setCopiedNumber(true);
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setErrorMsg('Please upload a valid image file (JPG, PNG).');
        return;
      }
      setProofFile(file);
      setProofPreview(URL.createObjectURL(file));
      setErrorMsg(null);
    }
  };

  const handleRemoveProof = () => {
    setProofFile(null);
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProofPreview(null);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (items.length === 0) {
      setErrorMsg('Your cart is empty. Please add items before checking out.');
      return;
    }

    if (!shippingName.trim() || !shippingPhone.trim() || !shippingAddress.trim()) {
      setErrorMsg('Please complete your shipping address details.');
      return;
    }

    if (paymentMethod === 'gcash') {
      if (!gcashReference.trim()) {
        setErrorMsg('Please enter your GCash Reference Number from your payment receipt.');
        return;
      }
      if (!proofFile) {
        setErrorMsg('Please upload a screenshot of your GCash payment receipt.');
        return;
      }
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('payment_method', paymentMethod);
      formData.append('shipping_name', shippingName.trim());
      formData.append('shipping_phone', shippingPhone.trim());
      formData.append('shipping_address', shippingAddress.trim());
      if (shippingProvince) formData.append('shipping_province', shippingProvince.trim());
      if (shippingCity) formData.append('shipping_city', shippingCity.trim());
      if (shippingBarangay) formData.append('shipping_barangay', shippingBarangay.trim());
      if (orderNotes) formData.append('notes', orderNotes.trim());

      if (paymentMethod === 'gcash') {
        formData.append('payment_reference', gcashReference.trim());
        if (proofFile) {
          formData.append('payment_proof', proofFile);
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
      clearCart();
      setSuccessOrder({
        id: res.data.id,
        order_number: res.data.order_number,
        payment_status: res.data.payment_status,
      });
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to place order. Please check your information and try again.';
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Order Success Screen
  if (successOrder) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-lg w-full border border-gray-100 shadow-xl text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5 border border-emerald-100">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Order Placed Successfully!</h1>
          <p className="text-sm text-gray-500 mt-2">
            Order <span className="font-mono font-semibold text-brand-black">#{successOrder.order_number}</span> has been created.
          </p>

          <div className="w-full bg-gray-50 rounded-2xl p-4 my-6 border border-gray-100 text-left text-xs space-y-2.5">
            <div className="flex justify-between">
              <span className="text-gray-500">Payment Method:</span>
              <span className="font-semibold text-gray-800 uppercase">
                {paymentMethod === 'gcash' ? 'GCash' : 'Cash on Delivery'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Payment Status:</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                paymentMethod === 'gcash'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                {paymentMethod === 'gcash' ? 'Pending Verification' : 'Cash on Delivery'}
              </span>
            </div>
            {paymentMethod === 'gcash' && (
              <p className="text-[11px] text-amber-800 bg-amber-50/80 p-2.5 rounded-xl border border-amber-100">
                The seller has been notified to verify your GCash receipt. Once confirmed, your order will be packed and shipped!
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Link to="/settings/orders" className="flex-1">
              <Button className="w-full">View My Orders</Button>
            </Link>
            <Link to="/" className="flex-1">
              <Button variant="secondary" className="w-full">Continue Shopping</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center shrink-0">
              <LovedItLogo variant="light" type="full" size="custom" imgClassName="h-8 sm:h-9 object-contain" />
            </Link>
            <span className="text-gray-300 text-lg">/</span>
            <span className="text-sm font-semibold text-brand-black">Secure Checkout</span>
          </div>
          <Link to="/cart" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-brand-red transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Cart
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {items.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 shadow-sm max-w-md mx-auto">
            <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-800">Your cart is empty</h2>
            <p className="text-xs text-gray-400 mt-1 mb-6">Add items to your cart before proceeding to checkout.</p>
            <Link to="/">
              <Button>Browse Products</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Shipping & Payment */}
            <div className="lg:col-span-7 space-y-6">
              {/* Shipping Address Card */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-red-50 text-brand-red flex items-center justify-center font-bold text-sm">
                      1
                    </div>
                    <div>
                      <h2 className="font-bold text-gray-900 text-base">Delivery Address</h2>
                      <p className="text-xs text-gray-400">Where should we deliver your order?</p>
                    </div>
                  </div>
                  <Truck className="w-5 h-5 text-gray-300" />
                </div>

                {/* Saved Address Selector */}
                {addresses.length > 0 && (
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-600 mb-2">Saved Addresses</label>
                    <div className="grid grid-cols-1 gap-2">
                      {addresses.map((addr) => (
                        <div
                          key={addr.id}
                          onClick={() => handleSelectAddress(addr)}
                          className={`p-3 rounded-2xl border text-xs cursor-pointer transition-all flex items-start justify-between ${
                            selectedAddressId === addr.id
                              ? 'border-brand-red bg-red-50/20 shadow-xs'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900">{addr.recipient_name || addr.full_name}</span>
                              <span className="text-gray-400">({addr.phone_number || addr.phone})</span>
                              {addr.is_default && (
                                <span className="bg-red-50 text-brand-red text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                  Default
                                </span>
                              )}
                            </div>
                            <p className="text-gray-600 mt-1 leading-relaxed">
                              {addr.street_address || addr.address}, {addr.barangay_name || addr.barangay_code || addr.ward}, {addr.city_name || addr.city_code || addr.district}, {addr.province_name || addr.province_code || addr.province}
                            </p>
                          </div>
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center mt-0.5 ${
                            selectedAddressId === addr.id ? 'border-brand-red bg-brand-red text-white' : 'border-gray-300'
                          }`}>
                            {selectedAddressId === addr.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual Address Fields */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Recipient Name *</label>
                      <input
                        type="text"
                        required
                        value={shippingName}
                        onChange={(e) => setShippingName(e.target.value)}
                        placeholder="Full Name"
                        className="w-full px-3.5 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red focus:ring-2 focus:ring-red-100 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Phone Number *</label>
                      <input
                        type="tel"
                        required
                        value={shippingPhone}
                        onChange={(e) => setShippingPhone(e.target.value)}
                        placeholder="09XXXXXXXXX"
                        className="w-full px-3.5 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red focus:ring-2 focus:ring-red-100 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Street Address / Unit / Building *</label>
                    <input
                      type="text"
                      required
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="House/Unit #, Street Name, Subdivision"
                      className="w-full px-3.5 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red focus:ring-2 focus:ring-red-100 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Barangay</label>
                      <input
                        type="text"
                        value={shippingBarangay}
                        onChange={(e) => setShippingBarangay(e.target.value)}
                        placeholder="Barangay"
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red focus:ring-1 focus:ring-red-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">City / Municipality</label>
                      <input
                        type="text"
                        value={shippingCity}
                        onChange={(e) => setShippingCity(e.target.value)}
                        placeholder="City"
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red focus:ring-1 focus:ring-red-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">Province / Region</label>
                      <input
                        type="text"
                        value={shippingProvince}
                        onChange={(e) => setShippingProvince(e.target.value)}
                        placeholder="Province"
                        className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red focus:ring-1 focus:ring-red-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Delivery Notes (Optional)</label>
                    <input
                      type="text"
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder="e.g. Leave package with guard, landmark"
                      className="w-full px-3.5 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Method Card */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-red-50 text-brand-red flex items-center justify-center font-bold text-sm">
                      2
                    </div>
                    <div>
                      <h2 className="font-bold text-gray-900 text-base">Payment Method</h2>
                      <p className="text-xs text-gray-400">Select your preferred payment option</p>
                    </div>
                  </div>
                  <CreditCard className="w-5 h-5 text-gray-300" />
                </div>

                {/* Option 1: GCash */}
                <div className="space-y-4">
                  <label
                    onClick={() => setPaymentMethod('gcash')}
                    className={`block p-4 rounded-2xl border cursor-pointer transition-all ${
                      paymentMethod === 'gcash'
                        ? 'border-brand-red bg-red-50/10 ring-2 ring-red-100 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#007DFE] flex items-center justify-center text-white font-bold text-sm shadow-xs">
                          G
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900 text-sm">GCash (Instant Verification)</span>
                            <span className="bg-blue-50 text-[#007DFE] text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-100">
                              Official Merchant
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">Pay via QR or Send Money, then upload your receipt proof</p>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                        paymentMethod === 'gcash' ? 'border-brand-red bg-brand-red text-white' : 'border-gray-300'
                      }`}>
                        {paymentMethod === 'gcash' && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </div>

                    {/* GCash Payment Instruction Box */}
                    {paymentMethod === 'gcash' && (
                      <div className="mt-4 pt-4 border-t border-red-100/60 animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl p-4 border border-red-100 shadow-xs space-y-4">
                          <div className="flex flex-col sm:flex-row items-center gap-4 bg-gradient-to-r from-blue-50/70 to-indigo-50/50 p-4 rounded-xl border border-blue-100/80">
                            {/* Stylized QR Code Placeholder */}
                            <div className="w-28 h-28 bg-white rounded-xl p-2 border border-blue-200 shadow-sm flex flex-col items-center justify-center shrink-0">
                              <QrCode className="w-16 h-16 text-[#007DFE]" />
                              <span className="text-[10px] font-bold text-blue-800 mt-1">SCAN TO PAY</span>
                            </div>

                            <div className="flex-1 space-y-2 text-center sm:text-left">
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">
                                  Loved-IT Official Account
                                </span>
                                <span className="font-bold text-gray-900 text-sm">{GCASH_NAME}</span>
                              </div>
                              <div className="flex items-center justify-center sm:justify-start gap-2">
                                <span className="font-mono font-bold text-gray-900 text-base bg-white px-3 py-1 rounded-lg border border-blue-200 shadow-2xs">
                                  {GCASH_NUMBER}
                                </span>
                                <button
                                  type="button"
                                  onClick={handleCopyNumber}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 bg-blue-100/60 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors"
                                >
                                  {copiedNumber ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                  {copiedNumber ? 'Copied' : 'Copy'}
                                </button>
                              </div>
                              <p className="text-[11px] text-gray-500">
                                Exact Amount to Pay: <span className="font-bold text-brand-red">₱{total.toLocaleString()}</span>
                              </p>
                            </div>
                          </div>

                          {/* Reference Number & Screenshot inputs */}
                          <div className="space-y-3 pt-2">
                            <div>
                              <label className="block text-xs font-bold text-gray-800 mb-1">
                                GCash Reference Number <span className="text-brand-red">*</span>
                              </label>
                              <input
                                type="text"
                                required={paymentMethod === 'gcash'}
                                value={gcashReference}
                                onChange={(e) => setGcashReference(e.target.value)}
                                placeholder="e.g. 1029384756123 (13 digits)"
                                className="w-full px-3.5 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-brand-red focus:ring-2 focus:ring-red-100 transition-all font-mono"
                              />
                              <p className="text-[10px] text-gray-400 mt-1">Found in your GCash payment SMS confirmation or app receipt.</p>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-gray-800 mb-1">
                                Upload Payment Screenshot (Receipt) <span className="text-brand-red">*</span>
                              </label>

                              {proofPreview ? (
                                <div className="relative inline-block border-2 border-emerald-200 rounded-2xl overflow-hidden shadow-xs bg-emerald-50/20 p-1">
                                  <img
                                    src={proofPreview}
                                    alt="Payment Proof"
                                    className="w-40 h-40 object-cover rounded-xl"
                                  />
                                  <button
                                    type="button"
                                    onClick={handleRemoveProof}
                                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700 shadow-md transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                  <div className="p-1 text-center">
                                    <span className="text-[10px] font-bold text-emerald-700 flex items-center justify-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> Screenshot Attached
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <label className="border-2 border-dashed border-gray-200 hover:border-brand-red hover:bg-red-50/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all bg-gray-50">
                                  <UploadCloud className="w-7 h-7 text-gray-400" />
                                  <div className="text-center">
                                    <span className="text-xs font-bold text-brand-red">Click to upload screenshot</span>
                                    <span className="text-xs text-gray-400 block">or drag and drop receipt image (PNG, JPG)</span>
                                  </div>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    className="hidden"
                                    required={paymentMethod === 'gcash'}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </label>

                  {/* Option 2: Cash on Delivery (COD) */}
                  <label
                    onClick={() => setPaymentMethod('cod')}
                    className={`block p-4 rounded-2xl border cursor-pointer transition-all ${
                      paymentMethod === 'cod'
                        ? 'border-brand-red bg-red-50/10 ring-2 ring-red-100 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white font-bold text-sm shadow-xs">
                          ₱
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900 text-sm">Cash on Delivery (COD)</span>
                            <span className="bg-amber-50 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-100">
                              Doorstep Pay
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">Pay in cash directly to the delivery rider when your package arrives</p>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                        paymentMethod === 'cod' ? 'border-brand-red bg-brand-red text-white' : 'border-gray-300'
                      }`}>
                        {paymentMethod === 'cod' && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Right Column: Order Summary */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm sticky top-20">
                <h2 className="font-bold text-gray-900 text-base mb-4 pb-3 border-b border-gray-100">
                  Order Summary <span className="text-gray-400 font-normal text-xs">({items.length} items)</span>
                </h2>

                {/* Items List */}
                <div className="max-h-64 overflow-y-auto space-y-3 pr-1 mb-4">
                  {items.map((item) => (
                    <div key={item.variantId} className="flex items-center gap-3 p-2 rounded-2xl hover:bg-gray-50 transition-colors">
                      <img
                        src={item.image || '/placeholder.png'}
                        alt={item.name}
                        className="w-12 h-14 object-cover rounded-xl bg-gray-100 shrink-0 border border-gray-100"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-xs text-gray-800 truncate">{item.name}</p>
                        {item.variant && <p className="text-[11px] text-gray-400 truncate">{item.variant}</p>}
                        <p className="text-xs font-bold text-gray-900 mt-1">
                          ₱{item.price.toLocaleString()} <span className="text-gray-400 font-normal">× {item.quantity}</span>
                        </p>
                      </div>
                      <span className="font-bold text-xs text-gray-900">
                        ₱{(item.price * item.quantity).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Pricing Summary */}
                <div className="space-y-2.5 pt-3 border-t border-gray-100 text-xs">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span className="font-medium text-gray-800">₱{subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Shipping Fee (Standard)</span>
                    <span className="font-medium text-gray-800">₱{shippingFee.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-bold text-gray-900 pt-2 border-t border-gray-100">
                    <span>Total Amount</span>
                    <span className="text-brand-red text-lg">₱{total.toLocaleString()}</span>
                  </div>
                </div>

                {/* Error Banner */}
                {errorMsg && (
                  <div className="mt-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-brand-red flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Submit CTA */}
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full mt-6 py-3 text-sm font-bold shadow-md flex items-center justify-center gap-2"
                >
                  {submitting ? 'Placing Order...' : `Place Order (₱${total.toLocaleString()})`}
                </Button>

                <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400 mt-4 text-center">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Loved-IT Buyer Protection & Safe Escrow Guarantee</span>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

