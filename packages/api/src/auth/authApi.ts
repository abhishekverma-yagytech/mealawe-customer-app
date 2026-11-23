import { ENDPOINTS, getCoreConfig, http, HttpError, type RequestOptions } from '@mealawe/core';

import type {
  CustomerProfile,
  LoginInfo,
  ReferralValidation,
  SetReferralCodeRequest,
  UpdateProfileRequest,
  VerifyOtpResponse,
} from './types';

/** Must match the server's `CustomerProfile` schema enum
 * (`customerProfile.model.js`) — plain `Platform.OS` ('ios'/'android') is NOT
 * a valid enum value and would throw a Mongoose ValidationError on save.
 * Mirrors the Ionic app's `apiMain.service.ts` `registerPlatform` values. */
/** Injected per platform via configureCore({ registeredPlatform }). */
const platformValue = (): string => getCoreConfig().registeredPlatform;

const RETRY_DELAY_MS = 2000;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `HttpError.status === 0` means `fetch` itself failed (offline, DNS, etc.);
 * `408` is this client's own synthetic timeout status — both are transient,
 * unlike a real HTTP status the server actually returned. */
const isNetworkFailure = (error: unknown): boolean =>
  error instanceof HttpError && (error.status === 0 || error.status === 408);

/** One retry after a fixed short delay, only for a transient network
 * failure — not infinite, not blocking, matching this file's existing
 * best-effort philosophy for these push-token registrations. */
async function postBestEffortWithRetry(path: string, body: unknown): Promise<void> {
  try {
    await http.post<unknown>(path, body);
  } catch (error) {
    if (!isNetworkFailure(error)) return;
    await delay(RETRY_DELAY_MS);
    try {
      await http.post<unknown>(path, body);
    } catch {
      // Still failing after one retry — drop it, same as before.
    }
  }
}

/**
 * Auth API — thin typed wrappers over the encrypted HTTP client.
 * Mirrors the Ionic app's apiMain auth methods.
 */
export const authApi = {
  /** Send an OTP to a 10-digit phone number. */
  sendOtp: (phoneNo: string) =>
    http.post<unknown>(ENDPOINTS.auth.registerPhoneNo, { phoneNo, registeredPlatform: platformValue() }),

  resendOtp: (phoneNo: string) =>
    http.post<unknown>(ENDPOINTS.auth.resendOtp, { phoneNo, registeredPlatform: platformValue() }),

  /** Verify the OTP; returns the session token + seed profile. */
  verifyOtp: (phoneNo: string, otp: string) =>
    http.post<VerifyOtpResponse>(ENDPOINTS.auth.verifyOtp, {
      phoneNo,
      password: otp,
      userType: 'customer',
      registeredPlatform: platformValue(),
    }),

  /** Exchange the login seed for the full customer profile. Mirrors the
   * Ionic app's `apiMain.service.ts`, which always stamps `registeredPlatform`
   * onto this call — the server only backfills a profile's `registeredPlatform`
   * on first creation, so an RN-created account that never sent this would
   * permanently lack it. */
  fetchProfile: (loginInfo: LoginInfo, options?: RequestOptions) =>
    http.post<CustomerProfile>(
      ENDPOINTS.profile.customerProfile,
      { ...loginInfo, registeredPlatform: platformValue() },
      options,
    ),

  /** Complete/update the profile (name, email, referral). */
  updateProfile: (id: string, data: UpdateProfileRequest) =>
    http.post<CustomerProfile>(`${ENDPOINTS.profile.updateProfile}/${id}`, data),

  validateReferral: (code: string) =>
    http.get<ReferralValidation>(
      `${ENDPOINTS.profile.validateReferralCode}/${code.toUpperCase()}`,
    ),

  /** Lazily assign the current user their own referral code (mirrors the
   * Ionic app's `generateReferrelCode()`) — a narrow partial update, never
   * the full profile-completion payload `updateProfile` sends. */
  setReferralCode: (id: string, data: SetReferralCodeRequest) =>
    http.post<CustomerProfile>(`${ENDPOINTS.profile.updateProfile}/${id}`, data),

  logout: () => http.get<unknown>(ENDPOINTS.auth.logout),

  /** Admin-configured login-screen background video — common to every user,
   * no cluster scoping. `null` if none is set — `useHeroVideoPlayer` falls
   * back to its gradient on `null` or any error. */
  getActiveLoginVideo: async (): Promise<{ videoFile: string } | null> => {
    try {
      const video = await http.get<{ videoFile: string } | null>(ENDPOINTS.auth.activeLoginVideo);
      return video ?? null;
    } catch {
      return null;
    }
  },

  /** Register this device's FCM token against the profile — best-effort, never blocks login. */
  saveFcmToken: async (profileId: string, fcmToken: string): Promise<void> => {
    try {
      await http.post<unknown>(ENDPOINTS.profile.saveFcmToken, { profileId, fcmToken });
    } catch {
      // Push registration is a nice-to-have, not a login blocker.
    }
  },

  /** Deregister this device's FCM token — best-effort, never blocks logout. */
  removeFcmToken: async (profileId: string): Promise<void> => {
    try {
      await http.post<unknown>(ENDPOINTS.profile.removeFcmToken, { profileId });
    } catch {
      // Best-effort cleanup — a stale token just means one fewer push later.
    }
  },

  /** Register this device's ActivityKit push-to-start token — best-effort,
   * iOS-only (caller gates on Platform.OS). Retries once on a transient
   * network failure, since a blip at the exact moment this fires can mean
   * the token is lost until the OS decides to reissue one. */
  registerLiveActivityPushToStartToken: (profileId: string, pushToStartToken: string): Promise<void> =>
    postBestEffortWithRetry(ENDPOINTS.profile.registerLiveActivityPushToStartToken, {
      profileId,
      pushToStartToken,
    }),

  /** Register/refresh the per-activity update token for the currently-active
   * Live Activity — best-effort, iOS-only. Same one-retry-on-network-failure
   * policy as the push-to-start registration above. */
  registerLiveActivityUpdateToken: (
    profileId: string,
    activityId: string,
    pushToken: string,
  ): Promise<void> =>
    postBestEffortWithRetry(ENDPOINTS.profile.registerLiveActivityUpdateToken, {
      profileId,
      activityId,
      pushToken,
    }),
};
