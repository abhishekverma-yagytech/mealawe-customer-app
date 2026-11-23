import { View } from 'react-native';
import { Image } from 'expo-image';

import { AppText } from '@/components/ui/AppText';
import { IconStar } from '@/components/ui/icons';
import { palette, accentTint } from '@/theme';

import type { Testimonial } from '../testimonials';

const STAR_COUNT = 5;
const CARD_WIDTH = 260;
const AVATAR_SIZE = 40;

interface TestimonialCardProps {
  testimonial: Testimonial;
}

/**
 * Customer testimonial card for the Home screen social-proof carousel —
 * profile photo (falls back to an avatar-initial circle when `image` is
 * absent), name + place, a 5-star row (reuses the `IconStar` +
 * `palette.accent.rating` "Rating Gold" convention from `on-demand-kitchen.tsx`'s
 * header rating, filled up to `stars`), and the quote. Fixed width — meant to
 * sit in a horizontally-scrolling row.
 */
export function TestimonialCard({ testimonial }: TestimonialCardProps) {
  const initial = testimonial.name.trim().charAt(0).toUpperCase();
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4" style={{ width: CARD_WIDTH }}>
      <View className="flex-row items-center gap-3">
        {testimonial.image ? (
          <Image
            source={testimonial.image}
            style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: AVATAR_SIZE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: accentTint(palette.brand.green, 0.16),
            }}>
            <AppText variant="label" style={{ color: palette.brand.greenDark }}>
              {initial}
            </AppText>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <AppText variant="label" className="text-foreground" numberOfLines={1}>
            {testimonial.name}
          </AppText>
          <AppText variant="caption" className="text-muted-foreground" numberOfLines={1}>
            {testimonial.place}
          </AppText>
        </View>
      </View>

      <View className="flex-row items-center gap-0.5">
        {Array.from({ length: STAR_COUNT }, (_, i) => (
          <IconStar
            key={i}
            size={13}
            color={palette.accent.rating}
            fill={i < testimonial.stars ? palette.accent.rating : 'none'}
          />
        ))}
      </View>

      <AppText variant="bodySm" className="text-muted-foreground">
        &quot;{testimonial.quote}&quot;
      </AppText>
    </View>
  );
}
