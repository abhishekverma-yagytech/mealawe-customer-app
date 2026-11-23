/** Order status → human label + timeline mapping. Ported from mealaweApp. */
import type { AccentTone } from '@mealawe/design-tokens';

export const ORDER_STATUS_LABEL: Record<string, string> = {
  paymentInprogress: 'Payment in progress',
  paymentFailed: 'Payment failed',
  placed: 'Placed',
  accepted: 'Accepted',
  preparing: 'Being prepared',
  readyToDelivery: 'Being prepared',
  readyForDelivery: 'Being prepared',
  deliveryBoyAssigned: 'Delivery partner assigned',
  handedOverToDeliveryBoy: 'Handed to delivery partner',
  onTheWay: 'On the way',
  inTransit: 'In transit',
  outForDelivery: 'Out for delivery',
  packagingInProgess: 'Packaging in progress',
  delivered: 'Delivered',
  cancelledByKitchen: 'Cancelled by kitchen',
  rejectedByKitchen: 'Not accepted',
  cancelledByUser: 'Cancelled',
  cancelledBySeller: 'Cancelled',
  rejectedBySeller: 'Cancelled',
  autoCancelled: 'Auto cancelled',
  rescheduled: 'Rescheduled',
};

export type StatusGroup = 'ongoing' | 'completed' | 'cancelled' | 'other';

const ONGOING = new Set([
  'paymentInprogress',
  'placed',
  'accepted',
  'preparing',
  'readyToDelivery',
  'readyForDelivery',
  'deliveryBoyAssigned',
  'handedOverToDeliveryBoy',
  'onTheWay',
  'inTransit',
  'outForDelivery',
  'packagingInProgess',
  'rescheduled',
]);
const CANCELLED = new Set([
  'paymentFailed',
  'cancelledByKitchen',
  'rejectedByKitchen',
  'cancelledByUser',
  'cancelledBySeller',
  'rejectedBySeller',
  'autoCancelled',
]);

export function statusLabel(status?: string): string {
  if (!status) return 'Order';
  return ORDER_STATUS_LABEL[status] ?? status;
}

export function statusGroup(status?: string): StatusGroup {
  if (!status) return 'other';
  if (status === 'delivered') return 'completed';
  if (ONGOING.has(status)) return 'ongoing';
  if (CANCELLED.has(status)) return 'cancelled';
  return 'other';
}

/** Ordered milestones for the live order-status timeline. */
export interface OrderStep {
  key: string;
  label: string;
}
export const ORDER_STEPS: readonly OrderStep[] = [
  { key: 'placed', label: 'Order placed' },
  { key: 'accepted', label: 'Accepted by kitchen' },
  { key: 'preparing', label: 'Being prepared' },
  { key: 'deliveryBoyAssigned', label: 'Delivery partner assigned' },
  { key: 'outForDelivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

const STEP_OF: Record<string, number> = {
  paymentInprogress: 0,
  placed: 0,
  accepted: 1,
  preparing: 2,
  readyToDelivery: 2,
  readyForDelivery: 2,
  packagingInProgess: 2,
  deliveryBoyAssigned: 3,
  handedOverToDeliveryBoy: 3,
  onTheWay: 4,
  inTransit: 4,
  outForDelivery: 4,
  delivered: 5,
};

/** Which timeline step a raw status maps to. */
export function statusStepIndex(status?: string): number {
  if (!status) return 0;
  return STEP_OF[status] ?? 0;
}

/**
 * Accent tone per lifecycle STEP (not just the broad group) — so "Accepted",
 * "Being prepared", "Delivery partner assigned" and "On the way" each render
 * a visually distinct pill background, instead of all four sharing one
 * "ongoing" color. Completed/cancelled/other keep their existing group tones
 * unchanged (matches the terminal states everywhere already rendered).
 */
const STEP_TONE: readonly AccentTone[] = ['info', 'plan', 'offer', 'location', 'reward', 'veg'];

export function statusTone(status?: string): AccentTone {
  const group = statusGroup(status);
  if (group === 'cancelled') return 'nonveg';
  if (group === 'other') return 'rating';
  return STEP_TONE[statusStepIndex(status)] ?? 'info';
}
