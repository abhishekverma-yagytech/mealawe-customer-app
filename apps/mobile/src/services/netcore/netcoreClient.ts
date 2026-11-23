import SmartechBaseReact from 'smartech-base-react-native';
import { router } from 'expo-router';

import { isTrackingEnabled, safeSmartechCall } from './internal';

/**
 * Every exported function in this module is best-effort: it checks
 * `isTrackingEnabled()` first, then routes its native SDK call through
 * `safeSmartechCall`. Safe to call from any try/catch (or with none at all)
 * — never throws, matching `recordCrashlyticsError`'s own contract in
 * `crashlytics.ts`. Both helpers live in `internal.ts`, shared with
 * `netcorePush.ts`.
 */

/** Fields updatable via `updateProfile` — matches the Ionic app's own
 * NAME/EMAIL Netcore profile attribute keys. Named and exported so call
 * sites (e.g. `register.tsx`) have a concrete type to build against. */
export interface NetcoreProfileFields {
  name?: string;
  email?: string;
}

/** Call once at app boot (`_layout.tsx` module scope). Registers Netcore's own
 * deeplink listener (fires when a user taps a push/in-app-message/app-inbox
 * item carrying a deeplink configured on Netcore's dashboard — unrelated to
 * this app's Expo Router `scheme`/`associatedDomains` linking, which handles
 * links opened from outside the app) and records the install/update event. */
export function initNetcore(): void {
  if (!isTrackingEnabled()) return;
  safeSmartechCall(() =>
    SmartechBaseReact.addListener('SmartechDeeplink', (payload: { smtDeeplink?: string }) => {
      // Strip any query string — Expo Router's path matching doesn't
      // tolerate a trailing `?...` on the path passed to `router.push`.
      const path = payload?.smtDeeplink?.split('?')[0];
      // `path` originates from Netcore's dashboard (external, unvalidated,
      // typo-prone by a non-developer) — a garbage value degrades to a
      // no-op instead of reaching `router.push` unchecked. Deliberate
      // divergence from the Ionic app's netcore.service.ts, which navigates
      // on any truthy value with no leading-slash check: Expo Router's
      // `router.push` treats a non-'/'-prefixed string as relative to the
      // current screen, which is almost certainly wrong for a push-tap
      // deeplink, so campaign links configured in Netcore's dashboard for
      // this app must use a leading '/' (e.g. '/order-tracking', not
      // 'order-tracking') or they'll no-op here instead of navigating.
      if (!path || !path.startsWith('/')) return;
      router.push(path as Parameters<typeof router.push>[0]);
    })
  );
  safeSmartechCall(() => SmartechBaseReact.trackAppInstallUpdateBySmartech());
}

/** Identify the user to Netcore. `phone` is the bare 10-digit number (this
 * app's `CustomerProfile.phoneNo` shape) — the '91' country-code prefix is
 * added here, matching the Ionic app's own `91${phoneNo}` construction. */
export function identify(phone: string): void {
  if (!isTrackingEnabled()) return;
  safeSmartechCall(() => SmartechBaseReact.login(`91${phone}`));
}

/** Logs the user out of Netcore and clears their locally cached identity —
 * call alongside clearing this app's own session. The `true` argument to
 * `logoutAndClearUserIdentity` tells the SDK to also clear the identity it
 * has cached on-device (not just stop attaching it to new events), matching
 * the Ionic app's own logout call. */
export function logout(): void {
  if (!isTrackingEnabled()) return;
  safeSmartechCall(() => SmartechBaseReact.logoutAndClearUserIdentity(true));
}

/** Pushes profile attributes to Netcore, shown against the user identified
 * by `identify`. Netcore's dashboard keys are the upper-case `NAME`/`EMAIL`
 * — that mapping happens here so callers can pass this app's own camelCase
 * field names. Only includes a key when the caller actually passed that
 * field: `{ NAME: fields.name, EMAIL: fields.email }` would still put an
 * own, enumerable `EMAIL` key on the object (with value `undefined`) even
 * when the caller omits `email` — the object crosses the JSI bridge to a
 * native TurboModule, where whether an `undefined`-valued key survives as
 * "absent" or arrives as `null` isn't something this codebase can verify.
 * Building the object conditionally guarantees the key is truly absent
 * before it ever leaves JS, so callers that don't have a value to send
 * (e.g. a cleared email field) can't accidentally overwrite Netcore's
 * previously-tracked attribute with a blank one. */
export function updateProfile(fields: NetcoreProfileFields): void {
  if (!isTrackingEnabled()) return;
  const payload: Record<string, string> = {};
  if (fields.name !== undefined) payload.NAME = fields.name;
  if (fields.email !== undefined) payload.EMAIL = fields.email;
  safeSmartechCall(() => SmartechBaseReact.updateUserProfile(payload));
}

/** Generic event wrapper — every named tracker in `events.ts` funnels through
 * this, matching the Ionic app's `NetCoreService.setEvent`. */
export function track(eventName: string, payload: Record<string, unknown>): void {
  if (!isTrackingEnabled()) return;
  // `source: 'App'` is spread last so it always wins over any caller-
  // supplied `source` key — every app-originated event must carry the same
  // source tag, not one overridable per call site.
  safeSmartechCall(() => SmartechBaseReact.trackEvent(eventName, { ...payload, source: 'App' }));
}

export function setScreenName(screenName: string): void {
  track('screen_view', { screenname: screenName });
}
