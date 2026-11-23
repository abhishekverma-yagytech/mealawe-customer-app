import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { DietMark } from '@/components/ui/DietMark';
import { IconGift, IconUtensils } from '@/components/ui/icons';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { accentTint, palette, shadow, useColors } from '@/theme';

import { loadFoodBoxVars } from '../foodBoxVars';
import { useBulkCartStore } from '../useBulkCartStore';
import type { BulkMenuItem, BulkMenuResponse } from '../types';

const BOX_ID = 'custom-foodbox';

interface CustomFoodBoxProps {
  menu: BulkMenuResponse;
}

/**
 * The Food Box "Customized" builder: pick items from a grouped grid, see a
 * live running price/count, and add the whole selection as one assembled
 * cart line. Distinct from the generic bulk item list used by every other
 * bulk category (and by Food Box's own "Individual"/predefined mode) —
 * ported from mealaweApp's CustomFoodboxComponent / MealaweUserApp's
 * FoodboxComponent "Customized" segment.
 */
export function CustomFoodBox({ menu }: CustomFoodBoxProps) {
  const colors = useColors();
  const cart = useBulkCartStore((s) => s.cart);
  const setCount = useBulkCartStore((s) => s.setCount);

  const [limit, setLimit] = useState(10);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadFoodBoxVars().then((vars) => setLimit(vars.limit));
  }, []);

  // The assembled box line, if this exact cart context already has one.
  const boxInCart = cart.category === 'foodbox' && cart.packaging === 'bulk';
  const boxCount = boxInCart ? cart.lines.find((l) => l.item._id === BOX_ID)?.count ?? 0 : 0;

  const groups = useMemo(() => {
    const byGroup = new Map<string, BulkMenuItem[]>();
    for (const item of menu.itemList) {
      const key = item.group ?? (item.isVeg ? 'Veg' : 'Non-Veg');
      byGroup.set(key, [...(byGroup.get(key) ?? []), item]);
    }
    return Array.from(byGroup.entries());
  }, [menu.itemList]);

  const selectedItems = useMemo(
    () => menu.itemList.filter((item) => (counts[item._id] ?? 0) > 0),
    [menu.itemList, counts],
  );
  const totalSelected = selectedItems.reduce((sum, item) => sum + (counts[item._id] ?? 0), 0);
  const boxPrice = selectedItems.reduce((sum, item) => sum + item.slab1Price * (counts[item._id] ?? 0), 0);
  const canAdd = totalSelected > 0;

  const setItemCount = (item: BulkMenuItem, count: number): void => {
    setCounts((prev) => ({ ...prev, [item._id]: Math.max(0, count) }));
  };

  const incItem = (item: BulkMenuItem): void => {
    if (totalSelected + 1 > limit) return;
    setItemCount(item, (counts[item._id] ?? 0) + 1);
  };

  const decItem = (item: BulkMenuItem): void => {
    setItemCount(item, (counts[item._id] ?? 0) - 1);
  };

  const assembleBox = (): BulkMenuItem => ({
    _id: BOX_ID,
    itemName: 'Customized Food Box',
    isVeg: selectedItems.every((item) => item.isVeg),
    itemType: selectedItems.every((item) => item.isVeg) ? 'Veg' : 'NonVeg',
    itemPrice: boxPrice,
    slab1Price: boxPrice,
    slab2Price: boxPrice,
    slab3Price: boxPrice,
    slab4Price: boxPrice,
  });

  const addBox = (): void => {
    if (!canAdd) return;
    setCount(assembleBox(), 'foodbox', 'bulk', menu, menu.moq || 1);
  };

  // Changing the NUMBER of boxes (not their contents) must never recompute
  // the box's price from `selectedItems` — if this component remounted with
  // a box already in the cart, local `counts` starts empty and `assembleBox`
  // would silently reprice the existing line to ₹0. Reuse the already-stored
  // line's item (and therefore its price) whenever one exists; only fall
  // back to `assembleBox()` for the very first box (no line yet, so there's
  // nothing to reuse — `canAdd`/`addBox` already covers that path).
  const boxLineItem = boxInCart ? cart.lines.find((l) => l.item._id === BOX_ID)?.item : undefined;

  const incBox = (): void => {
    if (!boxLineItem) return;
    setCount(boxLineItem, 'foodbox', 'bulk', menu, boxCount + 1);
  };

  const decBox = (): void => {
    if (!boxLineItem) return;
    setCount(boxLineItem, 'foodbox', 'bulk', menu, boxCount - 1);
  };

  return (
    <View style={{ gap: 16 }}>
      {/* Promo / running-total card */}
      <View
        style={[shadow.card, { borderRadius: 18, backgroundColor: colors.card }]}
        className="flex-row gap-3 border border-border p-4">
        <View className="flex-1" style={{ gap: 4 }}>
          <View className="flex-row items-center gap-2">
            <DietMark veg={selectedItems.every((i) => i.isVeg)} size={14} />
            <AppText variant="label" className="text-foreground">
              Customized Food Box
            </AppText>
          </View>
          {boxPrice > 0 ? (
            <AppText variant="h3" className="text-foreground">
              ₹{boxPrice} per box
            </AppText>
          ) : (
            <AppText variant="bodySm" className="text-muted-foreground">
              Add items to price your box
            </AppText>
          )}
          <AppText variant="caption" className="text-muted-foreground" numberOfLines={2}>
            {selectedItems.length
              ? selectedItems.map((i) => `${counts[i._id]} ${i.itemName}`).join(', ')
              : 'Nothing selected yet'}
          </AppText>
          <AppText variant="caption" className="text-muted-foreground">
            {totalSelected}/{limit} items
          </AppText>
          <View style={{ marginTop: 6 }}>
            {boxCount > 0 ? (
              <QuantityStepper
                count={boxCount}
                onIncrease={incBox}
                onDecrease={decBox}
                decreaseLabel="Decrease box count"
                increaseLabel="Increase box count"
                tone="plan"
              />
            ) : (
              <Button label="Add box" onPress={addBox} disabled={!canAdd} size="sm" tone="plan" />
            )}
          </View>
        </View>
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: 14,
            backgroundColor: accentTint(palette.accent.offer, canAdd ? 0.18 : 0.1),
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <IconGift size={38} color={palette.accent.offer} strokeWidth={canAdd ? 2 : 1.25} />
        </View>
      </View>

      <AppText variant="overline" className="text-muted-foreground">
        SELECT ITEMS
      </AppText>

      {groups.map(([groupName, items]) => (
        <View key={groupName} style={{ gap: 10 }}>
          <AppText variant="label" className="text-foreground">
            {groupName}
          </AppText>
          <View className="flex-row flex-wrap" style={{ gap: 10 }}>
            {items.map((item) => {
              const count = counts[item._id] ?? 0;
              const selected = count > 0;
              return (
                <View
                  key={item._id}
                  style={{
                    width: '31%',
                    borderRadius: 14,
                    overflow: 'hidden',
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? palette.accent.plan : colors.border,
                  }}>
                  <View
                    style={{
                      height: 84,
                      backgroundColor: accentTint(palette.accent.food, 0.14),
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {item.itemImage ? (
                      <Image source={{ uri: item.itemImage }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    ) : (
                      <IconUtensils size={22} color={palette.accent.food} />
                    )}
                  </View>
                  <View style={{ padding: 6, gap: 4, backgroundColor: colors.card }}>
                    <AppText variant="caption" className="text-foreground" numberOfLines={1}>
                      {item.itemName}
                    </AppText>
                    <AppText variant="caption" className="text-muted-foreground">
                      ₹{item.slab1Price}
                    </AppText>
                    {count > 0 ? (
                      <QuantityStepper
                        count={count}
                        onIncrease={() => incItem(item)}
                        onDecrease={() => decItem(item)}
                        decreaseLabel={`Decrease ${item.itemName} quantity`}
                        increaseLabel={`Increase ${item.itemName} quantity`}
                        tone="plan"
                      />
                    ) : (
                      <Pressable
                        onPress={() => incItem(item)}
                        accessibilityRole="button"
                        className="items-center rounded-full border py-1 active:opacity-70"
                        style={{ borderColor: palette.accent.plan }}>
                        <AppText variant="caption" style={{ color: palette.accent.plan }}>
                          Add
                        </AppText>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
