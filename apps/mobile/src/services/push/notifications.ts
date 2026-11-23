import { AppState, Linking, Platform, type AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission as requestIosPermission,
  setBackgroundMessageHandler,
  getInitialNotification,
  AuthorizationStatus as IosAuthorizationStatus,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import notifee, { AuthorizationStatus as AndroidAuthorizationStatus, EventType } from '@notifee/react-native';

import { authApi } from '@/features/auth';
import {
  CALL_RIDER_ACTION_ID,
  TRACK_ORDER_ACTION_ID,
  displayRiderTrackingNotification,
  scheduleStalenessCancel,
} from '@/features/tracking/riderTrackingNotification';
import { useTrackingTargetStore } from '@/features/tracking/trackingTargetStore';
import { bridgeDeviceToken, bridgeRemoteMessage } from '@/services/netcore';

import { ensureNotificationChannels, PUSH_CHANNEL_ID } from './channels';
import { useRefreshBumpStore } from './refreshBumpStore';

/** Data-only push sent from `foodorder.service.js#updateRunnerLocation` on
 * every rider location ping while an order is `onTheWay` — carries no
 * `notification` block, so it never shows a stock OS banner; we draw our
 * own ongoing tracking notification from it instead. */
const RIDER_LOCATION_UPDATE_TYPE = 'RIDER_LOCATION_UPDATE';

/** Mirrors `RiderShift.model.js`'s `stage` enum. */
const STAGE_LABEL: Record<string, string> = {
  pickup_stage: 'Picking up your order',
  delivery_stage: 'On the way',
};

/** `stage`/`distanceMeters` are both best-effort (see `sendRiderLocationFcmMessage`)
 * — arrive as strings (every FCM data value is stringified server-side). */
function riderStatusText(stage: unknown, distanceMeters: unknown): string | undefined {
  const stageLabel = typeof stage === 'string' ? STAGE_LABEL[stage] : undefined;
  const distance = typeof distanceMeters === 'string' ? Number(distanceMeters) : NaN;
  const distanceLabel = Number.isFinite(distance)
    ? distance >= 1000
      ? `${(distance / 1000).toFixed(1)} km away`
      : `${Math.round(distance)} m away`
    : undefined;
  return [stageLabel, distanceLabel].filter(Boolean).join(' · ') || undefined;
}

async function handleRiderLocationUpdate(message: RemoteMessage): Promise<boolean> {
  const orderId = message.data?.orderId;
  if (message.data?.type !== RIDER_LOCATION_UPDATE_TYPE || typeof orderId !== 'string') return false;
  // The backend resolves this via the order's `shiftId` → `RiderShift` →
  // `DeliveryPartner` (see `foodorder.service.js#updateRunnerLocation`) — only
  // present once the order has a shift (self-delivery, picked up), so still
  // optional here: a 3rd-party-vendor order or one not yet picked up has none.
  const riderPhone = message.data?.riderPhone;
  await displayRiderTrackingNotification(orderId, {
    riderPhone: typeof riderPhone === 'string' ? riderPhone : undefined,
    status: riderStatusText(message.data?.stage, message.data?.distanceMeters),
  });
  scheduleStalenessCancel(orderId);
  return true;
}

/** Reads the rider phone stashed in the tracking notification's `data` and
 * dials it — shared by the foreground and background action-press handlers.
 * Direct dial, not masked — see the matching comment on the in-screen Call
 * button in `app/order-tracking.tsx`; no masked-calling endpoint exists yet. */
function callRiderFromNotificationData(data: Record<string, unknown> | undefined): void {
  const phone = data?.riderPhone;
  if (typeof phone === 'string' && phone) {
    void Linking.openURL(`tel:${phone}`);
  }
}

/** Navigates to the live tracking screen for the order this notification is
 * for. Only pushes to `/order-tracking` when `useTrackingTargetStore`'s
 * already-set target actually matches this notification's `orderId` —
 * `setTarget` is never paired with a `clear()` anywhere in this codebase, so
 * a stale target from a previously-tracked (now finished) order can still be
 * sitting in the store when a *different* order's notification is tapped;
 * without this check, `order-tracking.tsx` would silently render the wrong
 * order (wrong ETA, wrong rider). On a mismatch — or when the app was cold
 *-started from killed and has no target at all yet — fall back to
 * `/my-orders`, the same best-effort destination `openRelevantScreen` already
 * uses for order-status pushes that can't be routed to a specific order. */
function trackOrderFromNotificationData(data: Record<string, unknown> | undefined): void {
  const orderId = data?.orderId;
  if (typeof orderId !== 'string' || !orderId) return;
  const target = useTrackingTargetStore.getState().target;
  if (target?.params.orderId === orderId) {
    router.push('/order-tracking');
  } else {
    router.push('/my-orders');
  }
}

const messagingInstance = getMessaging(getApp());

/**
 * Backend titles that mean "something about the customer's orders changed"
 * (`fcm-message-handler.js`'s `sendFcmMessage`/`sendDeliveryFcmMessage` both
 * hard-code `'Order Status'`). Matches the Ionic app's own
 * `notification.title === 'Order Status'` check for backward compatibility,
 * but the reliable signal is now the `data` payload `sendFcmMessage` attaches
 * (`{ type: 'ORDER_STATUS', status, orderNo }`) — see `isOrderStatusPush`.
 */
const ORDER_STATUS_TITLE = 'Order Status';
const ORDER_STATUS_DATA_TYPE = 'ORDER_STATUS';
/** Collapsed into one "out for delivery" step by the RN app's own
 * `statusStepIndex` — the transition we don't want to bang an OS
 * notification for, since the live bottom bar / order-detail map already
 * shows it happening in real time. */
const ON_THE_WAY_STATUS = 'onTheWay';

function isOrderStatusPush(message: RemoteMessage): boolean {
  return message.data?.type === ORDER_STATUS_DATA_TYPE || message.notification?.title === ORDER_STATUS_TITLE;
}

function getPushOrderStatus(message: RemoteMessage): string | undefined {
  const status = message.data?.status;
  return typeof status === 'string' ? status : undefined;
}

/** The backend already sends `onTheWay` pushes to customers data-only (no
 * `notification` block, see `sendFcmMessage`), so the OS won't auto-display
 * one in the background/killed state. This is the foreground-only guard —
 * `onMessage` builds its own banner from `message.notification`, so it needs
 * its own check to skip that for the same transition. */
function isSilentOrderStatusPush(message: RemoteMessage): boolean {
  return isOrderStatusPush(message) && getPushOrderStatus(message) === ON_THE_WAY_STATUS;
}

/** Where to land when the user taps a push — best-effort: order-status
 * pushes carry no orderId/orderType today, so this can only route to the
 * hub, not the specific order. */
function openRelevantScreen(message: RemoteMessage): void {
  if (isOrderStatusPush(message)) {
    router.push('/my-orders');
  }
}

async function displayForegroundNotification(message: RemoteMessage): Promise<void> {
  const title = message.notification?.title ?? 'Mealawe';
  const body = message.notification?.body ?? '';
  await notifee.displayNotification({
    title,
    body,
    android: {
      channelId: PUSH_CHANNEL_ID,
      pressAction: { id: 'default' },
    },
  });
}

/**
 * Request notification permission on both platforms — iOS via RNFB (drives
 * the native APNs prompt + `messaging().hasPermission()`), Android 13+ via
 * notifee (`POST_NOTIFICATIONS`, a no-op/auto-granted no-op below API 33).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    const status = await requestIosPermission(messagingInstance);
    return status === IosAuthorizationStatus.AUTHORIZED || status === IosAuthorizationStatus.PROVISIONAL;
  }
  const settings = await notifee.requestPermission();
  return settings.authorizationStatus >= AndroidAuthorizationStatus.AUTHORIZED;
}

/**
 * Call once at app start (see `_layout.tsx`). Wires the listeners that must
 * live for the app's lifetime: foreground display, tap-to-open (background
 * and cold-start-from-killed), and the token-refresh re-registration. The
 * background message handler itself is registered separately, at module
 * scope in `_layout.tsx` (must run before React renders — see RNFB's docs
 * on Expo Router integration).
 */
export function initPush(): void {
  void ensureNotificationChannels();

  onMessage(messagingInstance, async (message) => {
    bridgeRemoteMessage(message);
    if (await handleRiderLocationUpdate(message)) return;
    if (!isSilentOrderStatusPush(message)) {
      await displayForegroundNotification(message);
    }
    if (isOrderStatusPush(message)) {
      useRefreshBumpStore.getState().bumpOrders();
    }
  });

  onNotificationOpenedApp(messagingInstance, (message) => {
    if (isOrderStatusPush(message)) {
      useRefreshBumpStore.getState().bumpOrders();
    }
    openRelevantScreen(message);
  });

  getInitialNotification(messagingInstance).then((message) => {
    if (!message) return;
    if (isOrderStatusPush(message)) {
      useRefreshBumpStore.getState().bumpOrders();
    }
    openRelevantScreen(message);
  });

  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === CALL_RIDER_ACTION_ID) {
      callRiderFromNotificationData(detail.notification?.data as Record<string, unknown> | undefined);
      return;
    }
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === TRACK_ORDER_ACTION_ID) {
      trackOrderFromNotificationData(detail.notification?.data as Record<string, unknown> | undefined);
      return;
    }
    if (type === EventType.PRESS && detail.notification) {
      // Foreground-displayed notifications are ones we built ourselves in
      // `displayForegroundNotification` — re-derive the "order status"
      // signal from the title we set on it, same check as the push path.
      if (detail.notification.title === ORDER_STATUS_TITLE) {
        useRefreshBumpStore.getState().bumpOrders();
        router.push('/my-orders');
        return;
      }
      if (typeof detail.notification.id === 'string' && detail.notification.id.startsWith('order-tracking-')) {
        trackOrderFromNotificationData(detail.notification.data as Record<string, unknown> | undefined);
      }
    }
  });

  // Catches the gap every push-triggered bump above misses: a push arrived
  // while the app was backgrounded/killed (OS auto-displayed its own banner,
  // per `registerBackgroundHandler`'s comment), and the user reopened the
  // app normally — home-screen icon, task switcher, or just unlocking the
  // phone with the app already resumed — rather than tapping that specific
  // notification. None of `onMessage`/`onNotificationOpenedApp`/
  // `getInitialNotification` fire for that path, so the bottom live-order
  // bar and order history/detail screens (all driven by `ordersVersion`)
  // would otherwise sit stale until the next 10-minute poll. Same
  // inactive/background → active transition check as `BiometricGate`.
  let appState: AppStateStatus = AppState.currentState;
  AppState.addEventListener('change', (next) => {
    const cameToForeground = /inactive|background/.test(appState) && next === 'active';
    appState = next;
    if (cameToForeground) useRefreshBumpStore.getState().bumpOrders();
  });
}

