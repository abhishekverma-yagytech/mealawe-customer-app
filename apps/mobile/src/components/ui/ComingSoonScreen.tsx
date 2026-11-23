import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ComponentType } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { IconProps } from '@/components/ui/icons';
import { palette } from '@/theme';

interface ComingSoonScreenProps {
  title: string;
  icon: ComponentType<IconProps>;
  message: string;
}

/** Shared "not built yet" screen for a tab shortcut whose vertical hasn't
 * landed — keeps every placeholder (Navmool, Daily, Advance, …) consistent
 * instead of hand-rolling the same header + centered message per route. */
export function ComingSoonScreen({ title, icon: Icon, message }: ComingSoonScreenProps) {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title }} />
      <StatusBar style="dark" />
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <Icon size={40} color={palette.brand.green} />
        <AppText variant="h3" className="text-center text-foreground">
          {title} — coming soon
        </AppText>
        <AppText variant="body" className="text-center text-muted-foreground">
          {message}
        </AppText>
      </View>
    </View>
  );
}
