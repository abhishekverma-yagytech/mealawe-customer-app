import { useBulkCartStore } from '@/features/bulk/useBulkCartStore';
import { useOnDemandCartStore } from '@/features/on-demand/useOnDemandCartStore';

import { useCartStore } from './cartStore';

/** Clears in-progress cart state. Shared by explicit logout and forced
 *  session-expiry logout so the two paths can't drift out of parity. */
export function resetCartStores(): void {
  useCartStore.getState().reset();
  useBulkCartStore.getState().reset();
  useOnDemandCartStore.getState().reset();
}
