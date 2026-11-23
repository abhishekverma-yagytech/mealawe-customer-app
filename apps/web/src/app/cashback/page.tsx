'use client';

import { useCallback } from 'react';

import { asArray, formatTxnDate, isExpired, walletApi, type CashbackTxn } from '@mealawe/api';
import { formatINR } from '@mealawe/core';
import { useBalances } from '@mealawe/hooks';
import { useAuthStore } from '@mealawe/state';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { TxnList } from '@/components/wallet/TxnList';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { useRequireLogin } from '@/lib/useRequireLogin';

export default function CashbackPage() {
  const authed = useRequireLogin();
  const id = useAuthStore((s) => s.profile?._id);
  const { cashback } = useBalances();
  const load = useCallback(async (page: number) => (id ? asArray<CashbackTxn>(await walletApi.getCashbackHistory(id, page)) : []), [id]);
  if (!authed) return null;
  return (
    <>
      <PageHeader title="Cashback" />
      <Page narrow>
        <div className="space-y-5">
          <Card className="bg-gradient-to-br from-reward to-plan text-white"><p className="text-sm text-white/80">Available cashback</p><p className="text-3xl font-black">{formatINR(cashback)}</p><p className="mt-1 text-xs text-white/80">Cashback expires 30 days after it is credited.</p></Card>
          <TxnList<CashbackTxn> load={load} pageSize={10} empty="No cashback yet." render={(t) => (
            <>
              <div className="min-w-0"><p className="truncate font-bold">{t.title || t.remark || 'Cashback'}</p><p className="text-xs text-muted-foreground">{isExpired(t) ? 'Expired' : t.expiryOn ? `Expires ${formatTxnDate(t.expiryOn)}` : ''}</p></div>
              <p className={cn('shrink-0 font-black', isExpired(t) ? 'text-muted-foreground line-through' : 'text-primary-dark')}>+{formatINR(Number(t.cashbackPoints) || 0)}</p>
            </>
          )} />
        </div>
      </Page>
    </>
  );
}
