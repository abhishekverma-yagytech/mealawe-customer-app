import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { decryptData, encryptData } from '../crypto/aes';
import { http, setAuthTokenProvider } from '../http/httpClient';
import { HttpError } from '../http/types';
import { configureCore } from '../runtime';

beforeAll(() => {
  configureCore({ serverUrl: 'https://example.test', apiSecretKey: 'test-secret', isDev: false, registeredPlatform: 'test' });
});
afterEach(() => {
  vi.restoreAllMocks();
  setAuthTokenProvider(() => null);
});

function mockFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown; encryptWith?: { token: string | null } }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const res = handler(String(url), init as RequestInit);
    const headers = (init as RequestInit).headers as Record<string, string>;
    const body = res.encryptWith ? encryptData(res.body, res.encryptWith.token, headers.session_x) : res.body;
    return new Response(JSON.stringify(body), { status: res.status ?? 200 });
  });
}

describe('http client', () => {
  it('encrypts the request, sends session headers and decrypts the response', async () => {
    setAuthTokenProvider(() => 'jwt123');
    let seen: { url: string; headers: Record<string, string>; sent: unknown } | undefined;
    mockFetch((url, init) => {
      const headers = init.headers as Record<string, string>;
      seen = { url, headers, sent: decryptData(JSON.parse(init.body as string), 'Bearer jwt123', headers.session_x) };
      return { body: { hello: 'world' }, encryptWith: { token: 'Bearer jwt123' } };
    });

    const out = await http.post<{ hello: string }>('/api/x', { a: 1 });

    expect(out).toEqual({ hello: 'world' });
    expect(seen?.url).toBe('https://example.test/api/x');
    expect(seen?.sent).toEqual({ a: 1 });
    expect(seen?.headers.authorization).toBe('Bearer jwt123');
    expect(seen?.headers.session_x).toHaveLength(64);
    expect(seen?.headers['session-token']).toHaveLength(64);
    expect(seen?.headers.salt_encryp_key).toHaveLength(100);
  });

  it('surfaces the decrypted server error message in HttpError', async () => {
    mockFetch(() => ({ status: 500, body: { msg: 'TODAY_CUTOFF_PASSED: late' }, encryptWith: { token: null } }));
    await expect(http.get('/api/y')).rejects.toMatchObject({ status: 500, message: 'TODAY_CUTOFF_PASSED: late' });
  });

  it('wraps network failures as HttpError(0)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const err = await http.get('/api/z').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(0);
  });
});
