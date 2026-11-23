import { formatShort } from '../../utils/date';
import { ENDPOINTS } from '../../http/endpoints';
import { http } from '../../http/httpClient';

import type { BulkCartLine } from './types';

/** Tomorrow (local, noon-pinned) + the largest per-line lead time in the cart, as YYYY-MM-DD. */
export function minDeliveryDate(lines: BulkCartLine[]): string {
  const extraDays = lines.reduce((max, l) => Math.max(max, l.deliveryDateCount), 0);
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + 1 + extraDays);
  return date.toISOString().slice(0, 10);
}

export interface DeliverySlot {
  start: string; // "HH:mm"
  end: string;
}

/** Hourly delivery slots, default window mirrors MealaweUserApp's DD_B2B_START_TIME/STOP_TIME (8am–9pm). */
export function slotsFor(startHour = 8, endHour = 21): DeliverySlot[] {
  const slots: DeliverySlot[] = [];
  for (let h = startHour; h < endHour; h++) {
    slots.push({ start: `${String(h).padStart(2, '0')}:00`, end: `${String(h + 1).padStart(2, '0')}:00` });
  }
  return slots;
}

/** Parses "08:00"/"21:00"-style config strings into an hour number; falls back on any parse failure. */
function hourFrom(value: string | undefined, fallback: number): number {
  const hour = Number.parseInt((value ?? '').split(':')[0] ?? '', 10);
  return Number.isFinite(hour) ? hour : fallback;
}

/**
 * Fetch the bulk delivery slot window (`DD_B2B_START_TIME`/`DD_B2B_STOP_TIME`)
 * from the backend config variables, falling back to `slotsFor()`'s own
 * 8am–9pm defaults on any failure — mirrors `supportApi.getSupportContacts()`'s
 * `getVariables` call shape.
 */
export async function loadBulkSlotWindow(): Promise<DeliverySlot[]> {
  try {
    const res = await http.post<Array<{ configName: string; configData: string }>>(
      ENDPOINTS.support.variables,
      { variableNames: ['DD_B2B_START_TIME', 'DD_B2B_STOP_TIME'] },
    );
    const map: Record<string, string> = {};
    for (const row of Array.isArray(res) ? res : []) {
      if (row?.configName) map[row.configName] = row.configData;
    }
    return slotsFor(hourFrom(map.DD_B2B_START_TIME, 8), hourFrom(map.DD_B2B_STOP_TIME, 21));
  } catch {
    return slotsFor();
  }
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

