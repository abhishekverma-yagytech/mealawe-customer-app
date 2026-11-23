import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { AppSheet } from '@/components/ui/AppSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { formatShort } from '@/features/subscription';
import { palette, useColors } from '@/theme';

export interface DateRange {
  /** Inclusive, `YYYY-MM-DD`. */
  from: string;
  /** Inclusive, `YYYY-MM-DD`. */
  to: string;
}

export interface DateRangeSheetHandle {
  present: () => void;
  dismiss: () => void;
}

interface DateRangeSheetProps {
  initialRange: DateRange | null;
  onApply: (range: DateRange | null) => void;
}

type PeriodMark = { color: string; textColor?: string; startingDay?: boolean; endingDay?: boolean };

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return toISODate(new Date());
}

/** Every day from `from` to `to` inclusive, marked as one continuous
 * `markingType="period"` band — the standard react-native-calendars
 * range-selection pattern (a single day still renders as a one-day band). */
function buildRangeMarking(from: string | null, to: string | null): Record<string, PeriodMark> {
  if (!from) return {};
  const end = to ?? from;
  const marks: Record<string, PeriodMark> = {};
  let cursor = new Date(from);
  const last = new Date(end);
  while (cursor <= last) {
    const iso = toISODate(cursor);
    marks[iso] = {
      color: palette.brand.green,
      textColor: '#fff',
      startingDay: iso === from,
      endingDay: iso === end,
    };
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return marks;
}

/**
 * "Filter by buy date" — a calendar range picker for the package's own
 * purchase date (`orderDate`, set once at checkout — see
 * `foodOrderPackage.dao.js`'s `saveOrderPackage`), not the subscription's
 * delivery schedule. Tap a start day, then an end day; tapping again after
 * a full range starts a new one.
 */
export const DateRangeSheet = forwardRef<DateRangeSheetHandle, DateRangeSheetProps>(
  function DateRangeSheet({ initialRange, onApply }, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const colors = useColors();
    const [from, setFrom] = useState<string | null>(null);
    const [to, setTo] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      present: () => {
        setFrom(initialRange?.from ?? null);
        setTo(initialRange?.to ?? null);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const onDayPress = (day: DateData): void => {
      if (!from || to) {
        setFrom(day.dateString);
        setTo(null);
        return;
      }
      if (day.dateString < from) {
        setFrom(day.dateString);
        return;
      }
      setTo(day.dateString);
    };

    const apply = (): void => {
      if (from) onApply({ from, to: to ?? from });
      sheetRef.current?.dismiss();
    };

    const clear = (): void => {
      setFrom(null);
      setTo(null);
      onApply(null);
      sheetRef.current?.dismiss();
    };

    return (
      <AppSheet ref={sheetRef} snapPoints={['72%']}>
        <BottomSheetScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          <View>
            <AppText variant="h2" className="text-foreground">
              Filter by buy date
            </AppText>
            <AppText variant="bodySm" className="mt-1 text-muted-foreground">
              {from ? `${formatShort(from)}${to && to !== from ? ` – ${formatShort(to)}` : ''}` : 'Pick a start and end date'}
            </AppText>
          </View>

          <Calendar
            current={from ?? undefined}
            maxDate={todayIso()}
            markingType="period"
            markedDates={buildRangeMarking(from, to)}
            onDayPress={onDayPress}
            style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border }}
            theme={{
              calendarBackground: colors.card,
              dayTextColor: colors.foreground,
              monthTextColor: colors.foreground,
              textSectionTitleColor: colors.mutedForeground,
              textDisabledColor: colors.mutedForeground,
              todayTextColor: palette.brand.green,
              arrowColor: palette.brand.green,
              selectedDayBackgroundColor: palette.brand.green,
              selectedDayTextColor: '#fff',
            }}
          />

          <View className="flex-row" style={{ gap: 10 }}>
            <Button label="Clear" variant="outline" className="flex-1" onPress={clear} />
            <Button label="Apply" className="flex-1" disabled={!from} onPress={apply} />
          </View>
        </BottomSheetScrollView>
      </AppSheet>
    );
  },
);
