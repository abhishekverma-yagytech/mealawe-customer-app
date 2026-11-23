import { beforeAll, describe, expect, it } from 'vitest';

import { configureCore } from '../runtime';
import { decryptData, encryptData, makeId } from '../crypto/aes';

beforeAll(() => {
  configureCore({ serverUrl: 'https://example.test', apiSecretKey: 'test-secret', isDev: false, registeredPlatform: 'test' });
});

describe('aes session_x envelope', () => {
  it('round-trips with a bearer token', () => {
    const sessionX = makeId(64);
    const payload = { phoneNo: '9999999999', n: 1 };
    const enc = encryptData(payload, 'Bearer abc', sessionX);
    expect(typeof enc.data_key).toBe('string');
    expect(decryptData(enc, 'Bearer abc', sessionX)).toEqual(payload);
  });

  it('round-trips with the shared secret when logged out', () => {
    const sessionX = makeId(64);
    const enc = encryptData({ a: 'b' }, null, sessionX);
    expect(decryptData(enc, null, sessionX)).toEqual({ a: 'b' });
  });

  it('fails to decrypt with a different session key', () => {
    const enc = encryptData({ a: 'b' }, 'Bearer abc', 'x'.repeat(64));
    expect(() => decryptData(enc, 'Bearer abc', 'y'.repeat(64))).toThrow();
  });

  it('passes plain bodies through untouched', () => {
    expect(decryptData({ ok: true }, null, 'x')).toEqual({ ok: true });
  });

  it('makeId yields alphanumeric ids of the requested length', () => {
    expect(makeId(100)).toMatch(/^[A-Za-z0-9]{100}$/);
  });
});
