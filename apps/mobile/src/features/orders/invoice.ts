import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { formatShort } from '@/features/subscription';
import { statusLabel } from './orderStatus';
import type { DailyOrderEntry } from './dailyOrder';
import type { PackageBilling } from './packageBilling';

export interface InvoiceData {
  /** The package/category name, e.g. "Special Thali". */
  packageName: string;
  /** e.g. "30-day plan · Lunch". */
  planSubtitle?: string;
  orderNo?: string | number;
  /** Every child (per-day) order this package has generated. */
  items: readonly DailyOrderEntry[];
  /** Real itemized charges off the package doc — same breakdown the in-app
   * Bill popup shows (see `extractPackageBilling`). Omitted only if the
   * package doc had none of its billing fields set. */
  billing?: PackageBilling | null;
}

/** Total across every child order's own `amount` — the same figure the
 * child-orders list itself sums to, so the invoice can never show a total
 * that disagrees with what the list displays. */
function invoiceTotal(items: readonly DailyOrderEntry[]): number {
  return items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Charges summary block mirroring the in-app Bill popup's `BillRow` rows —
 * only rendered when the package doc actually carried billing fields. */
function buildBillingSection(billing: PackageBilling | null | undefined): string {
  if (!billing) return '';
  const rows: string[] = [];
  const row = (label: string, amount: number, original?: number): void => {
    const free = original !== undefined && amount === 0 && original > 0;
    const value = free ? 'FREE' : `${amount < 0 ? '- ' : ''}₹${Math.abs(amount).toLocaleString('en-IN')}`;
    const struck =
      original !== undefined && original > amount
        ? `<span class="strike">₹${original.toLocaleString('en-IN')}</span> `
        : '';
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

  return `
    <table class="billing">
      <tbody>${rows.join('')}</tbody>
      <tfoot>
        <tr><td>Total paid</td><td class="amount">₹${billing.total.toLocaleString('en-IN')}</td></tr>
      </tfoot>
    </table>`;
}

/** A clean, print-ready invoice document — plain HTML/CSS (no external
 * assets), since `expo-print` renders this through a WebView on both
 * platforms. Line items mirror the Manage Subscription child-orders list
 * exactly (order number, date, meal type, status, amount) rather than
 * inventing a different breakdown the user hasn't seen anywhere else. */
function buildInvoiceHtml(data: InvoiceData): string {
  const total = invoiceTotal(data.items);
  const rows = data.items
    .map((item) => {
      const dateLabel = item.orderDate ? formatShort(item.orderDate.slice(0, 10)) : '—';
      return `
        <tr>
          <td>Order #${escapeHtml(String(item.orderNo ?? '—'))}</td>
          <td>${escapeHtml(dateLabel)}</td>
          <td>${escapeHtml(item.mealType ?? '—')}</td>
          <td>${escapeHtml(statusLabel(item.orderstatus))}</td>
          <td class="amount">₹${(item.amount ?? 0).toLocaleString('en-IN')}</td>
        </tr>`;
    })
    .join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Helvetica, Arial, sans-serif; color: #042a33; padding: 32px; }
          h1 { font-size: 22px; margin: 0 0 4px 0; }
          .sub { color: #6d6d6d; font-size: 13px; margin: 0 0 24px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { text-align: left; padding: 8px 6px; border-bottom: 2px solid #042a33; color: #6d6d6d; font-size: 11px; text-transform: uppercase; }
          td { padding: 8px 6px; border-bottom: 1px solid #e5e5e5; }
          .amount { text-align: right; }
          tfoot td { border-bottom: none; border-top: 2px solid #042a33; font-weight: bold; padding-top: 12px; }
          h2 { font-size: 14px; margin: 28px 0 8px 0; }
          table.billing td { border-bottom: 1px solid #e5e5e5; }
          table.billing .strike { color: #6d6d6d; text-decoration: line-through; font-size: 11px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(data.packageName)}</h1>
        <p class="sub">${escapeHtml(data.planSubtitle ?? '')}${data.orderNo ? ` · Order #${escapeHtml(String(data.orderNo))}` : ''}</p>

        <h2>Charges</h2>
        ${buildBillingSection(data.billing)}

        <h2>Deliveries (${data.items.length})</h2>
        <table>
          <thead>
            <tr><th>Order</th><th>Date</th><th>Meal</th><th>Status</th><th class="amount">Amount</th></tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr><td colspan="4">Total</td><td class="amount">₹${total.toLocaleString('en-IN')}</td></tr>
          </tfoot>
        </table>
      </body>
    </html>`;
}

export interface DownloadInvoiceResult {
  ok: boolean;
  error?: string;
}

/**
 * Generate a PDF invoice from the package's child orders and hand it to the
 * native share sheet (save to Files, send via email/WhatsApp, etc.) — RN has
 * no direct "save to Downloads" without going through a share sheet on
 * either platform, so this is the standard Expo pattern for "download a
 * generated document" rather than a gap in this implementation.
 */
export async function downloadInvoice(data: InvoiceData): Promise<DownloadInvoiceResult> {
  try {
    const html = buildInvoiceHtml(data);
    const { uri } = await Print.printToFileAsync({ html, base64: false });
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      return { ok: false, error: 'Sharing is not available on this device.' };
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `${data.packageName} invoice`,
      UTI: 'com.adobe.pdf',
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not generate the invoice.' };
  }
}
