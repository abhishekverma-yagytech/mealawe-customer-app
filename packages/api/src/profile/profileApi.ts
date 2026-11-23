import { ENDPOINTS, getCoreConfig, http } from '@mealawe/core';

import type { CustomerProfile } from '../auth/types';

/** The stored `imageUrl` is a relative filename, never a full URL — same CDN-prefix convention as every other image field. */
export function resolveProfileImage(imageUrl: string | null | undefined): string | undefined {
  return imageUrl ? `${getCoreConfig().serverUrl}/images/${imageUrl}` : undefined;
}

/**
 * Profile API — posts the full merged profile (mirrors mealaweApp's updateUserProfile), so unrelated
 * fields like `addressList` are preserved.
 */
export const profileApi = {
  saveProfile: (profileId: string, profile: CustomerProfile) =>
    http.post<CustomerProfile>(`${ENDPOINTS.profile.updateProfile}/${profileId}`, profile),

  /**
   * Same endpoint with a real `multipart/form-data` body (the server runs multer `upload.single('image')`).
   * Platform-neutral: callers pass the image as a `Blob`/`File` (web: from <input type=file>;
   * mobile: wraps its local uri in expo-file-system's `File`). Sends just name/email (+ registeredPlatform
   * for parity with the JSON path); everything else falls back to the stored profile server-side.
   */
  saveProfileWithImage: (
    profileId: string,
    values: { userName: string; email: string; registeredPlatform?: string },
    image: Blob,
  ) => {
    const formData = new FormData();
    formData.append('userName', values.userName);
    formData.append('email', values.email);
    if (values.registeredPlatform) formData.append('registeredPlatform', values.registeredPlatform);
    formData.append('image', image);
    return http.post<CustomerProfile>(`${ENDPOINTS.profile.updateProfile}/${profileId}`, formData);
  },
};
