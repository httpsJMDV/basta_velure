/** ₱1,599 or ₱32.50: centavos only when there are any (storefront cards). */
export function pesoCompact(n: number): string {
  const whole = Number.isInteger(n);
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/** The whole-number percentage off, or 0 when the product is not on sale. */
export function discountPercent(price: number, original: number | null | undefined): number {
  return original != null && original > price ? Math.round((1 - price / original) * 100) : 0;
}
