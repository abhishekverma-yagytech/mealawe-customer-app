import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconClock, IconMapPin, IconStar, IconUtensils, IconZap } from '@/components/ui/icons';
import { palette, shadow, useColors } from '@/theme';

import { offerBadgeText, speedTag } from '../pricing';
import type { OnDemandKitchen } from '../types';

const IMAGE_HEIGHT = 130;

interface OnDemandKitchenCardProps {
  kitchen: OnDemandKitchen;
  onPress: () => void;
}

/** Kitchen tile for the two-column vertical grid — photo with an offer ribbon
 * + rating pill (bottom-left) and a prep-time pill (bottom-right, same
 * overlay treatment) overlay, closed-state dimming, name + speciality +
 * distance/"Near & Fast" meta below (Zomato "recommended for you" card
 * shape). The whole tile is the tap target (no separate CTA button). Sized
 * by its parent grid column, not a fixed width, so it fills whichever column
 * width the grid gives it.
 *
 * Distance and the prep-time pill both read `speedTag`'s underlying fields
 * (`distance`/`preparationTime`) directly rather than reusing its combined
 * string, so the qualitative "Near & Fast" badge below only appears for
 * genuinely nearby kitchens — its "Ready in X min"/"X km away" fallback
 * text would otherwise duplicate the literal distance line and prep-time
 * pill this card now renders. */
export function OnDemandKitchenCard({ kitchen, onPress }: OnDemandKitchenCardProps) {
  const colors = useColors();
  const offerText = offerBadgeText(kitchen);
  const speed = speedTag(kitchen);
  const isNearFast = speed === 'Near & Fast';
  return (
    <Pressable
      onPress={onPress}
      disabled={!kitchen.kitchenOpened}
      accessibilityRole="button"
      style={[
        shadow.card,
        {
          width: '100%',
          // 18, not 16 — matches the design reference's kitchen-card radius.
          borderRadius: 18,
          overflow: 'hidden',
          opacity: kitchen.kitchenOpened ? 1 : 0.6,
          backgroundColor: colors.card,
        },
      ]}
      className="border border-border active:opacity-80">
      <View style={{ height: IMAGE_HEIGHT }}>
        {kitchen.imageUrl ? (
          <Image source={{ uri: kitchen.imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={[palette.accent.food, palette.brand.teal]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <IconUtensils size={28} color="#ffffff" strokeWidth={1.5} style={{ opacity: 0.9 }} />
          </LinearGradient>
        )}
        {kitchen.rating ? (
          <View
            className="absolute bottom-1.5 left-1.5 flex-row items-center gap-1 rounded-full px-1.5 py-0.5"
            style={{ backgroundColor: palette.accent.rating }}>
            <IconStar size={10} color="#ffffff" fill="#ffffff" />
            <AppText variant="caption" className="text-white">
              {kitchen.rating.toFixed(1)}
            </AppText>
          </View>
        ) : null}
        {typeof kitchen.preparationTime === 'number' ? (
          <View
            className="absolute bottom-1.5 right-1.5 flex-row items-center gap-1 rounded-full px-1.5 py-0.5"
            style={{ backgroundColor: palette.accent.info }}>
            <IconClock size={10} color="#ffffff" />
            <AppText variant="caption" className="text-white">
              {kitchen.preparationTime} min
            </AppText>
          </View>
        ) : null}
        {!kitchen.kitchenOpened ? (
          <View className="absolute inset-0 items-center justify-center bg-black/40">
            <AppText variant="caption" className="text-white">
              CLOSED
            </AppText>
          </View>
        ) : offerText ? (
          <View
            className="absolute inset-x-0 top-0 px-2 py-1.5"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <AppText variant="caption" className="font-metropolis-bold text-white" numberOfLines={1}>
              {offerText}
            </AppText>
          </View>
        ) : null}
      </View>

      <View className="gap-1 p-2.5">
        <AppText variant="label" className="text-foreground" numberOfLines={1}>
          {kitchen.kitchenName}
        </AppText>
        {kitchen.speciality ? (
          <AppText variant="caption" className="text-muted-foreground" numberOfLines={1}>
            {kitchen.speciality}
          </AppText>
        ) : null}
        {typeof kitchen.distance === 'number' || isNearFast ? (
          <View className="flex-row items-center gap-2">
            {typeof kitchen.distance === 'number' ? (
              <View className="flex-row items-center gap-1">
                <IconMapPin size={11} color={palette.neutral.gray500} />
                <AppText variant="caption" className="text-muted-foreground">
                  {kitchen.distance.toFixed(1)} km
                </AppText>
              </View>
            ) : null}
            {isNearFast ? (
              <View className="flex-row items-center gap-1">
                <IconZap size={12} color={palette.accent.info} fill={palette.accent.info} />
                <AppText variant="caption" style={{ color: palette.accent.info }} numberOfLines={1}>
                  {speed}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
