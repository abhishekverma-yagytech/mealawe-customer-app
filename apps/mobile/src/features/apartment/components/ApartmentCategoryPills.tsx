import { Image, Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { IconUtensils } from '@/components/ui/icons';
import { useApartmentColors } from '@/theme';

// Fixed 12-cuisine taxonomy, deliberately not derived from currently loaded dishes.
export const APARTMENT_CUISINES = [
  'Kashmiri',
  'Punjabi',
  'Rajasthani',
  'Gujrati',
  'Maharashtrian',
  'Bihari',
  'North Eastern',
  'Bengali',
  'South Indian',
  'Hyderabadi',
  'Western',
  'North Indian',
];

// Decorative per-pill accent hues, index-paired with APARTMENT_CUISINES.
const HUES = ['#c2461f', '#8a5a12', '#1e5b3f', '#0f766e', '#7a3b8a', '#a0431f', '#2e6b8a', '#8a1f3f', '#4a6b12', '#8a3b1f', '#3b4a8a', '#6b4a12'];

// Maps each APARTMENT_CUISINES entry to a glyph index that's actually evocative of it (not just cycling order).
const CUISINE_GLYPH_INDEX = [0, 1, 3, 6, 2, 11, 4, 7, 10, 8, 9, 5];

type Glyph = (color: string) => React.ReactNode;

const GLYPHS: Glyph[] = [
  (c) => <Path key="drop" d="M12 3s6 6.3 6 10a6 6 0 0 1-12 0c0-3.7 6-10 6-10Z" stroke={c} />,
  (c) => <Path key="flame" d="M12 2c2 4 5 5 5 9a5 5 0 0 1-10 0c0-1.5.6-2.6 1.5-3.6C9.7 6.2 11 5 12 2Z" stroke={c} />,
  (c) => <Path key="chili" d="M18 5c-1 5-5 9-10 10-2 .4-4-1-4-3 5-1 9-5 10-10 2.5 0 4 1 4 3Z" stroke={c} />,
  (c) => (
    <>
      <Circle key="thali-o" cx="12" cy="12" r="9" stroke={c} />
      <Circle key="thali-i" cx="12" cy="12" r="4" stroke={c} />
    </>
  ),
  (c) => (
    <>
      <Path key="bowl-b" d="M3 11h18a9 9 0 0 1-18 0Z" stroke={c} />
      <Path key="bowl-l" d="M8 8c0-2 1-3 2-3" stroke={c} />
      <Path key="bowl-r" d="M13 8c0-2 1-3 2-3" stroke={c} />
    </>
  ),
  (c) => (
    <>
      <Circle key="roti-o" cx="12" cy="12" r="9" stroke={c} />
      <Path key="roti-1" d="M9 9h.01" stroke={c} />
      <Path key="roti-2" d="M15 11h.01" stroke={c} />
      <Path key="roti-3" d="M11 15h.01" stroke={c} />
    </>
  ),
  (c) => (
    <>
      <Path key="leaf-1" d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" stroke={c} />
      <Path key="leaf-2" d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" stroke={c} />
    </>
  ),
  (c) => (
    <>
      <Path key="fish-b" d="M3 12c4-6 12-6 16 0-4 6-12 6-16 0Z" stroke={c} />
      <Circle key="fish-e" cx="15" cy="12" r="1" stroke={c} fill={c} />
    </>
  ),
  (c) => (
    <>
      <Rect key="pot-b" x="4" y="9" width="16" height="10" rx="3" stroke={c} />
      <Path key="pot-h1" d="M2 11h2" stroke={c} />
      <Path key="pot-h2" d="M20 11h2" stroke={c} />
      <Path key="pot-l1" d="M8 6l1-2" stroke={c} />
      <Path key="pot-l2" d="M15 6l-1-2" stroke={c} />
    </>
  ),
  (c) => (
    <>
      <Path key="spoon-h" d="M13 4a3.5 3.5 0 0 1 0 7 3.5 3.5 0 0 1 0-7Z" stroke={c} />
      <Path key="spoon-s" d="M12 11 9 21" stroke={c} />
    </>
  ),
  (c) => (
    <>
      <Path key="cup-b" d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" stroke={c} />
      <Path key="cup-h" d="M17 9h2a2 2 0 0 1 0 4h-2" stroke={c} />
      <Path key="cup-base" d="M4 21h13" stroke={c} />
    </>
  ),
  (c) => (
    <>
      <Path key="wheat-stem" d="M12 22V9" stroke={c} />
      <Path key="wheat-1" d="M12 9 8 5l4-3 4 3-4 4Z" stroke={c} />
      <Path key="wheat-2" d="M12 15 8 12l-3 3 4 3 3-3Z" stroke={c} />
      <Path key="wheat-3" d="M12 15l4-3 3 3-4 3-3-3Z" stroke={c} />
    </>
  ),
];

function CuisineGlyph({ index, color, size = 21 }: { index: number; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {GLYPHS[index % GLYPHS.length](color)}
    </Svg>
  );
}

/**
 * Illustrated badge art per cuisine (complete circular badge, renders instead of the plain glyph pill).
 * Pre-rasterized PNGs, not live SVG — the original vector traces caused main-thread ANR stalls on mount.
 */
const CUISINE_IMAGE: Partial<Record<string, { active: number; default: number }>> = {
  Kashmiri: { active: require('@/assets/images/cuisines/active/Kashmiri.png'), default: require('@/assets/images/cuisines/default/Kashmiri.png') },
  Punjabi: { active: require('@/assets/images/cuisines/active/Punjabi.png'), default: require('@/assets/images/cuisines/default/Punjabi.png') },
  Rajasthani: { active: require('@/assets/images/cuisines/active/Rajasthani.png'), default: require('@/assets/images/cuisines/default/Rajasthani.png') },
  Gujrati: { active: require('@/assets/images/cuisines/active/Gujrati.png'), default: require('@/assets/images/cuisines/default/Gujrati.png') },
  Maharashtrian: { active: require('@/assets/images/cuisines/active/Maharashtrian.png'), default: require('@/assets/images/cuisines/default/Maharashtrian.png') },
  Bihari: { active: require('@/assets/images/cuisines/active/Bihari.png'), default: require('@/assets/images/cuisines/default/Bihari.png') },
  Bengali: { active: require('@/assets/images/cuisines/active/Bengali.png'), default: require('@/assets/images/cuisines/default/Bengali.png') },
  'South Indian': { active: require('@/assets/images/cuisines/active/SouthIndian.png'), default: require('@/assets/images/cuisines/default/SouthIndian.png') },
  Hyderabadi: { active: require('@/assets/images/cuisines/active/Hyderabadi.png'), default: require('@/assets/images/cuisines/default/Hyderabadi.png') },
  Western: { active: require('@/assets/images/cuisines/active/Western.png'), default: require('@/assets/images/cuisines/default/Western.png') },
  'North Indian': { active: require('@/assets/images/cuisines/active/NorthIndian.png'), default: require('@/assets/images/cuisines/default/NorthIndian.png') },
  // No dedicated North Eastern artwork; reuses North Indian's.
  'North Eastern': { active: require('@/assets/images/cuisines/active/NorthIndian.png'), default: require('@/assets/images/cuisines/default/NorthIndian.png') },
};

interface ApartmentCategoryPillsProps {
  /** `null` means "All"; tapping the active cuisine again falls back to "All". */
  selected: string | null;
  onSelect: (cuisine: string | null) => void;
}

// Cuisine-category pill row with a leading "All" pill; only one pill is active at a time.
export function ApartmentCategoryPills({ selected, onSelect }: ApartmentCategoryPillsProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
      <AllPill active={selected === null} onPress={() => onSelect(null)} />
      {APARTMENT_CUISINES.map((cuisine, i) => (
        <CategoryPill
          key={cuisine}
          label={cuisine}
          hue={HUES[i % HUES.length]}
          glyphIndex={CUISINE_GLYPH_INDEX[i % CUISINE_GLYPH_INDEX.length]}
          active={selected === cuisine}
          onPress={() => onSelect(selected === cuisine ? null : cuisine)}
        />
      ))}
    </ScrollView>
  );
}

