import { forwardRef, useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { BottomSheetView, type BottomSheetModal } from '@gorhom/bottom-sheet';

import { AppText } from '@/components/ui/AppText';
import { AppSheet } from '@/components/ui/AppSheet';
import { IconCheck, IconMoon, IconSun, IconSystem } from '@/components/ui/icons';
import { palette, accentTint, useColors } from '@/theme';
import { useThemeStore, type ThemePreference } from '@/store';

const OPTIONS: {
  key: ThemePreference;
  label: string;
  sub: string;
  icon: typeof IconSun;
  tone: string;
}[] = [
  { key: 'system', label: 'System default', sub: 'Match your device', icon: IconSystem, tone: palette.accent.info },
  { key: 'light', label: 'Light', sub: 'Bright & clean', icon: IconSun, tone: palette.accent.offer },
  { key: 'dark', label: 'Dark', sub: 'Easy on the eyes', icon: IconMoon, tone: palette.accent.plan },
];

/**
 * Appearance picker as a bottom sheet. A large preview icon reflects the active
 * mode and pops (scale + fade) whenever the preference changes, so switching
 * feels like the theme is "flipping".
 */
export const ThemeSheet = forwardRef<BottomSheetModal, { onClose?: () => void }>(
  ({ onClose }, ref) => {
    const insets = useSafeAreaInsets();
    const colors = useColors();
    const preference = useThemeStore((s) => s.preference);
    const setPreference = useThemeStore((s) => s.setPreference);

    const active = OPTIONS.find((o) => o.key === preference) ?? OPTIONS[0];
    const pop = useSharedValue(1);
    const reduced = useReducedMotion();

    useEffect(() => {
      if (reduced) {
        pop.value = 1; // no scale/rotate flourish; the icon just swaps
        return;
      }
      pop.value = 0;
      pop.value = withTiming(1, { duration: 380 });
    }, [preference, pop, reduced]);

    const previewStyle = useAnimatedStyle(() => ({
      opacity: 0.35 + pop.value * 0.65,
      transform: [{ scale: 0.7 + pop.value * 0.3 }, { rotate: `${(1 - pop.value) * -25}deg` }],
    }));

    const PreviewIcon = active.icon;

    return (
      <AppSheet ref={ref} onDismiss={onClose}>
        <BottomSheetView style={{ paddingBottom: insets.bottom + 24 }}>
          <AppText variant="h2" className="text-foreground px-5 pt-2">
            Appearance
          </AppText>

          {/* animated preview */}
          <View className="items-center py-5">
            <Animated.View
              style={[
                {
                  width: 84,
                  height: 84,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: accentTint(active.tone, 0.14),
                },
                previewStyle,
              ]}>
              <PreviewIcon size={40} color={active.tone} />
            </Animated.View>
          </View>

          <View className="px-5" style={{ gap: 10 }}>
            {OPTIONS.map(({ key, label, sub, icon: Icon, tone }) => {
              const selected = key === preference;
              return (
                <Pressable
                  key={key}
                  onPress={() => setPreference(key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  className="flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 active:opacity-80"
                  style={{
                    borderColor: selected ? palette.brand.green : colors.border,
                    backgroundColor: selected ? accentTint(palette.brand.green, 0.08) : colors.card,
                    borderWidth: selected ? 2 : 1,
                  }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: accentTint(tone),
                    }}>
                    <Icon size={20} color={tone} />
                  </View>
                  <View className="flex-1">
                    <AppText variant="label" className="text-foreground">
                      {label}
                    </AppText>
                    <AppText variant="caption" className="text-muted-foreground">
                      {sub}
                    </AppText>
                  </View>
                  {selected ? (
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: palette.brand.green,
                      }}>
                      <IconCheck size={14} color="#fff" strokeWidth={3} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </BottomSheetView>
      </AppSheet>
    );
  },
);

ThemeSheet.displayName = 'ThemeSheet';
