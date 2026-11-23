import { Platform } from 'react-native';
import notifee, { AndroidStyle, AndroidVisibility } from '@notifee/react-native';

import { TRACKING_CHANNEL_ID, ensureNotificationChannels } from '@/services/push/channels';

/** ~6 missed 15s server pushes — long enough to absorb a slow network blip,
 * short enough that a stale "on the way" notification doesn't linger after
 * delivery/cancellation (the server stops sending once the order drops out
 * of the rider's active list, so nothing explicitly tells us "done"). */
const STALE_AFTER_MS = 90_000;

const staleTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function notificationIdFor(orderId: string): string {
  return `order-tracking-${orderId}`;
}

/** Action ID for the notification's "Call rider" button — read back in the
 * foreground/background event handlers in `services/push/notifications.ts`. */
export const CALL_RIDER_ACTION_ID = 'call-rider';
/** Action ID for the notification's "Track Order" button — always present
 * (unlike "Call rider", which needs a known `riderPhone`). Read back in the
 * foreground/background event handlers in `services/push/notifications.ts`. */
export const TRACK_ORDER_ACTION_ID = 'track-order';

export interface RiderTrackingNotificationDetails {
  /** Order/plan name — shown as the expanded notification's summary line
   * (notifee has no `setSubText` equivalent for the collapsed header, so
   * this is the closest available slot to where Zomato/Swiggy place the
   * restaurant name) — so it never competes with the ETA for the bold
   * title line. */
  subText?: string | null;
  /** Human status line (e.g. "Being prepared", "On the way") — the body. */
  status?: string | null;
  etaText?: string | null;
  /** 0–100 order-lifecycle progress for the notification's progress bar
   * (Zomato's bag→home bar, minus the custom icon art). Omit for no bar. */
  progress?: number | null;
  riderPhone?: string | null;
}

/** Displays/updates the fixed-ID ongoing tracking notification for an order.
 * Shared by the poll-driven `useOngoingTrackingNotification` hook (screen
 * open, foreground) and the FCM data-message handlers (background/killed,
 * or foreground without the screen open) — same notification either way,
 * notifee just updates it in place.
 *
 * `riderPhone` is optional and best-effort: when present, adds a "Call
 * rider" action button and stashes the number in the notification's `data`
 * so the press handler can read it back without a second lookup. */
export async function displayRiderTrackingNotification(
  orderId: string,
  details: RiderTrackingNotificationDetails = {},
): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { subText, status, etaText, progress, riderPhone } = details;
  await ensureNotificationChannels();
  await notifee.displayNotification({
    id: notificationIdFor(orderId),
    title: etaText ? `Arriving in ${etaText}` : 'Tracking your order',
    body: status ?? 'Tracking your delivery…',
    data: { orderId, ...(riderPhone ? { riderPhone } : {}) },
    android: {
      channelId: TRACKING_CHANNEL_ID,
      ongoing: true,
      autoCancel: false,
      onlyAlertOnce: true,
      visibility: AndroidVisibility.PUBLIC,
      pressAction: { id: 'default' },
      style: subText
        ? { type: AndroidStyle.BIGTEXT, text: status ?? 'Tracking your delivery…', summary: subText }
        : undefined,
      progress: progress != null ? { max: 100, current: Math.max(0, Math.min(100, progress)) } : undefined,
      actions: [
        { title: 'Track Order', pressAction: { id: TRACK_ORDER_ACTION_ID } },
        ...(riderPhone ? [{ title: 'Call rider', pressAction: { id: CALL_RIDER_ACTION_ID } }] : []),
      ],
    },
  });
}

export function cancelRiderTrackingNotification(orderId: string): void {
  const timer = staleTimers.get(orderId);
  if (timer) {
    clearTimeout(timer);
    staleTimers.delete(orderId);
  }
  void notifee.cancelNotification(notificationIdFor(orderId));
}

/** Resets the staleness clock for an order — call on every fresh
 * RIDER_LOCATION_UPDATE push. If none arrives within `STALE_AFTER_MS`, the
 * notification cancels itself (the order was delivered/cancelled and the
 * rider stopped pinging for it). */
export function scheduleStalenessCancel(orderId: string, staleMs: number = STALE_AFTER_MS): void {
  const existing = staleTimers.get(orderId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    staleTimers.delete(orderId);
    void notifee.cancelNotification(notificationIdFor(orderId));
  }, staleMs);
  if (typeof timer === 'object' && 'unref' in timer) {
    (timer as unknown as { unref: () => void }).unref();
  }
  staleTimers.set(orderId, timer);
}
