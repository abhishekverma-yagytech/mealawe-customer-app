import '@/bootstrap/platform';
import '@/bootstrap/session';
import '@/bootstrap/core';
import '@/global.css';

import { useFonts } from 'expo-font';
import { NavigationBar } from 'expo-navigation-bar';
import { Observe, ObserveRoot, useObserve } from 'expo-observe';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, StatusBar as RNStatusBar, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { validateEnv } from '@/config';
import { LocationPermissionGate } from '@/features/location';
import { BiometricGate } from '@/features/security';
import { SplashAnimationOverlay } from '@/features/splash';
import { initLiveActivityPushTokenForwarding, registerBackgroundOrderRefreshAsync } from '@/features/tracking';
import { initCrashlytics, setCrashlyticsUser } from '@/services/crashlytics';
import { initNetcore, identify as identifyNetcore } from '@/services/netcore';
import { initJusPay } from '@/services/payment';
import { requestTrackingPermission } from '@/services/privacy';
import { initPush, registerBackgroundHandler, registerDeviceToken } from '@/services/push';
import { clearStaleSessionOnFreshInstall, initStores, useAuthStore, useClusterStore, useLocationStore } from '@/store';
import { metropolisFontMap, navigationDarkTheme, navigationLightTheme } from '@/theme';

// Imported for its module-scope `TaskManager.defineTask` side effect — must
// run before the React tree mounts, same reasoning as the FCM background
// handler below (the OS can relaunch the JS bundle headless for a
// background wake, and the task has to already be defined when it does).
import '@/features/tracking/backgroundOrderRefreshTask';

// Re-exported so Expo Router picks it up by its exact name — see
// ErrorBoundary.tsx's own comment for why this, not a hand-rolled class
// component, is the app-wide crash-safety net: no error boundary existed
// anywhere in this app before this, so any render-time exception in ANY
// screen was a hard crash with no graceful recovery.
export { ErrorBoundary } from '@/components/ui/ErrorBoundary';

SplashScreen.preventAutoHideAsync();
// EAS Observe (startup/navigation performance) — Expo Router integration
// gives per-screen render metrics (cold/warm TTR, TTI) for free once
// `markInteractive()` is called below.
Observe.configure({ integrations: { 'expo-router': true } });
validateEnv();
initStores();
// Must run before the React tree mounts — RNFB's background handler and
// notifee's background tap listener are only reliably wired up when
// registered at module scope, not inside a component effect.
registerBackgroundHandler();
initPush();
// Must resolve — and the system prompt must actually appear — before
// Netcore (Smartech) touches the advertising ID. See this function's own
// doc comment (App Store Review Guideline 5.1.2(i)).
void requestTrackingPermission().finally(() => {
  initNetcore();
});
initLiveActivityPushTokenForwarding();
initCrashlytics();
void registerBackgroundOrderRefreshAsync();

// Belt-and-suspenders alongside the ErrorBoundary above: that only catches
// RENDER-time exceptions (React's error boundary contract) — a rejected
// promise nobody awaited/caught (a missed `.catch()`, same bug class as the
// earlier-session "Fetch request has been canceled" incident) throws
// asynchronously instead, which no React error boundary ever sees. This is
// the one global catch-all for THAT class of bug — logs instead of letting
// it either crash silently in production or spam a dev-only redbox with no
// app-level trace of it having happened.
if (typeof ErrorUtils !== 'undefined') {
  const previousHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error('[GlobalErrorHandler]', isFatal ? 'FATAL' : 'non-fatal', error);
    previousHandler?.(error, isFatal);
  });
}

