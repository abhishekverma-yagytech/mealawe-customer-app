import { useRef, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { RefreshCw, WifiOff } from 'lucide-react-native';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useScreenTracking } from '@/services/netcore';
import { palette } from '@/theme';

const NAVMOOL_URL = 'https://navmool.com/';
const NAVMOOL_HOST_PATTERN = /^https?:\/\/([a-z0-9-]+\.)*navmool\.com(\/|$|\?)/i;

/** Navmool (grocery marketplace) — embedded as a WebView until the native port lands.
 * No Netcore commerce events (add_to_cart/purchase/etc.) fire for marketplace
 * orders: all cart/checkout happens inside navmool.com's own JS, invisible to
 * this WebView. If a `postMessage`/`injectedJavaScript` bridge is ever added
 * here, wire it to `src/services/netcore/events.ts`'s trackers at that point —
 * see the design spec's "Known gaps" section for the full reasoning. */
export default function MarketplaceScreen() {
  useScreenTracking('marketplace');

  const insets = useSafeAreaInsets();
  const webviewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  function retry() {
    setFailed(false);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Navmool' }} />
      <StatusBar style="dark" />

      {failed ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <WifiOff size={40} color={palette.neutral.gray500} />
          <AppText variant="h3" className="text-center text-foreground">
            Couldn&apos;t load Navmool
          </AppText>
          <AppText variant="body" className="text-center text-muted-foreground">
            Check your connection and try again.
          </AppText>
          <Button
            label="Try again"
            variant="primary"
            leftIcon={<RefreshCw size={16} color="#fff" />}
            onPress={retry}
          />
        </View>
      ) : (
        <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
          <WebView
            key={reloadKey}
            ref={webviewRef}
            source={{ uri: NAVMOOL_URL }}
            style={{ flex: 1 }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
            onHttpError={() => {
              setLoading(false);
              setFailed(true);
            }}
            onNavigationStateChange={(nav: WebViewNavigation) => {
              // Guard against a redirect off-domain hijacking the in-app browser.
              if (!NAVMOOL_HOST_PATTERN.test(nav.url) && !nav.loading) {
                WebBrowser.openBrowserAsync(nav.url).catch(() => {});
                webviewRef.current?.stopLoading();
              }
            }}
            startInLoadingState={false}
            javaScriptEnabled
            domStorageEnabled
          />
          {loading ? (
            <View className="absolute inset-0 items-center justify-center bg-background">
              <ActivityIndicator size="large" color={palette.brand.green} />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
