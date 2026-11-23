'use client';

import { useEffect, useMemo, useState } from 'react';

import { formatINR } from '@mealawe/core';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { DietMark } from '@/components/ui/DietMark';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { useApartmentCartStore } from '@/features/apartment/cartStore';
import { loadApartmentConfig, type ApartmentConfig } from '@/features/apartment/config';
import {
  DEFAULT_INSTANT_PREP_MINUTES,
  autoPickInstantOffer,
  currentMealType,
  dayLabel,
  formatHHmm,
  formatHourLabel,
  isPastAdvanceCutoff,
  isPastNextDayCutoffHour,
  isoDateLabel,
  isoForDay,
  mealOrderFrom,
} from '@/features/apartment/pricing';
import type { ApartmentDish, ApartmentDishOffer, OrderType } from '@/features/apartment/types';
import { Img } from '@/lib/img';

interface Props {
  dish: ApartmentDish | null;
  orderType: OrderType;
  apartment: { apartmentId: string; apartmentName?: string };
  onClose: () => void;
}

const MEAL_LABEL: Record<string, string> = { Breakfast: 'Breakfast', Lunch: 'Lunch', HighTea: 'High tea', Dinner: 'Dinner' };

/** Which dimension picks the offer besides the kitchen: Today → meal slot, Advance → serving date, Instant → none. */
function groupKeyOf(o: ApartmentDishOffer, orderType: OrderType): string {
  if (orderType === 'today') return o.mealType ?? '';
  if (orderType === 'advance') return o.itemServingDate ?? '';
  return 'all';
}

function offerBlock(o: ApartmentDishOffer, orderType: OrderType, config: ApartmentConfig | null): string | null {
  if (o.blocked) return o.blockReason ?? 'Not available right now';
  if (orderType === 'advance' && config) {
    const day = o.itemServingDate === isoForDay(1) ? 1 : o.itemServingDate === isoForDay(2) ? 2 : null;
    if (day && isPastNextDayCutoffHour(day, config.advanceNextDayCutoffHour)) return `Tomorrow's orders closed at ${formatHourLabel(config.advanceNextDayCutoffHour)}`;
    // Slot is chosen in the cart; here we only warn when EVERY slot of this kitchen is already inside the cutoff.
    const slots = (['Breakfast', 'Lunch', 'HighTea', 'Dinner'] as const).filter((m) => o.kitchenMealTiming?.some((t) => t.mealType === m));
    if (slots.length > 0 && slots.every((m) => isPastAdvanceCutoff(o.kitchenMealTiming, m, o.itemServingDate, config.advanceCutoffMinutes))) return 'Past the ordering cutoff for this day';
  }
  return null;
}

