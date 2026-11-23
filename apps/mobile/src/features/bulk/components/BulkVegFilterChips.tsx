import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { DietMark } from '@/components/ui/DietMark';
import { palette } from '@/theme';

export type BulkDietFilter = 'Veg' | 'NonVeg' | null;

interface BulkVegFilterChipsProps {
  value: BulkDietFilter;
  onChange: (value: BulkDietFilter) => void;
}

/**
 * Single-select Veg/Non-veg filter row for the Bulk vertical — same
 * tap-active-again-to-clear interaction as On Demand's `VegFilterChips`, but
 * built as its own small component rather than reused directly: On Demand's
 * version hardcodes its own tab accent (Delivery Teal) internally rather
 * than accepting it as a prop, and also offers a "Jain" option — no Jain
 * filter here yet (`BulkMenuItem` does carry `itemType`/`isVeg` for it, see
 * `ItemDietMark`, just no chip wired up), only Veg/Non-Veg. This one
 * filters on the `isVeg` field and is tinted with Bulk's own accent
 * (`palette.accent.plan`) instead.
 */
export function BulkVegFilterChips({ value, onChange }: BulkVegFilterChipsProps) {
  const chip = (label: Exclude<BulkDietFilter, null>, text: string) => {
    const active = value === label;
    return (
      <Pressable
        onPress={() => onChange(active ? null : label)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        className={`flex-row items-center self-start gap-2 rounded-full border px-4 py-2.5 ${active ? '' : 'border-border'}`}
        style={active ? { borderColor: palette.accent.plan, backgroundColor: palette.accent.plan } : undefined}>
        <DietMark veg={label === 'Veg'} size={12} />
        <AppText variant="caption" className={active ? 'text-white' : 'text-foreground'}>
          {text}
        </AppText>
      </Pressable>
    );
  };
  return (
    <View className="flex-row gap-2">
      {chip('Veg', 'Veg')}
      {chip('NonVeg', 'Non-Veg')}
    </View>
  );
}
