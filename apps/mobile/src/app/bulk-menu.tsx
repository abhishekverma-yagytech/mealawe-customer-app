import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react-native';
import { FlatList, ScrollView, TextInput, View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconSearch, IconUtensils } from '@/components/ui/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  BulkCartFooter,
  BulkMenuItemCard,
  BulkVegFilterChips,
  CustomFoodBox,
  isBelowMoq,
  loadBulkMenu,
  nextCountFor,
  slabNoteFor,
  slabTableFor,
  unitPriceFor,
  useBulkCartStore,
  type BulkCategory,
  type BulkDietFilter,
  type BulkMenuItem,
  type BulkMenuResponse,
  type BulkPackaging,
} from '@/features/bulk';
import { useScreenTracking } from '@/services/netcore';
import { palette } from '@/theme';

const CATEGORY_TITLE: Record<BulkCategory, string> = {
  meals: 'Bulk Meals',
  snacks: 'Bulk Snacks',
  foodbox: 'Food Box',
};

const VALID_CATEGORIES: BulkCategory[] = ['meals', 'snacks', 'foodbox'];

export default function BulkMenuScreen() {
  useScreenTracking('bulk_menu');

  const router = useRouter();
  const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();
  const category: BulkCategory = VALID_CATEGORIES.includes(categoryParam as BulkCategory)
    ? (categoryParam as BulkCategory)
    : 'meals';

  const cart = useBulkCartStore((s) => s.cart);
  const setCount = useBulkCartStore((s) => s.setCount);

  const [packaging, setPackaging] = useState<BulkPackaging>('individual');
  const [menu, setMenu] = useState<BulkMenuResponse | null>(null);
  const [search, setSearch] = useState('');
  const [dietFilter, setDietFilter] = useState<BulkDietFilter>(null);
  const [loading, setLoading] = useState(true);
  const [pendingSwitch, setPendingSwitch] = useState<{ itemId: string; delta: number } | null>(null);

  // Reset the packaging filter/search/diet filter when navigating to a
  // different category so each category starts from the same default view.
  useEffect(() => {
    setPackaging('individual');
    setSearch('');
    setDietFilter(null);
  }, [category]);

  const fetchMenu = (): (() => void) => {
    let cancelled = false;
    setLoading(true);
    loadBulkMenu(category, packaging).then((res) => {
      if (!cancelled) {
        setMenu(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  };

  useEffect(fetchMenu, [category, packaging]);

  const rawItems = menu?.itemList ?? [];
  const q = search.trim().toLowerCase();
  const dietMatches = (i: BulkMenuItem): boolean => {
    if (dietFilter === 'Veg') return i.isVeg;
    if (dietFilter === 'NonVeg') return !i.isVeg;
    return true;
  };
  const items = rawItems.filter((i) => (!q || i.itemName.toLowerCase().includes(q)) && dietMatches(i));

  // Only reflect the cart when it actually belongs to the category+packaging
  // currently on screen — otherwise a cart from a different combo would leak
  // into this screen's stepper counts and sticky footer.
  const cartMatchesView = cart.category === category && cart.packaging === packaging;

  const countFor = (itemId: string): number =>
    cartMatchesView ? (cart.lines.find((l) => l.item._id === itemId)?.count ?? 0) : 0;

  const applyChange = (itemId: string, delta: number): void => {
    if (!menu) return;
    const item = menu.itemList.find((i) => i._id === itemId);
    if (!item) return;
    // Strip itemList before persisting — only the org config belongs in the
    // cart, not a full snapshot of the menu's items.
    const { itemList: _itemList, ...orgInfo } = menu;
    const current = countFor(itemId);
    const next = nextCountFor(current, delta, orgInfo.moq);
    setCount(item, category, packaging, orgInfo, next);
  };

  const change = (itemId: string, delta: number): void => {
    // Adding an item under a different category/packaging silently wipes any
    // existing cart lines (bulk carts are single-context) — warn before that
    // happens instead of losing the user's cart with no notice.
    const wouldClearCart = !cartMatchesView && cart.lines.length > 0 && delta > 0;
    if (wouldClearCart) {
      setPendingSwitch({ itemId, delta });
      return;
    }
    applyChange(itemId, delta);
  };

  const itemCount = cartMatchesView ? cart.lines.reduce((sum, l) => sum + l.count, 0) : 0;
  const subTotal = cartMatchesView ? cart.lines.reduce((sum, l) => sum + l.itemPrice * l.count, 0) : 0;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: CATEGORY_TITLE[category] }} />
      <StatusBar style="auto" />

      <View className="flex-row items-center gap-2 px-4 pt-3">
        <Button
          label="Individual"
          variant={packaging === 'individual' ? 'primary' : 'outline'}
          tone={packaging === 'individual' ? 'plan' : undefined}
          size="sm"
          onPress={() => setPackaging('individual')}
        />
        <Button
          label="Bulk"
          variant={packaging === 'bulk' ? 'primary' : 'outline'}
          tone={packaging === 'bulk' ? 'plan' : undefined}
          size="sm"
          onPress={() => setPackaging('bulk')}
        />
        <View className="flex-1" />
        {menu ? (
          <AppText variant="caption" className="text-muted-foreground">
            Min {menu.moq} units
          </AppText>
        ) : null}
      </View>

      <View className="px-4 pt-3">
        <View className="flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <IconSearch size={16} color={palette.neutral.gray500} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={`Search in ${CATEGORY_TITLE[category]}`}
            placeholderTextColor={palette.neutral.gray500}
            className="flex-1 text-foreground"
          />
        </View>
      </View>

      <View className="px-4 pt-3">
        <BulkVegFilterChips value={dietFilter} onChange={setDietFilter} />
      </View>

      {loading ? (
        <View style={{ padding: 16, gap: 12 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} className="flex-row gap-3 rounded-2xl border border-border bg-card p-3">
              <Skeleton width={118} height={118} radius={14} />
              <View style={{ flex: 1, gap: 8, paddingTop: 4 }}>
                <Skeleton width="60%" height={15} />
                <Skeleton width="35%" height={13} />
              </View>
            </View>
          ))}
        </View>
      ) : !menu ? (
        <View className="flex-1 items-center justify-center px-10">
          <AccentIcon icon={CircleAlert} tone="nonveg" size={26} tileSize={56} />
          <AppText variant="title" className="text-center text-foreground" style={{ marginTop: 12 }}>
            Couldn't load the menu
          </AppText>
          <AppText variant="bodySm" className="mt-1 text-center text-muted-foreground">
            Check your connection and try again.
          </AppText>
          <View style={{ marginTop: 16 }}>
            <Button label="Retry" variant="outline" onPress={fetchMenu} />
          </View>
        </View>
      ) : rawItems.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <AccentIcon icon={IconUtensils} tone="food" size={26} tileSize={56} />
          <AppText variant="title" className="text-center text-foreground" style={{ marginTop: 12 }}>
            Nothing here yet
          </AppText>
          <AppText variant="bodySm" className="mt-1 text-center text-muted-foreground">
            Try the other packaging option or check back later.
          </AppText>
        </View>
      ) : category === 'foodbox' && packaging === 'bulk' ? (
        // "Bulk" packaging under Food Box means "Customized" — build-your-own
        // box from a grouped item picker, not the generic per-item list, so
        // search (which only filters the generic list below) doesn't apply here.
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96 }}>
          <CustomFoodBox menu={menu} />
        </ScrollView>
      ) : items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <AccentIcon icon={IconUtensils} tone="food" size={26} tileSize={56} />
          <AppText variant="title" className="text-center text-foreground" style={{ marginTop: 12 }}>
            No matching items
          </AppText>
          <AppText variant="bodySm" className="mt-1 text-center text-muted-foreground">
            {q || dietFilter ? 'Try a different search term or filter.' : 'Try a different search term.'}
          </AppText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i._id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 96 }}
          renderItem={({ item }) => {
            const count = countFor(item._id);
            return (
              <BulkMenuItemCard
                item={item}
                count={count}
                unitPrice={menu ? unitPriceFor(item, Math.max(count, 1), menu, category) : item.itemPrice}
                belowMoq={menu ? isBelowMoq(count, menu) : false}
                moq={menu?.moq ?? 1}
                slabRows={menu ? slabTableFor(item, menu, category) : []}
                slabNote={menu ? slabNoteFor(item, count, menu, category) : null}
                onIncrease={() => change(item._id, 1)}
                onDecrease={() => change(item._id, -1)}
              />
            );
          }}
        />
      )}

      <BulkCartFooter itemCount={itemCount} subTotal={subTotal} onPress={() => router.push('/bulk-cart' as Href)} />

      <ConfirmDialog
        visible={pendingSwitch !== null}
        title="Switch category?"
        message="Adding an item here will clear your current bulk cart."
        confirmLabel="Switch"
        onConfirm={() => {
          if (pendingSwitch) applyChange(pendingSwitch.itemId, pendingSwitch.delta);
          setPendingSwitch(null);
        }}
        onCancel={() => setPendingSwitch(null)}
      />
    </View>
  );
}
