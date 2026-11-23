import { Image } from 'expo-image';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconUtensils } from '@/components/ui/icons';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { accentTint, palette, shadow } from '@/theme';

import { isBelowMoq } from '../pricing';
import type { BulkCartLine, BulkOrgInfo } from '../types';

interface BulkCartLineItemProps {
  line: BulkCartLine;
  orgInfo: BulkOrgInfo | null;
  onIncrease: () => void;
  onDecrease: () => void;
}

/** One bulk-cart line: image/fallback tile, item name, quantity stepper, unit
 * price, and a below-MOQ warning — mirrors cart.tsx's subscription item-card
 * treatment (was text-only, no visual tile at all). */
export function BulkCartLineItem({ line, orgInfo, onIncrease, onDecrease }: BulkCartLineItemProps) {
  const belowMoq = orgInfo ? isBelowMoq(line.count, orgInfo) : false;
  return (
    <View style={shadow.card} className="flex-row gap-3 rounded-2xl border border-border bg-card p-3">
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: accentTint(palette.accent.food, 0.14),
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {line.item.itemImage ? (
          <Image source={{ uri: line.item.itemImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <IconUtensils size={20} color={palette.accent.food} />
        )}
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <AppText variant="label" className="flex-1 text-foreground">
            {line.item.itemName}
          </AppText>
          <QuantityStepper
            count={line.count}
            onIncrease={onIncrease}
            onDecrease={onDecrease}
            decreaseLabel={`Decrease ${line.item.itemName} quantity`}
            increaseLabel={`Increase ${line.item.itemName} quantity`}
            tone="plan"
          />
        </View>
        <AppText variant="bodySm" className="mt-1 text-muted-foreground">
          ₹{line.itemPrice}/unit · ₹{line.itemPrice * line.count}
        </AppText>
        {belowMoq ? (
          <AppText variant="caption" className="text-danger">
            Minimum order quantity is {orgInfo?.moq}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
