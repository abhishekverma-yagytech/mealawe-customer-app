const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Smartech's push SDK (smartech-push-react-native) autolinks a native Android
 * module whose AAR references styles/dimens/a drawable that neither the SDK
 * nor smartech-push-expo-plugin actually provides — confirmed via a real
 * `expo prebuild` + `expo run:android` build spike (AAPT "resource not found"
 * at app:processDebugResources without these). Needed regardless of whether
 * Netcore's push features are actively exercised, since the native module
 * autolinks unconditionally once the JS package is installed.
 *
 * Values: the four `dp_N` dimens are self-describing Android convention
 * (name matches value — `dp_3` = 3dp) and are very likely exactly what the
 * SDK's internal notification layouts expect. The transparent-activity theme
 * trio and close icon are a standard Android pattern for an SDK's trampoline/
 * overlay activity (common across push SDKs) — reasonable, functional
 * defaults. If push notification visuals look wrong on a real device, check
 * Netcore's official Android integration guide for their exact recommended
 * values and update this plugin (not android/, which gets wiped on every
 * `expo prebuild --clean`).
 */
const STYLES_XML = `
    <style name="TransparentCompat" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="android:windowIsTranslucent">true</item>
        <item name="android:windowBackground">@android:color/transparent</item>
        <item name="android:windowContentOverlay">@null</item>
        <item name="android:windowNoTitle">true</item>
        <item name="android:windowIsFloating">true</item>
        <item name="android:backgroundDimEnabled">false</item>
    </style>
    <style name="TransparentCompatTheme" parent="TransparentCompat" />
    <style name="NotificationTheme" parent="Theme.AppCompat.Light.NoActionBar" />
`.trim();

const DIMENS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <dimen name="dp_3">3dp</dimen>
    <dimen name="dp_5">5dp</dimen>
    <dimen name="dp_7">7dp</dimen>
    <dimen name="dp_10">10dp</dimen>
</resources>
`;

const IC_SMT_CLOSE_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M19,6.41L17.59,5 12,10.59 6.41,5 5,6.41 10.59,12 5,17.59 6.41,19 12,13.41 17.59,19 19,17.59 13.41,12z"/>
</vector>
`;

function withSmartechPushAndroidResources(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const resDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res');
      const valuesStylesPath = path.join(resDir, 'values/styles.xml');
      const dimensPath = path.join(resDir, 'values/smt_push_dimens.xml');
      const drawableDir = path.join(resDir, 'drawable');
      const iconPath = path.join(drawableDir, 'ic_smt_close.xml');

      if (!fs.existsSync(valuesStylesPath)) {
        throw new Error(`withSmartechPushAndroidResources: ${valuesStylesPath} not found`);
      }
      let styles = fs.readFileSync(valuesStylesPath, 'utf8');
      if (!styles.includes('name="NotificationTheme"')) {
        if (!styles.includes('</resources>')) {
          throw new Error('withSmartechPushAndroidResources: could not find </resources> anchor in styles.xml');
        }
        styles = styles.replace('</resources>', `${STYLES_XML}\n</resources>`);
        fs.writeFileSync(valuesStylesPath, styles);
      }

      fs.writeFileSync(dimensPath, DIMENS_XML);

      fs.mkdirSync(drawableDir, { recursive: true });
      fs.writeFileSync(iconPath, IC_SMT_CLOSE_XML);

      return config;
    },
  ]);
}

module.exports = withSmartechPushAndroidResources;
