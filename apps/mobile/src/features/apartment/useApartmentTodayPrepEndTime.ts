import { useEffect, useState } from 'react';

import { loadKitchenTodayPrepEndTime } from './api';
import type { ApartmentOrder } from './types';

/** `estimatedFulfillmentMinutes` is Instant-only server-side, so for Today orders this looks up the kitchen's live `apartmentSettings.todaySubTypes[mealType].prepEndTime` instead; `null` while unresolved. */
export function useApartmentTodayPrepEndTime(
  order: Pick<ApartmentOrder, 'orderType' | 'kitchenId' | 'mealType'> | null | undefined,
): string | null {
  const [prepEndTime, setPrepEndTime] = useState<string | null>(null);
  const kitchenId = order?.orderType === 'today' ? order.kitchenId : undefined;
  const mealType = order?.orderType === 'today' ? order.mealType : undefined;

  useEffect(() => {
    // Reset before the fetch resolves — syncs an external store, not a pure derivation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrepEndTime(null);
    if (!kitchenId || !mealType) return;
    let active = true;
    loadKitchenTodayPrepEndTime(kitchenId, mealType).then((res) => {
      if (active && res) setPrepEndTime(res);
    });
    return () => {
      active = false;
    };
  }, [kitchenId, mealType]);

  return prepEndTime;
}
