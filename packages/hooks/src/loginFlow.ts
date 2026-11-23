import { authApi, type CustomerProfile, type LoginInfo } from '@mealawe/api';
import { HttpError } from '@mealawe/core';
import { useAuthStore } from '@mealawe/state';

/** A 401 on the very first authenticated call (right after `setToken`) almost always means the
 * server's own token-save write for `/verifyOTP` hasn't landed yet — a known race in
 * `authUser.route.js`, not a real "session expired". One short retry closes that window. */
export async function fetchProfileWithRetry(loginInfo: LoginInfo): Promise<CustomerProfile> {
  try {
    return await authApi.fetchProfile(loginInfo);
  } catch (e) {
    if (!(e instanceof HttpError) || e.status !== 401) throw e;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return authApi.fetchProfile(loginInfo);
  }
}

export type PostLoginRoute = { kind: 'redirect'; path: string } | { kind: 'home' } | { kind: 'register'; redirect?: string };

/** Only same-app absolute paths are honoured as a post-login redirect (blocks open redirects). */
export function safeRedirect(redirect: string | null | undefined): string | undefined {
  return redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : undefined;
}

/**
 * Shared OTP verification + session bootstrap for mobile and web:
 * verify OTP → store token FIRST (so the profile call is authenticated and uses the
 * token-based AES key) → fetch profile → store profile → decide where to go next.
 * Platform-specific extras (device token, crash/analytics identity) stay in the caller.
 */
export async function verifyOtpAndLogin(
  phone: string,
  otp: string,
  redirect?: string | null,
): Promise<{ profile: CustomerProfile; next: PostLoginRoute }> {
  const res = await authApi.verifyOtp(phone, otp);
  if (!res?.token) throw new Error('Invalid OTP');
  await useAuthStore.getState().setToken(res.token);
  const profile = await fetchProfileWithRetry(res.loginInfo);
  await useAuthStore.getState().setProfile(profile);

  const safe = safeRedirect(redirect);
  if (profile.userName && profile.email) {
    return { profile, next: safe ? { kind: 'redirect', path: safe } : { kind: 'home' } };
  }
  return { profile, next: { kind: 'register', redirect: safe } };
}
