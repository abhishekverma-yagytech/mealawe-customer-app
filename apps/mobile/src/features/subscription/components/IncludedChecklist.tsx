import { useColorScheme, View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { mixHex, palette, shadow, useColors } from '@/theme';

import { iconForIncludedItem, toneForIncludedItem } from '../includedItemIcons';
import type { IncludedItem } from '../types';

interface IncludedChecklistProps {
  /** Category display name, slotted into the "What's Included in {name} ?" heading. */
  categoryName: string;
  items: readonly IncludedItem[];
}

/**
 * Soft mint card wrapping the "What's Included in {category} ?" heading and a
 * two-column list — each row led by a small semantic accent icon (from the
 * package's own `includedItems`) instead of a plain "•" marker. Self-contained
 * (no separate overline label above it, unlike the rest of the detail
 * screen's sections) since the heading lives inside the card itself.
 */
export function IncludedChecklist({ categoryName, items }: IncludedChecklistProps) {
  const colors = useColors();
  const scheme = useColorScheme();
  // Solid (not translucent) mint — this card overlaps the city banner image
  // above it on the detail screen, so a translucent tint would let the photo
  // show through and wreck legibility. Mixed from the theme's own `card`
  // color (never a hardcoded white — see `useColors`'s own warning) so it
  // starts from the right base per scheme. Dark mode skips the green mix
  // entirely and just uses the plain card surface, matching this app's dark
  // theme intentionally keeping elevated surfaces neutral (not tinted) —
  // see `darkColors` in `theme.ts`.
  const cardBg = scheme === 'dark' ? colors.card : mixHex(colors.card, palette.brand.green, 0.14);

  return (
    <View className="rounded-2xl p-4" style={[shadow.card, { backgroundColor: cardBg }]}>
      <AppText variant="label" className="text-foreground" style={{ marginBottom: 12 }}>
        What&apos;s Included in {categoryName} ?
      </AppText>
      <View className="flex-row flex-wrap justify-between" style={{ rowGap: 10 }}>
        {items.map((item, index) => (
          <View key={`${item.label}-${index}`} className="flex-row items-center gap-2" style={{ width: '48%' }}>
            <AccentIcon icon={iconForIncludedItem(item.icon)} tone={toneForIncludedItem(item.icon)} bare size={14} />
            <AppText variant="bodySm" className="text-foreground" style={{ flex: 1 }}>
              {item.label}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}
