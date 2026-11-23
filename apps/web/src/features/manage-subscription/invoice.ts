import { formatShort, statusLabel, type DailyOrderEntry, type PackageBilling } from '@mealawe/core';

/**
 * Web port of mobile's PDF invoice (apps/mobile/src/features/orders/invoice.ts, read-only reference). Mobile renders the HTML to a PDF
 * and opens the share sheet; on web the same document is printed through the browser ("Save as PDF").
 */
export interface InvoiceData {
  packageName: string;
  planSubtitle?: string;
  orderNo?: string | number;
  /** Every child (per-day) order this package has generated. */
  items: readonly DailyOrderEntry[];
  billing?: PackageBilling | null;
}

const inr = (n: number): string => `₹${n.toLocaleString('en-IN')}`;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Sum of every child order's own amount — the same figure the child-orders list sums to, so the invoice never disagrees with it. */
export function invoiceTotal(items: readonly DailyOrderEntry[]): number {
  return items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
}

function billingSection(billing: PackageBilling | null | undefined): string {
  if (!billing) return '';
  const rows: string[] = [];
  const row = (label: string, amount: number, original?: number): void => {
    const free = original !== undefined && amount === 0 && original > 0;
    const value = free ? 'FREE' : `${amount < 0 ? '- ' : ''}${inr(Math.abs(amount))}`;
    const struck = original !== undefined && original > amount ? `<span class="strike">${inr(original)}</span> ` : '';
    rows.push(`<tr><td>${escapeHtml(label)}</td><td class="amount">${struck}${escapeHtml(value)}</td></tr>`);
  };
  row('Plan', billing.itemAmount);
  if (billing.discount > 0) row('Plan discount', -billing.discount);
  if (billing.couponDiscount > 0) row(`Coupon${billing.couponCode ? ` (${billing.couponCode})` : ''}`, -billing.couponDiscount);
  row('Delivery', billing.delivery, billing.deliveryOriginal);
  row('Packaging', billing.packaging, billing.packagingOriginal);
  row('Platform fee', billing.platform, billing.platformOriginal);
  row('GST & charges', billing.taxes);
  if (billing.walletUsed > 0) row('Wallet credit', -billing.walletUsed);
  if (billing.cashbackUsed > 0) row('Cashback credit', -billing.cashbackUsed);
  return `<table class="billing"><tbody>${rows.join('')}</tbody><tfoot><tr><td>Total paid</td><td class="amount">${inr(billing.total)}</td></tr></tfoot></table>`;
}

/** Print-ready, self-contained invoice document (no external assets). */
export function buildInvoiceHtml(data: InvoiceData): string {
  const rows = data.items
    .map((item) => {
      const date = item.orderDate ? formatShort(item.orderDate.slice(0, 10)) : '—';
      return `<tr><td>Order #${escapeHtml(String(item.orderNo ?? '—'))}</td><td>${escapeHtml(date)}</td><td>${escapeHtml(item.mealType ?? '—')}</td><td>${escapeHtml(statusLabel(item.orderstatus))}</td><td class="amount">${inr(item.amount ?? 0)}</td></tr>`;
    })
    .join('');
  const sub = `${escapeHtml(data.planSubtitle ?? '')}${data.orderNo ? ` · Order #${escapeHtml(String(data.orderNo))}` : ''}`;
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(data.packageName)} invoice</title><style>
body{font-family:Helvetica,Arial,sans-serif;color:#042a33;padding:32px}h1{font-size:22px;margin:0 0 4px}.sub{color:#6d6d6d;font-size:13px;margin:0 0 24px}
table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;padding:8px 6px;border-bottom:2px solid #042a33;color:#6d6d6d;font-size:11px;text-transform:uppercase}
td{padding:8px 6px;border-bottom:1px solid #e5e5e5}.amount{text-align:right}tfoot td{border-bottom:none;border-top:2px solid #042a33;font-weight:bold;padding-top:12px}
h2{font-size:14px;margin:28px 0 8px}.strike{color:#6d6d6d;text-decoration:line-through;font-size:11px}
</style></head><body><h1>${escapeHtml(data.packageName)}</h1><p class="sub">${sub}</p>
<h2>Charges</h2>${billingSection(data.billing)}
<h2>Deliveries (${data.items.length})</h2>
<table><thead><tr><th>Order</th><th>Date</th><th>Meal</th><th>Status</th><th class="amount">Amount</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="4">Total</td><td class="amount">${inr(invoiceTotal(data.items))}</td></tr></tfoot></table></body></html>`;
}

/** Opens the browser print dialog for the invoice (choose "Save as PDF"). Uses a hidden iframe so no popup blocker can interfere. */
export function printInvoice(data: InvoiceData): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      frame.srcdoc = buildInvoiceHtml(data);
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          resolve({ ok: true });
        } catch (e) {
          resolve({ ok: false, error: e instanceof Error ? e.message : 'Could not open the print dialog.' });
        } finally {
          setTimeout(() => frame.remove(), 60_000);
        }
      };
      document.body.appendChild(frame);
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : 'Could not generate the invoice.' });
    }
  });
}
