import { Image } from 'expo-image';
import { View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { ItemAddButton } from '@/components/ui/ItemAddButton';
import { ItemDietMark } from '@/components/ui/ItemDietMark';
import { IconClock, IconUtensils } from '@/components/ui/icons';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { accentTint, palette, shadow, useColors } from '@/theme';

import type { ItemStatus, OnDemandMenuItem } from '../types';

interface OnDemandItemCardProps {
  item: OnDemandMenuItem;
  count: number;
  status: ItemStatus;
  onIncrease: () => void;
  onDecrease: () => void;
}

const IMAGE_SIZE = 118;
/** How far the ADD/stepper control hangs below the image's bottom edge —
 * also reserved as the image column's own bottom margin so it doesn't
 * collide with the card's padding (Zomato/Swiggy's floating-control look). */
const OVERLAY_OVERHANG = 16;

const STATUS_LABEL: Record<Exclude<ItemStatus, 'available'>, string> = {
  missed: 'MISSED',
  'coming-next': 'COMING NEXT',
  'sold-out': 'SOLD OUT',
  'not-available': 'NOT AVAILABLE',
};

/** Item row: name/description/price on the left, a large photo on the right
 * with the ADD control (or quantity stepper) floating over its bottom edge —
 * the Zomato/Swiggy menu-row layout. Not orderable states (Missed/Coming
 * next/Sold out/Not available) dim the photo and show a status badge in
 * place of the control, instead of a plain-text badge. */
export function OnDemandItemCard({ item, count, status, onIncrease, onDecrease }: OnDemandItemCardProps) {
  const colors = useColors();
  const orderable = status === 'available';
  return (
    <View style={shadow.card} className="flex-row gap-3 rounded-2xl border border-border bg-card p-3">
      <View className="flex-1 justify-center" style={{ gap: 4 }}>
        <View className="flex-row items-start gap-2">
          <View className="mt-1">
            <ItemDietMark itemType={item.itemType} size={14} />
          </View>
          <AppText variant="label" className="flex-1 text-foreground" numberOfLines={2}>
            {item.itemName}
          </AppText>
        </View>
        {item.itemDescription ? (
          <AppText variant="caption" className="text-muted-foreground" numberOfLines={3}>
            {item.itemDescription}
          </AppText>
        ) : null}
        <AppText variant="body" className="mt-1 text-foreground">
          ₹{item.itemPrice}
        </AppText>
        {orderable && typeof item.preparationTime === 'number' ? (
          <View className="mt-1 flex-row items-center gap-1">
            <AccentIcon icon={IconClock} tone="info" bare size={12} />
            <AppText variant="caption" style={{ color: palette.accent.info }}>
              Ready in {item.preparationTime} min
            </AppText>
          </View>
        ) : null}
        {!orderable ? (
          <View
            className="mt-1 flex-row items-center gap-1"
            accessible
            accessibilityLabel={`${item.itemName}, ${STATUS_LABEL[status]}`}>
            <AccentIcon icon={IconClock} tone={status === 'coming-next' ? 'info' : 'nonveg'} bare size={13} />
            <AppText
              variant="caption"
              style={{ color: status === 'coming-next' ? palette.accent.info : palette.accent.nonveg }}>
              {STATUS_LABEL[status]}
            </AppText>
          </View>
        ) : null}
      </View>

      <View
        style={{
          width: IMAGE_SIZE,
          marginBottom: orderable ? OVERLAY_OVERHANG : 0,
          // Without this, the row's default align-items:stretch would grow
          // this column to match the (usually taller) text column, pushing
          // the overlay's `bottom` offset far past the image's actual edge.
          alignSelf: 'flex-start',
        }}>
        <View
          style={{
            width: IMAGE_SIZE,
            height: IMAGE_SIZE,
            borderRadius: 14,
            overflow: 'hidden',
            backgroundColor: accentTint(palette.accent.food, 0.14),
            alignItems: 'center',
            justifyContent: 'center',
            opacity: orderable ? 1 : 0.5,
          }}>
          {item.itemImage ? (
            <Image source={{ uri: item.itemImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <IconUtensils size={30} color={palette.accent.food} />
          )}
        </View>
        {orderable ? (
          <View
            style={{
              position: 'absolute',
              bottom: -OVERLAY_OVERHANG,
              left: 0,
              right: 0,
              alignItems: 'center',
            }}>
            {count > 0 ? (
              // Radius must match QuantityStepper's own `rounded-full` pill
              // exactly (44px-tall control → 22) — a mismatched radius here
              // left a faint rectangular corner peeking out from behind the
              // pill's rounded ends.
              <View style={[shadow.card, { borderRadius: 22, backgroundColor: colors.card }]}>
                <QuantityStepper
                  count={count}
                  onIncrease={onIncrease}
                  onDecrease={onDecrease}
                  decreaseLabel={`Decrease ${item.itemName} quantity`}
                  increaseLabel={`Increase ${item.itemName} quantity`}
                  tone="info"
                />
              </View>
            ) : (
              <ItemAddButton tone="info" accessibilityLabel={`Add ${item.itemName}`} onPress={onIncrease} />
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}
