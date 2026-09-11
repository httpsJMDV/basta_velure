import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShoppingBag,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Plus,
  Minus,
  Truck,
  ShieldCheck,
  RotateCcw,
  Tag,
  Check,
  Lock,
  ChevronRight,
  BadgeCheck,
  Banknote,
} from 'lucide-react';
import LovedItLogo from '../components/LovedItLogo';
import { useCart } from '../hooks/useCart';

const FREE_SHIPPING_THRESHOLD = 499;

export default function CartPage() {
  const navigate = useNavigate();
  const { items, removeItem, updateQty, clearCart } = useCart();

  // Promo code engine
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState('');

  // Selected items for bulk operations (default all selected)
  const [selectedIds, setSelectedIds] = useState<number[]>(() => items.map((i) => i.variantId));

  // Sync selectedIds when items change
  const currentVariantIds = items.map((i) => i.variantId);
  const effectiveSelectedIds = selectedIds.filter((id) => currentVariantIds.includes(id));

  const allSelected = items.length > 0 && effectiveSelectedIds.length === items.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(currentVariantIds);
    }
  };

  const toggleSelectItem = (variantId: number) => {
    if (effectiveSelectedIds.includes(variantId)) {
      setSelectedIds(effectiveSelectedIds.filter((id) => id !== variantId));
    } else {
      setSelectedIds([...effectiveSelectedIds, variantId]);
    }
  };

  const activeItems = items.filter((i) => effectiveSelectedIds.includes(i.variantId));
  const subtotal = activeItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const totalItemCount = activeItems.reduce((s, i) => s + i.quantity, 0);

  const isFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const progressPercent = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));
  const amountToFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  const shippingCost = isFreeShipping || subtotal === 0 ? 0 : 99;
  const discountAmount = promoApplied ? Math.round(subtotal * promoDiscount) : 0;
  const grandTotal = Math.max(0, subtotal - discountAmount + shippingCost);

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    setPromoError('');
    const code = promoCode.trim().toUpperCase();
    if (!code) return;

    if (code === 'LOVED10' || code === 'WELCOME10') {
      setPromoApplied(true);
      setPromoDiscount(0.1); // 10% discount
      setPromoError('');
    } else if (code === 'FREESHIP') {
      setPromoApplied(true);
      setPromoDiscount(0.05);
      setPromoError('');
    } else {
      setPromoError('Invalid voucher code. Try LOVED10 for 10% off.');
    }
  };

  const handleRemoveSelected = () => {
    effectiveSelectedIds.forEach((id) => removeItem(id));
    setSelectedIds([]);
  };

  return (
    <div className="min-h-screen bg-[#FBFBFA] flex flex-col font-sans">
      {/* ── Top Utility / Breadcrumb Header ── */}
      <header className="bg-white border-b border-stone-200/80 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center shrink-0">
              <LovedItLogo variant="light" type="full" size="custom" imgClassName="h-8 sm:h-9 object-contain" />
            </Link>
            <span className="text-stone-300 text-lg hidden sm:inline">/</span>
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-stone-500">
              <Link to="/" className="hover:text-brand-red transition-colors">Home</Link>
              <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
              <span className="text-stone-900 font-bold">Shopping Cart</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-stone-600 hover:text-brand-red transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Continue Shopping</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {items.length === 0 ? (
          /* ── Modern High-End Empty State ── */
          <div className="max-w-xl mx-auto py-16 px-4 text-center">
            <div className="w-24 h-24 rounded-3xl bg-red-50/80 border border-red-100 flex items-center justify-center mx-auto mb-6 shadow-sm relative">
              <ShoppingBag className="w-12 h-12 text-brand-red/60" />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 animate-ping" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight">Your shopping cart is empty</h1>
            <p className="text-sm text-stone-500 mt-2 max-w-md mx-auto leading-relaxed">
              Looks like you haven't added anything to your cart yet. Explore thousands of verified Philippine merchants, trending fashion, gadgets, and home goods.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('/')}
                className="w-full sm:w-auto px-8 py-3 rounded-xl bg-brand-red hover:bg-[#852222] text-white text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <span>Discover Products</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <Link
                to="/search"
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 text-sm font-semibold transition-colors flex items-center justify-center"
              >
                Browse All Categories
              </Link>
            </div>

            {/* Quick Suggestions Chips */}
            <div className="mt-12 pt-8 border-t border-stone-200/70">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-3">Popular Categories</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {[
                  { label: 'Tech & Gadgets', to: '/search?category=tech-gadgets' },
                  { label: 'Fashion & Apparel', to: '/search?category=fashion-apparel' },
                  { label: 'Home & Living', to: '/search?category=home-living' },
                  { label: 'Beauty & Wellness', to: '/search?category=beauty-wellness' },
                ].map((chip) => (
                  <Link
                    key={chip.label}
                    to={chip.to}
                    className="text-xs font-medium px-3.5 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200/80 text-stone-700 transition-colors"
                  >
                    {chip.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── 2-Column Responsive Modern Cart Layout ── */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* ── Left Column: Items & Bulk Actions (8 cols on lg) ── */}
            <div className="lg:col-span-8 flex flex-col gap-5">
              
              {/* Free Shipping Progress Banner */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-stone-200/90 shadow-2xs">
                <div className="flex items-center justify-between text-xs sm:text-sm mb-2">
                  <div className="flex items-center gap-2 font-medium text-stone-700">
                    <Truck className={`w-4 h-4 sm:w-5 sm:h-5 ${isFreeShipping ? 'text-emerald-600' : 'text-brand-red'}`} />
                    {isFreeShipping ? (
                      <span className="text-emerald-700 font-bold">
                        Congratulations! You've unlocked <span className="underline decoration-emerald-500">FREE Standard Delivery!</span>
                      </span>
                    ) : (
                      <span>
                        Add <strong className="text-brand-red font-bold">₱{amountToFreeShipping.toLocaleString()}</strong> more to enjoy{' '}
                        <strong className="text-stone-900">FREE Standard Delivery</strong>
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-stone-500">{progressPercent}%</span>
                </div>

                <div className="w-full h-2.5 rounded-full bg-stone-100 overflow-hidden relative">
                  <motion.div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isFreeShipping
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                        : 'bg-gradient-to-r from-amber-400 via-rose-500 to-brand-red'
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>

              {/* Items Card Header / Select All Bar */}
              <div className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs overflow-hidden">
                <div className="px-5 py-4 bg-stone-50/70 border-b border-stone-200/70 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded text-brand-red focus:ring-brand-red focus:ring-offset-0 border-stone-300 cursor-pointer accent-brand-red"
                      />
                      <span className="text-xs sm:text-sm font-bold text-stone-800">
                        Select All ({items.length} items)
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center gap-3">
                    {effectiveSelectedIds.length > 0 && (
                      <button
                        onClick={handleRemoveSelected}
                        className="text-xs font-semibold text-stone-500 hover:text-brand-red transition-colors flex items-center gap-1.5 cursor-pointer"
                        title="Delete selected items"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Selected ({effectiveSelectedIds.length})</span>
                      </button>
                    )}
                    <button
                      onClick={clearCart}
                      className="text-xs font-semibold text-stone-400 hover:text-brand-red transition-colors flex items-center gap-1 cursor-pointer"
                      title="Clear entire cart"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span className="hidden sm:inline">Clear Cart</span>
                    </button>
                  </div>
                </div>

                {/* Items List */}
                <div className="divide-y divide-stone-100">
                  {items.map((item) => {
                    const isSelected = effectiveSelectedIds.includes(item.variantId);
                    return (
                      <div
                        key={item.variantId}
                        className={`p-4 sm:p-5 flex flex-col sm:flex-row gap-4 transition-colors ${
                          isSelected ? 'bg-white' : 'bg-stone-50/40 opacity-70'
                        }`}
                      >
                        {/* Checkbox & Product Image */}
                        <div className="flex items-center gap-3 shrink-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectItem(item.variantId)}
                            className="w-4 h-4 rounded text-brand-red focus:ring-brand-red focus:ring-offset-0 border-stone-300 cursor-pointer accent-brand-red"
                          />

                          {/* Protected Product Thumbnail */}
                          <Link
                            to={`/products/${item.productId}`}
                            className="relative rounded-xl overflow-hidden bg-stone-50 border border-stone-200/90 w-20 h-24 sm:w-24 sm:h-28 flex items-center justify-center group shrink-0"
                          >
                            <img
                              src={item.image || '/placeholder.png'}
                              alt={item.name}
                              draggable={false}
                              onContextMenu={(e) => e.preventDefault()}
                              onDragStart={(e) => e.preventDefault()}
                              className="w-full h-full object-contain p-1.5 select-none protected-image no-save group-hover:scale-105 transition-transform duration-300"
                            />
                            {/* Transparent Shield to prevent drag/save */}
                            <div
                              className="absolute inset-0 bg-transparent select-none z-10"
                              onContextMenu={(e) => e.preventDefault()}
                              draggable={false}
                            />
                          </Link>
                        </div>

                        {/* Product Info & Controls */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <Link
                                to={`/products/${item.productId}`}
                                className="font-semibold text-sm sm:text-base text-stone-900 hover:text-brand-red transition-colors line-clamp-2 leading-snug"
                              >
                                {item.name}
                              </Link>

                              <button
                                onClick={() => removeItem(item.variantId)}
                                className="p-1.5 text-stone-400 hover:text-brand-red hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                                title="Remove item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {item.variant && (
                              <div className="mt-1 flex items-center gap-2">
                                <span className="text-[11px] font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">
                                  Variant: {item.variant}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Quantity Stepper & Price Row */}
                          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-2 border-t border-stone-100">
                            {/* Modern Tactile Stepper */}
                            <div className="flex items-center border border-stone-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                              <button
                                onClick={() => updateQty(item.variantId, item.quantity - 1)}
                                className="w-8 h-8 flex items-center justify-center text-stone-600 hover:text-brand-red hover:bg-stone-50 transition-colors cursor-pointer"
                                title="Decrease quantity"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-xs font-bold w-9 text-center text-stone-900 select-none">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => updateQty(item.variantId, item.quantity + 1)}
                                className="w-8 h-8 flex items-center justify-center text-stone-600 hover:text-brand-red hover:bg-stone-50 transition-colors cursor-pointer"
                                title="Increase quantity"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Item Pricing */}
                            <div className="text-right">
                              <span className="text-base sm:text-lg font-black text-brand-red">
                                ₱{(item.price * item.quantity).toLocaleString()}
                              </span>
                              {item.quantity > 1 && (
                                <span className="block text-[11px] text-stone-400 font-medium">
                                  ₱{item.price.toLocaleString()} each
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Trust Features Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-xl p-3.5 border border-stone-200/80 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-stone-900">Buyer Protection</h4>
                    <p className="text-[11px] text-stone-500">Money back guarantee</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-3.5 border border-stone-200/80 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-50 text-brand-red flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-stone-900">Nationwide Shipping</h4>
                    <p className="text-[11px] text-stone-500">Reliable courier partners</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-3.5 border border-stone-200/80 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-stone-900">Cash on Delivery</h4>
                    <p className="text-[11px] text-stone-500">Available across PH</p>
                  </div>
                </div>
              </div>

            </div>

            {/* ── Right Column: Order Summary (4 cols on lg, sticky) ── */}
            <div className="lg:col-span-4 sticky top-20 flex flex-col gap-4">
              
              <div className="bg-white rounded-2xl p-6 border border-stone-200/90 shadow-sm space-y-5">
                <h2 className="font-black text-lg text-stone-900 tracking-tight flex items-center justify-between">
                  <span>Order Summary</span>
                  <span className="text-xs font-semibold text-stone-400">
                    {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
                  </span>
                </h2>

                {/* Promo Code Input */}
                <form onSubmit={handleApplyPromo} className="relative">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Tag className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value)}
                        placeholder="Voucher code (e.g. LOVED10)"
                        disabled={promoApplied}
                        className="w-full h-9 pl-9 pr-3 text-xs bg-stone-50 text-stone-900 placeholder-stone-400 rounded-xl border border-stone-200 focus:bg-white focus:border-brand-red focus:outline-none transition-all disabled:opacity-60 font-medium"
                      />
                    </div>
                    {promoApplied ? (
                      <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 rounded-xl border border-emerald-200 shrink-0">
                        <Check className="w-3.5 h-3.5" /> Applied
                      </span>
                    ) : (
                      <button
                        type="submit"
                        disabled={!promoCode.trim()}
                        className="h-9 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
                      >
                        Apply
                      </button>
                    )}
                  </div>
                  {promoError && <p className="text-[11px] text-red-500 mt-1.5 font-medium">{promoError}</p>}
                </form>

                {/* Cost Breakdown */}
                <div className="space-y-3 text-xs sm:text-sm border-t border-stone-100 pt-4">
                  <div className="flex justify-between text-stone-600">
                    <span>Items Subtotal</span>
                    <span className="font-semibold text-stone-900">₱{subtotal.toLocaleString()}</span>
                  </div>

                  {promoApplied && (
                    <div className="flex justify-between text-emerald-600 font-medium">
                      <span>Discount ({(promoDiscount * 100).toFixed(0)}%)</span>
                      <span>-₱{discountAmount.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-stone-600">
                    <span className="flex items-center gap-1.5">
                      <span>Shipping Fee</span>
                      {isFreeShipping && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded">
                          FREE
                        </span>
                      )}
                    </span>
                    <span className={isFreeShipping ? 'text-emerald-600 font-bold' : 'font-semibold text-stone-900'}>
                      {isFreeShipping ? '₱0' : `₱${shippingCost.toLocaleString()}`}
                    </span>
                  </div>

                  {/* Grand Total */}
                  <div className="border-t border-stone-200 pt-3.5 flex justify-between items-baseline">
                    <div>
                      <span className="text-base font-black text-stone-900">Estimated Total</span>
                      <p className="text-[10.5px] text-stone-400">VAT included where applicable</p>
                    </div>
                    <span className="text-xl sm:text-2xl font-black text-brand-red">
                      ₱{grandTotal.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Proceed to Checkout Action */}
                <div className="pt-2">
                  <button
                    onClick={() => navigate('/checkout')}
                    disabled={activeItems.length === 0}
                    className="w-full py-4 rounded-xl bg-brand-red hover:bg-[#852222] disabled:opacity-50 text-white font-bold text-sm sm:text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 group cursor-pointer active:scale-98"
                  >
                    <Lock className="w-4 h-4 text-white/80" />
                    <span>Proceed to Checkout</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>

                  <p className="text-[11px] text-center text-stone-400 mt-3">
                    GCash, Credit/Debit, and Cash on Delivery accepted
                  </p>
                </div>

              </div>

              {/* Escrow Guarantee Box */}
              <div className="bg-stone-100/70 rounded-2xl p-4 border border-stone-200/60 flex items-start gap-3">
                <BadgeCheck className="w-5 h-5 text-brand-red shrink-0 mt-0.5" />
                <div className="text-xs text-stone-600 leading-relaxed">
                  <strong className="text-stone-900 font-semibold block mb-0.5">Loved-IT Safe Escrow Guarantee</strong>
                  Payment is securely held and only released to the seller once you have received and confirmed your items.
                </div>
              </div>

            </div>

          </div>
        )}
      </main>

      {/* ── Minimal Professional Footer ── */}
      <footer className="bg-white border-t border-stone-200/80 py-6 mt-12 text-center text-xs text-stone-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} Loved-IT Official. All rights reserved.</p>
          <div className="flex items-center gap-4 text-stone-500 font-medium">
            <Link to="/help/safety" className="hover:text-brand-red transition-colors">Buyer Safety</Link>
            <span>•</span>
            <Link to="/terms-of-service" className="hover:text-brand-red transition-colors">Terms of Service</Link>
            <span>•</span>
            <Link to="/privacy-policy" className="hover:text-brand-red transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
