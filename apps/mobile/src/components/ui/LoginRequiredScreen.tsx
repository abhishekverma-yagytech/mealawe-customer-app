import { StatusBar } from 'expo-status-bar';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { IconArrowLeft } from './icons';

interface LoginRequiredScreenProps {
  headerTitle: string;
  message: string;
  onBack: () => void;
  onLogin: () => void;
  page: string;
  ink: string;
  border: string;
}

export function LoginRequiredScreen({ headerTitle, message, onBack, onLogin, page, ink, border }: LoginRequiredScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1" style={{ backgroundColor: page }}>
      <StatusBar style="dark" />
      <View className="flex-row items-center gap-3 px-4 pb-3" style={{ paddingTop: insets.top + 10 }}>
        <Pressable onPress={onBack} className="h-9 w-9 items-center justify-center rounded-2xl" style={{ borderWidth: 1, borderColor: border }}>
          <IconArrowLeft size={18} color={ink} />
        </Pressable>
        <AppText variant="h3" style={{ color: ink, flex: 1 }}>
          {headerTitle}
        </AppText>
      </View>
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <AppText variant="h3" style={{ color: ink, textAlign: 'center' }}>
          {message}
        </AppText>
        <Pressable onPress={onLogin} className="rounded-2xl bg-primary px-6 py-3 active:opacity-80">
          <AppText variant="label" className="text-primary-foreground">
            Login
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
