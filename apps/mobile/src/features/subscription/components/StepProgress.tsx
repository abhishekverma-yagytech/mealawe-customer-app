import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { palette, accentTint } from '@/theme';

/** Always both shown, on both screens — that's what makes this a progress
 * indicator rather than a per-screen title: the user sees the whole 2-step
 * journey and where they are in it. */
const STEP_LABELS = ['PLAN', 'SET UP & DELIVERY'] as const;

interface StepProgressProps {
  /** 1-based index of the step currently active. Segments/labels up to and
   * including this step render filled/green ("done"); the rest render
   * tinted/muted ("upcoming"). */
  step: 1 | 2;
}

/**
 * Shared "step X of 2" progress indicator — a row of filled/tinted bar
 * segments with an overline label under each. Used by both
 * `subscription-plan.tsx` (step 1) and `subscription-configure.tsx` (step 2)
 * so the two screens read as one continuous progress system instead of two
 * different visual languages for the same concept.
 */
export function StepProgress({ step }: StepProgressProps) {
  return (
    <View>
      <View className="flex-row" style={{ gap: 6 }}>
        {STEP_LABELS.map((label, index) => {
          const done = index < step;
          return (
            <View
              key={label}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                backgroundColor: done ? palette.brand.green : accentTint(palette.brand.green, 0.15),
              }}
            />
          );
        })}
      </View>
      <View className="flex-row" style={{ marginTop: 6 }}>
        {STEP_LABELS.map((label, index) => {
          const done = index < step;
          return (
            <View key={label} style={{ flex: 1 }}>
              <AppText
                variant="overline"
                className={done ? undefined : 'text-muted-foreground'}
                style={done ? { color: palette.brand.green } : undefined}>
                {label}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}
