import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { DietMark } from '@/components/ui/DietMark';
import { palette } from '@/theme';

export type DineInDietFilter = 'Veg' | 'NonVeg' | null;

interface DineInDietChipsProps {
  value: DineInDietFilter;
  onChange: (value: DineInDietFilter) => void;
}

/** Single-select Veg/Non-veg filter for the plan grid — tapping the active
 * chip again clears it, same interaction as On-Demand's `VegFilterChips`
 * (which this mirrors), but tinted Dine In's own `food` accent instead of
 * On-Demand's teal, per the Order-Mode CTA Rule (each vertical's own
 * interactive controls use its own accent) — kept as its own small
 * component rather than reusing `VegFilterChips` directly, since that one
 * is hardcoded to On-Demand's color and a 3-way Veg/Non-Veg/Jain choice
 * that doesn't apply here. */
export function DineInDietChips({ value, onChange }: DineInDietChipsProps) {
  const chip = (label: 'Veg' | 'NonVeg', text: string) => {
    const active = value === label;
    return (
      <Pressable
        onPress={() => onChange(active ? null : label)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        className={`flex-row items-center gap-2 self-start rounded-full border px-4 py-2 ${active ? '' : 'border-border'}`}
        style={active ? { borderColor: palette.accent.food, backgroundColor: palette.accent.food } : undefined}
      >
        <DietMark veg={label === 'Veg'} size={12} />
        <AppText variant="caption" className={active ? 'text-white' : 'text-foreground'}>
          {text}
        </AppText>
      </Pressable>
    );
  };
  return (
    <View className="flex-row" style={{ gap: 8 }}>
      {chip('Veg', 'Veg')}
      {chip('NonVeg', 'Non-Veg')}
    </View>
  );
}
