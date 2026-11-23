import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useSubscriptionOrders } from '@mealawe/hooks';

import { useRefreshBumpStore } from '@/services/push';

import { mealaweOrderWidget } from './orderWidget';

/** Subscription orders (shared hook) + the iOS-only "reorder your usual" home-screen widget (native). */
export function useOrders() {
  const ordersVersion = useRefreshBumpStore((s) => s.ordersVersion);
  const state = useSubscriptionOrders(ordersVersion);
  const latest = state.past[0];

  // Keep the widget pointed at the most recent order. iOS-only: `expo-widgets`' Android bridge is a no-op stub
  // (see PLATFORM-NATIVE-FEATURES-PLAN.md Phase A).
  useEffect(() => {
    if (Platform.OS !== 'ios' || !latest) return;
    mealaweOrderWidget.updateSnapshot({ title: latest.title, subtitle: latest.subtitle ?? 'Tap to reorder' });
  }, [latest]);

  return state;
}
