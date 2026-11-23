import { formatShort } from '../../utils/date';
/** Delivery-date scheduling — ports the Configure page's run generation. */

const DAY_MS = 24 * 60 * 60 * 1000;

/** "HH:MM" 24h → a friendly 12h clock label ("2 PM", "2:30 PM"). */
function formatClock12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour12}:${String(m).padStart(2, '0')} ${period}` : `${hour12} ${period}`;
}

/** A `SubscriptionCategory.mealTimes` window as a "12–2 PM" style label —
 * drops the shared AM/PM suffix off the start when both ends agree, matching
 * the compact style the meal-time picker's static copy used before this was
 * admin-configurable. */
export function formatMealTimeWindow(startTime: string, endTime: string): string {
  const start = formatClock12h(startTime);
  const end = formatClock12h(endTime);
  const startPeriod = start.slice(-2);
  const endPeriod = end.slice(-2);
  return startPeriod === endPeriod ? `${start.slice(0, -3)}–${end}` : `${start}–${end}`;
}

/** A Date → 'YYYY-MM-DD' (UTC, to avoid timezone drift). */
export function toISODate(d: Date): string {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

/** getUTCDay for an ISO date (0 = Sun … 6 = Sat). */
function isoDay(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** Is a date deliverable given the weekend-inclusion rules? */
export function isEligible(iso: string, includeSat: boolean, includeSun: boolean): boolean {
  const day = isoDay(iso);
  if (day === 0) return includeSun;
  if (day === 6) return includeSat;
  return true;
}

export interface DateChip {
  iso: string;
  /** Day-of-month, e.g. 25. */
  dom: number;
  /** Short weekday label, e.g. "SUN" (or "TMRW" for tomorrow). */
  label: string;
  month: string;
  enabled: boolean;
}

const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The next `count` calendar days starting tomorrow, each flagged whether it's an
 * eligible start under the weekend rules (weekend chips render disabled when
 * that weekend isn't included). Mirrors the horizontal date strip in the design.
 */
export function nextStartDates(
  count: number,
  includeSat: boolean,
  includeSun: boolean,
  from: Date = new Date(),
): DateChip[] {
  const chips: DateChip[] = [];
  const base = new Date(from.getTime() + DAY_MS); // tomorrow
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getTime() + i * DAY_MS);
    const iso = toISODate(d);
    chips.push({
      iso,
      dom: d.getDate(),
      label: i === 0 ? 'TMRW' : WEEKDAY[d.getDay()],
      month: MONTH[d.getMonth()],
      enabled: isEligible(iso, includeSat, includeSun),
    });
  }
  return chips;
}

/**
 * `days` consecutive eligible delivery dates from `startIso` (weekends skipped
 * unless included). Ports the Configure page's generateRun.
 */
export function generateRun(
  startIso: string,
  days: number,
  includeSat: boolean,
  includeSun: boolean,
): string[] {
  const out: string[] = [];
  let cur = new Date(`${startIso}T00:00:00Z`);
  let guard = 0;
  const target = Math.max(1, days);
  while (out.length < target && guard < 400) {
    const iso = cur.toISOString().slice(0, 10);
    if (isEligible(iso, includeSat, includeSun)) {
      out.push(iso);
    }
    cur = new Date(cur.getTime() + DAY_MS);
    guard++;
  }
  return out;
}

