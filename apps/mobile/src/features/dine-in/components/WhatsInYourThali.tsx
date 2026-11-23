import { Image } from 'expo-image';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';

interface ThaliItem {
  label: string;
  image: number;
}

/** Exact colors from the reference design — a warm cream/gold pairing
 * distinct from the app's neutral `colors.card`/`colors.border` tokens. */
const PILL_BACKGROUND = '#FAF7F2';
const PILL_BORDER = '#FFE9BF';

/** Kota's dine-in thali composition — fixed across every Kota package (one
 * venue, one thali), same "representative enough to summarize once" premise
 * `DineInHome`'s old `includedDescription` line used, but as a real visual
 * grid instead of a single sentence. Swap the image/label pairs here if
 * Kota's thali composition ever changes — no dashboard config for this,
 * matching `DineInPlanBanner`'s own "just replace the asset" simplicity. */
const THALI_ITEMS: ThaliItem[] = [
  { label: '3 Chapati / Roti', image: require('@/assets/images/subscription/thali-item-roti.png') },
  { label: '2 Veg Curry / Dry', image: require('@/assets/images/subscription/thali-item-curry.png') },
  { label: '1 Dal', image: require('@/assets/images/subscription/thali-item-dal.png') },
  { label: '1 Steam Rice', image: require('@/assets/images/subscription/thali-item-rice.png') },
  { label: 'Cut Salad', image: require('@/assets/images/subscription/thali-item-salad.png') },
  { label: 'Sweet twice a week', image: require('@/assets/images/subscription/thali-item-sweet.png') },
];

/**
 * "What's in your thali" — a 3×2 grid of the dine-in thali's fixed
 * components (icon + count/name), replacing a single "what's included"
 * sentence with something that actually reads at a glance. Kota-only (see
 * `DineInHome`'s `isKota` gate) since it depicts Kota's specific thali
 * composition, not a generic one every cluster's dine-in packages share.
 */
export function WhatsInYourThali() {
  return (
    <View style={{ gap: 12 }}>
      {/* Same size/weight as DineInHome's "Choose your plan" heading right
          below this section, so the two read as equal-weight section
          titles, not a subheading under a heading. */}
      <AppText variant="h2" className="text-foreground">
        What&apos;s in your thali
      </AppText>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {THALI_ITEMS.map((item) => (
          <View
            key={item.label}
            className="flex-row items-center rounded-xl border p-2"
            style={{
              width: '31.5%',
              gap: 6,
              borderColor: PILL_BORDER,
              backgroundColor: PILL_BACKGROUND,
            }}>
            <Image source={item.image} style={{ width: 30, height: 30 }} contentFit="contain" />
            <AppText variant="caption" className="flex-1 text-foreground" numberOfLines={2}>
              {item.label}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}
