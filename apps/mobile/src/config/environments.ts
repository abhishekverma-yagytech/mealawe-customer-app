/**
 * Per-environment configuration — ported from the Ionic app's
 * environment.ts / environment.staging.ts / environment.prod.ts.
 *
 * Select the active profile with the `EXPO_PUBLIC_ENV` variable
 * (`local` | `staging` | `production`). See `env.ts` + the `start:*` scripts.
 *
 * These are client-side keys already shipped in the store builds (same as the
 * Ionic app). Override any of them per build via EXPO_PUBLIC_* / EAS env.
 */
export type EnvName = 'local' | 'staging' | 'production';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

export interface AppEnvironment {
  production: boolean;
  envName: EnvName;
  withCredentials: boolean;
  serverUrl: string;
  imageUrl: string;
  videoUrl: string;
  firebaseConfig: FirebaseConfig;
  storeUrls: {
    playStore: string;
    appStore: string;
    oneLink: string;
  };
  mixPanelToken: string;
  paytm: {
    merchantId: string;
    callback: string;
  };
  juspay: {
    clientId: string;
    merchantId: string;
  };
  apiSecretKey: string;
  mealaweFingerprint: string;
  appName: string;
  appVersion: string;
  /** Google Maps / Places / Geocoding key (client-side; restrict by app id in console). */
  googleMapsApiKey: string;
  /** Netcore Smartech — reused as-is from the live Ionic app (MealaweUserApp) so
   * the RN rewrite continues the same user/event history in Netcore's dashboard. */
  netcore: {
    androidAppId: string;
    iosAppId: string;
    iosGroupIdentifier: string;
  };
}

// Values shared across every environment.
const firebaseConfig: FirebaseConfig = {
  apiKey: 'AIzaSyBd3_DKxM7DmTru0bI1a0Kh1YOZcE47WCI',
  authDomain: 'mymealawe.firebaseapp.com',
  projectId: 'mymealawe',
  storageBucket: 'mymealawe.appspot.com',
  messagingSenderId: '587646762370',
  appId: '1:587646762370:web:3dbe5f133fc3dcd998e39b',
  measurementId: 'G-KXKTFHE1KS',
};

const storeUrls = {
  playStore: 'https://play.google.com/store/apps/details?id=com.mealawe.app',
  appStore: 'https://itunes.apple.com/app/1602148451',
  oneLink: 'http://onelink.to/536q9d',
};

const juspay = { clientId: 'mealwe', merchantId: 'mealwe' };
const mealaweFingerprint =
  '41:2D:B8:A9:71:09:04:81:B4:84:A7:F3:B2:78:7B:8A:D8:BD:97:82:FB:CF:26:4E:C5:B1:30:9D:B3:21:AF:B5';
const appName = 'mealawe';
const appVersion = '1.7.8';
// Shared client-side Google Maps key (from MealaweUserApp's GoogleKeys pool —
// verified enabled for Maps SDK, legacy Places, and Geocoding). NOT the Firebase
// key (that one is REQUEST_DENIED for Maps). Override per build via
// EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.
const googleMapsApiKey = 'AIzaSyCtIAU1RAa32Y9at1VnmL-fa79AP0NPreQ';
// Netcore Smartech identity — reused as-is from MealaweUserApp (Ionic). Same
// value across every environment: Netcore's Ionic config doesn't vary by
// build environment either (values are hardcoded in AndroidManifest.xml /
// Info.plist there, not environment-specific).
const netcore = {
  androidAppId: '2699cd5e4ada21e96e3f481c8400a433',
  iosAppId: 'a6fe8c8cae98111daae5600714b4c50c',
  iosGroupIdentifier: 'group.com.mealawe.app',
};

function withDerived(
  base: Omit<AppEnvironment, 'imageUrl' | 'videoUrl'>,
): AppEnvironment {
  return {
    ...base,
    imageUrl: `${base.serverUrl}/images/`,
    videoUrl: `${base.serverUrl}/videos/`,
  };
}

// NOTE: for a physical device / emulator, `localhost` points at the device, not
// your dev machine — set EXPO_PUBLIC_API_URL to your LAN IP (e.g. 192.168.x.x).
// This default drifts whenever a developer's LAN IP changes (DHCP) — treat it
// as a convenience fallback, not a source of truth; override with
// EXPO_PUBLIC_API_URL rather than relying on this staying current.
const local = withDerived({
  production: true,
  envName: 'local',
  withCredentials: true,
  // serverUrl: 'http://localhost:5000',
  serverUrl: 'http://192.168.1.21:5000',
  firebaseConfig,
  storeUrls,
  mixPanelToken: '0809a73cf108c46656f5a5a213321e3f',
  paytm: {
    merchantId: 'CLIMBI33455635501584',
    callback: 'https://securegw-stage.paytm.in/theia/paytmCallback?ORDER_ID=',
  },
  juspay,
  // Must match MealaweServerApp's .env.development API_SECTET_KEY — every
  // request/response is AES-encrypted end-to-end keyed by this value
  // (httpClient.ts's encryptData/decryptData ↔ server's response-handler.js's
  // encryptLastware + decryptMiddleware). A mismatch doesn't fail loudly: the
  // app just can't decrypt what it gets back, which surfaces as a generic
  // network-looking error — indistinguishable from "can't reach the server"
  // even though the request/response round-trip is actually completing fine.
  // .env.development reuses the same key as staging, not production's.
  // apiSecretKey: 'fFwzsLH3ynmfXqSSY2KPlTdv0WjzZlFm',
  apiSecretKey: 'Xs7dRTbaqPkcxHp5WcriK8CHUnVXbWMg',
  mealaweFingerprint,
  appName,
  appVersion,
  googleMapsApiKey,
  netcore,
});

const staging = withDerived({
  production: false,
  envName: 'staging',
  withCredentials: true,
  serverUrl: 'http://mealawelbstaging-486868523.ap-southeast-1.elb.amazonaws.com:5000',
  firebaseConfig,
  storeUrls,
  mixPanelToken: '0809a73cf108c46656f5a5a213321e3f',
  paytm: {
    merchantId: 'CLIMBI33455635501584',
    callback: 'https://securegw-stage.paytm.in/theia/paytmCallback?ORDER_ID=',
  },
  juspay,
  apiSecretKey: 'fFwzsLH3ynmfXqSSY2KPlTdv0WjzZlFm',
  mealaweFingerprint,
  appName,
  appVersion,
  googleMapsApiKey,
  netcore,
});

const production = withDerived({
  production: true,
  envName: 'production',
  withCredentials: true,
  serverUrl: 'https://api.mealawe.com',
  firebaseConfig,
  storeUrls,
  mixPanelToken: 'fa9af996e8fc033260ba701189fe7fa5',
  paytm: {
    merchantId: 'CLIMBI19907092016325',
    callback: 'https://securegw.paytm.in/theia/paytmCallback?ORDER_ID=',
  },
  juspay,
  apiSecretKey: 'Xs7dRTbaqPkcxHp5WcriK8CHUnVXbWMg',
  mealaweFingerprint,
  appName,
  appVersion,
  googleMapsApiKey,
  netcore,
});

export const environments: Record<EnvName, AppEnvironment> = {
  local,
  staging,
  production,
};
