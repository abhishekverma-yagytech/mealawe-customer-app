import { accentTint, palette } from '@/theme';

import { formatHHmm, formatHour12, isoDateLabel } from './pricing';
import type { ApartmentOrder } from './types';

/** Mirrors `apartmentOrder.model.js`'s `orderstatus` enum. The payment-flavored values
 * shouldn't actually occur (no payment gateway in apartment ordering) but are labelled
 * defensively anyway. */
export const APARTMENT_ORDER_STATUS_LABEL: Record<string, string> = {
  paymentInitiated: 'Payment initiated',
  paymentInprogress: 'Payment in progress',
  paymentFailed: 'Payment failed',
  placed: 'Placed',
  accepted: 'Accepted by kitchen',
  preparing: 'Being prepared',
  readyToDelivery: 'Ready for delivery',
  deliveryBoyAssigned: 'Rider assigned',
  handedOverToDeliveryBoy: 'Handed to rider',
  onTheWay: 'On the way',
  delivered: 'Delivered',
  readyForPickup: 'Ready for pickup',
  pickedUp: 'Picked up',
  cancelledByUser: 'Cancelled by you',
  cancelledByKitchen: 'Cancelled by kitchen',
  rejectedByKitchen: 'Rejected by kitchen',
  autoCancelled: 'Auto-cancelled',
  refundCompleted: 'Refunded',
};

/** One accent color per status (not per bucket), from existing design tokens only. */
const APARTMENT_ORDER_STATUS_COLOR: Record<string, string> = {
  paymentInitiated: palette.apartment.gold,
  paymentInprogress: palette.apartment.gold,
  paymentFailed: palette.status.danger,
  placed: palette.apartment.gold,
  accepted: palette.accent.info,
  preparing: palette.accent.food,
  readyToDelivery: palette.accent.location,
  deliveryBoyAssigned: palette.accent.location,
  handedOverToDeliveryBoy: palette.accent.location,
  onTheWay: palette.accent.location,
  delivered: palette.apartment.green,
  readyForPickup: palette.accent.location,
  pickedUp: palette.apartment.green,
  cancelledByUser: palette.status.danger,
  cancelledByKitchen: palette.status.danger,
  rejectedByKitchen: palette.status.danger,
  autoCancelled: palette.status.danger,
  refundCompleted: palette.accent.info,
};

const APARTMENT_ORDER_STATUS_COLOR_DARK: Record<string, string> = {
  ...APARTMENT_ORDER_STATUS_COLOR,
  paymentInitiated: palette.apartmentDark.gold,
  paymentInprogress: palette.apartmentDark.gold,
  placed: palette.apartmentDark.gold,
  delivered: palette.apartmentDark.green,
  pickedUp: palette.apartmentDark.green,
};

/** One emoji per status, baked into `apartmentOrderStatusLabel`'s return value so every
 * call site picks it up automatically. */
const APARTMENT_ORDER_STATUS_EMOJI: Record<string, string> = {
  paymentInitiated: '💳',
  paymentInprogress: '⏳',
  paymentFailed: '❌',
  placed: '🧾',
  accepted: '✅',
  preparing: '👨‍🍳',
  readyToDelivery: '📦',
  deliveryBoyAssigned: '🛵',
  handedOverToDeliveryBoy: '🤝',
  onTheWay: '🚴',
  delivered: '🎉',
  readyForPickup: '🍱',
  pickedUp: '✅',
  cancelledByUser: '🚫',
  cancelledByKitchen: '🚫',
  rejectedByKitchen: '❌',
  autoCancelled: '⚠️',
  refundCompleted: '💰',
};

/** Pass `useApartmentColors().isDark` from the call site so this reflects the current theme. */
export function apartmentOrderStatusColor(status: string, isDark = false): string {
  const map = isDark ? APARTMENT_ORDER_STATUS_COLOR_DARK : APARTMENT_ORDER_STATUS_COLOR;
  return map[status] ?? (isDark ? palette.apartmentDark.gold : palette.apartment.gold);
}

/** Gold uses a dedicated solid background token instead of a translucent tint — a
 * low-alpha gold tint reads as plain gray on this app's dark background, giving gold
 * text poor contrast. */
export function apartmentOrderStatusBg(status: string, isDark = false): string {
  const colors = isDark ? palette.apartmentDark : palette.apartment;
  if (status === 'paymentInitiated' || status === 'paymentInprogress' || status === 'placed') {
    return colors.goldBg;
  }
  return accentTint(apartmentOrderStatusColor(status, isDark), 0.14);
}

export function apartmentOrderStatusLabel(status: string): string {
  const label = APARTMENT_ORDER_STATUS_LABEL[status] ?? status;
  const emoji = APARTMENT_ORDER_STATUS_EMOJI[status];
  return emoji ? `${emoji} ${label}` : label;
}

/** Progression steps per fulfillment mode, so the order-detail screen can show every
 * status Placed through Delivered/Picked-up, not just the current one. A delivery
 * order's rider leg collapses into one "On the way" step. */
