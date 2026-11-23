import { useEffect, useState } from 'react';

import { loadApartmentAdvanceMenu } from './api';
import type { AdvanceDeliverySlot, ApartmentOrder } from './types';

/** An Advance order has no clock-time window on its own record, so this looks up the kitchen's live `apartmentSettings.advanceSubTypes[mealType]` window; `null` while unresolved. */
export function useApartmentAdvanceSlotWindow(
  order: Pick<ApartmentOrder, 'orderType' | 'apartmentId' | 'kitchenId' | 'mealType'> | null | undefined,
): AdvanceDeliverySlot | null {
  const [window, setWindow] = useState<AdvanceDeliverySlot | null>(null);
  const apartmentId = order?.orderType === 'advance' ? order.apartmentId : undefined;
  const kitchenId = order?.orderType === 'advance' ? order.kitchenId : undefined;
  const mealType = order?.orderType === 'advance' ? order.mealType : undefined;

  useEffect(() => {
    // Reset before the fetch resolves — syncs an external store, not a pure derivation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWindow(null);
    if (!apartmentId || !kitchenId || !mealType) return;
    let active = true;
    loadApartmentAdvanceMenu(apartmentId).then((res) => {
      if (!active || !res) return;
      const row = [...res.activeItems, ...res.inactiveItems].find((r) => r.kitchenId === kitchenId);
      const slot = row?.advanceDeliverySlots?.find((s) => s.mealType === mealType);
      if (slot) setWindow(slot);
    });
    return () => {
      active = false;
    };
  }, [apartmentId, kitchenId, mealType]);

  return window;
}
