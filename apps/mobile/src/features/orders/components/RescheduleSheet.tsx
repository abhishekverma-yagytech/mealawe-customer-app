import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { BottomSheetScrollView, BottomSheetView, type BottomSheetModal } from '@gorhom/bottom-sheet';

import { AppSheet } from '@/components/ui/AppSheet';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconCheck } from '@/components/ui/icons';
import { formatShort, nextStartDates, type DateChip } from '@/features/subscription';
import { palette, accentTint, useColors, RADIUS, BORDER_WIDTH } from '@/theme';

import { checkRescheduleConflict, reschedulePackageChildOrder } from '../api';

/** Everything `reschedulePackageChildOrder`/`checkRescheduleConflict` need for
 * one child order — `packageOrderId` is the parent `FoodOrderPackage._id`
 * (on a child `FoodOrder` doc that's its `subscriptionMasterId`; from
 * Manage Subscription it's just the screen's own `orderId`). */
export interface RescheduleTarget {
  foodOrderId: string;
  packageOrderId: string;
  orderNo?: number | string;
  orderDate?: string;
  mealType?: string;
}

export interface RescheduleSheetHandle {
  present: () => void;
  dismiss: () => void;
}

interface RescheduleSheetProps {
  target: RescheduleTarget | null;
  /** This package's sibling child orders (Manage Subscription already has
   * this loaded as its own `childOrders` list) — used to flag a date chip
   * that already has an order for the SAME meal type as `target`, so the
   * user sees the conflict before tapping Confirm instead of only after via
   * `checkRescheduleConflict`'s alert (still the authoritative check — this
   * is a same-shape but possibly-stale client-side hint, never enforced).
   * Omit when the caller doesn't have this list handy (e.g. Order Details,
   * which only knows about the one order being rescheduled) — chips just
   * won't show the hint there. */
  siblingOrders?: readonly { orderDate?: string; mealType?: string }[];
  /** Called after a successful reschedule so the caller can refetch. */
  onRescheduled: () => void;
}

/**
 * The one reschedule-a-delivery bottom sheet, shared by Manage Subscription
 * (reschedule from the package's child-orders list) and Order Details
 * (reschedule from a single child order's own page) — both ultimately
 * reschedule the same kind of child `FoodOrder`, so they share one flow
 * instead of two near-identical copies.
 */
export const RescheduleSheet = forwardRef<RescheduleSheetHandle, RescheduleSheetProps>(
  function RescheduleSheet({ target, siblingOrders, onRescheduled }, ref) {
    const sheetRef = useRef<BottomSheetModal>(null);
    const [date, setDate] = useState('');
    const [busy, setBusy] = useState(false);
    const dateChips = useMemo(() => nextStartDates(14, true, false), []);
    // Same-meal-type sibling dates only — a date already booked for a
    // different meal type (e.g. Dinner) is no conflict for a Lunch
    // reschedule, matching `checkRescheduleConflict`'s own `(date, mealType)`
    // scoping.
    const bookedDates = useMemo(() => {
      if (!siblingOrders?.length) {
        return new Set<string>();
      }
      const mealType = target?.mealType ?? 'Lunch';
      return new Set(
        siblingOrders
          .filter((o) => (o.mealType ?? 'Lunch') === mealType && o.orderDate)
          .map((o) => o.orderDate!.slice(0, 10)),
      );
    }, [siblingOrders, target?.mealType]);

    useImperativeHandle(ref, () => ({
      present: () => {
        setDate('');
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const confirm = async (): Promise<void> => {
      if (!target || !date || busy) return;
      setBusy(true);
      try {
        const conflict = await checkRescheduleConflict(target.packageOrderId, date, target.mealType ?? 'Lunch');
        if (conflict) {
          Alert.alert('Already booked', 'You already have a delivery on that day. Pick a different date.');
          return;
        }
        const ok = await reschedulePackageChildOrder(date, target.foodOrderId, target.packageOrderId);
        if (!ok) {
          Alert.alert('Could not reschedule', 'Please try again in a moment.');
          return;
        }
        sheetRef.current?.dismiss();
        onRescheduled();
        Alert.alert('Rescheduled', `Order #${target.orderNo ?? ''} moved to ${formatShort(date)}.`);
      } finally {
        setBusy(false);
      }
    };

    return (
      // `enableContentPanningGesture={false}` — same reason `StartDatePickerSheet`
      // sets it: without it, the sheet's own drag-to-resize gesture competes
      // with the date row's horizontal scroll and usually wins, so the row
      // never actually scrolls.
      <AppSheet ref={sheetRef} snapPoints={['60%']} enableContentPanningGesture={false}>
        <BottomSheetView style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, gap: 14 }}>
          <View>
            <AppText variant="h2" className="text-foreground">
              Reschedule order
            </AppText>
            {target ? (
              <AppText variant="bodySm" className="mt-1 text-muted-foreground">
                Order #{target.orderNo ?? '—'}
                {target.orderDate ? ` · currently ${formatShort(target.orderDate.slice(0, 10))}` : ''}
              </AppText>
            ) : null}
          </View>

          <BottomSheetScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}>
            {dateChips.map((chip) => (
              <DateChipButton
                key={chip.iso}
                chip={chip}
                active={chip.iso === date}
                booked={bookedDates.has(chip.iso)}
                onPress={() => chip.enabled && setDate(chip.iso)}
              />
            ))}
          </BottomSheetScrollView>

          <Button label="Confirm new date" block loading={busy} disabled={!date} onPress={confirm} />
        </BottomSheetView>
      </AppSheet>
    );
  },
);

/** Same chip shape as `subscription-configure.tsx`'s START DATE picker —
 * reused here instead of inventing a second date-chip visual language.
 * `booked` swaps the bottom caption to a warning instead of blocking the
 * tap outright — `bookedDates` is a client-side hint that can be stale, and
 * `checkRescheduleConflict` (the authoritative check, still runs on Confirm)
 * is what actually decides whether the pick is allowed. */
function DateChipButton({
  chip,
  active,
  booked,
  onPress,
}: {
  chip: DateChip;
  active: boolean;
  booked?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!chip.enabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: !chip.enabled }}
      accessibilityHint={booked ? 'Already has an order on this date' : undefined}
      style={{
        width: 64,
        borderRadius: RADIUS.md,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: active ? BORDER_WIDTH.emphasis : BORDER_WIDTH.hairline,
        borderColor: active ? palette.brand.green : colors.border,
        backgroundColor: active ? accentTint(palette.brand.green, 0.08) : colors.card,
        opacity: chip.enabled ? 1 : 0.4,
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
            backgroundColor: palette.brand.green,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: '#fff',
          }}>
          <IconCheck size={10} color="#fff" strokeWidth={3} />
        </View>
      ) : null}
      <AppText variant="overline" className="text-muted-foreground">
        {chip.label}
      </AppText>
      <AppText variant="h3" className="text-foreground">
        {chip.dom}
      </AppText>
      {booked ? (
        <AppText variant="caption" style={{ color: palette.accent.offer }}>
          Booked
        </AppText>
      ) : (
        <AppText variant="caption" className="text-muted-foreground">
          {chip.month}
        </AppText>
      )}
    </Pressable>
  );
}
