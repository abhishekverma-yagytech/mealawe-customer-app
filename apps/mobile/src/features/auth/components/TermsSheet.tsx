import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheetScrollView, type BottomSheetModal } from '@gorhom/bottom-sheet';

import { AppSheet } from '@/components/ui/AppSheet';
import { AppText } from '@/components/ui/AppText';
import { IconClose } from '@/components/ui/icons';
import { useColors } from '@/theme';

import { TERMS_SECTIONS } from './termsContent';

const SNAP_POINTS = ['92%'];

export interface TermsSheetHandle {
  present: () => void;
}

/**
 * Terms & Conditions as an in-app sheet, rendering copy bundled with the app
 * (see `termsContent.ts`) instead of loading `mealawe.com/terms` in a
 * WebView. The live page is a heavy WordPress/Divi page carrying third-party
 * Cloudflare Turnstile + reCAPTCHA scripts for an unrelated contact form on
 * the same page — WebView's load-complete signals never reliably fired for
 * it (confirmed: sheet opened but the content area stayed blank/spinner-stuck),
 * and an earlier attempt to load it via injected static HTML instead of live
 * `uri` navigation was already tried and reverted for the same reason. A
 * native render sidesteps the problem entirely: instant, no network
 * dependency, 100% reliable. Trade-off: legal-copy edits now need an app
 * release instead of being editable server-side.
 */
export const TermsSheet = forwardRef<TermsSheetHandle, object>(function TermsSheet(_props, ref) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const sheetRef = useRef<BottomSheetModal>(null);

  useImperativeHandle(ref, () => ({
    present: () => {
      sheetRef.current?.present();
    },
  }));

  return (
    <AppSheet ref={sheetRef} snapPoints={SNAP_POINTS}>
      <View className="flex-row items-center justify-between px-5 pb-3 pt-1">
        <AppText variant="h3" className="text-foreground">
          Terms &amp; Conditions
        </AppText>
        <Pressable
          onPress={() => sheetRef.current?.dismiss()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          className="h-8 w-8 items-center justify-center rounded-full active:opacity-70"
          style={{ backgroundColor: colors.muted }}>
          <IconClose size={16} color={colors.foreground} />
        </Pressable>
      </View>

      <BottomSheetScrollView
        contentContainerStyle={{ paddingHorizontal: 20, gap: 16, paddingBottom: insets.bottom + 32 }}>
        {TERMS_SECTIONS.map((section) => (
          <View key={section.heading} style={{ gap: 8 }}>
            <AppText variant="label" weight="bold" className="text-foreground">
              {section.heading}
            </AppText>
            {section.paragraphs.map((p, i) => (
              <AppText key={i} variant="bodySm" className="text-muted-foreground">
                {p}
              </AppText>
            ))}
          </View>
        ))}
      </BottomSheetScrollView>
    </AppSheet>
  );
});
