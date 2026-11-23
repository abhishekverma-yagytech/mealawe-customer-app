import './randomPolyfill'; // must run before crypto-js uses crypto.getRandomValues

import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';

import { getCoreConfig } from '../runtime';

/**
 * AES `session_x` request/response encryption — ported EXACTLY from the Ionic
 * app (mealaweApp `apiHttp.service.ts`). Every API request body is encrypted and
 * every response body decrypted with a per-request key.
 *
 * Key derivation (must match the backend):
 *   key      = token ? (token + token) : SECRET_KEY      // token = "Bearer <jwt>"
 *   finalKey = session_x ? (key + session_x) : SECRET_KEY // session_x = random per request
 *
 * CryptoJS.AES.encrypt with a STRING passphrase uses OpenSSL-style key
 * derivation (salted) — do not switch to raw key/IV mode.
 */

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Random alphanumeric id (matches the Ionic `makeid`). */
export function makeId(length: number): string {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return result;
}

function deriveKey(bearerToken: string | null, sessionX: string): string {
  const secretKey = getCoreConfig().apiSecretKey;
  const key = bearerToken ? bearerToken + bearerToken : secretKey;
  return sessionX ? key + sessionX : secretKey;
}

/** Encrypt a request payload into the `{ data_key }` envelope. */
export function encryptData(
  data: unknown,
  bearerToken: string | null,
  sessionX: string,
): { data_key: string } {
  const finalKey = deriveKey(bearerToken, sessionX);
  return { data_key: AES.encrypt(JSON.stringify(data), finalKey).toString() };
}

/** Decrypt a `{ data_key }` response envelope; pass through if not encrypted. */
export function decryptData<T>(
  body: unknown,
  bearerToken: string | null,
  sessionX: string,
): T {
  if (body && typeof body === 'object' && 'data_key' in body && (body as { data_key?: string }).data_key) {
    const finalKey = deriveKey(bearerToken, sessionX);
    const text = AES.decrypt(
      (body as { data_key: string }).data_key,
      finalKey,
    ).toString(Utf8);
    return JSON.parse(text) as T;
  }
  return body as T;
}
