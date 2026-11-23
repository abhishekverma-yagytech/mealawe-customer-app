/**
 * Defensive parsers for wallet / cashback responses. The backend may return a
 * bare array, a single object, `{ data: [...] }`, or a nested container. These
 * dig through common wrapper keys so the UI finds the balance / rows regardless.
 * (Superset of mealaweApp's wallet-parse.util.)
 */

const LIST_KEYS = [
  'data',
  'list',
  'result',
  'results',
  'rows',
  'records',
  'transactions',
  'history',
  'walletHistory',
  'cashbackList',
  'cashbackHistory',
  'response',
] as const;

/** Extract an array from a response, digging up to 2 wrapper levels deep. */
export function asArray<T = unknown>(res: unknown, depth = 2): T[] {
  if (Array.isArray(res)) return res as T[];
  const obj = res as Record<string, unknown> | null | undefined;
  if (!obj || typeof obj !== 'object') return [];
  for (const key of LIST_KEYS) {
    if (Array.isArray(obj[key])) return obj[key] as T[];
  }
  if (depth > 0) {
    for (const key of ['data', 'result', 'response']) {
      const nested = obj[key];
      if (nested && typeof nested === 'object') {
        const inner = asArray<T>(nested, depth - 1);
        if (inner.length) return inner;
      }
    }
  }
  return [];
}

/** Find the first finite value for any of `fields`, searching nested objects. */
function findNumber(res: unknown, fields: readonly string[], depth = 3): number | null {
  if (res == null) return null;
  if (Array.isArray(res)) {
    return res.length ? findNumber(res[0], fields, depth) : null;
  }
  if (typeof res !== 'object') return null;
  const obj = res as Record<string, unknown>;
  for (const field of fields) {
    const value = Number(obj[field]);
    if (Number.isFinite(value) && obj[field] != null && obj[field] !== '') return value;
  }
  if (depth > 0) {
    for (const key of ['data', 'result', 'response', 'wallet', 'cashback']) {
      const nested = obj[key];
      if (nested && typeof nested === 'object') {
        const found = findNumber(nested, fields, depth - 1);
        if (found != null) return found;
      }
    }
  }
  return null;
}

export function cashbackBalanceOf(res: unknown): number {
  const value = findNumber(res, [
    'totalCashbackBalance',
    'cashbackBalance',
    'cashback_balance',
    'balance',
    'wallet_balance',
    'points',
  ]);
  return value != null && value > 0 ? value : 0;
}

export function moneyWalletBalanceOf(res: unknown): number {
  const value = findNumber(res, [
    'wallet_balance',
    'walletBalance',
    'balance',
    'totalWalletBalance',
    'amount',
  ]);
  return value != null && value > 0 ? value : 0;
}
