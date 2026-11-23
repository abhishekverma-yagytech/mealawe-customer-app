'use client';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useApartmentCartStore } from '@/features/apartment/cartStore';

/** Shown when an add would mix kitchens, or mix Advance with Instant/Today — the cart can hold only one of those at a time. */
export function ApartmentConflictDialog() {
  const conflict = useApartmentCartStore((s) => s.conflict);
  const cartKitchen = useApartmentCartStore((s) => s.meta?.kitchenName);
  const startNewOrder = useApartmentCartStore((s) => s.startNewOrder);
  const dismiss = useApartmentCartStore((s) => s.dismissConflict);
  if (!conflict) return null;
  const byType = conflict.reason === 'orderType';
  return (
    <Dialog open onOpenChange={(o) => !o && dismiss()} title={byType ? 'Start a new order?' : 'Order from one kitchen at a time'}>
      <p className="text-sm text-muted-foreground">
        {byType
          ? 'Advance orders can’t be combined with Instant or Today items. Start a new order with this item?'
          : `Your cart has items from ${cartKitchen ?? 'another kitchen'}. Start a new order with ${conflict.offer.kitchenName} instead? Your current cart will be cleared.`}
      </p>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" block onClick={dismiss}>Keep current</Button>
        <Button block onClick={startNewOrder}>Start new order</Button>
      </div>
    </Dialog>
  );
}
