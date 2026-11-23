import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconMoon, IconSun, IconSystem } from '@/components/ui/icons';
import { palette } from '@/theme';
import { useThemeStore, type ThemePreference } from '@/store';

const OPTIONS: { key: ThemePreference; label: string; icon: typeof IconSun }[] = [
  { key: 'system', label: 'System', icon: IconSystem },
  { key: 'light', label: 'Light', icon: IconSun },
  { key: 'dark', label: 'Dark', icon: IconMoon },
];

/** Segmented theme picker: System / Light / Dark. Persists via the theme store. */
export function ThemeSelector() {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  return (
    <View>
      <AppText variant="overline" className="mb-2 text-muted-foreground">
        Appearance
      </AppText>
      <View className="flex-row gap-2 rounded-2xl border border-border bg-card p-1.5">
        {OPTIONS.map(({ key, label, icon: Icon }) => {
          const active = key === preference;
          return (
            <Pressable
              key={key}
              onPress={() => setPreference(key)}
              className={
                active
                  ? 'flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 active:opacity-90'
                  : 'flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2.5 active:opacity-70'
              }
              accessibilityRole="button"
              accessibilityState={{ selected: active }}>
              <Icon size={16} color={active ? palette.neutral.white : palette.neutral.gray600} />
              <AppText
                variant="label"
                className={active ? 'text-primary-foreground' : 'text-muted-foreground'}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
