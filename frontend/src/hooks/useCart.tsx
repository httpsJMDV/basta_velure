import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { addToCartApi } from '../api/client';

export interface CartItem {
  variantId: number;
  productId: number;
  name: string;
  variant: string;
  price: number;
  quantity: number;
  image: string;
}

interface CartContextValue {
  items: CartItem[];
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => Promise<void>;
  removeItem: (variantId: number) => void;
  updateQty: (variantId: number, qty: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('velure_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('velure_cart', JSON.stringify(items));
    } catch {
      // ignore quota / private mode errors
    }
  }, [items]);

  const addItem = useCallback(async (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => {
    const qty = item.quantity ?? 1;
    try {
      await addToCartApi(item.variantId, qty);
    } catch {
      // Backend cart API may not exist or user is in offline/client cart mode
    }
    setItems((prev) => {
      const existing = prev.find((i) => i.variantId === item.variantId);
      if (existing) {
        return prev.map((i) =>
          i.variantId === item.variantId ? { ...i, quantity: i.quantity + qty } : i
        );
      }
      return [...prev, { ...item, quantity: qty }];
    });
    setCartOpen(true);
  }, []);

  const removeItem = useCallback((variantId: number) => {
    setItems((prev) => prev.filter((i) => i.variantId !== variantId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const updateQty = useCallback((variantId: number, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.variantId !== variantId)
        : prev.map((i) => (i.variantId === variantId ? { ...i, quantity: qty } : i))
    );
  }, []);

  return (
    <CartContext.Provider value={{
      items, cartOpen,
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),
      addItem, removeItem, updateQty, clearCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
