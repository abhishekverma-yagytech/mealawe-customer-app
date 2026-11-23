/** Round to 2 decimal places (paise) — was defined identically in four
 * separate places (`features/cart/bill.ts`, `features/bulk/bill.ts`,
 * `features/on-demand/bill.ts`, `features/apartment/bill.ts`); consolidated
 * here since it's the one piece of real, byte-for-byte duplicated logic
 * across those bill builders. Each vertical's actual charge FORMULA (GST
 * layering, discount/cashback/wallet order, slab-vs-flat delivery, etc.)
 * stays separate — those differ by real product rules per vertical, not by
 * accident, and forcing them into one shared function would either be
 * wrong for at least one vertical or need stubbed-out fields that don't
 * apply to it (see each bill.ts's own doc comments). */
export const round2 = (n: number): number => Math.round(n * 100) / 100;
