import { HTTP } from '../constants';
import { getCoreConfig } from '../runtime';

import { decryptData, encryptData, makeId } from '../crypto/aes';
import { HttpError, type ApiResponse, type RequestOptions } from './types';

/**
 * Fetch-based HTTP client. Ports the Ionic `apiHttp.service` transport:
 * every request carries random `session-token` / `session_x` / `salt_encryp_key`
 * headers, the body is AES-encrypted into `{ data_key }` keyed by `session_x`
 * (+ bearer token when logged in), and the response `{ data_key }` is decrypted
 * with the same key.
 */

let authTokenProvider: () => string | null = () => null;

/** Wire the auth store in at startup so requests carry the session token. */
export function setAuthTokenProvider(provider: () => string | null): void {
  authTokenProvider = provider;
}

function buildUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${getCoreConfig().serverUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, signal } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP.timeoutMs);

  const rawToken = authTokenProvider();
  const bearerToken = rawToken ? `Bearer ${rawToken}` : null;
  const sessionX = makeId(64);

  // Every request/response body is AES-encrypted on the wire (see the file
  // header) — Chrome/React Native DevTools' Network inspector shows it as an
  // opaque `{ data_key }` blob no matter what, so "inspecting the request in
  // DevTools" needs a different source of truth. Log the PLAIN (pre-
  // encryption / post-decryption) payload to the console instead — visible
  // in Metro's terminal output and in the DevTools Console tab, getCoreConfig().isDev-only
  // so it never ships to a production build.
  if (getCoreConfig().isDev) {
    console.log(`[http] → ${method} ${path}`, body ?? '');
  }

  // File uploads (e.g. the profile photo) pass a real `FormData` body —
  // ported from the Ionic app's own `apiHttp.service.ts` `encryptDate`,
  // which special-cases `FormData` the exact same way: skip AES encryption
  // (multer on the server parses genuine multipart fields, not an encrypted
  // JSON envelope) and never set `Content-Type` ourselves — `fetch` needs to
  // generate its own multipart boundary, which a hardcoded
  // `application/json` header would silently break.
  const isFormData = body instanceof FormData;

  try {
    const response = await fetch(buildUrl(path), {
      method,
      credentials: 'include',
      signal: signal ?? controller.signal,
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'session-token': makeId(64),
        session_x: sessionX,
        salt_encryp_key: makeId(100),
        ...(rawToken ? { authorization: `Bearer ${rawToken}` } : {}),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : isFormData
            ? (body as FormData)
            : JSON.stringify(encryptData(body, bearerToken, sessionX)),
    });

    const text = await response.text();
    if (!response.ok) {
      // The server encrypts EVERY response body the same way once a
      // session-token header is present (which every request here sends) —
      // that includes error bodies (`responsehanlder.hasError500` etc.),
      // typically `{ msg: error.message }`. Without decrypting this, every
      // HttpError message collapsed to a generic "Request failed: 500" and
      // the server's actual message (e.g. apartment's `ORDER_MULTI_KITCHEN:
      // ...`, `TODAY_CUTOFF_PASSED: ...`) was silently discarded — several
      // flows (Apartment's conflict/cutoff messaging in particular) depend
      // on that real message reaching the caller. Best-effort: fall back to
      // the generic message if the body isn't JSON/encrypted, same as before.
      let message = `Request failed: ${response.status}`;
      try {
        const parsedError = text ? (JSON.parse(text) as unknown) : undefined;
        const decrypted = parsedError !== undefined ? decryptData<Record<string, unknown>>(parsedError, bearerToken, sessionX) : undefined;
        const serverMessage = decrypted?.msg ?? decrypted?.error ?? decrypted?.message;
        if (typeof serverMessage === 'string' && serverMessage) {
          message = serverMessage;
        }
      } catch {
        // not JSON / not decryptable — keep the generic message
      }
      throw new HttpError(response.status, message, text);
    }
    if (!text) return undefined as T;

    const parsed = JSON.parse(text) as unknown;
    const decrypted = decryptData<T>(parsed, bearerToken, sessionX);
    if (getCoreConfig().isDev) {
      console.log(`[http] ← ${method} ${path} ${response.status}`, decrypted);
    }
    return decrypted;
  } catch (error: unknown) {
    if (getCoreConfig().isDev) {
      console.log(`[http] ✗ ${method} ${path}`, error);
    }
    if (error instanceof HttpError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError(408, 'Request timed out');
    }
    throw new HttpError(0, error instanceof Error ? error.message : 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

export type { ApiResponse };
