'use client';

import { CalendarDays, ChevronRight, Download, Receipt } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { loadFoodOrdersByPackage, loadPackageOrderDetail } from '@mealawe/api';
import { extractPackageBilling, formatINR, formatShort, type DailyOrderEntry, type OrderSummary } from '@mealawe/core';

import { Page, PageHeader } from '@/components/layout/PageHeader';
import { RescheduleDialog, type RescheduleTarget } from '@/components/orders/RescheduleDialog';
import { StatusPill } from '@/components/orders/OrderRow';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { printInvoice } from '@/features/manage-subscription/invoice';
import { canRescheduleStatus } from '@/features/manage-subscription/rules';
import { cn } from '@/lib/cn';
import { useRequireLogin } from '@/lib/useRequireLogin';

function BillRowLine({ label, amount, original, credit }: { label: string; amount: number; original?: number; credit?: boolean }) {
  const free = original !== undefined && amount === 0 && original > 0;
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt>{label}</dt>
      <dd className={cn(credit && 'text-primary')}>
        {original !== undefined && original > amount ? <s className="mr-1 text-muted-foreground">{formatINR(original)}</s> : null}
        {free ? 'FREE' : `${amount < 0 ? '− ' : ''}${formatINR(Math.abs(amount))}`}
      </dd>
    </div>
  );
}