function RootLayout() {
  const scheme = useColorScheme();
  const hydrate = useAuthStore((state) => state.hydrate);
  const [fontsLoaded] = useFonts(metropolisFontMap);
  const { markInteractive } = useObserve();
  const [hydrated, setHydrated] = useState(false);
  const [splashAnimationDone, setSplashAnimationDone] = useState(false);

  // Hide the NATIVE (static-image) splash the moment the animation handoff
  // overlay is ready to paint — its background exactly matches the native
  // splash's `#30B34A`, so the swap is invisible. No longer gated on
  // `hydrate` finishing: that work now runs underneath the animation instead
  // of blocking the native splash from coming down at all.
  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    if (!fontsLoaded) {
      return;
    }
    // Must resolve before `hydrate()` reads secure storage — see its own
    // doc comment (iOS Keychain otherwise survives an uninstall and
    // `hydrate()` would restore the very session this is meant to clear).
    clearStaleSessionOnFreshInstall().finally(() => {
      hydrate().finally(() => {
        // Seed the delivery location from local storage + the hydrated profile,
        // then refresh serviceable-cluster detection for that address.
        useLocationStore.getState().hydrate();
        const current = useLocationStore.getState().current;
        if (current?.geolocation) {
          void useClusterStore.getState().detectClusters(current.geolocation);
        }
        // Re-register the (possibly rotated) FCM token on every cold start for
        // an already-logged-in user — mirrors the Ionic app's
        // `app.component.ts#routeConditions()`, which does the same on launch
        // rather than relying solely on the one-time post-login registration.
        const { isAuthenticated, profile } = useAuthStore.getState();
        if (isAuthenticated && profile) {
          void registerDeviceToken(profile._id);
          setCrashlyticsUser(profile._id);
          identifyNetcore(profile.phoneNo);
        }
        setHydrated(true);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrate, fontsLoaded]);

  // The true "interactive" moment: both the boot hydrate work AND the splash
  // animation handoff have finished — this is when the user can actually see
  // and use the app, not just when the native splash came down.
  useEffect(() => {
    if (!hydrated || !splashAnimationDone) {
      return;
    }
    // Marks Observe's time-to-interactive metric right as the splash
    // animation overlay comes down — the "ready" moment users actually
    // experience.
    markInteractive();
    // Boots the JusPay HyperSDK (preFetch/createHyperServices/initiate) —
    // deliberately deferred until after the splash comes down rather than
    // run at module scope before the React tree even renders. The native
    // splash screen (Android 12+'s SplashScreen API) runs its own
    // ObjectAnimator-driven exit animation; calling into HyperSDK's native
    // view setup while that's still in flight raced the two against the
    // same Activity's view hierarchy and produced a
    // `ReflectiveProperty.set: null receiver` crash (an animator's target
    // view torn down mid-frame). The user still has to navigate through
    // several screens before reaching checkout, so there's no downside to
    // pre-warming a moment later instead of before first paint.
    initJusPay();
    // `markInteractive` deliberately excluded — expo-observe's implementation
    // (useObserveForRouter) re-derives it on every route change across the
    // WHOLE app (it depends on the current pathname/route params), since
    // this hook is called at the root. Including it here would refire this
    // effect on every navigation once `hydrated`/`splashAnimationDone` are
    // already both true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, splashAnimationDone]);

  // Draw content behind a transparent status bar on Android (this build is not
  // edge-to-edge by default, so content would otherwise be inset with a white bar).
  useEffect(() => {
    if (Platform.OS === 'android') {
      RNStatusBar.setTranslucent(true);
      RNStatusBar.setBackgroundColor('transparent');
    }
  }, []);

  // Hold the native splash until the brand font is ready so text doesn't flash in
  // the system font first. Placed AFTER all hooks so hook order stays stable.
  if (!fontsLoaded) {
    return null;
  }

  const mode = scheme === 'dark' ? 'dark' : 'light';

  return (
    <GluestackUIProvider mode={mode}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <SafeAreaProvider>
            <BottomSheetModalProvider>
              <ThemeProvider
                value={scheme === 'dark' ? navigationDarkTheme : navigationLightTheme}>
                <StatusBar style="auto" />
                <NavigationBar style="auto" />
                <Stack
                  screenOptions={{ headerShown: false, headerBackButtonDisplayMode: 'minimal' }}
                />
                <BiometricGate />
                <LocationPermissionGate />
              </ThemeProvider>
            </BottomSheetModalProvider>
          </SafeAreaProvider>
        </KeyboardProvider>
        {/* The animation handoff from the native splash — sits on top of
            everything above (later JSX siblings stack on top in RN) until
            it finishes, at which point it unmounts and reveals the app. */}
        {!splashAnimationDone ? (
          <SplashAnimationOverlay onFinished={() => setSplashAnimationDone(true)} />
        ) : null}
      </GestureHandlerRootView>
    </GluestackUIProvider>
  );
}

export default ObserveRoot.wrap(RootLayout);
