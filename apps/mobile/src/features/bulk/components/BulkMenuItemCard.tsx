import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { ItemAddButton } from '@/components/ui/ItemAddButton';
import { ItemDietMark } from '@/components/ui/ItemDietMark';
import { IconInfo, IconUtensils } from '@/components/ui/icons';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { accentTint, palette, shadow, useColors } from '@/theme';

import type { SlabNote, SlabRow } from '../pricing';
import type { BulkMenuItem } from '../types';

interface BulkMenuItemCardProps {
  item: BulkMenuItem;
  count: number;
  unitPrice: number;
  belowMoq: boolean;
  moq: number;
  /** The item's full slab-tier ladder (quantity breakpoint -> per-unit
   * price), pre-computed by the caller via `slabTableFor` — shown in the
   * info popover. */
  slabRows: SlabRow[];
  /** "slab price · was ₹X" / "from ₹X at N+ units" hint, pre-computed by
   * the caller via `slabNoteFor`. `null` when there's no genuinely cheaper
   * tier to mention. */
  slabNote: SlabNote | null;
  onIncrease: () => void;
  onDecrease: () => void;
}

const IMAGE_SIZE = 118;
/** How far the ADD/stepper control hangs below the image's bottom edge —
 * also reserved as the image column's own bottom margin so it doesn't
 * collide with the card's padding (Zomato/Swiggy's floating-control look). */
const OVERLAY_OVERHANG = 16;

/**
 * Name/price on the left, a large photo on the right with the ADD control
 * (or quantity stepper) floating over its bottom edge — same menu-row layout
 * as the On Demand item card. A distinct "ADD" button (not a stepper
 * starting at 0) shows until the item is in the cart — matches both
 * reference apps' pattern (MealaweUserApp's addB2BItemToCart / mealaweApp's
 * bulk-item-card add()), where the first tap jumps straight to the
 * category's MOQ rather than to 1.
 */
export function BulkMenuItemCard({
  item,
  count,
  unitPrice,
  belowMoq,
  moq,
  slabRows,
  slabNote,
  onIncrease,
  onDecrease,
}: BulkMenuItemCardProps) {
  const colors = useColors();
  // Only worth a popover when there's more than the current tier to show.
  const hasSlabInfo = slabRows.length > 1;
  const [showSlabs, setShowSlabs] = useState(false);

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
          <AppText variant="caption" className="text-muted-foreground" numberOfLines={2}>
            {item.itemDescription}
          </AppText>
        ) : null}
        <View className="mt-1 flex-row items-center gap-1.5">
          <AppText variant="body" className="text-foreground">
            ₹{unitPrice}/unit
          </AppText>
          {hasSlabInfo ? (
            <Pressable
              onPress={() => setShowSlabs((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel={`${item.itemName} slab pricing`}
              accessibilityState={{ expanded: showSlabs }}
              hitSlop={8}
              className="active:opacity-60">
              <IconInfo size={15} color={palette.accent.plan} />
            </Pressable>
          ) : null}
        </View>
        {slabNote ? (
          <AppText variant="caption" className="text-muted-foreground">
            {slabNote.discounted
              ? `slab price · was ₹${slabNote.basePrice}`
              : `from ₹${slabNote.nextPrice} at ${slabNote.nextThreshold}+ units`}
          </AppText>
        ) : null}
        {showSlabs ? (
          <View
            className="mt-1 rounded-xl border border-border p-2"
            style={{ backgroundColor: accentTint(palette.accent.plan, 0.08), gap: 3 }}>
            {slabRows.map((row) => (
              <View key={row.fromQty} className="flex-row items-center justify-between">
                <AppText variant="caption" className="text-muted-foreground">
                  {row.fromQty}+ units
                </AppText>
                <AppText variant="caption" className="text-foreground">
                  ₹{row.price}/unit
                </AppText>
              </View>
            ))}
          </View>
        ) : null}
        {belowMoq ? (
          <AppText variant="caption" className="text-danger">
            Minimum order quantity is {moq}
          </AppText>
        ) : null}
      </View>

      <View
        style={{
          width: IMAGE_SIZE,
          marginBottom: OVERLAY_OVERHANG,
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
          }}>
          {item.itemImage ? (
            <Image source={{ uri: item.itemImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <IconUtensils size={30} color={palette.accent.food} />
          )}
        </View>
        <View
          style={{ position: 'absolute', bottom: -OVERLAY_OVERHANG, left: 0, right: 0, alignItems: 'center' }}>
          {count > 0 ? (
            // Radius must match QuantityStepper's own `rounded-full` pill
            // exactly (44px-tall control → 22) — same fix as OnDemandItemCard.
            <View style={[shadow.card, { borderRadius: 22, backgroundColor: colors.card }]}>
              <QuantityStepper
                count={count}
                onIncrease={onIncrease}
                onDecrease={onDecrease}
                decreaseLabel={`Decrease ${item.itemName} quantity`}
                increaseLabel={`Increase ${item.itemName} quantity`}
                tone="plan"
              />
            </View>
          ) : (
            <ItemAddButton tone="plan" accessibilityLabel={`Add ${item.itemName}`} onPress={onIncrease} />
          )}
        </View>
      </View>
    </View>
  );
}
