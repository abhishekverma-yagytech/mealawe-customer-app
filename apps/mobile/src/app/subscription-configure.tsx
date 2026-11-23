import { Redirect, Stack, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { IconCheck, IconCheckCircle, IconDelivery, IconCalendar, IconMoon, IconSun } from '@/components/ui/icons';
import { dineInMealTime } from '@/features/dine-in';
import { DeliverToSection, hasSavedAddress, type Address } from '@/features/location';
import {
  addonKey,
  addonLineTotal,
  daysLabel,
  extraAddonDays,
  finalPrice,
  useConfigureStore,
  generateRun,
  nextStartDates,
  formatShort,
  MealSlot,
  ExtrasGrid,
  type AddOn,
  type MealPackage,
} from '@/features/subscription';
import { StepProgress } from '@/features/subscription/components/StepProgress';
import type { SubscriptionConfig } from '@/features/cart';
import { trackSubAddonSelected, useScreenTracking } from '@/services/netcore';
import { palette, accentTint, useColors, RADIUS, BORDER_WIDTH } from '@/theme';
import { useCartStore, useClusterStore, useLocationStore } from '@/store';
import { formatINR } from '@/utils/currency';

export default function SubscriptionConfigureScreen() {
  useScreenTracking('subscription_configure');

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const deliverToY = useRef(0);
  const [addressError, setAddressError] = useState<string | null>(null);
  const colors = useColors();
  const context = useConfigureStore((s) => s.context);
  const setSubscription = useCartStore((s) => s.setSubscription);
  const loadCharges = useCartStore((s) => s.loadCharges);
  const currentAddress = useLocationStore((s) => s.current);
  const savedAddresses = useLocationStore((s) => s.saved);
  const setCurrentAddress = useLocationStore((s) => s.setCurrent);
  const removeAddress = useLocationStore((s) => s.removeAddress);
  // The cluster(s) active when this flow started — `context.package` was
  // fetched cluster-scoped against these, so switching to an address outside
  // them mid-flow would silently invalidate the already-chosen plan (wrong
  // kitchen/menu/pricing), not just "change the delivery location".
  const activeClusters = useClusterStore((s) => s.clusters);
  const requiredClusterIds = useMemo(
    () => activeClusters.map((c) => c.clusterId).filter(Boolean),
    [activeClusters],
  );
  const requiredClusterName = activeClusters[activeClusters.length - 1]?.clusterName;

  const pkg = context?.package;
  const days = pkg?.days ?? 0;
  const initial = context?.initial;

  // Meal time is chosen on the Plan screen for regular Subscription orders
  // (a package can include either or both meals, or is a fixed single
  // "Breakfast" slot for that category) — this screen only displays it there,
  // with a "Change" link back. A Dine In package's meal time is baked into
  // the package itself (its `packageCategory`, e.g. "Lunch, Dinner" — see
  // `dineInMealTime`), not a user choice, so it's derived here and shown
  // locked (see the render below) rather than offered as a picker — the
  // tapped package on `DineInHome` already decided this. `initial` (editing
  // an existing cart line) takes priority over both that and the fresh
  // selection carried in `context.lunch`/`context.dinner`/`context.breakfast`;
  // Dine In never has a breakfast option, matching the Ionic reference.
  const dineInMeal = context?.isDineIn && pkg ? dineInMealTime(pkg) : null;
  const [breakfast] = useState(initial?.breakfast ?? context?.breakfast ?? false);
  const [mealSelection, setMealSelection] = useState<'lunch' | 'dinner' | 'both'>(() => {
    if (initial) {
      return initial.lunch && initial.dinner ? 'both' : initial.dinner ? 'dinner' : 'lunch';
    }
    if (dineInMeal?.isDetermined) {
      return dineInMeal.hasLunch && dineInMeal.hasDinner ? 'both' : dineInMeal.hasDinner ? 'dinner' : 'lunch';
    }
    const initLunch = context?.lunch ?? true;
    const initDinner = context?.dinner ?? false;
    return initLunch && initDinner ? 'both' : initDinner ? 'dinner' : 'lunch';
  });
  const lunch = !breakfast && (mealSelection === 'lunch' || mealSelection === 'both');
  const dinner = !breakfast && (mealSelection === 'dinner' || mealSelection === 'both');
  // Whether this plan delivers on Saturday/Sunday is the package's own
  // admin-set `deliveryOnWeekends` (dashboard's meal-package "Delivery on
  // Weekends" checkbox) — not a per-order choice, so it's read directly from
  // `pkg`, never from user input or `initial` (an existing cart line could
  // predate an admin changing this flag; the package's current setting wins).
  const deliverOnWeekends = pkg?.deliveryOnWeekends ?? false;
  const [startIso, setStartIso] = useState(initial?.selectedDates?.[0] ?? '');
  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(
    () => new Set((initial?.addOns ?? []).map((a) => a._id ?? a.addonName ?? '')),
  );

  useEffect(() => {
    void loadCharges();
  }, [loadCharges]);

  const chips = useMemo(
    () => nextStartDates(14, deliverOnWeekends, deliverOnWeekends),
    [deliverOnWeekends],
  );

  // Keep a valid start date selected as the weekend rules change.
  useEffect(() => {
    const firstEnabled = chips.find((c) => c.enabled);
    if (!startIso || !chips.some((c) => c.iso === startIso && c.enabled)) {
      setStartIso(firstEnabled?.iso ?? '');
    }
  }, [chips, startIso]);

  const selectedDates = useMemo(
    () => (startIso ? generateRun(startIso, days, deliverOnWeekends, deliverOnWeekends) : []),
    [startIso, days, deliverOnWeekends],
  );

  // Dine-in never doubles for a lunch+dinner selection — one dine-in visit
  // per day regardless of which meal times are acceptable, not two separate
  // meals (matches `buildBill`'s same guard — see its own comment for the
  // Ionic reference this mirrors).
  const mealsPerDay = context?.isDineIn ? 1 : breakfast ? 1 : lunch && dinner ? 2 : 1;

  const addons = pkg?.addonsList ?? [];
  // Float initially-selected add-ons to the top (stable during the session).
  const displayAddons = useMemo(() => {
    const initiallyOn = new Set((initial?.addOns ?? []).map((a) => a._id ?? a.addonName ?? ''));
    return [...addons].sort(
      (a, b) => Number(initiallyOn.has(addonKey(b))) - Number(initiallyOn.has(addonKey(a))),
    );
  }, [addons, initial]);
  const addonTotal = useMemo(() => {
    return addons.reduce((sum, a) => {
      if (!selectedAddonIds.has(addonKey(a))) return sum;
      return sum + addonLineTotal(a, mealsPerDay, days);
    }, 0);
  }, [addons, selectedAddonIds, mealsPerDay, days]);
  // "Include Saturday"/"Include Sunday" add-ons carry their own extra day
  // count beyond the plan's own `days` — reflected everywhere the day count
  // is shown (this screen + cart) as a running "60 + 4" total. Display only:
  // `days` itself and the generated `selectedDates` run are unchanged.
  const extraDays = useMemo(
    () => extraAddonDays(addons.filter((a) => selectedAddonIds.has(addonKey(a))), deliverOnWeekends),
    [addons, selectedAddonIds, deliverOnWeekends],
  );
  const totalDaysLabel = daysLabel(days, extraDays);

  if (!context || !pkg) {
    return <Redirect href="/(tabs)" />;
  }

  const planTotal = finalPrice(pkg) * mealsPerDay;
  const itemTotal = planTotal + addonTotal;
  const canSave = selectedDates.length === days && (breakfast || lunch || dinner);

  // Guards `DeliverToSection`'s inline address selection against the cluster
  // mismatch described above: an address is only usable here if it falls
  // inside one of the cluster(s) this plan was configured for.
  const selectDeliveryAddress = async (addr: Address): Promise<void> => {
    if (requiredClusterIds.length > 0) {
      const matched = await useClusterStore.getState().previewClusters(addr.geolocation);
      const inCluster = matched.some((c) => requiredClusterIds.includes(c.clusterId));
      if (!inCluster) {
        Alert.alert(
          'Outside delivery area',
          `This plan is only deliverable in ${requiredClusterName ?? 'your current area'}. Choose a different saved address, or add a new one there.`,
        );
        return;
      }
    }
    setAddressError(null);
    await setCurrentAddress(addr);
  };

  const deleteAddress = (index: number): void => {
    Alert.alert('Delete address', 'Remove this saved address?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const error = await removeAddress(index);
          if (error) {
            Alert.alert('Cannot delete', error);
          }
        },
      },
    ]);
  };

  const toggleAddon = (a: AddOn): void => {
    const key = addonKey(a);
    const willSelect = !selectedAddonIds.has(key);
    trackSubAddonSelected(a.addonName ?? '', a.addOnType, willSelect);
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const save = (): void => {
    if (!canSave) return;
    if (!hasSavedAddress(currentAddress, savedAddresses)) {
      setAddressError('Please choose a saved delivery address to continue.');
      scrollRef.current?.scrollTo({ y: Math.max(0, deliverToY.current - 20), animated: true });
      return;
    }
    setAddressError(null);
    const config: SubscriptionConfig = {
      package: pkg,
      category: context.category,
      deliveryOnWeekends: deliverOnWeekends,
      addOns: addons
        .filter((a) => selectedAddonIds.has(addonKey(a)))
        .map((a) => ({ ...a, selected: true })),
      selectedDates: [...selectedDates].sort(),
      lunch,
      dinner,
      breakfast,
      isDineIn: context.isDineIn,
    };
    // Not cleared here: this screen stays in the nav stack under Cart, and
    // clearing `context` immediately made `!context` true the moment the
    // user pressed back into it, bouncing them to `<Redirect href="/(tabs)">`
    // instead of showing the plan they'd just filled in. The context is
    // cleared once the flow actually ends — see `cart.tsx`'s `pay()`.
    setSubscription(config);
    router.push('/cart' as Href);
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Customize your plan' }} />
      <StatusBar style="auto" />

      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {!context.isDineIn ? <StepProgress step={2} /> : null}

        <View className="flex-row items-center justify-between">
          <AppText variant="bodySm" className="text-muted-foreground">
            {context.category} · {totalDaysLabel} days
          </AppText>
          {!context.isDineIn ? (
            <Pressable
              onPress={() => router.push('/subscription-plan')}
              accessibilityRole="button"
              accessibilityLabel="Change plan"
              hitSlop={8}
            >
              <AppText variant="label" className="text-primary">
                Change plan
              </AppText>
            </Pressable>
          ) : null}
        </View>

        <OrderPreviewCard
          pkg={pkg}
          mealsPerDay={mealsPerDay}
          days={days}
          totalDaysLabel={totalDaysLabel}
          planTotal={planTotal}
          isDineIn={context.isDineIn}
        />

        {/* Meal time — chosen on the Plan screen (read-only here) for
            Subscription. A Dine In package's meal time is baked into the
            package itself (see `dineInMeal` above), so it's shown locked —
            a single always-active, non-interactive `MealSlot` in Dine In's
            own accent color, same "shown but can't be tapped" treatment the
            fixed Breakfast slot below already uses for Subscription. Falls
            back to the old editable 3-tile picker only for the edge case of
            a Dine In package with no determinable meal time at all. */}
        <View className="flex-row items-center justify-between" style={{ marginTop: 30 }}>
          <AppText variant="overline" className="text-muted-foreground">
            MEAL TIME
          </AppText>
          {!context.isDineIn ? (
            <Pressable
              onPress={() => router.push('/subscription-plan')}
              accessibilityRole="button"
              accessibilityLabel="Change meal time"
              hitSlop={8}
            >
              <AppText variant="label" className="text-primary">
                Change
              </AppText>
            </Pressable>
          ) : null}
        </View>
        {context.isDineIn && dineInMeal?.isDetermined ? (
          <View className="flex-row gap-2" style={{ marginTop: 10 }}>
            {mealSelection === 'both' ? (
              <MealSlot
                compact
                label="Both"
                time="Lunch + Dinner"
                tone={palette.accent.food}
                Icon={IconCheckCircle}
                active
                onPress={() => {}}
              />
            ) : mealSelection === 'dinner' ? (
              <MealSlot
                compact
                label="Dinner"
                time="7:30–9 PM"
                tone={palette.accent.food}
                Icon={IconMoon}
                active
                onPress={() => {}}
              />
            ) : (
              <MealSlot
                compact
                label="Lunch"
                time="12–1:30 PM"
                tone={palette.accent.food}
                Icon={IconSun}
                active
                onPress={() => {}}
              />
            )}
          </View>
        ) : context.isDineIn ? (
          <View className="flex-row gap-2" style={{ marginTop: 10 }}>
            <MealSlot
              compact
              label="Lunch"
              time="12–1:30 PM"
              tone={palette.accent.offer}
              Icon={IconSun}
              active={mealSelection === 'lunch'}
              onPress={() => setMealSelection('lunch')}
            />
            <MealSlot
              compact
              label="Dinner"
              time="7:30–9 PM"
              tone={palette.accent.plan}
              Icon={IconMoon}
              active={mealSelection === 'dinner'}
              onPress={() => setMealSelection('dinner')}
            />
            <MealSlot
              compact
              label="Both"
              time="Lunch + Dinner"
              tone={palette.accent.veg}
              Icon={IconCheckCircle}
              active={mealSelection === 'both'}
              onPress={() => setMealSelection('both')}
            />
          </View>
        ) : (
          <AppText variant="label" className="text-foreground" style={{ marginTop: 4 }}>
            {breakfast ? 'Breakfast' : lunch && dinner ? 'Lunch & Dinner' : dinner ? 'Dinner' : 'Lunch'}
          </AppText>
        )}

        {/* Delivery days — read-only: whether this plan includes weekends is
            the package's own admin-set policy (dashboard's "Delivery on
            Weekends" checkbox on the meal package), not a per-order choice. */}
        {/* <AppText variant="overline" className="text-muted-foreground" style={{ marginTop: 30 }}>
          DELIVERY DAYS
        </AppText>
        <View style={{ marginTop: 10 }}>
          <DeliveryDaysInfo deliverOnWeekends={deliverOnWeekends} />
        </View> */}

        {/* Start date — kept close to Delivery days above: both are the
            "when" group, so they read as one unit rather than two
            equally-weighted sections. */}
        <AppText variant="overline" className="text-muted-foreground" style={{ marginTop: 16 }}>
          START DATE
        </AppText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingVertical: 10 }}
        >
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
                  borderColor: active ? (context.isDineIn ? palette.accent.food : palette.brand.green) : colors.border,
                  backgroundColor: active
                    ? accentTint(context.isDineIn ? palette.accent.food : palette.brand.green, 0.08)
                    : colors.card,
                  opacity: c.enabled ? 1 : 0.4,
                }}
              >
                {active ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: context.isDineIn ? palette.accent.food : palette.brand.green,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: '#fff',
                    }}
                  >
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
        </ScrollView>
        {startIso ? (
          <>
            <AppText variant="caption" className="text-muted-foreground">
              Starts {formatShort(startIso)} · {selectedDates.length}/{days} delivery days
            </AppText>
            {!context.isDineIn ? (
              <FirstDeliveryNote
                mealWord={breakfast ? 'breakfast' : lunch && dinner ? 'meal' : dinner ? 'dinner' : 'lunch'}
                startIso={startIso}
              />
            ) : null}
          </>
        ) : null}

        {/* Add-ons */}
        <View className="flex-row items-center justify-between" style={{ marginTop: 30 }}>
          <AppText variant="overline" className="text-muted-foreground">
            ADD-ONS
          </AppText>
          <AppText variant="caption" className="text-muted-foreground">
            optional
          </AppText>
        </View>
        <View style={{ marginTop: 10 }}>
          <ExtrasGrid
            addons={displayAddons}
            selectedIds={selectedAddonIds}
            mealsPerDay={mealsPerDay}
            days={days}
            onToggle={toggleAddon}
          />
        </View>

        {/* Deliver to — every saved address is selectable inline via
            `DeliverToSection` (no leaving this screen to `/addresses`), with
            a persistent "add new address" entry below the list rather than
            only appearing when no address is set yet. Selection is guarded
            by `selectDeliveryAddress` above against picking one outside the
            cluster this plan was configured for. */}
        <View
          onLayout={(e) => {
            deliverToY.current = e.nativeEvent.layout.y;
          }}
          style={{ marginTop: 30 }}>
          <AppText variant="overline" className="text-muted-foreground" style={{ marginBottom: 10 }}>
            DELIVER TO
          </AppText>
          {addressError ? (
            <AppText variant="bodySm" className="text-danger" style={{ marginBottom: 10 }}>
              {addressError}
            </AppText>
          ) : null}
          <DeliverToSection
            saved={savedAddresses}
            current={currentAddress}
            onSelect={selectDeliveryAddress}
            onEdit={(index) => router.push({ pathname: '/address-form', params: { index: String(index) } })}
            onDelete={deleteAddress}
            onAddNew={() => router.push('/address-form')}
          />
        </View>
      </ScrollView>

      {/* footer */}
      <View
        className="border-t border-border bg-card px-5 pt-3"
        style={{
          gap: 12,
          paddingBottom: insets.bottom + 12,
          shadowColor: '#0b1220',
          shadowOpacity: 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: -5 },
          elevation: 16,
        }}
      >
        {/* Itemized breakdown — plan + add-ons (when any are selected) —
            instead of one opaque lump total, so it's clear what's adding up
            to the final number. */}
        <View style={{ gap: 4 }}>
          <View className="flex-row items-center justify-between">
            <AppText variant="bodySm" className="text-muted-foreground">
              Plan ({totalDaysLabel} days)
            </AppText>
            <AppText variant="bodySm" className="text-foreground">
              {formatINR(planTotal)}
            </AppText>
          </View>
          {addonTotal > 0 ? (
            <View className="flex-row items-center justify-between">
              <AppText variant="bodySm" className="text-muted-foreground">
                Add-ons
              </AppText>
              <AppText variant="bodySm" className="text-foreground">
                {formatINR(addonTotal)}
              </AppText>
            </View>
          ) : null}
          <View className="flex-row items-center justify-between" style={{ marginTop: 2 }}>
            <AppText variant="label" className="text-foreground">
              Total
            </AppText>
            <AppText variant="h3" className="text-foreground">
              {formatINR(itemTotal)}
            </AppText>
          </View>
          <AppText variant="caption" className="text-muted-foreground">
            Excludes GST, delivery, packaging &amp; platform charges — added at checkout.
          </AppText>
        </View>
        <Button
          label="Review & pay"
          block
          disabled={!canSave}
          onPress={save}
          tone={context.isDineIn ? 'food' : undefined}
        />
      </View>
    </View>
  );
}

