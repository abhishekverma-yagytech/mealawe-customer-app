'use client';

import { useEffect } from 'react';

import { useLocationStore } from '@mealawe/state';

import { resolveApartment } from '@/features/apartment/api';
import { useApartmentCartStore } from '@/features/apartment/cartStore';
import { useApartmentEligibilityStore } from '@/features/apartment/eligibility';

/**
 * Resolves whether the current address is inside an apartment complex (`getNearestApartment`), same rule as mobile.
 * Mounted once (AppBootstrap). A real request failure keeps the last known answer instead of hiding Apartment.
 */
export function ApartmentEligibilityResolver() {
  const lat = useLocationStore((s) => s.current?.geolocation?.lat);
  const lng = useLocationStore((s) => s.current?.geolocation?.lng);

  useEffect(() => {
    const set = useApartmentEligibilityStore.getState().setApartment;
    // {0,0} is the "saved address never had a geolocation" sentinel — same as no location.
    if (lat === undefined || lng === undefined || (lat === 0 && lng === 0)) {
      set(null);
      return;
    }
    let active = true;
    resolveApartment(lng, lat)
      .then((res) => {
        if (!active) return;
        set(res);
        // A cart belongs to one apartment: moving to another (or to none) empties it, as on mobile.
        const cart = useApartmentCartStore.getState();
        if (cart.meta && cart.meta.apartmentId !== res?.apartmentId) cart.reset();
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [lat, lng]);

  return null;
}
