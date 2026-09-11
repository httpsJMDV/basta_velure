import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ShoppingBag,
  Trash2,
  ArrowRight,
  Plus,
  Minus,
  Truck,
  ShieldCheck,
  Tag,
  Check,
  Lock,
  RotateCcw,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';

export interface CartItem {
  id: number;
  productId?: number;
  name: string;
  variant: string;
  price: number;
  quantity: number;
  image: string;
}

interface CartModalProps {
  open: boolean;
  onClose: () => void;
  items?: CartItem[];
  onRemove?: (id: number) => void;
  onUpdateQty?: (id: number, qty: number) => void;
  onClear?: () => void;
}

const FREE_SHIPPING_THRESHOLD = 499;

export default function CartModal({
  open,
  onClose,
  items: propItems,
  onRemove: propOnRemove,
  onUpdateQty: propOnUpdateQty,
  onClear: propOnClear,
}: CartModalProps) {
  const navigate = useNavigate();
  const cart = useCart();

  // Prefer props if provided, fallback to useCart hook
  const rawItems = propItems ?? cart.items.map((i) => ({
    id: i.variantId,
    productId: i.productId,
    name: i.name,
    variant: i.variant,
    price: i.price,
    quantity: i.quantity,
    image: i.image,
  }));

  const handleRemove = (id: number) => {
    if (propOnRemove) propOnRemove(id);
    else cart.removeItem(id);
  };

  const handleUpdateQty = (id: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemove(id);
      return;
    }
    if (propOnUpdateQty) propOnUpdateQty(id, newQty);
    else cart.updateQty(id, newQty);
  };

  const handleClear = () => {
    if (propOnClear) propOnClear();
    else cart.clearCart();
  };

  // Promo code state
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState('');

  const subtotal = rawItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const totalItemsCount = rawItems.reduce((sum, i) => sum + i.quantity, 0);

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
      setPromoDiscount(0.1); // 10% off
      setPromoError('');
    } else if (code === 'FREESHIP') {
      setPromoApplied(true);
      setPromoDiscount(0.05);
      setPromoError('');
    } else {
      setPromoError('Invalid coupon code. Try LOVED10 for 10% off.');
    }
  };

  const handleCheckout = () => {
    onClose();
    navigate('/checkout');
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ── Modern Backdrop with Soft Blur ── */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 transition-all"
          />

          {/* ── Modern Professional Drawer (440px width, sleek typography & cards) ── */}
          <motion.div
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed right-0 top-0 h-full w-full max-w-[440px] bg-white z-50 flex flex-col shadow-2xl border-l border-stone-200/80 select-none"
          >
            {/* ── Header ── */}
            <div className="px-5 sm:px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-red-50 text-brand-red flex items-center justify-center shadow-2xs">
                  <ShoppingBag className="w-4 h-4 text-brand-red" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-gray-900 text-base sm:text-lg tracking-tight">Shopping Bag</h2>
                    {totalItemsCount > 0 && (
                      <span className="bg-brand-red text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-2xs">
                        {totalItemsCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {rawItems.length > 0 && (
                  <button
                    onClick={handleClear}
                    title="Clear all items"
                    className="p-1.5 text-xs text-gray-400 hover:text-brand-red hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Clear</span>
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full text-gray-400 hover:text-gray-700 hover:bg-stone-100 flex items-center justify-center transition-colors cursor-pointer"
                  title="Close cart"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* ── Free Shipping Progress Bar (High-Conversion E-Commerce Pattern) ── */}
            {rawItems.length > 0 && (
              <div className="px-5 sm:px-6 py-3 bg-stone-50/90 border-b border-stone-100 shrink-0">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-1.5 font-medium text-gray-700">
                    <Truck className={`w-4 h-4 ${isFreeShipping ? 'text-emerald-600' : 'text-brand-red'}`} />
                    {isFreeShipping ? (
                      <span className="text-emerald-700 font-bold">
                        You've unlocked <span className="underline decoration-emerald-500">FREE Shipping!</span>
                      </span>
                    ) : (
                      <span>
                        Add <strong className="text-brand-red font-bold">₱{amountToFreeShipping.toLocaleString()}</strong> more for{' '}
                        <strong className="text-gray-900">FREE Shipping</strong>
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-gray-500">{progressPercent}%</span>
                </div>

                {/* Progress track */}
                <div className="w-full h-2 rounded-full bg-stone-200 overflow-hidden relative">
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
            )}

            {/* ── Cart Items List / Empty State ── */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 flex flex-col gap-3.5 divide-y divide-stone-100 scrollbar-none no-scrollbar">
              {rawItems.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center h-full py-12 text-center px-4">
                  <div className="w-20 h-20 rounded-3xl bg-red-50/80 border border-red-100 flex items-center justify-center mb-4 shadow-sm relative">
                    <ShoppingBag className="w-10 h-10 text-brand-red/60" />
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 animate-ping" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">Your bag is empty</h3>
                  <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-xs leading-relaxed">
                    Discover hand-crafted goods, everyday essentials, and exclusive community discounts.
                  </p>

                  {/* Category Quick Chips */}
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-6 max-w-xs">
                    {[
                      { label: 'Tech & Gadgets', to: '/search?category=tech-gadgets' },
                      { label: 'Fashion', to: '/search?category=fashion-apparel' },
                      { label: 'Home Living', to: '/search?category=home-living' },
                    ].map((chip) => (
                      <Link
                        key={chip.label}
                        to={chip.to}
                        onClick={onClose}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-gray-700 transition-colors"
                      >
                        {chip.label}
                      </Link>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      onClose();
                      navigate('/search');
                    }}
                    className="mt-6 px-6 py-2.5 rounded-full bg-brand-red hover:bg-[#801818] text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                  >
                    <span>Start Shopping</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                /* Item rows */
                rawItems.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="pt-3.5 first:pt-0 flex gap-3.5 group"
                  >
                    {/* Protected product image */}
                    <Link
                      to={`/products/${item.productId ?? item.id}`}
                      onClick={onClose}
                      className="shrink-0 relative rounded-xl overflow-hidden bg-stone-50 border border-stone-200/80 w-20 h-24 flex items-center justify-center group/img"
                    >
                      <img
                        src={item.image || '/placeholder.png'}
                        alt={item.name}
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                        onDragStart={(e) => e.preventDefault()}
                        className="w-full h-full object-contain p-1.5 select-none protected-image no-save group-hover/img:scale-105 transition-transform duration-300"
                      />
                      <div
                        className="absolute inset-0 bg-transparent select-none z-10"
                        onContextMenu={(e) => e.preventDefault()}
                        draggable={false}
                      />
                    </Link>

                    {/* Product Details */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to={`/products/${item.productId ?? item.id}`}
                            onClick={onClose}
                            className="text-xs sm:text-sm font-semibold text-gray-900 hover:text-brand-red transition-colors line-clamp-2 leading-snug"
                          >
                            {item.name}
                          </Link>
                          {/* Remove button */}
                          <button
                            onClick={() => handleRemove(item.id)}
                            className="p-1 text-gray-400 hover:text-brand-red hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="Remove item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Variant Badge */}
                        {item.variant && (
                          <span className="inline-block mt-1 text-[11px] font-medium text-gray-500 bg-stone-100 px-2 py-0.5 rounded-md">
                            {item.variant}
                          </span>
                        )}
                      </div>

                      {/* Quantity Stepper & Price Row */}
                      <div className="flex items-center justify-between mt-2.5 pt-1">
                        {/* Modern Stepper */}
                        <div className="flex items-center border border-stone-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                          <button
                            onClick={() => handleUpdateQty(item.id, item.quantity - 1)}
                            className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-brand-red hover:bg-stone-50 transition-colors cursor-pointer disabled:opacity-30"
                            title="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold w-7 text-center text-gray-800 select-none">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateQty(item.id, item.quantity + 1)}
                            className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-brand-red hover:bg-stone-50 transition-colors cursor-pointer"
                            title="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Line Total */}
                        <div className="text-right">
                          <span className="text-xs sm:text-sm font-black text-brand-red">
                            ₱{(item.price * item.quantity).toLocaleString()}
                          </span>
                          {item.quantity > 1 && (
                            <span className="block text-[10px] text-gray-400">
                              ₱{item.price.toLocaleString()} each
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* ── Footer / Order Summary & Checkout Action ── */}
            {rawItems.length > 0 && (
              <div className="p-5 sm:p-6 border-t border-stone-200 bg-stone-50/50 shrink-0 space-y-3.5">
                
                {/* Voucher / Coupon Accordion Input */}
                <form onSubmit={handleApplyPromo} className="relative">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Tag className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value)}
                        placeholder="Discount code (e.g. LOVED10)"
                        disabled={promoApplied}
                        className="w-full h-8 pl-8 pr-3 text-xs bg-white text-gray-800 placeholder-gray-400 rounded-lg border border-stone-200 focus:border-brand-red focus:outline-none transition-all disabled:bg-stone-100 disabled:text-gray-400"
                      />
                    </div>
                    {promoApplied ? (
                      <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 shrink-0 px-2 py-1 bg-emerald-50 rounded-lg border border-emerald-200">
                        <Check className="w-3.5 h-3.5" /> Applied
                      </span>
                    ) : (
                      <button
                        type="submit"
                        disabled={!promoCode.trim()}
                        className="h-8 px-3 rounded-lg bg-stone-800 hover:bg-stone-900 disabled:opacity-40 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
                      >
                        Apply
                      </button>
                    )}
                  </div>
                  {promoError && <p className="text-[11px] text-red-500 mt-1">{promoError}</p>}
                </form>

                {/* Subtotals & Breakdowns */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span className="font-semibold text-gray-800">₱{subtotal.toLocaleString()}</span>
                  </div>

                  {promoApplied && (
                    <div className="flex justify-between text-emerald-600 font-medium">
                      <span>Discount ({(promoDiscount * 100).toFixed(0)}%)</span>
                      <span>-₱{discountAmount.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-gray-500">
                    <span className="flex items-center gap-1">
                      <span>Shipping</span>
                      {isFreeShipping && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.2 rounded">
                          FREE
                        </span>
                      )}
                    </span>
                    <span className={isFreeShipping ? 'text-emerald-600 font-bold' : 'font-semibold text-gray-800'}>
                      {isFreeShipping ? '₱0' : `₱${shippingCost.toLocaleString()}`}
                    </span>
                  </div>

                  {/* Grand Total */}
                  <div className="border-t border-stone-200 pt-2 flex justify-between items-baseline">
                    <div>
                      <span className="text-sm sm:text-base font-black text-gray-900">Estimated Total</span>
                      <span className="block text-[10px] text-gray-400">Taxes & final courier rates calculated at checkout</span>
                    </div>
                    <span className="text-base sm:text-xl font-black text-brand-red">
                      ₱{grandTotal.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Checkout CTA Buttons */}
                <div className="space-y-2 pt-1">
                  <button
                    onClick={handleCheckout}
                    className="w-full py-3.5 rounded-xl bg-brand-red hover:bg-[#8e2424] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 group cursor-pointer active:scale-98"
                  >
                    <Lock className="w-4 h-4 text-white/80" />
                    <span>Proceed to Checkout</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>

                  <Link
                    to="/cart"
                    onClick={onClose}
                    className="w-full py-2.5 rounded-xl bg-white hover:bg-stone-100 border border-stone-200 text-gray-700 font-semibold text-xs transition-colors flex items-center justify-center"
                  >
                    View &amp; Edit Shopping Cart
                  </Link>
                </div>

                {/* Trust Badges */}
                <div className="pt-2 flex items-center justify-center gap-4 text-[10.5px] text-gray-400 border-t border-stone-200/60">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>7-Day Escrow Guarantee</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5 text-brand-red" />
                    <span>Verified Couriers</span>
                  </span>
                </div>

              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
