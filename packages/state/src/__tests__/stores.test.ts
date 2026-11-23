import { beforeEach, describe, expect, it } from 'vitest';

import { STORAGE_KEYS } from '@mealawe/core';
import type { CustomerProfile } from '@mealawe/api';

import { useAuthStore, clearStaleSessionOnFreshInstall } from '../authStore';
import { useCartStore } from '../cartStore';
import { useClusterStore } from '../clusterStore';
import { installTestPlatform } from './testPlatform';

let platform: ReturnType<typeof installTestPlatform>;

beforeEach(() => {
  platform = installTestPlatform();
  useAuthStore.setState({ token: null, profile: null, isAuthenticated: false, needsProfile: false, isHydrated: false });
  useClusterStore.setState({ clusters: [] });
  useCartStore.getState().reset();
});

describe('authStore', () => {
  const profile = { _id: 'u1', userName: 'A', email: 'a@b.c' } as unknown as CustomerProfile;

  it('persists a session through the secure adapter and rehydrates it', async () => {
    await useAuthStore.getState().setSession('tok', profile);
    expect(platform.secure.get(STORAGE_KEYS.sessionToken)).toBe('tok');

    useAuthStore.setState({ token: null, profile: null, isAuthenticated: false });
    await useAuthStore.getState().hydrate();
    const s = useAuthStore.getState();
    expect(s.token).toBe('tok');
    expect(s.profile?._id).toBe('u1');
    expect(s.isAuthenticated).toBe(true);
    expect(s.needsProfile).toBe(false);
    expect(s.isHydrated).toBe(true);
  });

  it('flags profile completion for new users and clears on logout', async () => {
    await useAuthStore.getState().setSession('tok', { _id: 'u2' } as unknown as CustomerProfile);
    expect(useAuthStore.getState().needsProfile).toBe(true);
    await useAuthStore.getState().clearSession();
    expect(platform.secure.size).toBe(0);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('clears a stale session once on a fresh install, then leaves it alone', async () => {
    await useAuthStore.getState().setSession('tok', profile);
    await clearStaleSessionOnFreshInstall();
    expect(useAuthStore.getState().token).toBeNull();
    await useAuthStore.getState().setSession('tok2', profile);
    await clearStaleSessionOnFreshInstall();
    expect(useAuthStore.getState().token).toBe('tok2');
  });
});

describe('clusterStore', () => {
  it('derives ids, serviceability and config name from the clusters', () => {
    expect(useClusterStore.getState().isServiceable()).toBe(false);
    expect(useClusterStore.getState().currentConfigName()).toBe('');
    useClusterStore.setState({
      clusters: [
        { clusterId: 'c1', clusterConfigName: 'Pune' },
        { clusterId: 'c2', clusterConfigName: 'Mumbai' },
      ] as never,
    });
    expect(useClusterStore.getState().clusterIds()).toEqual(['c1', 'c2']);
    expect(useClusterStore.getState().isServiceable()).toBe(true);
    expect(useClusterStore.getState().currentConfigName()).toBe('Mumbai');
  });

  it('skips overlapping clusters with no config name (staging "Pune Extended" case)', () => {
    useClusterStore.setState({
      clusters: [
        { clusterId: 'c1', clusterName: 'pune', clusterConfigName: 'tier1' },
        { clusterId: 'c2', clusterName: 'pune full', clusterConfigName: 'tier1' },
        { clusterId: 'c3', clusterName: 'Pune Extended' },
        { clusterId: 'c4', clusterName: 'blank', clusterConfigName: '  ' },
      ] as never,
    });
    expect(useClusterStore.getState().currentConfigName()).toBe('tier1');
    useClusterStore.setState({ clusters: [{ clusterId: 'c3', clusterName: 'Pune Extended' }] as never });
    expect(useClusterStore.getState().currentConfigName()).toBe('');
  });
});

describe('cartStore', () => {
  const config = {
    package: { _id: 'p1', packageName: 'Thali', packagePrice: 100, days: 5 },
    category: 'Lunch',
    deliveryOnWeekends: false,
    addOns: [],
    selectedDates: ['2026-01-05'],
    lunch: true,
    dinner: false,
  } as never;

  it('adds a plan once, persists it, and emits an add_to_cart event', () => {
    useCartStore.getState().setSubscription(config);
    const { cart } = useCartStore.getState();
    expect(cart.item?.count).toBe(1);
    expect(platform.kv.get(STORAGE_KEYS.cart)).toContain('"p1"');
    expect(platform.events.map((e) => e.name)).toContain('add_to_cart');

    const before = platform.events.length;
    useCartStore.getState().setSubscription(config); // same plan: no new add event
    expect(platform.events.length).toBe(before);
  });

  it('reset empties the cart', () => {
    useCartStore.getState().setSubscription(config);
    useCartStore.getState().reset();
    expect(useCartStore.getState().cart.item).toBeNull();
  });
});
