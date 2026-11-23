/**
 * crypto-js needs `crypto.getRandomValues` to generate the AES salt. Browsers
 * (and the Ionic WebView) provide it; Hermes / React Native does not, so
 * crypto-js throws "Native crypto module could not be used to get secure random
 * number". This side-effect module installs a getRandomValues implementation.
 *
 * The value only seeds the OpenSSL-style salt for our shared-key `session_x`
 * scheme (obfuscation, not real secrecy), so Math.random is acceptable. For
 * cryptographically strong randomness, install `react-native-get-random-values`
 * and import it instead of this file.
 */
const g: any = globalThis;

if (!g.crypto) g.crypto = {};

if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = (array: any) => {
    for (let i = 0; i < array.length; i += 1) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  };
}
