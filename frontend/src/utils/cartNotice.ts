// The big-purchase notice for a guest's cart, which lives in the browser (the server says it for a signed-in buyer:
// OrderLimits::cartNotice). Same rule and words, at the default limits.
import type { CartNotice } from '../api/commerce';

export const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** What a guest's add says, at the default ₱50,000. */
export function guestNotice(cartTotal: number, shopTotal: number, added: number, shopName: string): CartNotice | null {
  const min = 50000;
  const codMax = 50000;
  const agreement = cartTotal >= min && (cartTotal - added < min || added >= min);
  const noCod = shopTotal > codMax && (shopTotal - added <= codMax || added > codMax);
  if (!agreement && !noCod) return null;
  const points: string[] = [];
  if (agreement) points.push(`Your cart is now ${peso(cartTotal)}. For orders of ${peso(min)} or more, you confirm at checkout that you checked the items, the shop and the total. Your agreement is saved with the order.`);
  if (noCod) points.push(`Cash on delivery is only for up to ${peso(codMax)} per shop, so a rider never carries that much cash. Pay ${shopName}'s order of ${peso(shopTotal)} by GCash.`);
  points.push('You can still ask for a return within 7 days of delivery if something is wrong.');
  return { kind: 'big_purchase', title: 'This is a big purchase', points, cart_total: cartTotal, shop_total: shopTotal, agreement_min: min, cod_max: codMax, agreement, no_cod: noCod };
}

