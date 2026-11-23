/** Wallet (Mealawe Money) transaction row. */
export interface WalletTxn {
  created_at?: string;
  remark?: string;
  transaction_points?: number | string;
  transactionType?: string; // 'credit' | 'debit'
}

/** Cashback history entry. */
export interface CashbackTxn {
  expiryOn?: string;
  status?: string; // 'expired' | ...
  title?: string;
  remark?: string;
  cashbackPoints?: number | string;
}

export function isCredit(txn: WalletTxn): boolean {
  return (txn.transactionType ?? '').toLowerCase() === 'credit';
}

export function isExpired(txn: CashbackTxn): boolean {
  return (txn.status ?? '').toLowerCase() === 'expired';
}

/** Format an ISO/date string as e.g. "5 Feb 2026" (en-GB). Empty string if invalid. */
export function formatTxnDate(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
