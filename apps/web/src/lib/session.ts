import { authApi } from '@mealawe/api';
import { useAuthStore, useBulkCartStore, useCartStore, useOnDemandCartStore } from '@mealawe/state';

/** Sign out: best-effort server logout, clear in-progress carts and the stored session (mirrors mobile profile.tsx). */
export async function signOut(): Promise<void> {
  try {
    await authApi.logout();
  } catch {
    // clear the local session regardless of network errors
  }
  useCartStore.getState().reset();
  useBulkCartStore.getState().reset();
  useOnDemandCartStore.getState().reset();
  await useAuthStore.getState().clearSession();
}
