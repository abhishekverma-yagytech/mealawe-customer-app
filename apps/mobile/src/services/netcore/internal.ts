/**
 * Shared internals for the `netcore` module — deliberately NOT re-exported
 * from `index.ts`. Every other feature imports this module's public API
 * (`initNetcore`, `identify`, `bridgeDeviceToken`, ...); these two helpers
 * are implementation details of `netcoreClient.ts` and `netcorePush.ts`
 * only, not something the rest of the app should reach for directly.
 */

/**
 * Netcore only fires outside dev builds — mirrors `crashlytics.ts`'s own
 * `!__DEV__` gate for the same reason (every Metro reload / local debugging
 * run would otherwise show up as noise on the live Netcore dashboard).
 * Deliberately NOT `env.production`: `environments.ts`'s `local` profile
 * sets `production: true`, so gating on that would still fire real events
 * from the most common local dev command (`npm start` / `start:local`).
 */
export function isTrackingEnabled(): boolean {
  return !__DEV__;
}

/**
 * Runs a Smartech SDK call (`SmartechBaseReact` or `SmartechPushReact`) and
 * swallows any synchronous throw (SDK not linked, malformed call, threading
 * issue) — Netcore tracking is non-essential, so a failure here must never
 * break the caller's own flow (e.g. the OTP-verify success path that calls
 * `identify`, or the push-notification pipeline that calls
 * `bridgeRemoteMessage`).
 */
export function safeSmartechCall(fn: () => void): void {
  try {
    fn();
  } catch {
    // Best-effort only — never propagate.
  }
}
