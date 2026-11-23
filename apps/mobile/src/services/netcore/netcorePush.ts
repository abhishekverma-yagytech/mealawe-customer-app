import SmartechPushReact from 'smartech-push-react-native';
import type { RemoteMessage } from '@react-native-firebase/messaging';

import { isTrackingEnabled, safeSmartechCall } from './internal';

/** Forward this device's FCM token to Netcore — Netcore never registers its
 * own FCM listener (`useSmartechFCM: false` in app.json's plugin config); the
 * app's existing RNFB pipeline owns the token, this just also tells Netcore
 * about it, exactly like the Ionic app's `MyFirebaseMessagingService`
 * forwards to `SmartPush.setDevicePushToken`. */
export function bridgeDeviceToken(token: string): void {
  if (!isTrackingEnabled()) return;
  safeSmartechCall(() => SmartechPushReact.setDevicePushToken(token));
}

/** Forward a received remote message's data payload to Netcore so it can
 * record/attribute pushes that originated from a Netcore campaign. Does not
 * take over rendering — notifee continues to own that (see
 * `notifications.ts`'s `displayForegroundNotification`).
 *
 * Passes a SHALLOW COPY of `message.data`, never the live object: the SDK's
 * `handlePushNotification` runs the payload through `processNestedData`,
 * which mutates its argument in place — every string value that parses as
 * JSON (e.g. FCM's always-stringified `"532"` or a bare digit-string phone
 * number) gets replaced with the parsed value (a `number`, here). Since this
 * function runs BEFORE `notifications.ts`'s own handlers read that same
 * `message.data` object (`handleRiderLocationUpdate`'s `riderPhone`/
 * `distanceMeters` `typeof ... === 'string'` checks in particular), passing
 * the live reference would silently corrupt those fields for every rider-
 * tracking push. A shallow copy is sufficient — FCM `data` values are always
 * primitive strings, never nested objects. */
export function bridgeRemoteMessage(message: RemoteMessage): void {
  if (!isTrackingEnabled()) return;
  safeSmartechCall(() => SmartechPushReact.handlePushNotification({ ...(message.data ?? {}) }, null));
}
