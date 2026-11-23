import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { palette, accentTint } from '@/theme';

import { useReasons } from '../reasons';

/**
 * Dark "why choose us" tile grid — 6 tiles (icon + title + sub-copy), 2 per
 * row, on the brand deep-ink background (`palette.brand.teal`), each tile a
 * slightly lighter translucent card. Reads its 6 entries from `reasons.ts`'s
 * `useReasons` (cluster-aware — Kota's first tile differs) — fully
 * self-contained, no props.
 */
export function ReasonsGrid() {
  const reasons = useReasons();
  return (
    <View className="rounded-2xl p-4" style={{ backgroundColor: palette.brand.teal }}>
      <View className="flex-row flex-wrap justify-between" style={{ rowGap: 12 }}>
        {reasons.map((reason) => {
          const Icon = reason.icon;
          return (
            <View
              key={reason.title}
              className="gap-2 rounded-2xl p-3"
              style={{ width: '48%', backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: accentTint('#ffffff', 0.14),
                }}>
                <Icon size={18} color="#ffffff" />
              </View>
              <AppText variant="label" style={{ color: '#ffffff' }}>
                {reason.title}
              </AppText>
              <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.72)' }}>
                {reason.sub}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}
