import { Link } from 'react-router-dom';
import { ShoppingBag, Trash2, ArrowLeft, ArrowRight } from 'lucide-react';
import Button from '../components/ui/Button';

// Placeholder — will be replaced with real cart state/context
const MOCK_ITEMS = [
  { id: 1, name: 'Floral Wrap Dress', variant: 'Size M · Red', price: 1299, quantity: 1, image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&q=80' },
  { id: 2, name: 'Linen Blouse', variant: 'Size S · White', price: 799, quantity: 2, image: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400&q=80' },
];

export default function CartPage() {
  const items = MOCK_ITEMS;
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const shipping = subtotal > 0 ? 99 : 0;
  const total = subtotal + shipping;

  return (
    <div className="min-h-screen bg-brand-gray-soft">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo1.png" alt="Velure" className="w-7 h-7 rounded-full logo-img" />
            <span className="text-brand-red font-bold text-lg tracking-tight">Velure</span>
          </Link>
          <span className="text-gray-300 text-lg">/</span>
          <span className="text-sm font-semibold text-brand-black">Shopping Cart</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-black transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Continue Shopping
        </Link>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <ShoppingBag className="w-16 h-16 text-gray-200" />
            <p className="text-lg font-semibold text-gray-400">Your cart is empty</p>
            <Link to="/">
              <Button>Start Shopping</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Items */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <h1 className="text-xl font-bold text-brand-black">
                Cart <span className="text-gray-400 font-normal text-base">({items.length} items)</span>
              </h1>

              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-2xl p-4 flex gap-4 shadow-sm border border-gray-100">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-24 h-32 object-cover rounded-xl bg-gray-100 shrink-0"
                  />
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <p className="font-semibold text-brand-black">{item.name}</p>
                      <p className="text-sm text-gray-400 mt-0.5">{item.variant}</p>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      {/* Quantity */}
                      <div className="flex items-center gap-2 border border-gray-200 rounded-lg overflow-hidden">
                        <button className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors font-bold">−</button>
                        <span className="text-sm font-semibold w-6 text-center">{item.quantity}</span>
                        <button className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors font-bold">+</button>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-brand-red">₱{(item.price * item.quantity).toLocaleString()}</span>
                        <button className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-brand-red transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Order summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 sticky top-20">
                <h2 className="font-bold text-brand-black mb-4">Order Summary</h2>
                <div className="flex flex-col gap-3 text-sm">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span className="text-brand-black font-medium">₱{subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Shipping</span>
                    <span className="text-brand-black font-medium">₱{shipping.toLocaleString()}</span>
                  </div>
                  <div className="border-t border-gray-100 pt-3 flex justify-between font-bold text-base">
                    <span>Total</span>
                    <span className="text-brand-red">₱{total.toLocaleString()}</span>
                  </div>
                </div>
                <Button className="w-full mt-5 flex items-center justify-center gap-2">
                  Proceed to Checkout <ArrowRight className="w-4 h-4" />
                </Button>
                <p className="text-xs text-center text-gray-400 mt-3">GCash & Cash on Delivery accepted</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
