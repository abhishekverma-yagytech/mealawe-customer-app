import * as TrackingTransparency from 'expo-tracking-transparency';
import { Platform } from 'react-native';

/**
 * Apple's App Tracking Transparency gate (iOS only — Android has no
 * equivalent system prompt). Must resolve before anything in the app
 * collects data used for tracking, per App Store Review Guideline 5.1.2(i):
 * this app's privacy declaration lists Advertising Data among its collected
 * types, sourced from Netcore Smartech's advertising-ID usage (`useAdvID` in
 * app.json, baked into Info.plist as `SmartechUseAdvId`) — but nothing
 * previously called this API, so the required permission prompt never
 * appeared, and Apple rejected the build on exactly that basis.
 *
 * iOS itself won't hand a real IDFA to any SDK until this is granted
 * regardless of call order, but Review additionally checks that the prompt
 * itself actually appears — `_layout.tsx` awaits this before `initNetcore()`
 * so there's no ambiguity about sequencing for a reviewer testing the app.
 * Best-effort: a permission-request failure must never block app boot.
 */
export async function requestTrackingPermission(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await TrackingTransparency.requestTrackingPermissionsAsync();
  } catch {
    // Best-effort only — never block boot on this.
  }
}
