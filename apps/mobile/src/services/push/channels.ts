import { Platform } from 'react-native';
import notifee, { AndroidColor, AndroidImportance, AndroidVisibility } from '@notifee/react-native';

/**
 * Matches the backend's hardcoded `android.notification.channel_id` (see
 * `http-api-handler.js`'s `httpFcmMessage`) — the channel must exist on the
 * device with this exact id before a background/killed-state FCM
 * "notification" message arrives, or Android falls back to a default
 * channel instead of the backend's intended sound/color/importance.
 */
export const PUSH_CHANNEL_ID = 'mealawepushnotification';

/** Separate, lower-importance channel for the live order-tracking status
 * notification — it updates every few seconds while `onTheWay`, so it must
 * not re-alert (sound/vibrate) on every refresh the way a real push does. */
export const TRACKING_CHANNEL_ID = 'order-tracking';

let ensured = false;

/** Creates both Android notification channels once. No-op on iOS (channels
 * are an Android-only concept) and safe to call repeatedly. */
export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android' || ensured) return;
  ensured = true;
  await notifee.createChannel({
    id: PUSH_CHANNEL_ID,
    name: 'mealawe',
    description: 'mealawe notification',
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    lights: true,
    lightColor: AndroidColor.GREEN,
    vibration: true,
  });
  await notifee.createChannel({
    id: TRACKING_CHANNEL_ID,
    name: 'Order tracking',
    description: 'Live status for an order that is on its way',
    importance: AndroidImportance.DEFAULT,
    visibility: AndroidVisibility.PUBLIC,
    vibration: false,
  });
}
