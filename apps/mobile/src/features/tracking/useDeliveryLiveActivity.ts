import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { EventSubscription } from 'expo-modules-core';
import type { LiveActivity } from 'expo-widgets';

import { authApi } from '@/features/auth';
import { recordCrashlyticsError } from '@/services/crashlytics';
import { useAuthStore } from '@/store';

import { mealaweDeliveryActivity, type DeliveryActivityProps } from './liveActivity';

/**
 * iOS-only counterpart to `useOngoingTrackingNotification` — starts a Live
 * Activity when tracking begins, updates its content as the ETA/status
 * change, and ends it when tracking stops. Never runs on Android (Live
 * Activities are an iOS-only concept; Android's equivalent is the ongoing
 * notification in `riderTrackingNotification.ts`).
 *
 * Push-based updates (so the activity keeps ticking while the app is
 * backgrounded/killed) need a backend endpoint to receive the push-to-start
 * and per-activity update tokens — see `docs/LIVE-ORDER-TRACKING-PLAN.md`
 * Phase 3's "cross-cutting backend work" table. Not wired up here; this hook
 * only covers the foreground/local-update path.
 */
export function useDeliveryLiveActivity(
  orderId: string | undefined,
  restaurantName: string,
  statusLabel: string,
  etaText: string | null,
  isTrackable: boolean,
): void {
  const activityRef = useRef<LiveActivity<DeliveryActivityProps> | null>(null);
  const pushTokenSubRef = useRef<EventSubscription | null>(null);
  const shouldRun = Platform.OS === 'ios' && isTrackable && !!orderId;

  useEffect(() => {
    if (!shouldRun) {
      return;
    }

    const props: DeliveryActivityProps = {
      restaurantName,
      statusLabel,
      etaText: etaText ?? 'Calculating…',
    };

    let activity: LiveActivity<DeliveryActivityProps>;
    try {
      // Reuse whatever's already running for this activity type instead of
      // starting a duplicate Dynamic Island/Lock Screen entry — e.g. this
      // component remounted (background/relaunch) while the OS-managed
      // activity from a prior mount is still alive and still receiving
      // server pushes.
      const [existing] = mealaweDeliveryActivity.getInstances();
      if (existing) {
        activity = existing;
        void activity.update(props);
      } else {
        activity = mealaweDeliveryActivity.start(props);
      }
    } catch (error) {
      // iOS lets a user disable Live Activities per-app independent of
      // notification permission — starting one can reject/throw in that
      // case. Log and skip rather than leaving an unhandled rejection.
      recordCrashlyticsError(error, 'useDeliveryLiveActivity: start failed');
      return;
    }
    activityRef.current = activity;

    // Forwards this specific activity's push (update) token to the backend —
    // instance-scoped API, unlike the device-level push-to-start token
    // registered once at app boot (`liveActivityPushTokens.ts`). Lets the
    // backend send APNs content updates while the app is backgrounded/killed
    // (see `docs/LIVE-ACTIVITY-PUSH-UPDATES-PLAN.md` §3.6).
    pushTokenSubRef.current = activity.addPushTokenListener(({ activityId, pushToken }) => {
      const profileId = useAuthStore.getState().profile?._id;
      if (!profileId) return;
      void authApi.registerLiveActivityUpdateToken(profileId, activityId, pushToken);
    });

    return () => {
      pushTokenSubRef.current?.remove();
      pushTokenSubRef.current = null;
      void activityRef.current?.end('default');
      activityRef.current = null;
    };
    // Only re-run when tracking actually starts/stops for this order — content
    // updates while active are handled by the effect below, not by
    // restarting the activity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRun, orderId]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !activityRef.current) {
      return;
    }
    void activityRef.current.update({
      restaurantName,
      statusLabel,
      etaText: etaText ?? 'Calculating…',
    });
  }, [restaurantName, statusLabel, etaText]);
}