/** Add-to-cart dialog: pick slot/day (Today/Advance), kitchen, quantity. The cart store enforces the one-kitchen rules. */
export function ApartmentAddSheet({ dish, orderType, apartment, onClose }: Props) {
  const addLine = useApartmentCartStore((s) => s.addLine);
  const cartKitchenId = useApartmentCartStore((s) => s.meta?.kitchenId ?? null);
  const [config, setConfig] = useState<ApartmentConfig | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [kitchenId, setKitchenId] = useState<string | null>(null);
  const [count, setCount] = useState(1);

  useEffect(() => {
    let active = true;
    loadApartmentConfig().then((c) => active && setConfig(c)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const groups = useMemo(() => {
    if (!dish) return [] as string[];
    const keys = Array.from(new Set(dish.offers.map((o) => groupKeyOf(o, orderType))));
    if (orderType === 'today') {
      const order = mealOrderFrom(currentMealType());
      return keys.sort((a, b) => order.indexOf(a as never) - order.indexOf(b as never));
    }
    return keys.sort();
  }, [dish, orderType]);

  // Default group: the first one with something orderable.
  useEffect(() => {
    if (!dish) return;
    const firstOk = groups.find((g) => dish.offers.some((o) => groupKeyOf(o, orderType) === g && !offerBlock(o, orderType, config))) ?? groups[0] ?? null;
    setGroup(firstOk);
    setKitchenId(null);
    setCount(1);
  }, [dish, groups, orderType, config]);

  const offers = useMemo(() => {
    if (!dish || group === null) return [] as ApartmentDishOffer[];
    return dish.offers
      .filter((o) => groupKeyOf(o, orderType) === group)
      .sort((a, b) => {
        const ab = offerBlock(a, orderType, config) ? 1 : 0;
        const bb = offerBlock(b, orderType, config) ? 1 : 0;
        if (ab !== bb) return ab - bb;
        const ac = a.kitchenId === cartKitchenId ? 0 : 1;
        const bc = b.kitchenId === cartKitchenId ? 0 : 1;
        return ac - bc || a.price - b.price;
      });
  }, [dish, group, orderType, config, cartKitchenId]);

  const selected = useMemo(() => {
    if (!dish) return null;
    if (orderType === 'instant' && !kitchenId) return autoPickInstantOffer({ ...dish, offers }, count) ?? offers[0] ?? null;
    return offers.find((o) => o.kitchenId === kitchenId) ?? offers.find((o) => !offerBlock(o, orderType, config)) ?? offers[0] ?? null;
  }, [dish, offers, kitchenId, orderType, config, count]);

  const block = selected ? offerBlock(selected, orderType, config) : 'Not available';
  const min = Math.max(1, selected?.moq ?? 1);
  const max = selected?.availableQty !== undefined ? Math.max(min, selected.availableQty) : 99;
  const shown = Math.min(Math.max(count, min), max);

  if (!dish) return null;

  const submit = () => {
    if (!selected || block) return;
    // On a kitchen/order-type conflict the store raises `conflict` (shown by ApartmentConflictDialog) instead of adding.
    addLine(dish, selected, orderType, apartment.apartmentId, apartment.apartmentName, shown);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={dish.name}>
      <div className="space-y-4">
        <div className="flex gap-3">
          {dish.imageUrl ? <Img src={dish.imageUrl} alt={dish.name} className="size-20 shrink-0 rounded-card" /> : null}
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2"><DietMark veg={dish.isVeg} /><span className="text-sm text-muted-foreground">{dish.servesTo ? `Serves ${dish.servesTo}` : null}</span></div>
            {dish.description ? <p className="line-clamp-3 text-sm text-muted-foreground">{dish.description}</p> : null}
          </div>
        </div>

        {orderType !== 'instant' ? (
          <fieldset>
            <legend className="mb-2 text-sm font-bold">{orderType === 'today' ? 'Meal slot' : 'Delivery day'}</legend>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => {
                const anyOk = dish.offers.some((o) => groupKeyOf(o, orderType) === g && !offerBlock(o, orderType, config));
                const label = orderType === 'today' ? (MEAL_LABEL[g] ?? g) : g === isoForDay(1) ? `Tomorrow · ${dayLabel(1)}` : g === isoForDay(2) ? `${dayLabel(2)}` : isoDateLabel(g);
                return (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={group === g}
                    onClick={() => {
                      setGroup(g);
                      setKitchenId(null);
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-bold ${group === g ? 'bg-primary text-primary-foreground' : 'bg-muted'} ${anyOk ? '' : 'opacity-50'}`}>
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <fieldset>
          <legend className="mb-2 text-sm font-bold">Kitchen</legend>
          <ul className="space-y-2">
            {offers.map((o) => {
              const why = offerBlock(o, orderType, config);
              const isSel = selected?.kitchenId === o.kitchenId;
              return (
                <li key={`${o.kitchenId}|${o.itemId}`}>
                  <button
                    type="button"
                    disabled={!!why}
                    aria-pressed={isSel}
                    onClick={() => setKitchenId(o.kitchenId)}
                    className={`flex w-full items-center justify-between rounded-card border p-3 text-left ${isSel ? 'border-primary bg-primary/10' : 'border-border'} ${why ? 'opacity-60' : ''}`}>
                    <span>
                      <span className="block font-bold">{o.kitchenName}{o.kitchenId === cartKitchenId ? ' · in your cart' : ''}</span>
                      <span className="block text-xs text-muted-foreground">
                        {why ?? (orderType === 'instant' ? `Ready in ~${o.preparationTime ?? DEFAULT_INSTANT_PREP_MINUTES} min` : orderType === 'today' && o.kitchenPrepEndTime ? `Ready after ${formatHHmm(o.kitchenPrepEndTime)}` : o.kitchenCuisine ?? '')}
                      </span>
                    </span>
                    <span className="font-black">{formatINR(o.price)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <div className="flex items-center justify-between gap-3">
          <QuantityStepper value={shown} min={min} max={max} onChange={setCount} />
          <Button disabled={!selected || !!block} onClick={submit} className="flex-1">
            Add · {formatINR((selected?.price ?? 0) * shown)}
          </Button>
        </div>
        {min > 1 ? <p className="text-xs text-muted-foreground">Minimum order {min}.</p> : null}
        {block ? <p role="alert" className="text-sm font-bold text-destructive">{block}</p> : null}
      </div>
    </Dialog>
  );
}
