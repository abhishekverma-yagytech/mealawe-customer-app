import { useEffect } from 'react';
import { Platform } from 'react-native';

import { cancelRiderTrackingNotification, displayRiderTrackingNotification } from './riderTrackingNotification';

/** Extra order context for the notification — all optional so screens that
 * don't have it yet (e.g. no plan title, no lifecycle status) still get a
 * working ETA notification, just without the subText/progress bar. */
export interface OngoingTrackingNotificationDetails {
  /** Order/plan name, shown as the notification's subText. */
  title?: string | null;
  /** Human status line (e.g. "Being prepared", "On the way") — the body. */
  statusText?: string | null;
  /** 0–100 order-lifecycle progress for the notification's progress bar. */
  progress?: number | null;
}

/**
 * Android-only ongoing/ambient notification mirroring the live tracking
 * screen's own status + ETA — Phase 2 of `LIVE-ORDER-TRACKING-PLAN.md`.
 * Driven by this app's own client-side polling (`useTrackingStore`) while
 * this screen is mounted, so it has the most precise ETA text available.
 * A separate, server-pushed path (`RIDER_LOCATION_UPDATE` FCM data messages,
 * handled in `services/push/notifications.ts`) keeps the same notification
 * (shared by `notificationIdFor`) updating even when this screen isn't
 * mounted — backgrounded or killed app.
 */
export function useOngoingTrackingNotification(
  orderId: string | undefined,
  etaText: string | null,
  status: 'idle' | 'loading' | 'active' | 'error',
  riderPhone?: string | null,
  details?: OngoingTrackingNotificationDetails,
): void {
  const { title, statusText, progress } = details ?? {};

  useEffect(() => {
    if (Platform.OS !== 'android' || !orderId) return;
    if (status !== 'loading' && status !== 'active') return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await displayRiderTrackingNotification(orderId, {
        subText: title,
        status: statusText,
        etaText,
        progress,
        riderPhone,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, etaText, status, riderPhone, title, statusText, progress]);

  // Separate effect, unconditional cleanup: clear the ongoing notification
  // the moment this screen unmounts (tracking stopped, or order finished),
  // regardless of which render's `status` last ran the effect above.
  useEffect(() => {
    if (Platform.OS !== 'android' || !orderId) return undefined;
    return () => {
      cancelRiderTrackingNotification(orderId);
    };
  }, [orderId]);
}
