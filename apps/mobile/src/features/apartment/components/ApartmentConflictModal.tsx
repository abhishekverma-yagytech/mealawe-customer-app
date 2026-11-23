import { Modal, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useApartmentColors } from '@/theme';

import { ORDER_TYPE_LABEL } from '../pricing';
import type { ApartmentCartConflict } from '../useApartmentCartStore';

interface ApartmentConflictModalProps {
  conflict: ApartmentCartConflict | null;
  currentKitchenName?: string;
  onStartNewOrder: () => void;
  onDismiss: () => void;
}

/**
 * R2/U6 — "one order = one kitchen" — raised by
 * `useApartmentCartStore#checkKitchenConflict` whenever an add would bring
 * in a second kitchen; this never happens silently.
 *
 * Product instruction, 2026-09-01 — also raised for a second, distinct
 * reason now: Instant and Today may still combine into one cart/checkout
 * (each type still checks out as its own separate order — see
 * `groupCartLines` — Path unification handles the combined payment), but
 * Advance never combines with either. `conflict.reason` picks which of the
 * two explanations to show — the "Start a new order"/"Keep current order"
 * actions themselves are identical either way, only the copy differs.
 */
export function ApartmentConflictModal({ conflict, currentKitchenName, onStartNewOrder, onDismiss }: ApartmentConflictModalProps) {
  // Root-cause fix: this modal used to read the Apartment feature's own
  // palette directly — fixed light-mode hex with no dark-mode counterpart —
  // so it stayed on its light white card even after the app was switched to
  // dark mode. Hook called BEFORE the early return below (Rules of Hooks).
  const { colors } = useApartmentColors();
  if (!conflict) return null;
  const isOrderTypeConflict = conflict.reason === 'orderType';
  const title = isOrderTypeConflict ? 'Advance orders separately' : 'Different kitchen';
  // Deliberately doesn't say WHICH side (the cart already has, or
  // `conflict.orderType` itself) is the Advance one — this conflict fires
  // in both directions (adding Advance to a Today/Instant cart, or the
  // reverse), and the rule reads correctly either way without needing to
  // know that.
  const body = isOrderTypeConflict
    ? `Advance can't be combined with ${ORDER_TYPE_LABEL.today}/${ORDER_TYPE_LABEL.instant} in the same checkout — one is cooked and delivered today, the other on a future date you pick. Add ${conflict.dishName} to its own order instead.`
    : `Your order is being cooked by ${currentKitchenName ?? 'another kitchen'}. Items from ${conflict.offer.kitchenName} need a separate order — one order is always one kitchen.`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      {/* Tapping the backdrop dismisses like "Keep current order". Card is a sibling, not nested, so it doesn't bubble into onPress. */}
      <Pressable className="flex-1" style={{ backgroundColor: 'rgba(27,33,28,.5)' }} onPress={onDismiss} accessibilityLabel="Keep current order" />
      <View pointerEvents="box-none" className="absolute inset-0 items-center justify-center px-6">
        <View className="w-full rounded-3xl p-5" style={{ backgroundColor: colors.card }}>
          <AppText variant="h3" style={{ color: colors.ink }}>
            {title}
          </AppText>
          <AppText variant="body" style={{ color: colors.mutedLine, marginTop: 8, lineHeight: 19 }}>
            {body}
          </AppText>
          <View style={{ gap: 9, marginTop: 18 }}>
            {/* `.green`, not `.ink` — ink flips light in dark mode, which would break this solid-fill button. */}
            <Pressable onPress={onStartNewOrder} className="items-center rounded-2xl py-3.5" style={{ backgroundColor: colors.green }}>
              <AppText variant="label" style={{ color: '#fff' }}>
                Start a new order
              </AppText>
            </Pressable>
            <Pressable onPress={onDismiss} className="items-center rounded-2xl py-3.5" style={{ borderWidth: 1, borderColor: colors.border }}>
              <AppText variant="label" style={{ color: colors.ink }}>
                Keep current order
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