function Content() {
  const authed = useRequireLogin();
  const orderId = useSearchParams().get('orderId');
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [children, setChildren] = useState<DailyOrderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [billOpen, setBillOpen] = useState(false);
  const [target, setTarget] = useState<RescheduleTarget | null>(null);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    if (!orderId) return setLoading(false);
    let active = true;
    setLoading(true);
    Promise.all([loadPackageOrderDetail(orderId), loadFoodOrdersByPackage(orderId)])
      .then(([detail, entries]) => {
        if (!active) return;
        setOrder(detail);
        setChildren(entries);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [authed, orderId, reload]);

  const total = children.length;
  const delivered = useMemo(() => children.filter((c) => c.orderstatus === 'delivered').length, [children]);
  const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const complete = total > 0 && delivered === total;
  const billing = useMemo(() => extractPackageBilling(order?.raw), [order]);
  const onRescheduled = useCallback(() => setReload((n) => n + 1), []);

  const downloadInvoice = async () => {
    if (invoiceBusy || children.length === 0) return;
    setInvoiceBusy(true);
    setInvoiceError(null);
    const res = await printInvoice({ packageName: order?.title ?? 'Subscription', planSubtitle: order?.subtitle, orderNo: order?.orderNo, items: children, billing });
    if (!res.ok) setInvoiceError(res.error ?? 'Could not generate the invoice.');
    setInvoiceBusy(false);
  };

  if (!authed) return null;
  if (!orderId) {
    return (
      <>
        <PageHeader title="My subscription" />
        <Page narrow><p className="py-16 text-center text-muted-foreground">No subscription selected. <Link href="/orders" className="font-bold text-primary">Go to your orders</Link></p></Page>
      </>
    );
  }

  return (
    <>
      <PageHeader title="My subscription" />
      <Page narrow>
        <div className="space-y-4">
          {loading ? (
            <Skeleton className="h-36" />
          ) : (
            <section aria-label="Plan summary" className="rounded-3xl bg-[#042a33] p-5 text-white">
              <p className={cn('flex items-center gap-2 text-xs font-bold tracking-wide', complete ? 'text-secondary' : 'text-[#eae2b7]')}>
                <span className={cn('size-2 rounded-full', complete ? 'bg-secondary' : 'bg-primary')} />{complete ? 'COMPLETED' : 'ACTIVE'}
              </p>
              <h2 className="mt-2 text-2xl font-black">{order?.title ?? 'Your subscription'}</h2>
              {order?.subtitle ? <p className="text-sm text-white/80">{order.subtitle}</p> : null}
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Meals delivered">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-white/80"><span>{delivered} of {total} meals delivered</span><span>{Math.max(0, total - delivered)} meals left</span></div>
            </section>
          )}

          <button type="button" disabled={loading} onClick={() => setBillOpen(true)} className="flex w-full items-center gap-3 rounded-card border border-border bg-card p-4 text-left shadow-sm transition hover:shadow-md disabled:opacity-50">
            <span className="flex size-10 items-center justify-center rounded-xl bg-plan/15 text-plan"><Receipt className="size-5" /></span>
            <span className="flex-1"><span className="block font-bold">Bill &amp; invoice</span><span className="block text-xs text-muted-foreground">Billing details, invoice download, reschedule</span></span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </button>

          <Card>
            <div className="flex items-baseline justify-between"><h2 className="text-lg font-black">Deliveries</h2><span className="text-xs text-muted-foreground">{total} total</span></div>
            <ul className="mt-3 space-y-2">
              {loading ? (
                [0, 1, 2].map((i) => <li key={i}><Skeleton className="h-16" /></li>)
              ) : children.length === 0 ? (
                <li className="text-sm text-muted-foreground">No deliveries found for this subscription yet.</li>
              ) : (
                children.map((c) => {
                  const done = c.orderstatus === 'delivered';
                  return (
                    <li key={c.foodOrderId} className={cn('rounded-card border border-border p-3', done ? 'bg-muted' : 'bg-card')}>
                      <Link href={`/order-detail?id=${encodeURIComponent(c.foodOrderId)}`} className="flex items-center gap-3">
                        <span className="w-14 text-center text-sm font-bold">{c.orderDate ? formatShort(c.orderDate.slice(0, 10)) : '—'}</span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block', done && 'text-muted-foreground line-through')}>Order #{c.orderNo ?? '—'}</span>
                          {c.mealType ? <span className="block text-xs text-muted-foreground">{c.mealType}</span> : null}
                        </span>
                        <StatusPill status={c.orderstatus} />
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                      {canRescheduleStatus(c.orderstatus) ? (
                        <button
                          type="button"
                          onClick={() => setTarget({ foodOrderId: c.foodOrderId, packageOrderId: orderId, orderNo: c.orderNo, orderDate: c.orderDate, mealType: c.mealType })}
                          aria-label={`Reschedule order #${c.orderNo ?? ''}`}
                          className="mt-2 ml-[4.25rem] inline-flex items-center gap-1 text-xs font-bold text-primary">
                          <CalendarDays className="size-3.5" /> Reschedule
                        </button>
                      ) : null}
                    </li>
                  );
                })
              )}
            </ul>
          </Card>
        </div>
      </Page>

      <Dialog open={billOpen} onOpenChange={setBillOpen} title="Bill details">
        {billing ? (
          <dl className="space-y-2">
            <BillRowLine label={order?.title ?? 'Plan'} amount={billing.itemAmount} />
            {billing.discount > 0 ? <BillRowLine label="Plan discount" amount={-billing.discount} credit /> : null}
            {billing.couponDiscount > 0 ? <BillRowLine label={billing.couponCode ? `Coupon (${billing.couponCode})` : 'Coupon discount'} amount={-billing.couponDiscount} credit /> : null}
            <BillRowLine label="Delivery" amount={billing.delivery} original={billing.deliveryOriginal} />
            <BillRowLine label="Packaging" amount={billing.packaging} original={billing.packagingOriginal} />
            <BillRowLine label="Platform fee" amount={billing.platform} original={billing.platformOriginal} />
            <BillRowLine label="GST & charges" amount={billing.taxes} />
            {billing.walletUsed > 0 ? <BillRowLine label="Wallet credit" amount={-billing.walletUsed} credit /> : null}
            {billing.cashbackUsed > 0 ? <BillRowLine label="Cashback credit" amount={-billing.cashbackUsed} credit /> : null}
            <div className="flex justify-between border-t border-border pt-3 text-lg font-black"><dt>Total paid</dt><dd>{formatINR(billing.total)}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Billing details aren&apos;t available for this order yet.</p>
        )}
        {invoiceError ? <p role="alert" className="mt-3 text-sm text-destructive">{invoiceError}</p> : null}
        <Button block className="mt-4" disabled={invoiceBusy || children.length === 0} onClick={downloadInvoice}>
          <Download className="size-4" /> {invoiceBusy ? 'Preparing…' : 'Download invoice'}
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">Opens your browser&apos;s print dialog — choose &ldquo;Save as PDF&rdquo;.</p>
      </Dialog>

      <RescheduleDialog target={target} siblingOrders={children} onClose={() => setTarget(null)} onRescheduled={onRescheduled} />
    </>
  );
}

export default function ManageSubscriptionPage() {
  return <Suspense><Content /></Suspense>;
}
