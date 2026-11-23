import { environments, type AppEnvironment, type EnvName } from './environments';

/**
 * Active environment. Selected by `EXPO_PUBLIC_ENV` (local | staging |
 * production), defaulting to production. Individual keys can be overridden by
 * `EXPO_PUBLIC_*` vars (handy for EAS builds / pointing a device at a LAN IP).
 *
 * Switch env with the `start:*` / `android:*` scripts, e.g. `npm run start:staging`.
 */
const DEFAULT_ENV: EnvName = 'production';

function resolveEnvName(): EnvName {
  const raw = process.env.EXPO_PUBLIC_ENV;
  if (raw === 'local' || raw === 'staging' || raw === 'production') return raw;
  return DEFAULT_ENV;
}

const active = environments[resolveEnvName()];

const serverUrl = process.env.EXPO_PUBLIC_API_URL ?? active.serverUrl;

export const env: AppEnvironment = {
  ...active,
  serverUrl,
  imageUrl: `${serverUrl}/images/`,
  videoUrl: `${serverUrl}/videos/`,
  apiSecretKey: process.env.EXPO_PUBLIC_API_SECRET_KEY ?? active.apiSecretKey,
  googleMapsApiKey:
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? active.googleMapsApiKey,
  netcore: {
    androidAppId: process.env.EXPO_PUBLIC_NETCORE_ANDROID_APP_ID ?? active.netcore.androidAppId,
    iosAppId: process.env.EXPO_PUBLIC_NETCORE_IOS_APP_ID ?? active.netcore.iosAppId,
    iosGroupIdentifier: active.netcore.iosGroupIdentifier,
  },
};

export type { AppEnvironment, EnvName };

/**
 * Validate required env at startup. Call once from the root layout.
 * Throws in production so a misconfigured build fails fast; warns in dev.
 */
export function validateEnv(): void {
  const missing: string[] = [];
  if (!env.serverUrl) missing.push('serverUrl');
  if (!env.apiSecretKey) missing.push('apiSecretKey');

  if (missing.length === 0) return;

  const message = `[env] Missing required config for "${env.envName}": ${missing.join(', ')}`;
  if (env.production) throw new Error(message);
  // eslint-disable-next-line no-console
  console.warn(message);
}
