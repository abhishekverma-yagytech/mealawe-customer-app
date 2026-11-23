import { formatShort } from '../../utils/date';
import { ENDPOINTS } from '../../http/endpoints';
import { http } from '../../http/httpClient';

export interface OrderingWindow {
  start: string; // "HH:mm"
  end: string;
}

export interface OrderingWindows {
  allDay: OrderingWindow;
  advance: OrderingWindow;
}

const DEFAULT_WINDOWS: OrderingWindows = {
  allDay: { start: '08:00', end: '22:00' },
  advance: { start: '08:00', end: '22:00' },
};

/** Parses "08:00"-style config strings into an hour number; falls back on any parse failure. */
function hourFrom(value: string | undefined, fallback: number): number {
  const hour = Number.parseInt((value ?? '').split(':')[0] ?? '', 10);
  return Number.isFinite(hour) ? hour : fallback;
}

/**
 * Fetch the Daily (`ALLDAY_ORDER_*`) and Advance (`ADV_ORDER_*`) ordering
 * windows from the backend config variables, falling back to 8am–10pm for
 * both on any failure — mirrors `bulk/schedule.ts#loadBulkSlotWindow`.
 */
export async function loadOrderingWindows(): Promise<OrderingWindows> {
  try {
    const res = await http.post<Array<{ configName: string; configData: string }>>(
      ENDPOINTS.support.variables,
      {
        variableNames: [
          'ALLDAY_ORDER_START_TIME',
          'ALLDAY_ORDER_END_TIME',
          'ADV_ORDER_START_TIME',
          'ADV_ORDER_END_TIME',
        ],
      },
    );
    const map: Record<string, string> = {};
    for (const row of Array.isArray(res) ? res : []) {
      if (row?.configName) map[row.configName] = row.configData;
    }
    return {
      allDay: {
        start: map.ALLDAY_ORDER_START_TIME ?? DEFAULT_WINDOWS.allDay.start,
        end: map.ALLDAY_ORDER_END_TIME ?? DEFAULT_WINDOWS.allDay.end,
      },
      advance: {
        start: map.ADV_ORDER_START_TIME ?? DEFAULT_WINDOWS.advance.start,
        end: map.ADV_ORDER_END_TIME ?? DEFAULT_WINDOWS.advance.end,
      },
    };
  } catch {
    return DEFAULT_WINDOWS;
  }
}

/** True when `now` falls inside the given mode's ordering window. */
export function isOrderingWindowOpen(
  mode: 'allDay' | 'advance',
  windows: OrderingWindows,
  now = new Date(),
): boolean {
  const w = windows[mode];
  const startHour = hourFrom(w.start, 8);
  const endHour = hourFrom(w.end, 22);
  const hour = now.getHours();
  return hour >= startHour && hour < endHour;
}

/** True when within 2 hours before the Daily window opens — "coming next" state.
 * Exact port of the legacy's `1000 * 60 * 60 * 2` threshold. */
export function isAllDayUpcoming(windows: OrderingWindows, now = new Date()): boolean {
  const startHour = hourFrom(windows.allDay.start, 8);
  const startToday = new Date(now);
  startToday.setHours(startHour, 0, 0, 0);
  const diffMs = startToday.getTime() - now.getTime();
  return diffMs > 0 && diffMs <= 1000 * 60 * 60 * 2;
}

export interface TimeSlot {
  start: string; // "HH:mm"
  end: string;
}

/**
 * Today's remaining hourly slots inside the Daily window, filtered so a slot
 * is only offered if it's more than `preparationTimeMins` away — exact port
 * of `generateTimeSlotsArray('allDay', maxPreparationTime)`, minus the
 * legacy's delivery-partner ETA term (no live-quote infra in this app; see
 * design spec's "Explicitly out of scope").
 */
export function allDaySlotsFor(windows: OrderingWindows, preparationTimeMins = 0, now = new Date()): TimeSlot[] {
  const startHour = hourFrom(windows.allDay.start, 8);
  const endHour = hourFrom(windows.allDay.end, 22);
  const slots: TimeSlot[] = [];
  for (let h = startHour; h < endHour; h++) {
    if (h <= now.getHours()) continue;
    const slotStart = new Date(now);
    slotStart.setHours(h, 0, 0, 0);
    const diffMins = (slotStart.getTime() - now.getTime()) / (1000 * 60);
    if (diffMins > preparationTimeMins) {
      slots.push({ start: `${String(h).padStart(2, '0')}:00`, end: `${String(h + 1).padStart(2, '0')}:00` });
    }
  }
  return slots;
}

/** Tomorrow + day-after-tomorrow (noon-pinned), as YYYY-MM-DD — exact port of
 * `tabCart.page.ts`'s fixed `allowedMinDate`/`allowedMaxDate`. */
export function advanceDates(now = new Date()): string[] {
  const dates: string[] = [];
  for (let i = 1; i <= 2; i++) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Hourly slots across the Advance window — no "future only" filter needed
 * since the date is always at least tomorrow. */
export function advanceSlotsFor(windows: OrderingWindows): TimeSlot[] {
  const startHour = hourFrom(windows.advance.start, 8);
  const endHour = hourFrom(windows.advance.end, 22);
  const slots: TimeSlot[] = [];
  for (let h = startHour; h < endHour; h++) {
    slots.push({ start: `${String(h).padStart(2, '0')}:00`, end: `${String(h + 1).padStart(2, '0')}:00` });
  }
  return slots;
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

