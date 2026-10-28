/** A typed quantity as a whole number of at least 1, and no more than `max` (null when it is not a number). */
export function clampQuantity(raw: string | number, max?: number): { qty: number; clamped: boolean } | null {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw).replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  if (max !== undefined && max > 0 && n > max) return { qty: max, clamped: true };
  return { qty: n, clamped: false };
}
