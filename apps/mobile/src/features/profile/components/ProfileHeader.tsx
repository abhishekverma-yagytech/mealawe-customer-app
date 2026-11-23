import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { IconArrowLeft, IconEdit, IconUser } from '@/components/ui/icons';
import type { CustomerProfile } from '@/features/auth/types';
import { palette } from '@/theme';

import { resolveProfileImage } from '../profileApi';

interface ProfileHeaderProps {
  profile: CustomerProfile | null;
  onEdit: () => void;
  /** When provided, renders a back row inside the gradient. */
  onBack?: () => void;
  /** Title shown next to the back arrow (e.g. "Profile"). */
  title?: string;
}

/**
 * Customer-details hero: avatar + name + phone + email on the brand gradient.
 * The gradient fills up through the status bar (safe-area top inset) so it
 * covers the very top of the screen.
 */
export function ProfileHeader({ profile, onEdit, onBack, title }: ProfileHeaderProps) {
  const insets = useSafeAreaInsets();
  const name = profile?.userName || 'Guest';
  const phone = profile?.phoneNo ? `+91-${profile.phoneNo}` : '';
  const email = profile?.email || '';
  const photoUri = resolveProfileImage(profile?.imageUrl);

  return (
    <LinearGradient
      // Deep indigo → teal ink: a premium, non-green header (green stays for CTAs).
      colors={['#2B2A4E', '#122A3A', palette.brand.teal]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 28 }}>
      {onBack && (
        <View className="mb-3 flex-row items-center gap-1">
          <Pressable
            onPress={onBack}
            hitSlop={10}
            className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <IconArrowLeft size={24} color="#ffffff" />
          </Pressable>
          {!!title && (
            <AppText variant="title" className="text-white">
              {title}
            </AppText>
          )}
        </View>
      )}
      <View className="flex-row items-center gap-4">
        <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white/20">
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={{ height: 64, width: 64 }} contentFit="cover" />
          ) : (
            <IconUser size={40} color="#ffffff" />
          )}
        </View>
        <View className="flex-1">
          <AppText variant="h2" className="text-white" numberOfLines={1}>
            {name}
          </AppText>
          {!!phone && (
            <AppText variant="bodySm" className="mt-0.5 text-white/90">
              {phone}
            </AppText>
          )}
          {!!email && (
            <AppText variant="bodySm" className="text-white/90" numberOfLines={1}>
              {email}
            </AppText>
          )}
        </View>
        <Pressable
          onPress={onEdit}
          hitSlop={10}
          className="h-10 w-10 items-center justify-center rounded-full bg-white/20 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="Edit profile">
          <IconEdit size={18} color="#ffffff" />
        </Pressable>
      </View>
    </LinearGradient>
  );
}
