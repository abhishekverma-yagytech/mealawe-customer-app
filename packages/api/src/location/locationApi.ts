import type { CustomerProfile } from '../auth/types';
import { ENDPOINTS, http } from '@mealawe/core';

import type { Address } from './types';

/**
 * Location / address API — thin typed wrappers over the encrypted HTTP client.
 * Mirrors mealaweApp's apiMain (updatecustomerCurrLocation / updateUserProfile).
 */
export const locationApi = {
  /** Set the user's active delivery address on the backend. */
  setCurrentLocation: (profileId: string, addr: Address) =>
    http.post<unknown>(`${ENDPOINTS.profile.updateCurrentLocation}/${profileId}`, addr),

  /**
   * Persist the full profile (used to save the `addressList`). Posts the merged
   * profile object; returns the updated profile the server echoes back.
   */
  saveProfile: (profileId: string, profile: CustomerProfile) =>
    http.post<CustomerProfile>(`${ENDPOINTS.profile.updateProfile}/${profileId}`, profile),
};
