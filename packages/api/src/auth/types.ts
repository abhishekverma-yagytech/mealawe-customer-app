/** Auth models — typed against the live backend (see endpoints.ts). */

export interface SendOtpRequest {
  phoneNo: string;
  registeredPlatform: string;
}

export interface VerifyOtpRequest {
  phoneNo: string;
  /** the 6-digit OTP */
  password: string;
  userType: 'customer';
  registeredPlatform: string;
}

/** Seed profile returned inside the verify-OTP response. */
export interface LoginInfo {
  _id?: string;
  phoneNo?: string;
  userName?: string;
  email?: string;
  lastLogin?: string | null;
  [key: string]: unknown;
}

export interface VerifyOtpResponse {
  token: string;
  loginInfo: LoginInfo;
}

/** Full customer profile from /api/customerProfile. */
export interface CustomerProfile {
  _id: string;
  phoneNo: string;
  userName?: string;
  email?: string;
  lastLogin?: string | null;
  addressList?: unknown[];
  installReferrer?: string;
  /** Server-stored filename (relative path), never a full URL — same
   * `env.imageUrl` CDN-prefix convention as every other image field in this
   * app (see `profileApi`'s own `resolveProfileImage`). */
  imageUrl?: string;
  [key: string]: unknown;
}

export interface UpdateProfileRequest {
  userName: string;
  email: string;
  installReferrer?: string;
}

export interface ReferralValidation {
  referralCodeValid: boolean;
}

/** Partial-update payload for lazily assigning a user their own referral
 * code — the backend's `/api/updatecustomerprofile/:id` merges whatever
 * fields are sent with the existing profile, so this never touches
 * userName/email (see `customerProfile.dao.js`'s `||`-fallback merge). */
export interface SetReferralCodeRequest {
  referralCode: string;
}
