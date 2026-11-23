import { ENDPOINTS, http } from '@mealawe/core';

import type { CashbackTxn, WalletTxn } from './types';

const PER_PAGE = 10;

/**
 * Wallet (Mealawe Money) + Cashback API — thin wrappers over the encrypted HTTP
 * client. Endpoints/behavior ported from mealaweApp apiMain.
 */
export const walletApi = {
  /** Mealawe Money balance for a user. */
  getWalletBalance: (userId: string) =>
    http.get<unknown>(`${ENDPOINTS.wallet.balance}/${userId}`),

  /** Wallet transaction history (paged, 10/page). */
  getWalletHistory: (userId: string, page: number) =>
    http.get<WalletTxn[] | { data: WalletTxn[] }>(
      `${ENDPOINTS.wallet.history}/${userId}/${page}/${PER_PAGE}`,
    ),

  /** Cashback points balance. */
  getCashbackBalance: (userId: string) =>
    http.get<unknown>(`${ENDPOINTS.wallet.cashbackBalance}/${userId}`),

  /** Cashback history (paged). */
  getCashbackHistory: (userId: string, page: number) =>
    http.get<CashbackTxn[] | { data: CashbackTxn[] }>(
      `${ENDPOINTS.wallet.cashbackHistory}/${userId}/${page}`,
    ),
};

export { PER_PAGE };
