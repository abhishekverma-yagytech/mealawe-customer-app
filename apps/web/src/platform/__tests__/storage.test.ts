import { describe, expect, it } from 'vitest';

import { webKv, webSecure } from '../storage';

// Node has no localStorage, so these exercise the in-memory fallback used during SSR / blocked storage.
describe('web storage adapters (memory fallback)', () => {
  it('round-trips strings and booleans through the kv adapter', () => {
    webKv.set('mw.test.s', 'hello');
    webKv.set('mw.test.b', true);
    expect(webKv.getString('mw.test.s')).toBe('hello');
    expect(webKv.getBoolean('mw.test.b')).toBe(true);
    expect(webKv.getBoolean('mw.test.missing')).toBeUndefined();
    webKv.remove('mw.test.s');
    expect(webKv.getString('mw.test.s')).toBeUndefined();
  });

  it('clearAll only affects our namespace and clears memory', () => {
    webKv.set('mw.test.x', '1');
    webKv.clearAll();
    expect(webKv.getString('mw.test.x')).toBeUndefined();
  });

  it('stores the session token asynchronously', async () => {
    await webSecure.set('mw.session.token', 'tok');
    expect(await webSecure.get('mw.session.token')).toBe('tok');
    await webSecure.remove('mw.session.token');
    expect(await webSecure.get('mw.session.token')).toBeNull();
  });
});
