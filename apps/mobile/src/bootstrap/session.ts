import { registerSessionContext } from '@mealawe/api';

import { useAuthStore } from '@/store/authStore';
import { useClusterStore } from '@/store/clusterStore';
import { useLocationStore } from '@/store/locationStore';

/**
 * Lets the shared `@mealawe/api` package read the current user / cluster /
 * location from this app's Zustand stores without importing them. Imported once
 * from the root layout (all reads happen lazily at request time).
 */
registerSessionContext({
  getProfileId: () => useAuthStore.getState().profile?._id,
  getClusters: () => useClusterStore.getState().clusters,
  getClusterIds: () => useClusterStore.getState().clusterIds(),
  getCurrentConfigName: () => useClusterStore.getState().currentConfigName(),
  getGeolocation: () => useLocationStore.getState().current?.geolocation,
});
