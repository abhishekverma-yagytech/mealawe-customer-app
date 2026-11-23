import { configureCore } from '@mealawe/core';
import { Platform } from 'react-native';

import { env } from '@/config/env';

/**
 * Injects this app's runtime config into the shared `@mealawe/core` package.
 * Idempotent; imported by every shim that exposes core http/crypto so it always
 * runs before the first request.
 */
configureCore({
  serverUrl: env.serverUrl,
  apiSecretKey: env.apiSecretKey,
  isDev: __DEV__,
  registeredPlatform: Platform.OS === 'android' ? 'mealawe_app_android' : 'mealawe_app_ios',
});
