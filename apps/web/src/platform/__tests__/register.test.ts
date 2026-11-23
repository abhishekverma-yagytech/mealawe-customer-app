import { describe, expect, it } from 'vitest';

import { getCoreConfig, getAdapter } from '@mealawe/core';
import { session } from '@mealawe/api';

import { registerWebPlatform } from '../register';

describe('registerWebPlatform', () => {
  it('registers every port the shared packages need, with the web platform value', () => {
    registerWebPlatform();
    expect(getCoreConfig().registeredPlatform).toBe('mealawe_web');
    expect(() => getAdapter('kv')).not.toThrow();
    expect(() => getAdapter('secure')).not.toThrow();
    expect(() => getAdapter('analytics')).not.toThrow();
    expect(session().getClusterIds()).toEqual([]); // empty stores, but the context is registered
  });

  it('is idempotent', () => {
    registerWebPlatform();
    registerWebPlatform();
    expect(getCoreConfig().registeredPlatform).toBe('mealawe_web');
  });
});
