import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { IconMapPin, IconSearch } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  KitchenGrid,
  loadNearestKitchens,
  VegFilterChips,
  type DietFilter,
  type OnDemandKitchen,
  type OnDemandMode,
} from '@/features/on-demand';
import { trackCategoryViewed, useScreenTracking } from '@/services/netcore';
import { useClusterStore } from '@/store';
import { palette, shadow } from '@/theme';

const TITLE: Record<OnDemandMode, string> = { allDay: 'Daily Order', advance: 'Advance Order' };

export default function OnDemandKitchensScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const mode: OnDemandMode = modeParam === 'advance' ? 'advance' : 'allDay';
  useScreenTracking(`ondemand_kitchens_${mode}`);

  const serviceable = useClusterStore((s) => s.clusters.length > 0);
  const [kitchens, setKitchens] = useState<OnDemandKitchen[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [diet, setDiet] = useState<DietFilter>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadNearestKitchens(mode).then((res) => {
      if (active) {
        setKitchens(res);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [mode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kitchens.filter((k) => {
      const matchesSearch = !q || k.kitchenName.toLowerCase().includes(q);
      const matchesDiet = !diet || (k.mealType?.includes(diet) ?? false);
      return matchesSearch && matchesDiet;
    });
  }, [kitchens, search, diet]);

  function openKitchen(kitchen: OnDemandKitchen) {
    trackCategoryViewed(kitchen.kitchenName);
    router.push({
      pathname: '/on-demand-kitchen',
      params: { kitchenId: kitchen._id, mode },
    } as Href);
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: TITLE[mode] }} />
      <StatusBar style="auto" />

      <View className="gap-3 px-4 pt-3">
        <View
          className="flex-row items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3.5"
          style={shadow.card}>
          <IconSearch size={20} color={palette.neutral.gray500} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search kitchens"
            placeholderTextColor={palette.neutral.gray500}
            className="flex-1 font-metropolis text-title text-foreground"
            style={{ paddingVertical: 0 }}
          />
        </View>
        <VegFilterChips value={diet} onChange={setDiet} />
      </View>

      {loading ? (
        <View className="flex-row flex-wrap justify-between px-4 pt-4" style={{ rowGap: 16 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ width: '48%', borderRadius: 16, overflow: 'hidden' }}>
              <Skeleton height={130} radius={0} />
              <View style={{ padding: 10, gap: 6 }}>
                <Skeleton width="80%" height={14} />
                <Skeleton width="50%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : !serviceable ? (
        <EmptyState
          title="Set a delivery location"
          message="Choose your location to see kitchens open for on-demand orders near you."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No matching kitchens' : 'No kitchens here yet'}
          message={search ? 'Try a different search term.' : 'On-demand ordering isn’t available in your area right now.'}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 16 }}>
          <AppText variant="overline" className="px-4 text-muted-foreground" style={{ marginBottom: 10 }}>
            KITCHENS NEAR YOU
          </AppText>
          <KitchenGrid kitchens={filtered} onPressKitchen={openKitchen} />
        </ScrollView>
      )}
    </View>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <AccentIcon icon={IconMapPin} tone="location" size={26} tileSize={56} />
      <AppText variant="title" className="text-center text-foreground" style={{ marginTop: 12 }}>
        {title}
      </AppText>
      <AppText variant="bodySm" className="mt-1 text-center text-muted-foreground">
        {message}
      </AppText>
    </View>
  );
}
