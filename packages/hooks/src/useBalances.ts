import { useCallback, useEffect, useState } from 'react';

import { cashbackBalanceOf, moneyWalletBalanceOf, walletApi } from '@mealawe/api';
import { useAuthStore } from '@mealawe/state';

export interface Balances {
  /** Mealawe Money, formatted to 2 decimals (e.g. "120.00"). */
  wallet: string;
  /** Cashback points (whole/2-dp number). */
  cashback: number;
  loading: boolean;
  refresh: () => void;
}

/**
 * Loads the logged-in user's wallet + cashback balances. Safe for guests
 * (returns zeros). Errors are swallowed to zeros so the UI never breaks.
 */
export function useBalances(): Balances {
  const profileId = useAuthStore((s) => s.profile?._id);
  const [wallet, setWallet] = useState('0.00');
  const [cashback, setCashback] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!profileId) {
      setWallet('0.00');
      setCashback(0);
      return;
    }
    setLoading(true);
    try {
      const [w, c] = await Promise.all([
        walletApi.getWalletBalance(profileId).catch(() => null),
        walletApi.getCashbackBalance(profileId).catch(() => null),
      ]);
      const money = moneyWalletBalanceOf(w);
      setWallet(money > 0 ? money.toFixed(2) : '0.00');
      setCashback(Math.round(cashbackBalanceOf(c) * 100) / 100);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { wallet, cashback, loading, refresh: load };
}
