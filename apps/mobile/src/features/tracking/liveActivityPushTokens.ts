import { Platform } from 'react-native';
import { addPushToStartTokenListener } from 'expo-widgets';

import { authApi } from '@/features/auth';
import { useAuthStore } from '@/store';

/**
 * iOS-only: forwards the device-level ActivityKit push-to-start token to the
 * backend, so `MealaweDeliveryActivity` can be started remotely via APNs
 * even while this app is killed — see
 * `docs/LIVE-ACTIVITY-PUSH-UPDATES-PLAN.md` §3.6. The per-activity update
 * token is a separate, instance-scoped API (`LiveActivity#addPushTokenListener`)
 * and is registered from `useDeliveryLiveActivity.ts` instead, once an
 * activity actually exists.
 *
 * Call once at app boot (see `_layout.tsx`) — same lifecycle as `initPush`,
 * not a React hook, since this listener needs to stay live for as long as
 * the app process is. Reads the current profile from the store at
 * event-fire time rather than needing re-registration on login/logout,
 * matching how `services/push`'s own listeners read fresh store state
 * inside their callbacks.
 */
export function initLiveActivityPushTokenForwarding(): void {
  if (Platform.OS !== 'ios') return;

  addPushToStartTokenListener(({ activityPushToStartToken }) => {
    const profileId = useAuthStore.getState().profile?._id;
    if (!profileId) return;
    void authApi.registerLiveActivityPushToStartToken(profileId, activityPushToStartToken);
  });
}
