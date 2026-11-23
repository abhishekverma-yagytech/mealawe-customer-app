'use client';

import Link from 'next/link';
import { useCallback } from 'react';

import { asArray, formatTxnDate, isCredit, PER_PAGE, walletApi, type WalletTxn } from '@mealawe/api';
import { formatINR } from '@mealawe/core';
import { useBalances } from '@mealawe/hooks';
import { useAuthStore } from '@mealawe/state';

import { BottomNav } from '@/components/layout/BottomNav';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { TxnList } from '@/components/wallet/TxnList';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { useRequireLogin } from '@/lib/useRequireLogin';

export default function WalletPage() {
  const authed = useRequireLogin();
  const id = useAuthStore((s) => s.profile?._id);
  const { wallet, cashback } = useBalances();
  const load = useCallback(async (page: number) => (id ? asArray<WalletTxn>(await walletApi.getWalletHistory(id, page)) : []), [id]);
  if (!authed) return null;
  return (
    <>
      <PageHeader title="Wallet" />
      <Page narrow>
        <div className="space-y-5">
          <Card className="bg-gradient-to-br from-primary-dark to-primary text-white"><p className="text-sm text-white/80">Mealawe Money</p><p className="text-3xl font-black">{formatINR(Number.parseFloat(wallet) || 0)}</p></Card>
          <Link href="/cashback" className="flex items-center justify-between rounded-card border border-border bg-card p-4 font-bold"><span>Cashback</span><span className="text-reward">{formatINR(cashback)} →</span></Link>
          <section aria-labelledby="h"><h2 id="h" className="mb-2 text-lg font-black">Transactions</h2>
            <TxnList<WalletTxn> load={load} pageSize={PER_PAGE} empty="No wallet transactions yet." render={(t) => (
              <>
                <div className="min-w-0"><p className="truncate font-bold">{t.remark || (isCredit(t) ? 'Credit' : 'Debit')}</p><p className="text-xs text-muted-foreground">{formatTxnDate(t.created_at)}</p></div>
                <p className={cn('shrink-0 font-black', isCredit(t) ? 'text-primary-dark' : 'text-destructive')}>{isCredit(t) ? '+' : '−'}{formatINR(Math.abs(Number(t.transaction_points) || 0))}</p>
              </>
            )} />
          </section>
        </div>
      </Page>
      <BottomNav />
    </>
  );
}