/**
 * Compact tinted order-preview strip — the single visual anchor breaking up
 * this screen's five flat label→control rows. Placed right under the
 * category/days summary, it previews the running plan price (before the
 * user has even reached the footer) using the same tinted-card language as
 * `subscription-plan.tsx`'s `AiRecommendationCard`, so the "here's what
 * you're building" moment carries the same visual weight on both screens.
 */
function OrderPreviewCard({
  pkg,
  mealsPerDay,
  days,
  totalDaysLabel,
  planTotal,
  isDineIn,
}: {
  pkg: MealPackage;
  mealsPerDay: number;
  days: number;
  totalDaysLabel: string;
  planTotal: number;
  /** Dine In's own accent (Order-Mode CTA Rule) instead of the Subscription
   * brand green this card otherwise defaults to. */
  isDineIn?: boolean;
}) {
  const accent = isDineIn ? palette.accent.food : palette.brand.green;
  const iconColor = isDineIn ? palette.accent.food : palette.brand.greenDark;
  return (
    <View
      className="flex-row items-center rounded-2xl p-4"
      style={{ marginTop: 14, backgroundColor: accentTint(accent, 0.1), gap: 12 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: accentTint(accent, 0.22),
        }}>
        <IconCalendar size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label" className="text-foreground">
          {pkg.packageName ?? `${days}-day plan`}
        </AppText>
        <AppText variant="caption" className="text-muted-foreground" style={{ marginTop: 2 }}>
          {totalDaysLabel} days · {mealsPerDay} meal{mealsPerDay > 1 ? 's' : ''}/day
        </AppText>
      </View>
      <AppText variant="h3" className="text-foreground">
        {formatINR(planTotal)}
      </AppText>
    </View>
  );
}