export interface ApartmentOrderStep {
  key: string;
  label: string;
}

const APARTMENT_DELIVERY_STEPS: readonly ApartmentOrderStep[] = [
  { key: 'placed', label: 'Placed' },
  { key: 'accepted', label: 'Accepted by kitchen' },
  { key: 'preparing', label: 'Being prepared' },
  { key: 'readyToDelivery', label: 'Ready to deliver' },
  { key: 'onTheWay', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
];

const APARTMENT_PICKUP_STEPS: readonly ApartmentOrderStep[] = [
  { key: 'placed', label: 'Placed' },
  { key: 'accepted', label: 'Accepted by kitchen' },
  { key: 'preparing', label: 'Being prepared' },
  { key: 'readyForPickup', label: 'Ready for pickup' },
  { key: 'pickedUp', label: 'Picked up' },
];

const APARTMENT_DELIVERY_STEP_OF: Record<string, number> = {
  paymentInitiated: 0,
  paymentInprogress: 0,
  placed: 0,
  accepted: 1,
  preparing: 2,
  readyToDelivery: 3,
  deliveryBoyAssigned: 4,
  handedOverToDeliveryBoy: 4,
  onTheWay: 4,
  delivered: 5,
};

const APARTMENT_PICKUP_STEP_OF: Record<string, number> = {
  paymentInitiated: 0,
  paymentInprogress: 0,
  placed: 0,
  accepted: 1,
  preparing: 2,
  readyForPickup: 3,
  pickedUp: 4,
};

/** The ordered step list for this order's fulfillment mode — render every
 * one of these, always, in order; never filter/hide a step. */
export function apartmentOrderSteps(fulfillmentMode: 'delivery' | 'pickup'): readonly ApartmentOrderStep[] {
  return fulfillmentMode === 'pickup' ? APARTMENT_PICKUP_STEPS : APARTMENT_DELIVERY_STEPS;
}

/** Which step this raw status maps to. Unrecognized status fails open to step 0. */
export function apartmentOrderStepIndex(status: string, fulfillmentMode: 'delivery' | 'pickup'): number {
  const map = fulfillmentMode === 'pickup' ? APARTMENT_PICKUP_STEP_OF : APARTMENT_DELIVERY_STEP_OF;
  return map[status] ?? 0;
}

/** Earliest `statusHistory` timestamp among the raw statuses that map to `stepIndex`
 * (several can share one step). `null` when the step hasn't been reached yet. */
export function apartmentOrderStepTimestamp(
  statusHistory: { orderstatus: string; updatedOn: string }[] | undefined,
  stepIndex: number,
  fulfillmentMode: 'delivery' | 'pickup',
): string | null {
  if (!statusHistory?.length) return null;
  const map = fulfillmentMode === 'pickup' ? APARTMENT_PICKUP_STEP_OF : APARTMENT_DELIVERY_STEP_OF;
  const matches = statusHistory.filter((h) => (map[h.orderstatus] ?? 0) === stepIndex);
  if (matches.length === 0) return null;
  return matches.reduce((earliest, h) => (new Date(h.updatedOn).getTime() < new Date(earliest.updatedOn).getTime() ? h : earliest)).updatedOn;
}

/**
 * "Ready to deliver/pickup by/after ..." label, shared across the placement confirmation
 * screen, tracking rib, and cart preview. `null` when there's nothing real to show.
 */
export function apartmentOrderReadyLabel(
  order: Pick<ApartmentOrder, 'orderType' | 'estimatedFulfillmentMinutes' | 'mealType' | 'fulfillmentMode' | 'itemServingDate'>,
  // Advance's live delivery window, resolved separately (useApartmentAdvanceSlotWindow).
  advanceSlotWindow?: { deliveryStartTime: string; deliveryEndTime: string } | null,
  // Today's real prep-end time, resolved separately (useApartmentTodayPrepEndTime).
  todayPrepEndTime?: string | null,
): string | null {
  if (order.orderType === 'advance') {
    if (!order.mealType) return null;
    const dateLabel = order.itemServingDate ? isoDateLabel(order.itemServingDate) : null;
    const timeLabel = advanceSlotWindow ? ` (${formatHHmm(advanceSlotWindow.deliveryStartTime)} to ${formatHHmm(advanceSlotWindow.deliveryEndTime)})` : '';
    return [dateLabel, `${order.mealType} slot${timeLabel}`].filter(Boolean).join(', ');
  }
  const verb = order.fulfillmentMode === 'pickup' ? 'pickup' : 'deliver';
  if (order.orderType === 'today') {
    return todayPrepEndTime ? `Ready to ${verb} after ${formatHHmm(todayPrepEndTime)}` : null;
  }
  if (!order.estimatedFulfillmentMinutes) return null;
  return `Ready to ${verb} by ${formatHour12(new Date(Date.now() + order.estimatedFulfillmentMinutes * 60000))}`;
}
