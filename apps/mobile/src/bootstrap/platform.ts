import { registerLocationProvider } from '@mealawe/api';
import { registerPlatform } from '@mealawe/core';

import { expoLocationProvider } from '@/features/location/geo';
import { track } from '@/services/netcore/netcoreClient';
import { kvStorage } from '@/services/storage/kvStore';
import { secureStorage } from '@/services/storage/secureStore';

/**
 * Wires this app's native implementations into the shared packages' platform
 * ports (storage, analytics, location). Imported first from the root layout so
 * everything is registered before any store hydrates or request fires.
 */
registerPlatform({
  kv: kvStorage,
  secure: secureStorage,
  analytics: { track },
});
registerLocationProvider(expoLocationProvider);
