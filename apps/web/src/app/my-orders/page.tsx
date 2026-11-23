'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { useVisibleOrderModes } from '@mealawe/hooks';

import { BottomNav } from '@/components/layout/BottomNav';
import { useApartmentEligibilityStore } from '@/features/apartment/eligibility';
import { Page, PageHeader } from '@/components/layout/PageHeader';
import { PendingPaymentBanner } from '@/components/orders/PendingPaymentBanner';
import { ORDER_HISTORY_CATEGORIES } from '@/lib/orderCategories';
import { useRequireLogin } from '@/lib/useRequireLogin';

export default function MyOrdersPage() {
  const authed = useRequireLogin();
  const visible = useVisibleOrderModes();
  const apartmentHere = useApartmentEligibilityStore((s) => !!s.apartment);
  const cats = useMemo(() => ORDER_HISTORY_CATEGORIES.filter((c) => !c.gate || visible.has(c.gate)), [visible]);
  if (!authed) return null;
  return (
    <>
      <PageHeader title="My orders" />
      <Page narrow>
        <div className="mb-4 space-y-3">
          <PendingPaymentBanner />
          <p className="text-muted-foreground">Track deliveries, review past orders</p>
        </div>
        <ul className="space-y-3">
          {cats.map((c) => (
            <li key={c.key}>
              <Link href={c.key === 'subscription' ? '/orders' : `/order-history/${c.key}`} className="flex items-center justify-between rounded-card border border-border bg-card p-4 font-bold shadow-sm hover:shadow-md">
                {c.title}<ChevronRight className="size-5 text-muted-foreground" />
              </Link>
            </li>
          ))}
          {apartmentHere ? (
            <li>
              <Link href="/apartment/orders" className="flex items-center justify-between rounded-card border border-border bg-card p-4 font-bold shadow-sm hover:shadow-md">
                Apartment Orders<ChevronRight className="size-5 text-muted-foreground" />
              </Link>
            </li>
          ) : null}
        </ul>
      </Page>
      <BottomNav />
    </>
  );
}
