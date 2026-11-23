import { View } from 'react-native';

import { AppText } from './AppText';
import { DietMark } from './DietMark';
import { useColors } from '@/theme';

interface ItemDietMarkProps {
  itemType: 'Veg' | 'NonVeg' | 'Jain';
  /** Forwarded to `DietMark` for the Veg/NonVeg cases. Ignored for Jain —
   * the text capsule sizes itself off `AppText`'s own smallest step. */
  size?: number;
}

/**
 * Per-menu-item diet indicator — `DietMark`'s veg circle / non-veg triangle
 * for 'Veg'/'NonVeg', or a small bordered "Jain" text capsule for 'Jain'.
 * Jain is a stricter *vegetarian* subtype (no onion/garlic/root veg, not a
 * meat distinction), not a third icon shape — ports the Ionic reference's
 * `item-card.component.html`, which never renders the veg/non-veg icon for
 * a Jain item, only this text badge (`.capsule`). Using plain `DietMark`
 * with a boolean `veg` for a Jain item (as both `OnDemandItemCard` and
 * `BulkMenuItemCard` used to) renders the non-veg triangle — wrong, and
 * worth fixing wherever an item can be Jain.
 */
export function ItemDietMark({ itemType, size = 14 }: ItemDietMarkProps) {
  const colors = useColors();
  if (itemType === 'Jain') {
    return (
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 3,
          paddingHorizontal: 5,
          paddingVertical: 1,
          alignSelf: 'flex-start',
        }}>
        <AppText variant="caption" className="text-muted-foreground">
          Jain
        </AppText>
      </View>
    );
  }
  return <DietMark veg={itemType === 'Veg'} size={size} />;
}