/**
 * Small tinted info row setting first-delivery expectations. Reuses the
 * meal-time label derived from this order's `lunch`/`dinner` selection and
 * this screen's own selected start date — no new state, no fabricated copy.
 */
function FirstDeliveryNote({ mealWord, startIso }: { mealWord: string; startIso: string }) {
  return (
    <View
      className="flex-row items-center gap-3 rounded-2xl"
      style={{
        marginTop: 12,
        padding: 12,
        backgroundColor: accentTint(palette.accent.info, 0.1),
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: accentTint(palette.accent.info, 0.22),
        }}
      >
        <IconDelivery size={16} color={palette.accent.info} />
      </View>
      <AppText variant="bodySm" className="text-foreground" style={{ flex: 1 }}>
        Your first {mealWord} arrives {formatShort(startIso)}. The kitchen confirms the exact time
        the evening before.
      </AppText>
    </View>
  );
}


/**
 * Read-only "does this plan deliver on weekends" row — same icon-tile +
 * label + subcopy shape the old editable `WeekendsOffToggle` used, minus the
 * `Toggle` control, since this is now the package's own admin-set policy
 * (see `deliverOnWeekends` above), never a per-order user choice.
 */
function DeliveryDaysInfo({ deliverOnWeekends }: { deliverOnWeekends: boolean }) {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3.5">
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: accentTint(palette.brand.green, 0.14),
        }}
      >
        <IconCalendar size={18} color={palette.brand.greenDark} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label" className="text-foreground">
          {deliverOnWeekends ? 'Delivering all seven days' : 'Delivering Monday to Friday only'}
        </AppText>
        {/* <AppText variant="caption" className="text-muted-foreground" style={{ marginTop: 2 }}>
          Set by this plan — not editable per order.
        </AppText> */}
      </View>
    </View>
  );
}

/* `ExtrasGrid` lives in `@/features/subscription/components/ExtrasGrid` — it
 * takes everything via props with no dependency on screen-local state,
 * matching this codebase's convention of extracting fully decoupled blocks
 * into their feature's `components/` folder. "Deliver to" itself reuses
 * `DeliverToSection` (add/edit/delete/select all happen inline here); full
 * address management for other flows still lives at `/addresses`. */
