import LottieView from 'lottie-react-native';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

/**
 * Promo banner above the plan grid (e.g. "30 Meal Days, anytime within 45
 * days") — currently a blank placeholder (no layers), matching the same
 * "drop the real animation in under this exact filename, no code change
 * needed" convention `homeLotties.ts`/its README already establish for the
 * Home hero. Deliberately its own small Lottie, not routed through
 * `LottieHero`/`homeLotties.ts` — that registry is a full-bleed, tab-keyed,
 * auto-advancing carousel behind the collapsing header; this is a single
 * static banner sitting inline in the plan grid's own scroll content, a
 * different composition entirely.
 */
const PLAN_BANNER_SOURCE = require('@/assets/lottie/DineInPlanBanner.json');

/** Matches the reference design's banner proportions (wide, short). Swap
 * alongside the animation file above if the real asset's aspect differs. */
const ASPECT_RATIO = 2.5;

export function DineInPlanBanner() {
  return (
    <View style={{ width: '100%', aspectRatio: ASPECT_RATIO, borderRadius: 18, overflow: 'hidden' }}>
      <LottieView
        source={PLAN_BANNER_SOURCE as unknown as ComponentProps<typeof LottieView>['source']}
        autoPlay
        loop
        resizeMode="cover"
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}
