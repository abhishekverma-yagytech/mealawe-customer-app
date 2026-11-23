import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import {
  IconChevronDown,
  IconCoins,
  IconMapPin,
  IconUser,
} from '@/components/ui/icons';
import { useColors } from '@/theme';

interface HomeHeaderProps {
  /** Short delivery-address label, e.g. "Home · Kothrud". */
  addressLabel: string;
  /** Cashback points pill. Hidden when not logged in. */
  cashback?: number | string;
  loggedIn?: boolean;
  /** True once the hero has fully collapsed and its backdrop has faded to a
   * solid card color — flips from white-on-hero to dark-on-card so text and
   * icons stay legible against the (no longer video) background. */
  solid?: boolean;
  /** Resolved profile photo URL (via `resolveProfileImage`) — falls back to
   * the generic user icon when the customer hasn't added a photo. */
  photoUri?: string;
  onPressAddress: () => void;
  onPressCashback: () => void;
  onPressProfile: () => void;
}

/**
 * Home top bar, floating over the hero: delivery address on the left (tap to
 * change), cashback points + profile on the right. White-on-hero by default;
 * switches to dark-on-card once `solid` (see `useScrollSolidHeader`).
 * Mirrors mealaweApp's `home__header`.
 */
export function HomeHeader({
  addressLabel,
  cashback = 0,
  loggedIn = false,
  solid = false,
  photoUri,
  onPressAddress,
  onPressCashback,
  onPressProfile,
}: HomeHeaderProps) {
  const colors = useColors();
  const iconColor = solid ? colors.foreground : '#ffffff';
  const pillClassName = solid ? 'bg-muted' : 'bg-white/20';

  return (
    <View className="flex-row items-center justify-between px-4 py-2">
      {/* Address (left) */}
      <Pressable
        onPress={onPressAddress}
        className="flex-1 active:opacity-70"
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Change delivery address">
        <View className="flex-row items-center gap-1">
          <IconMapPin size={15} color={iconColor} />
          <AppText variant="overline" className={solid ? 'text-muted-foreground' : 'text-white/90'}>
            Delivered to
          </AppText>
          <IconChevronDown size={14} color={iconColor} />
        </View>
        <AppText variant="title" className={solid ? 'text-foreground' : 'text-white'} numberOfLines={1}>
          {addressLabel}
        </AppText>
      </Pressable>

      {/* Actions (right) */}
      <View className="flex-row items-center gap-2 pl-3">
        {loggedIn && (
          <Pressable
            onPress={onPressCashback}
            className={`flex-row items-center gap-1 rounded-full px-2.5 py-1.5 active:opacity-70 ${pillClassName}`}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cashback points">
            <IconCoins size={16} color={iconColor} />
            <AppText variant="label" className={solid ? 'text-foreground' : 'text-white'}>
              ₹{cashback}
            </AppText>
          </Pressable>
        )}
        <Pressable
          onPress={onPressProfile}
          className={`h-10 w-10 items-center justify-center overflow-hidden rounded-full active:opacity-70 ${pillClassName}`}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Open profile">
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={{ height: 40, width: 40 }} contentFit="cover" />
          ) : (
            <IconUser size={22} color={iconColor} />
          )}
        </Pressable>
      </View>
    </View>
  );
}
