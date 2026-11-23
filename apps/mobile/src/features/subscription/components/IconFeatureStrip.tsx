import { View } from 'react-native';

import { AccentIcon } from '@/components/ui/AccentIcon';
import { AppText } from '@/components/ui/AppText';

import type { PromiseItem } from '../promises';

interface IconFeatureStripProps {
  items: readonly PromiseItem[];
}

/**
 * Light feature strip — N equal columns (icon + 2-line caption) split by thin
 * vertical dividers. Shared by `PromiseStrip` (the subscription detail
 * screen's "our promise" strip) and the Home bestseller banner's feature row —
 * same layout, different `items`.
 */
export function IconFeatureStrip({ items }: IconFeatureStripProps) {
  return (
    <View className="flex-row rounded-2xl border border-border bg-card py-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <View
            key={item.label}
            className={`flex-1 items-center gap-2 px-1 ${index > 0 ? 'border-l border-border' : ''}`}>
            <AccentIcon icon={Icon} tone={item.tone} size={18} tileSize={36} />
            <AppText variant="caption" className="text-muted-foreground" style={{ textAlign: 'center' }}>
              {item.label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}
