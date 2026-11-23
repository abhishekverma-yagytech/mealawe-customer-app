import { getApp } from '@react-native-firebase/app';
import {
  getCrashlytics,
  log,
  recordError,
  setCrashlyticsCollectionEnabled,
  setUserId,
} from '@react-native-firebase/crashlytics';

const crashlyticsInstance = getCrashlytics(getApp());

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Call once at app start (see `_layout.tsx`), same pattern as `initPush`.
 * Crash/non-fatal collection is off in dev builds — every Metro reload or
 * local debugging exception would otherwise show up in the Crashlytics
 * console as noise — and on for every built (preview/production) binary.
 *
 * Also installs a global JS error handler so an uncaught JS exception is
 * recorded as a non-fatal before React Native's own handler runs (shows the
 * red screen in dev, or otherwise crashes the app in production) — native
 * crashes are already captured automatically by the Crashlytics SDK without
 * any code here. See https://rnfirebase.io/crashlytics/usage#javascript-errors.
 */
export function initCrashlytics(): void {
  void setCrashlyticsCollectionEnabled(crashlyticsInstance, !__DEV__);

  const previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    recordError(crashlyticsInstance, toError(error), isFatal ? 'FatalJsError' : 'JsError');
    previousHandler(error, isFatal);
  });
}

/**
 * Attaches the signed-in customer to subsequent crash/error reports — call
 * on login and on cold-start re-hydration for an already-authenticated
 * session (mirrors `registerDeviceToken`'s two call sites). Pass `null` on
 * logout to detach so reports after sign-out aren't misattributed.
 */
export function setCrashlyticsUser(profileId: string | null): void {
  void setUserId(crashlyticsInstance, profileId ?? '');
}

/**
 * Records a non-fatal error to Crashlytics, with an optional breadcrumb log
 * line for context (shown alongside the error in the Crashlytics console).
 * Safe to call from any try/catch — never throws.
 */
export function recordCrashlyticsError(error: unknown, context?: string): void {
  if (context) {
    log(crashlyticsInstance, context);
  }
  recordError(crashlyticsInstance, toError(error));
}
