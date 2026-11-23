import { View } from 'react-native';

import { OnDemandKitchenCard } from './OnDemandKitchenCard';
import type { OnDemandKitchen } from '../types';

interface KitchenGridProps {
  kitchens: OnDemandKitchen[];
  onPressKitchen: (kitchen: OnDemandKitchen) => void;
}

/**
 * Two-column vertical kitchen grid (Zomato "recommended for you" pattern) —
 * wraps inline like the Subscription plan grid (`SubscriptionHome`'s `48%`
 * cards) rather than a nested FlatList, so it scrolls as part of the single
 * outer page scroller instead of tripping RN's nested-VirtualizedList warning.
 */
export function KitchenGrid({ kitchens, onPressKitchen }: KitchenGridProps) {
  return (
    <View className="flex-row flex-wrap justify-between px-4" style={{ rowGap: 16 }}>
      {kitchens.map((kitchen) => (
        <View key={kitchen._id} style={{ width: '48%' }}>
          <OnDemandKitchenCard kitchen={kitchen} onPress={() => onPressKitchen(kitchen)} />
        </View>
      ))}
    </View>
  );
}
