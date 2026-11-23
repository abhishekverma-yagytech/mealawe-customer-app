import { forwardRef, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetView, type BottomSheetModal } from '@gorhom/bottom-sheet';

import { AppSheet } from '@/components/ui/AppSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconCheck } from '@/components/ui/icons';
import { accentTint, palette, useColors, RADIUS, BORDER_WIDTH } from '@/theme';

import { generateRun, nextStartDates, formatShort } from '../schedule';

interface StartDatePickerSheetProps {
  /** Plan length — how many delivery dates a new run generates. */
  days: number;
  deliverOnWeekends: boolean;
  /** Currently-saved start date (`selectedDates[0]`) — the sheet reopens
   * pre-selected on whatever's already in the cart, not always the first chip. */
  initialStartIso: string;
  isDineIn?: boolean;
  onConfirm: (startIso: string, selectedDates: string[]) => void;
}

/**
 * Change-start-date sheet — lets the cart edit a subscription line's
 * schedule inline (tap "Schedule") instead of the only option being a full
 * trip back to `/subscription-configure`. Reuses the exact same
 * `nextStartDates`/`generateRun` chip logic that screen's own "START DATE"
 * section is built on, so the two stay in lockstep by construction rather
 * than by two independently-maintained copies of the same date math.
 */
export const StartDatePickerSheet = forwardRef<BottomSheetModal, StartDatePickerSheetProps>(
  ({ days, deliverOnWeekends, initialStartIso, isDineIn, onConfirm }, ref) => {
    const colors = useColors();
    const [startIso, setStartIso] = useState(initialStartIso);

    // Resync to whatever's actually saved every time the sheet is asked to
    // show a (possibly different) line's date — this component instance is
    // shared/reused, not remounted per-present.
    useEffect(() => {
      setStartIso(initialStartIso);
    }, [initialStartIso]);

    const chips = useMemo(
      () => nextStartDates(14, deliverOnWeekends, deliverOnWeekends),
      [deliverOnWeekends],
    );
    const selectedDates = useMemo(
      () => (startIso ? generateRun(startIso, days, deliverOnWeekends, deliverOnWeekends) : []),
      [startIso, days, deliverOnWeekends],
    );

    function confirm(): void {
      if (!startIso) return;
      onConfirm(startIso, selectedDates);
    }

    const accent = isDineIn ? palette.accent.food : palette.brand.green;

    return (
      <AppSheet ref={ref} snapPoints={['60%']} enableContentPanningGesture={false}>
        <BottomSheetView style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 }}>
          <AppText variant="h2" className="text-foreground">
            Change start date
          </AppText>
          <BottomSheetScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingVertical: 14 }}>
            {chips.map((c) => {
              const active = c.iso === startIso;
              return (
                <Pressable
                  key={c.iso}
                  disabled={!c.enabled}
                  onPress={() => setStartIso(c.iso)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: !c.enabled }}
                  style={{
                    width: 64,
                    borderRadius: RADIUS.md,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderWidth: active ? BORDER_WIDTH.emphasis : BORDER_WIDTH.hairline,
                    borderColor: active ? accent : colors.border,
                    backgroundColor: active ? accentTint(accent, 0.08) : colors.card,
                    opacity: c.enabled ? 1 : 0.4,
                  }}>
                  {active ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: accent,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 2,
                        borderColor: colors.card,
                      }}>
                      <IconCheck size={10} color="#fff" strokeWidth={3} />
                    </View>
                  ) : null}
                  <AppText variant="overline" className="text-muted-foreground">
                    {c.label}
                  </AppText>
                  <AppText variant="h3" className="text-foreground">
                    {c.dom}
                  </AppText>
                  <AppText variant="caption" className="text-muted-foreground">
                    {c.month}
                  </AppText>
                </Pressable>
              );
            })}
          </BottomSheetScrollView>
          {startIso ? (
            <AppText variant="bodySm" className="text-muted-foreground">
              Starts {formatShort(startIso)} · {selectedDates.length} delivery days
            </AppText>
          ) : null}
          <View style={{ marginTop: 20 }}>
            <Button label="Confirm date" block disabled={!startIso} onPress={confirm} tone={isDineIn ? 'food' : undefined} />
          </View>
        </BottomSheetView>
      </AppSheet>
    );
  },
);

StartDatePickerSheet.displayName = 'StartDatePickerSheet';