/**
 * Registered at module scope (outside any component) — RNFB requires the
 * background handler to be set before the app's React tree mounts.
 */
export function registerBackgroundHandler(): void {
  setBackgroundMessageHandler(messagingInstance, async (message) => {
    bridgeRemoteMessage(message);
    if (await handleRiderLocationUpdate(message)) return;
    // Notification-type FCM messages (what the backend sends for most order
    // status changes — see `httpFcmMessage`) are displayed automatically by
    // the OS while the app is backgrounded/killed; nothing else to do here.
    // The one exception is `onTheWay` to a customer, which the backend sends
    // data-only (no `notification` block) precisely so the OS has nothing to
    // auto-display — this handler correctly no-ops for it too.
  });
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === CALL_RIDER_ACTION_ID) {
      callRiderFromNotificationData(detail.notification?.data as Record<string, unknown> | undefined);
      return;
    }
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === TRACK_ORDER_ACTION_ID) {
      trackOrderFromNotificationData(detail.notification?.data as Record<string, unknown> | undefined);
      return;
    }
    if (type === EventType.PRESS && detail.notification?.title === ORDER_STATUS_TITLE) {
      useRefreshBumpStore.getState().bumpOrders();
      return;
    }
    if (
      type === EventType.PRESS &&
      typeof detail.notification?.id === 'string' &&
      detail.notification.id.startsWith('order-tracking-')
    ) {
      trackOrderFromNotificationData(detail.notification?.data as Record<string, unknown> | undefined);
    }
  });
}

/**
 * Get this device's FCM token, register it with the backend, and keep it
 * fresh on rotation. Call once a profile is available (login, and again on
 * cold start once hydration confirms an existing session — mirrors the
 * Ionic app's `app.component.ts#routeConditions()` + post-OTP registration).
 * Best-effort throughout: `authApi.saveFcmToken` already swallows its own
 * errors, and a denied permission just skips registration silently.
 */
export async function registerDeviceToken(profileId: string): Promise<void> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;
    await ensureNotificationChannels();
    const token = await getToken(messagingInstance);
    await authApi.saveFcmToken(profileId, token);
    bridgeDeviceToken(token);
    onTokenRefresh(messagingInstance, (nextToken) => {
      void authApi.saveFcmToken(profileId, nextToken);
      bridgeDeviceToken(nextToken);
    });
  } catch {
    // No push this session — not worth surfacing to the user.
  }
}

/** Deregister this device's token — call before clearing the local session. */
export async function unregisterDeviceToken(profileId: string): Promise<void> {
  await authApi.removeFcmToken(profileId);
}
