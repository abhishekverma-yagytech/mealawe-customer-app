import { ScrollView, View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { IconCheckCircle, IconStar, IconUtensils } from '@/components/ui/icons';

interface TrustBadge {
  key: string;
  icon: typeof IconStar;
  tone: 'rating' | 'veg' | 'food';
  label: string;
}

const BADGES: TrustBadge[] = [
  { key: 'rating', icon: IconStar, tone: 'rating', label: '4.8 Rated' },
  { key: 'fssai', icon: IconCheckCircle, tone: 'veg', label: 'FSSAI Certified' },
  { key: 'fresh', icon: IconUtensils, tone: 'food', label: 'Freshly Prepared' },
];

/** Small trust-signal strip below the Total Bill card — a reassurance beat
 * right before checkout, matching the pill shape/spacing food-delivery apps
 * use for this. Horizontally scrollable so more badges can be added later
 * without a layout change. */
export function TrustBadgesRow() {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {BADGES.map((badge) => (
        <View
          key={badge.key}
          className="flex-row items-center rounded-full border border-border bg-card"
          style={{ gap: 6, paddingVertical: 8, paddingHorizontal: 12 }}
        >
          <AccentIcon icon={badge.icon} tone={badge.tone} bare size={14} />
          <AppText variant="caption" weight="bold" className="text-foreground">
            {badge.label}
          </AppText>
        </View>
      ))}
    </ScrollView>
  );
}
