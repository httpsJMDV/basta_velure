import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './useAuth';
import { isWorkAccount } from '../utils/roleHome';
import {
  addCartItemApi, getCartApi, mergeCartApi, removeCartItemApi, selectCartApi, updateCartItemApi,
} from '../api/commerce';
import type { CartLine, CartNotice, CartView } from '../api/commerce';
import BigPurchaseNotice from '../components/cart/BigPurchaseNotice';
import { guestNotice } from '../utils/cartNotice';
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
  /** Server cart only: the most this buyer can have of it now (stock, or what is left of the purchase limit). */
  maxQuantity?: number;
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
    lineId: l.id, status: l.status, message: l.message, selected: l.selected, maxQuantity: l.max_quantity,
  })));
}

/**
 * The cart (B6). Signed in, it lives on the server: the same on every device, priced live, with sold-out or removed
 * items marked. A guest's cart is kept in this browser and moves into the account at login.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  // A hub, courier or rider account has no cart (the API refuses it), so it never loads or merges one.
  const signedIn = !!user && !isWorkAccount(user);
  const [view, setView] = useState<CartView | null>(null);
  const [guest, setGuest] = useState<CartItem[]>(readGuest);
  const [loading, setLoading] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  /** A big purchase, said once right after the add that made it one. */
  const [notice, setNotice] = useState<CartNotice | null>(null);
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
    let said: CartNotice | null = null;
    if (signedIn) {
      try {
        const res = await addCartItemApi(item.variantId, qty);
        setView(res.data);
        said = res.notice ?? null;
      } catch (e) {
        throw new Error(apiErrorMessage(e, 'Could not add to cart. Please try again.'));
      }
    } else {
      const existing = guest.find((i) => i.variantId === item.variantId);
      const next = existing
        ? guest.map((i) => (i.variantId === item.variantId ? { ...i, quantity: i.quantity + qty } : i))
        : [...guest, { ...item, quantity: qty }];
      setGuest(next);
      const total = next.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const shop = next.filter((i) => i.sellerId === item.sellerId).reduce((sum, i) => sum + i.price * i.quantity, 0);
      said = guestNotice(total, shop, item.price * qty, item.shopName ?? 'this shop');
    }
    // A big purchase is said first; its View cart button opens the cart.
    if (said) setNotice(said);
    else if (opts?.open !== false) setCartOpen(true);
  }, [signedIn, guest]);

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
      <BigPurchaseNotice notice={notice} onClose={() => setNotice(null)} onViewCart={() => { setNotice(null); setCartOpen(true); }} />
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
