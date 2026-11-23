import { File } from 'expo-file-system';

import '@/bootstrap/core';

import { profileApi as sharedProfileApi, resolveProfileImage } from '@mealawe/api';

export { resolveProfileImage };

/** Shared profile API plus the mobile-only photo wrapper (Expo's `File` is a spec-compliant Blob subclass). */
export const profileApi = {
  saveProfile: sharedProfileApi.saveProfile,
  saveProfileWithPhoto: (
    profileId: string,
    values: { userName: string; email: string; registeredPlatform?: string },
    photo: { uri: string; name: string; type: string },
  ) => sharedProfileApi.saveProfileWithImage(profileId, values, new File(photo.uri)),
};
