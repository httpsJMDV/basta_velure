import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './useAuth';
import {
  addCartItemApi, getCartApi, mergeCartApi, removeCartItemApi, selectCartApi, updateCartItemApi,
} from '../api/commerce';
import type { CartLine, CartView } from '../api/commerce';
import { apiErrorMessage } from '../utils/apiError';

/** A cart line as the header, drawer and product pages use it. */
export interface CartItem {
  variantId: number;
  productId: number;
  name: string;
  variant: string;
  price: number;
  quantity: number;
  image: string;
  sellerId?: number;
  shopName?: string;
  /** Server cart only: the line id, its status and whether it is selected for checkout. */
  lineId?: number;
  status?: CartLine['status'];
  message?: string | null;
  selected?: boolean;
}

interface CartContextValue {
  /** The priced cart (server) for a signed-in buyer; null for a guest. */
  view: CartView | null;
  items: CartItem[];
  count: number;
  loading: boolean;
  signedIn: boolean;
  cartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  /** Adds units; rejects with the server's message (sold out, over the stock or the purchase limit). */
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }, opts?: { open?: boolean }) => Promise<void>;
  removeItem: (variantId: number) => Promise<void>;
  /** Resolves to an error message when the quantity is refused. */
  updateQty: (variantId: number, qty: number | string) => Promise<string | undefined>;
  setSelected: (variantId: number, on: boolean) => Promise<string | undefined>;
  selectAll: (on: boolean, sellerId?: number) => Promise<void>;
  refresh: () => Promise<void>;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);
const KEY = 'loved_it_cart';

function readGuest(): CartItem[] {
  try {
    const saved = localStorage.getItem(KEY) || localStorage.getItem('velure_cart');
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGuest(items: CartItem[]) {
  try {
    if (items.length) localStorage.setItem(KEY, JSON.stringify(items));
    else localStorage.removeItem(KEY);
    localStorage.removeItem('velure_cart');
  } catch {
    // private mode or quota: the cart lives in memory for this visit
  }
}

function flatten(view: CartView): CartItem[] {
  return view.stores.flatMap((s) => s.lines.map((l) => ({
    variantId: l.variant_id, productId: l.product_id, name: l.name, variant: l.variant_label ?? '', price: l.unit_price,
    quantity: l.quantity, image: l.image_url ?? '', sellerId: s.seller.id, shopName: s.seller.shop_name,
    lineId: l.id, status: l.status, message: l.message, selected: l.selected,
  })));
}

/**
 * The cart (B6). Signed in, it lives on the server: the same on every device, priced live, with sold-out or removed
 * items marked. A guest's cart is kept in this browser and moves into the account at login.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const signedIn = !!user;
  const [view, setView] = useState<CartView | null>(null);
  const [guest, setGuest] = useState<CartItem[]>(readGuest);
  const [loading, setLoading] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const merging = useRef(false);

  useEffect(() => { if (!signedIn) writeGuest(guest); }, [guest, signedIn]);

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    try { setView(await getCartApi()); } catch { /* keep what is shown */ }
  }, [signedIn]);

  // On login: move the guest cart in, then load the account's cart. On logout: back to the browser's cart.
  useEffect(() => {
    if (authLoading) return;
    if (!signedIn) { setView(null); setGuest(readGuest()); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const local = readGuest();
        if (local.length && !merging.current) {
          merging.current = true;
          const res = await mergeCartApi(local.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })));
          writeGuest([]);
          setGuest([]);
          if (alive) setView(res.data);
        } else if (alive) {
          setView(await getCartApi());
        }
      } catch {
        // offline for a moment: the next action loads it
      } finally {
        merging.current = false;
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [signedIn, authLoading]);

  const lineOf = useCallback((variantId: number) => view?.stores.flatMap((s) => s.lines).find((l) => l.variant_id === variantId), [view]);

  const addItem = useCallback(async (item: Omit<CartItem, 'quantity'> & { quantity?: number }, opts?: { open?: boolean }) => {
    const qty = item.quantity ?? 1;
    if (signedIn) {
      try {
        const res = await addCartItemApi(item.variantId, qty);
        setView(res.data);
      } catch (e) {
        throw new Error(apiErrorMessage(e, 'Could not add to cart. Please try again.'));
      }
    } else {
      setGuest((prev) => {
        const existing = prev.find((i) => i.variantId === item.variantId);
        return existing
          ? prev.map((i) => (i.variantId === item.variantId ? { ...i, quantity: i.quantity + qty } : i))
          : [...prev, { ...item, quantity: qty }];
      });
    }
    if (opts?.open !== false) setCartOpen(true);
  }, [signedIn]);

  const removeItem = useCallback(async (variantId: number) => {
    if (!signedIn) { setGuest((prev) => prev.filter((i) => i.variantId !== variantId)); return; }
    const line = lineOf(variantId);
    if (!line) return;
    try { setView(await removeCartItemApi(line.id)); } catch { await refresh(); }
  }, [signedIn, lineOf, refresh]);

  const updateQty = useCallback(async (variantId: number, qty: number | string) => {
    if (!signedIn) {
      const n = Number(qty);
      if (!Number.isInteger(n) || n < 1) return 'Enter a whole-number quantity of at least 1.';
      setGuest((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, quantity: n } : i)));
      return undefined;
    }
    const line = lineOf(variantId);
    if (!line) return undefined;
    try { setView(await updateCartItemApi(line.id, { quantity: qty })); return undefined; }
    catch (e) { return apiErrorMessage(e, 'The quantity could not be changed.'); }
  }, [signedIn, lineOf]);

  const setSelected = useCallback(async (variantId: number, on: boolean) => {
    const line = lineOf(variantId);
    if (!signedIn || !line) return undefined;
    try { setView(await updateCartItemApi(line.id, { selected: on })); return undefined; }
    catch (e) { return apiErrorMessage(e, 'This item cannot be selected.'); }
  }, [signedIn, lineOf]);

  const selectAll = useCallback(async (on: boolean, sellerId?: number) => {
    if (!signedIn) return;
    try { setView(await selectCartApi(on, sellerId)); } catch { await refresh(); }
  }, [signedIn, refresh]);

  const clearCart = useCallback(() => {
    if (signedIn) { void refresh(); return; }
    setGuest([]);
  }, [signedIn, refresh]);

  const items = useMemo(() => (signedIn ? (view ? flatten(view) : []) : guest), [signedIn, view, guest]);
  const count = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);

  return (
    <CartContext.Provider value={{
      view, items, count, loading, signedIn, cartOpen,
      openCart: () => setCartOpen(true),
      closeCart: () => setCartOpen(false),
      addItem, removeItem, updateQty, setSelected, selectAll, refresh, clearCart,
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
