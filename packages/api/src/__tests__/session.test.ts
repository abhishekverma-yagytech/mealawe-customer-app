import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { configureCore } from '@mealawe/core';

import { loadClusterMenu, loadNearestKitchens } from '../on-demand/api';
import { registerSessionContext, session, type SessionContext } from '../session';

beforeAll(() => {
  configureCore({ serverUrl: 'https://api.test', apiSecretKey: 'k', isDev: false, registeredPlatform: 'test' });
});
afterEach(() => vi.restoreAllMocks());

function ctx(over: Partial<SessionContext> = {}): SessionContext {
  return {
    getProfileId: () => undefined,
    getClusters: () => [],
    getClusterIds: () => [],
    getCurrentConfigName: () => '',
    getGeolocation: () => undefined,
    ...over,
  };
}

describe('session context', () => {
  it('exposes what the app registered', () => {
    registerSessionContext(ctx({ getProfileId: () => 'u1', getClusterIds: () => ['c1'] }));
    expect(session().getProfileId()).toBe('u1');
    expect(session().getClusterIds()).toEqual(['c1']);
  });
});

describe('session-scoped api calls', () => {
  it('does not hit the network when there is no cluster / location', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    registerSessionContext(ctx());
    expect(await loadClusterMenu()).toBeNull();
    expect(await loadNearestKitchens('allDay' as never)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requests nearest kitchens with the registered clusters and geolocation', async () => {
    registerSessionContext(ctx({ getClusterIds: () => ['c9'], getGeolocation: () => ({ lat: 18.5, lng: 73.8 }) }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('[]', { status: 200 }));
    await loadNearestKitchens('allDay' as never);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/1/73.8/18.5');
  });
});
