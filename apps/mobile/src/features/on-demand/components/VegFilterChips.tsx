import { Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { DietMark } from '@/components/ui/DietMark';
import { palette } from '@/theme';

export type DietFilter = 'Veg' | 'NonVeg' | 'Jain' | null;

interface VegFilterChipsProps {
  value: DietFilter;
  onChange: (value: DietFilter) => void;
}

/** Single-select Veg/Non-veg/Jain filter row — tapping the active chip again
 * clears the filter (mirrors the legacy's `changeItemFilter`'s crossIcon-to-clear).
 * Tinted Delivery Teal (this vertical's own tab accent) when active — this
 * component only ever renders inside On-Demand screens. */
export function VegFilterChips({ value, onChange }: VegFilterChipsProps) {
  const chip = (label: DietFilter, text: string) => {
    const active = value === label;
    return (
      <Pressable
        onPress={() => onChange(active ? null : label)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        className={`flex-row items-center self-start gap-2 rounded-full border px-4 py-2.5 ${active ? '' : 'border-border'}`}
        style={active ? { borderColor: palette.accent.info, backgroundColor: palette.accent.info } : undefined}>
        {label !== 'Jain' ? <DietMark veg={label === 'Veg'} size={12} /> : null}
        <AppText variant="caption" className={active ? 'text-white' : 'text-foreground'}>
          {text}
        </AppText>
      </Pressable>
    );
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {chip('Veg', 'Veg')}
      {chip('NonVeg', 'Non-Veg')}
      {chip('Jain', 'Jain')}
    </ScrollView>
  );
}
