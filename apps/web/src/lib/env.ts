/** Public runtime config (NEXT_PUBLIC_* are inlined at build time). */
export type EnvName = 'local' | 'staging' | 'production';

const name = (process.env.NEXT_PUBLIC_ENV as EnvName | undefined) ?? 'production';

export const ENV = {
  name,
  isDev: name !== 'production',
  // Set NEXT_PUBLIC_API_URL for local/staging; production defaults to the public API host.
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? (name === 'production' ? 'https://api.mealawe.com' : '')).replace(/\/$/, ''),
  // Shared AES passphrase — public by design (obfuscation, not secrecy), same as the mobile/Angular clients.
  apiSecretKey: process.env.NEXT_PUBLIC_API_SECRET_KEY ?? '',
  googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
  gtmId: process.env.NEXT_PUBLIC_GTM_ID ?? '',
  /** Backend enum value for web customers (same as the Angular app). */
  registeredPlatform: 'mealawe_web',
  /** Juspay web payments. Off by default: carts then show "complete your order in the app". Turn on only once
   * Juspay allows this origin as a return URL. */
  /** Hero slides are stored per device OS ('ios' | 'android' | both); the server has no web value, so web borrows one. */
  heroPlatform: process.env.NEXT_PUBLIC_HERO_PLATFORM === 'android' ? 'android' : 'ios',
  paymentsEnabled: process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true',
  imageBase: '',
} as const;

export function assertEnv(): string[] {
  const missing: string[] = [];
  if (!ENV.apiUrl) missing.push('NEXT_PUBLIC_API_URL');
  if (!ENV.apiSecretKey) missing.push('NEXT_PUBLIC_API_SECRET_KEY');
  return missing;
}
