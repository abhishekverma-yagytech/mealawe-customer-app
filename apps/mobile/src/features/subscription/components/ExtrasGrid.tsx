import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { IconCheck } from '@/components/ui/icons';
import { palette, accentTint, useColors } from '@/theme';
import { formatINR } from '@/utils/currency';

import { AddonTypeIcon } from './AddonTypeIcon';
import { addonKey, addonLineTotal } from '../pricing';
import type { AddOn } from '../types';

interface ExtrasGridProps {
  addons: readonly AddOn[];
  selectedIds: Set<string>;
  mealsPerDay: number;
  days: number;
  onToggle: (a: AddOn) => void;
}

/** Full-width, single-column list of checkable extras cards — each row gets
 * the whole line width so a longer add-on name wraps onto a second line
 * instead of being cut off, the way a 2-up grid was forcing it to. */
export function ExtrasGrid({ addons, selectedIds, mealsPerDay, days, onToggle }: ExtrasGridProps) {
  if (addons.length === 0) {
    return (
      <AppText variant="bodySm" className="text-muted-foreground">
        No add-ons available for this plan.
      </AppText>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      {addons.map((a) => {
        const key = addonKey(a);
        const price = a.extraPrice ?? a.addonPrice ?? 0;
        return (
          <ExtraCard
            key={key}
            label={a.addonName ?? 'Add-on'}
            type={a.addOnType}
            price={price}
            lineTotal={addonLineTotal(a, mealsPerDay, days)}
            checked={selectedIds.has(key)}
            onPress={() => onToggle(a)}
          />
        );
      })}
    </View>
  );
}

/** One checkable extras card. Card border/tint mirrors `PlanRow`'s selected
 * look; the leading checkbox square mirrors the green-check-when-selected
 * convention used for add-ons throughout this feature. */
function ExtraCard({
  label,
  type,
  price,
  lineTotal,
  checked,
  onPress,
}: {
  label: string;
  type?: string;
  price: number;
  lineTotal: number;
  checked: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={{
        borderRadius: 16,
        borderWidth: checked ? 2 : 1,
        borderColor: checked ? palette.brand.green : colors.border,
        backgroundColor: checked ? accentTint(palette.brand.green, 0.08) : colors.card,
        padding: 12,
      }}
      className="active:opacity-90"
    >
      <View className="flex-row items-center" style={{ gap: 10 }}>
        <AddonTypeIcon type={type} />
        <AppText variant="label" className="text-foreground" style={{ flex: 1 }}>
          {label}
        </AppText>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: checked ? palette.brand.green : 'transparent',
            borderWidth: checked ? 0 : 1.5,
            borderColor: checked ? palette.brand.green : colors.mutedForeground,
          }}
        >
          {checked ? <IconCheck size={12} color="#fff" strokeWidth={3} /> : null}
        </View>
      </View>
      {price > 0 ? (
        <View style={{ marginTop: 8 }} className="flex-row items-baseline justify-between">
          <AppText variant="caption" style={{ color: palette.brand.green }}>
            +{formatINR(price)}/meal
          </AppText>
          <AppText variant="caption" className="text-muted-foreground">
            {formatINR(lineTotal)} for this plan
          </AppText>
        </View>
      ) : (
        <AppText variant="caption" style={{ marginTop: 8, color: palette.accent.veg }}>
          Free
        </AppText>
      )}
    </Pressable>
  );
}
