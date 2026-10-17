import { useEffect, useState } from 'react';
import { getShopPaymentInfoApi } from '../api/client';
import type { ShopPaymentInfo } from '../types';
import { DELIVERY_FEE } from '../utils/shipping';

/**
 * How each shop in the cart takes payment and when it delivers for free, keyed by seller id. GCash details come
 * back only for a signed-in buyer, so pass the user as `refreshKey` where they matter (checkout).
 */
export function useShopPaymentInfo(sellerIds: (number | undefined)[], enabled = true, refreshKey?: unknown) {
  const key = [...new Set(sellerIds.filter((id): id is number => Boolean(id)))].sort((a, b) => a - b).join(',');
  const [info, setInfo] = useState<Record<number, ShopPaymentInfo>>({});

  useEffect(() => {
    if (!key || !enabled) return;
    let alive = true;
    getShopPaymentInfoApi(key.split(',').map(Number))
      .then((list) => { if (alive) setInfo((prev) => ({ ...prev, ...Object.fromEntries(list.map((x) => [x.seller_id, x])) })); })
      .catch(() => {});
    return () => { alive = false; };
  }, [key, enabled, refreshKey]);

  return info;
}

/**
 * One shop's delivery fee for a given subtotal: the flat fee, or nothing once the shop's free-delivery minimum
 * is met. `short` is how much more would make it free. Mirrors BuyerOrderController::placeOrder.
 */
export function shopDelivery(subtotal: number, info?: ShopPaymentInfo) {
  const freeFrom = info?.free_delivery_min ?? null;
  const fee = freeFrom !== null && subtotal >= freeFrom ? 0 : DELIVERY_FEE;
  return { fee, freeFrom, short: freeFrom !== null && fee > 0 ? freeFrom - subtotal : 0 };
}