function AllPill({ active, onPress }: { active: boolean; onPress: () => void }) {
  const { colors } = useApartmentColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="All" accessibilityState={{ selected: active }} className="items-center active:opacity-80" style={{ width: 62 }}>
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? colors.green : colors.card,
        }}>
        <IconUtensils size={20} color={active ? '#fff' : colors.green} />
      </View>
      <AppText
        variant="caption"
        weight={active ? 'bold' : undefined}
        numberOfLines={1}
        style={{ color: active ? colors.greenDeep : colors.mutedLine, marginTop: 6, fontSize: 10.5 }}>
        All
      </AppText>
    </Pressable>
  );
}

function CategoryPill({ label, hue, glyphIndex, active, onPress }: { label: string; hue: string; glyphIndex: number; active: boolean; onPress: () => void }) {
  const { colors } = useApartmentColors();
  const imageSet = CUISINE_IMAGE[label];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} className="items-center active:opacity-80" style={{ width: 62 }}>
      {imageSet ? (
        <Image source={active ? imageSet.active : imageSet.default} style={{ width: 46, height: 46 }} resizeMode="contain" />
      ) : (
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 999,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active ? hue : colors.card,
          }}>
          <CuisineGlyph index={glyphIndex} color={active ? '#fff' : hue} />
        </View>
      )}
      <AppText
        variant="caption"
        weight={active ? 'bold' : undefined}
        numberOfLines={1}
        // Active text color is a deliberate fixed value, not colors.greenDeep.
        style={{ color: active ? '#FEAB04' : colors.mutedLine, marginTop: 6, fontSize: 10.5 }}>
        {label}
      </AppText>
    </Pressable>
  );
}
