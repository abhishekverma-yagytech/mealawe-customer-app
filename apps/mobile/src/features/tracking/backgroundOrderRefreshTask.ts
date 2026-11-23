import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { ORDER_STEPS, statusLabel, statusStepIndex } from '@/features/orders/orderStatus';

import { fetchFoodOrder } from './api';
import {
  clearActiveTrackedOrderIfMatches,
  getActiveTrackedOrder,
  updateActiveTrackedOrderStatus,
} from './backgroundRefreshState';
import { displayRiderTrackingNotification } from './riderTrackingNotification';

export const BACKGROUND_ORDER_REFRESH_TASK = 'mealawe-background-order-refresh';

/**
 * Resilience fallback for the push-driven order tracking (`riderTrackingNotification.ts`) —
 * neither FCM nor APNs guarantees delivery, so this OS-scheduled task
 * (budgeted, best-effort — not a fixed interval) periodically re-checks
 * whatever order the app last started tracking and reconciles the ongoing
 * notification if a push update was missed. Must be defined at module scope
 * so it survives the app being relaunched headless for a background wake —
 * mirrors `registerBackgroundHandler()`'s FCM handler in `_layout.tsx`.
 */
TaskManager.defineTask(BACKGROUND_ORDER_REFRESH_TASK, async () => {
  try {
    const active = getActiveTrackedOrder();
    if (!active) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const order = await fetchFoodOrder(active.orderId);
    const status = order?.orderstatus as string | undefined;
    if (!status || status === active.lastKnownStatus) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    if (status === 'delivered') {
      clearActiveTrackedOrderIfMatches(active.orderId);
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    updateActiveTrackedOrderStatus(status);
    await displayRiderTrackingNotification(active.orderId, {
      status: statusLabel(status),
      progress: (statusStepIndex(status) / (ORDER_STEPS.length - 1)) * 100,
      riderPhone: active.riderPhone,
    });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Registers the periodic background task — safe to call on every app start,
 * `registerTaskAsync` is idempotent. Call once from `_layout.tsx`.
 */
export async function registerBackgroundOrderRefreshAsync(): Promise<void> {
  try {
    await BackgroundTask.registerTaskAsync(BACKGROUND_ORDER_REFRESH_TASK, { minimumInterval: 15 });
  } catch {
    // Background tasks unsupported/restricted on this device (or Expo Go) —
    // the push-driven path still covers the common case.
  }
}
