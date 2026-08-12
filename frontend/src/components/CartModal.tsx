import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingBag, Trash2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from './ui/Button';

export interface CartItem {
  id: number;
  name: string;
  variant: string;
  price: number;
  quantity: number;
  image: string;
}

interface CartModalProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  onRemove: (id: number) => void;
}

export default function CartModal({ open, onClose, items }: CartModalProps) {
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40"
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 h-full w-full max-w-sm bg-white z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-brand-red" />
                <span className="font-bold text-brand-black text-base">My Cart</span>
                {items.length > 0 && (
                  <span className="bg-brand-red text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {items.length}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <ShoppingBag className="w-12 h-12 text-gray-200" />
                  <p className="text-sm font-semibold text-gray-400">Your cart is empty</p>
                  <p className="text-xs text-gray-300">Add items to get started</p>
                  <button
                    onClick={onClose}
                    className="mt-2 text-sm text-brand-red font-semibold hover:underline"
                  >
                    Continue Shopping
                  </button>
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-16 h-20 object-cover rounded-xl bg-gray-100 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-black truncate">{item.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.variant}</p>
                      <p className="text-sm font-bold text-brand-red mt-1">
                        ₱{(item.price * item.quantity).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                    </div>
                    <button className="self-start p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-brand-red transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="px-5 py-4 border-t border-gray-100 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Subtotal</span>
                  <span className="text-base font-bold text-brand-black">₱{total.toLocaleString()}</span>
                </div>
                <Link to="/cart" onClick={onClose}>
                  <Button className="w-full flex items-center justify-center gap-2">
                    View Full Cart <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <p className="text-xs text-center text-gray-400">Shipping & taxes calculated at checkout</p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
