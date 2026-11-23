import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedScrollHandler, type SharedValue } from 'react-native-reanimated';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { IconMapPin } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBottomStackClearance } from '@/features/orders';
import { PlanCard, useConfigureStore, type MealPackage } from '@/features/subscription';
import { useClusterStore } from '@/store';

import { loadDineInPackages } from '../api';
import { dineInMealTime } from '../mealTime';
import { DineInDietChips, type DineInDietFilter } from './DineInDietChips';
import { DineInPlanBanner } from './DineInPlanBanner';
import { WhatsInYourThali } from './WhatsInYourThali';

interface DineInHomeProps {
  /** Top padding so content starts below the home hero band, same contract
   * as SubscriptionHome's `topInset`. */
  topInset?: number;
  /** Shared scroll offset — lets the home hero collapse as this feed scrolls,
   * same contract as SubscriptionHome/OnDemandHome. Was missing before, so
   * Dine In never drove the hero-collapse / nav-bar-hide behavior the other
   * feed tabs get for free. */
  scrollY?: SharedValue<number>;
  /** Increment to scroll this feed back to the top — e.g. tapping the
   * already-active Dine In tab again. */
  scrollToTopSignal?: number;
}

/** The Dine In tab body: a promo banner, "Choose your plan" header, and a
 * two-column plan grid — there's no kitchen/table-booking concept
 * server-side, Dine In is a Subscription package flagged `isDineIn: true`,
 * so it looks and behaves like one too. Tapping a card hands off straight to
 * `/subscription-configure` (no separate select-then-Continue step, and no
 * sticky bottom bar — unlike Subscription/On Demand, a Dine In package's
 * price is fixed the moment you tap it, nothing left to configure before
 * seeing the next screen). No category tabs: the real packages are
 * duration/meal-time named (e.g. "Bi-Weekly Package-Lunch"), not thali
 * categories, and the server already sorts them by priority. */
export function DineInHome({ topInset = 0, scrollY, scrollToTopSignal = 0 }: DineInHomeProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setConfigureContext = useConfigureStore((s) => s.set);
  const clusters = useClusterStore((s) => s.clusters);
  const serviceable = clusters.length > 0;
  // "What's in your thali" depicts Kota's specific thali composition, not a
  // generic one every cluster's dine-in packages share — same Kota check
  // `(tabs)/index.tsx` uses for its own hero-lottie override.
  const isKota = useMemo(
    () => clusters.some((c) => (c.clusterName ?? '').toLowerCase().includes('kota')),
    [clusters],
  );
  const bottomStackClearance = useBottomStackClearance();
  const scrollRef = useRef<Animated.ScrollView>(null);

  const onScroll = useAnimatedScrollHandler((e) => {
    if (scrollY) {
      scrollY.value = e.contentOffset.y;
    }
  });

  const [packages, setPackages] = useState<MealPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [dietFilter, setDietFilter] = useState<DineInDietFilter>(null);

  useEffect(() => {
    if (scrollToTopSignal) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [scrollToTopSignal]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadDineInPackages().then((res) => {
      if (active) {
        setPackages(res);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // "What's included" teaser under the title — every dine-in package's own
  // veg meal description reads the same in practice (one venue, one thali),
  // so the first one that actually has a description is representative
  // enough for a single summary line; falls back to nothing rather than a
  // half-populated guess if none do.
  const includedDescription = useMemo(
    () => packages.find((p) => p.vegMealDescription?.trim())?.vegMealDescription?.trim() ?? '',
    [packages],
  );

  // Only worth showing when there's actually something to switch between —
  // a lone always-selected chip with nothing else to filter to isn't a real
  // filter (same rule subscription-detail.tsx's own diet toggle uses).
  const showDietChips =
    packages.some((p) => p.packageType === 'Veg') && packages.some((p) => p.packageType === 'NonVeg');
  const filteredPackages = useMemo(
    () => (dietFilter ? packages.filter((p) => p.packageType === dietFilter) : packages),
    [packages, dietFilter],
  );

  function continueToConfigure(pkg: MealPackage) {
    setConfigureContext({ package: pkg, category: 'Dine In', isDineIn: true });
    router.push('/subscription-configure' as Href);
  }

  return (
    <View className="flex-1">
      <Animated.ScrollView
        ref={scrollRef}
        className="flex-1"
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: topInset,
          paddingBottom: 40 + insets.bottom + bottomStackClearance,
        }}>
        <View className="px-4 pt-4">
          <DineInPlanBanner />
        </View>

        {isKota ? (
          <View className="px-4 pt-4">
            <WhatsInYourThali />
          </View>
        ) : null}

        <View className="px-4 pt-4" style={{ gap: 12 }}>
          <View>
            <AppText variant="h2" className="text-foreground">
              Choose your plan
            </AppText>
            {/* Kota shows the real thali composition above (WhatsInYourThali)
                instead of this one-line summary. */}
            {!isKota && includedDescription ? (
              <AppText variant="bodySm" className="text-muted-foreground" style={{ marginTop: 2 }}>
                {includedDescription}
              </AppText>
            ) : null}
          </View>
          {showDietChips ? <DineInDietChips value={dietFilter} onChange={setDietFilter} /> : null}
        </View>

        {loading ? (
          <PlanGridSkeleton />
        ) : !serviceable ? (
          <EmptyState
            title="Set a delivery location"
            message="Choose your location to see dine-in packages near you."
          />
        ) : packages.length === 0 ? (
          <EmptyState
            title="No dine-in packages here yet"
            message="Dine-in isn't available in your area right now."
          />
        ) : filteredPackages.length === 0 ? (
          <EmptyState
            title="No matching packages"
            message="Try the other diet filter."
          />
        ) : (
          <View className="flex-row flex-wrap justify-between px-4 pt-4" style={{ rowGap: 14 }}>
            {filteredPackages.map((pkg) => {
              const { mealsPerDay } = dineInMealTime(pkg);
              return (
                <View key={pkg._id} style={{ width: '48%' }}>
                  <PlanCard
                    pkg={pkg}
                    onPress={() => continueToConfigure(pkg)}
                    tone="food"
                    mealCount={mealsPerDay > 0 ? mealsPerDay * pkg.days : undefined}
                  />
                </View>
              );
            })}
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

function PlanGridSkeleton() {
  return (
    <View className="flex-row flex-wrap justify-between px-4 pt-4" style={{ rowGap: 14 }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width: '48%' }}>
          <Skeleton height={96} radius={18} />
          <View style={{ paddingHorizontal: 4, paddingTop: 10, gap: 8 }}>
            <Skeleton width="55%" height={18} />
            <Skeleton width="40%" height={14} />
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View className="items-center px-4 py-14">
      <AccentIcon icon={IconMapPin} tone="location" size={26} tileSize={56} />
      <AppText variant="title" className="text-foreground" style={{ marginTop: 12, textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText
        variant="bodySm"
        className="text-muted-foreground"
        style={{ marginTop: 4, textAlign: 'center' }}>
        {message}
      </AppText>
    </View>
  );
}
