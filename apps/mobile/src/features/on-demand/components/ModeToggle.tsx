import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { accentTint, palette } from '@/theme';

import type { OnDemandMode } from '../types';

interface ModeToggleProps {
  mode: OnDemandMode;
  onChange: (mode: OnDemandMode) => void;
  /** Hide a capsule when that mode has no eligible items for this kitchen —
   * mirrors the legacy's `*ngIf="!noAlldayMenu"` guard. */
  showDaily?: boolean;
  showAdvance?: boolean;
  /**
   * Optional second line under each label — kitchen-context copy (e.g. a
   * prep-time indicator for Daily, the delivery-date range for Advance) so
   * the choice reads as "what happens", not just a mode name. Omit either to
   * fall back to a bare label-only card.
   */
  dailySubtext?: string;
  advanceSubtext?: string;
}

/** Two-card Daily/Advance segmented control. Each card is a label with an
 * optional descriptive subtext line underneath — same selected-tone
 * treatment (Delivery Teal / `palette.accent.info`) as `VegFilterChips` /
 * `OnDemandSlotPicker`'s date & slot chips, so the selection language stays
 * consistent across this screen. */
export function ModeToggle({
  mode,
  onChange,
  showDaily = true,
  showAdvance = true,
  dailySubtext,
  advanceSubtext,
}: ModeToggleProps) {
  const card = (value: OnDemandMode, label: string, subtext?: string) => {
    const selected = mode === value;
    return (
      <Pressable
        onPress={() => onChange(value)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        className={`flex-1 rounded-xl border px-3.5 py-2.5 ${selected ? '' : 'border-border'}`}
        style={
          selected
            ? { borderColor: palette.accent.info, backgroundColor: accentTint(palette.accent.info, 0.12) }
            : undefined
        }>
        <AppText
          variant="label"
          className={selected ? '' : 'text-foreground'}
          style={selected ? { color: palette.accent.info } : undefined}>
          {label}
        </AppText>
        {subtext ? (
          <AppText variant="caption" className="mt-0.5 text-muted-foreground">
            {subtext}
          </AppText>
        ) : null}
      </Pressable>
    );
  };
  return (
    <View className="flex-row items-center gap-2">
      {showDaily ? card('allDay', 'Daily', dailySubtext) : null}
      {showAdvance ? card('advance', 'Advance', advanceSubtext) : null}
    </View>
  );
}
