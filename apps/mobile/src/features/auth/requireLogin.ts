import { Alert } from 'react-native';
import type { useRouter } from 'expo-router';

import { useAuthStore } from '@/store';

/**
 * Gate a guest-blocked action — placing any order — behind login. A "Skip"
 * on the login screen never sets a session (see `login.tsx`'s Skip button),
 * so `profile` staying null IS the guest signal; every checkout screen
 * (Subscription/Dine-in, On Demand, Bulk) used to just silently no-op its
 * `pay()` when `profile` was missing, letting a guest fill an entire cart
 * and tap Pay with no visible result. This surfaces why and sends them to
 * the same login flow `doSignOut`/the wallet & cashback `LoginGate`s already
 * use, instead of adding a third, different "please log in" destination.
 *
 * Returns `true` when the customer already has a session (caller proceeds
 * as before); `false` when the guard fired (caller must return early).
 */
export function requireLogin(router: ReturnType<typeof useRouter>): boolean {
  if (useAuthStore.getState().profile) return true;
  Alert.alert('Sign in required', 'Please sign in to place your order.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign in', onPress: () => router.replace('/login') },
  ]);
  return false;
}
