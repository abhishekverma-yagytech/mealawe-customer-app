import { useEffect, useState, type ComponentType } from 'react';
import { Platform, Pressable, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import Svg, { G, Path } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { type IconProps } from '@/components/ui/icons';
import { NAV_SEGMENT_HEIGHT, NavSegment } from '@/components/ui/NavSegment';
import { ApartmentOrderTypeTabs } from '@/features/apartment';
import { useStableBottomInset } from '@/hooks/useStableBottomInset';
import { accentTint, palette, shadow, useColors } from '@/theme';

import { HOME_NAV_BAR_BOTTOM_GAP, useHomeNavBarStore } from '../homeNavBarStore';
import { tabThemeFor } from '../tabTheme';

export interface HomeTab {
  key: string;
  label: string;
  icon: ComponentType<IconProps>;
}

/** The standalone pills' own fixed height — exact value from the Claude
 * Design (`healthyPillStyle`/`homePillStyle`'s `height:59px`). Distinct
 * from the BAR's height, which is measured live (see `homeNavBarStore`)
 * since it varies with font scale/label wrapping — the pills are a fixed
 * design size regardless of that. */
export const HOME_NAV_BAR_HEIGHT = 59;
// HOME_NAV_BAR_BOTTOM_GAP now lives in `../homeNavBarStore` (imported
// above) — single source of truth shared with `useHomeNavBarClearance()`,
// which superseded the static `HOME_NAV_BAR_CLEARANCE` this used to export.

/** Slide duration/easing — exact match for the design's own CSS transition
 * (`.34s cubic-bezier(.2,.8,.2,1)`), shared by the bar's position, the
 * track's shift, and both pills' position so everything moves in lockstep. */
const SLIDE_MS = 340;
const SLIDE_EASING = Easing.bezier(0.2, 0.8, 0.2, 1);
/** The pills' opacity fade is a SEPARATE, faster CSS transition in the
 * design (`.22s ease`, vs the position's `.34s`) — so opacity finishes
 * before the slide does. Modelled here as a fraction of the shared
 * progress value's timeline (220ms of 340ms ≈ 0.65) rather than a second
 * independent animation, since both are driven off one `progress` value. */
const OPACITY_DONE_AT = 0.65;
/** Near/far screen-edge insets the bar's `left`/`right` swap between —
 * exact values from the design. Their SUM is constant (118), so the bar's
 * own width never changes — only which edge it hugs — which is what makes
 * a plain measured-width pixel translate exact for the track shift below. */
const BAR_NEAR = 14;
const BAR_FAR = 104;

interface HomeBottomNavProps {
  /** The main tab row's tabs (Subscription/Bulk/On Demand/Navmool, ... —
   * never includes 'apartment', which is always rendered as its own
   * standalone pill regardless of what's passed here). */
  tabs: HomeTab[];
  activeKey: string;
  onSelect: (key: string) => void;
  /**
   * Which of the two nav layouts is showing — INDEPENDENT of `activeKey`.
   * Apartment can be the active content tab while the nav is still showing
   * the undrilled main-bar+pill (the app's initial state); this only
   * flips to the Home+order-type-tabs layout once the Apartment pill is
   * explicitly tapped, and back once Home is tapped.
   */
  drilledIn: boolean;
  /**
   * Enhancement (mirrors the legacy Ionic app's own `showApartment` flag):
   * whether the floating "Apartment" pill renders at all — hidden when the
   * resident's current location has no registered apartment complex
   * (`useApartmentEligibilityStore`'s `apartment === null`, resolved by the
   * caller). Gates ONLY this one pill, deliberately never the "Home" pill
   * (`drilledIn`'s own exit affordance) — a resident who's already drilled
   * into Apartment when it turns ineligible still needs a way back out
   * regardless of this flag; the caller separately force-navigates them
   * away in that case (see `(tabs)/index.tsx`'s own effect), at which point
   * `drilledIn` flips false and the (always-rendered) Home pill hides
   * itself the normal way.
   */
  apartmentVisible: boolean;
}

/** The "Apartment" pill's own glyph — real custom brand asset
 * (`assets/icons/Apartment-tabs/Apartment Icon.svg`), ported the same way as
 * `ApartmentOrderTypeTabs.tsx`'s own `InstantIcon`/`TodayIcon`/`AdvanceIcon`.
 * Replaces the generic Lucide `IconApartment` (Building2) placeholder this
 * pill used before. */
function ApartmentTabIcon({ size = 17, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <G fill={color}>
        <Path d="M6.23,18.38c-.24-.31-.31-.61-.31-.97,0-.23.14-.39.38-.39h.46c-.03-.69.09-1.32.35-1.94.63-1.51,1.98-2.6,3.61-2.83-.22-.41-.13-.88.21-1.16.36-.33.87-.34,1.25-.06s.49.79.26,1.22c2.35.36,4.02,2.41,3.92,4.77h.62c.24,0,.33.18.34.38.04.87-.62,1.52-1.47,1.52H.31c-.17,0-.28-.09-.31-.23-.02-.12.05-.31.21-.31h.83s0-14.74,0-14.74c0-.43.37-.73.77-.73h1.32s0-1.17,0-1.17c0-.37.32-.68.7-.68h4.76c.36,0,.65.34.65.67v1.19s1.38,0,1.38,0c.44,0,.79.31.79.76v6.72c0,.16-.15.25-.27.24-.12,0-.28-.08-.28-.24V3.71c0-.18-.13-.24-.28-.24H1.82c-.13,0-.24.11-.24.25v14.67s1.17,0,1.17,0v-2.39c0-.29.21-.56.52-.56h1.63c.31,0,.51.27.51.56v2.39s.82,0,.82,0ZM8.71,2.92v-1.12c-.01-.11-.09-.19-.22-.18H3.9c-.14,0-.22.09-.22.21v1.09s5.04,0,5.04,0ZM11.68,12.21c.19-.03.31-.17.34-.31.04-.18-.03-.34-.17-.44-.13-.1-.3-.11-.45-.03-.12.06-.22.18-.24.34-.02.13.05.28.14.36.1.09.24.12.39.09ZM15.83,17.03c.05-1.34-.53-2.58-1.54-3.39-.79-.61-1.74-.92-2.73-.9-.55,0-1.07.08-1.59.26-1.02.38-1.82,1.13-2.28,2.12-.28.6-.43,1.24-.39,1.91h8.53ZM4.88,18.38v-2.41s-1.51,0-1.51,0c-.04.03-.07.09-.07.14v2.28s1.58,0,1.58,0ZM15.85,18.39c.48,0,.87-.31.93-.81H6.47c.03.41.36.8.79.8h8.59Z" />
        <Path d="M17.7,9.23c-.28.41-.7.63-1.19.64-.71.01-1.28-.53-1.28-1.25,0-.88.73-1.67,1.53-2.08-1.01-.85-2.36-.63-3.07.44-.07.11-.26.09-.34.02-.1-.1-.1-.24,0-.35.46-.63,1.15-1.04,1.94-1.08.73-.03,1.41.26,1.94.77.91-.32,1.88-.27,2.7.22.08.12.09.25.01.34-.1.12-.23.09-.36,0-.62-.37-1.36-.41-2.06-.19.48.74.67,1.74.17,2.51ZM16.01,9.26c.39.26.87.19,1.2-.11.56-.62.37-1.58-.12-2.26-.65.31-1.28.87-1.4,1.6-.02.29.06.59.32.77Z" />
        <Path d="M4.95,10.63h-1.73c-.17,0-.31-.14-.31-.31v-1.75c0-.16.14-.31.31-.31h1.75c.18,0,.33.12.33.31v1.81c0,.16-.19.26-.34.26ZM4.75,10.09v-1.29s-1.32,0-1.32,0v1.29s1.32,0,1.32,0Z" />
        <Path d="M9.27,10.63h-1.83c-.17,0-.28-.16-.28-.31v-1.75c0-.2.17-.31.36-.31h1.72c.17,0,.3.15.3.31v1.73c0,.15-.09.34-.28.34ZM9.01,10.09v-1.29s-1.32,0-1.32,0v1.29s1.32,0,1.32,0Z" />
        <Path d="M9.25,7.04h-1.77c-.18,0-.32-.13-.32-.31v-1.75c0-.18.15-.32.33-.32h1.75c.15,0,.31.14.31.29v1.79c0,.14-.12.3-.29.31ZM9.01,6.49v-1.29s-1.31,0-1.31,0v1.29s1.31,0,1.31,0Z" />
        <Path d="M4.98,7.04h-1.77c-.2,0-.31-.16-.31-.34v-1.69c0-.2.13-.35.34-.35h1.74c.18,0,.31.16.31.32v1.75c0,.16-.13.31-.31.31ZM4.76,6.49v-1.29s-1.31,0-1.31,0v1.29s1.31,0,1.31,0Z" />
        <Path d="M4.97,14.24h-1.78c-.18-.02-.28-.15-.28-.33v-1.72c0-.17.14-.32.31-.32h1.77c.18,0,.3.16.3.32v1.78c0,.16-.18.27-.33.27ZM4.76,13.7v-1.29s-1.32,0-1.32,0v1.29s1.32,0,1.32,0Z" />
        <Path d="M13.04,8.47c.27-.07.52.09.58.33.07.26-.08.52-.34.59-.24.06-.49-.07-.57-.32s.05-.52.33-.6Z" />
        <Path d="M8.79,15.85c-.05.17-.17.26-.32.21-.15-.04-.2-.19-.15-.34.31-.93,1-1.67,1.93-1.99.13-.04.25.05.29.15s0,.25-.12.29c-.77.28-1.38.87-1.63,1.67Z" />
      </G>
    </Svg>
  );
}

/** The "Home" pill's own glyph — real custom brand asset
 * (`assets/icons/Apartment-tabs/Home Icon.svg`). Used to reuse the SAME
 * `IconApartment` building glyph the Apartment pill has (the design's own
 * duplicate-asset choice, per an earlier version of this comment) — now
 * that a real dedicated Home asset exists, the two pills finally get their
 * own distinct icons instead of sharing one. */
function HomeIcon({ size = 17, color = '#fff' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <G fill={color}>
        <Path d="M16.78,15.34v-7.28s-4.57-3.81-4.57-3.81l-2.23-1.84-3.39,2.82-3.48,2.91v7.25c0,.67.52,1.17,1.18,1.19h.78c.17,0,.3.11.32.27.01.14-.09.32-.26.32h-.88c-.91,0-1.71-.77-1.71-1.71v-6.83c-.44.42-1.07.47-1.52.07-.47-.42-.48-1.16-.03-1.61L8.96.39c.54-.46,1.37-.54,1.93-.08l3.01,2.5v-.48c.02-.39.33-.75.74-.76h2.18c.4-.01.83.26.83.7v3.67s1.38,1.16,1.38,1.16c.44.37.39,1.06.04,1.47-.39.45-1.01.5-1.48.15l-.21-.16-.02,6.83c0,1.08-.96,1.82-1.98,1.76-.21-.01-.37-.08-.37-.3,0-.18.17-.32.37-.3.73.08,1.41-.44,1.41-1.22ZM10.47,2.03l2.37,1.96,5.07,4.23c.23.2.54.19.73-.03.18-.21.16-.53-.07-.72L10.53.77c-.28-.24-.81-.24-1.1,0L1.38,7.51c-.15.12-.17.32-.13.48.03.14.15.29.29.35.23.09.41,0,.59-.15L9.59,1.96c.28-.23.61-.14.87.07ZM17.07,5.44v-3.12c0-.1-.07-.17-.16-.18h-2.24c-.09,0-.17.09-.17.17v.98s2.58,2.14,2.58,2.14Z" />
        <Path d="M5.11,15.76c-.66,0-1.19-.5-1.32-1.09-.06-.29.02-.55.2-.74s.47-.25.77-.22c-.04-2.46,1.66-4.58,4.05-5.07-.16-.51.1-1.03.58-1.24.38-.19.83-.14,1.16.11s.5.67.39,1.11c2.42.45,4.19,2.61,4.15,5.08h.35c.42.07.71.44.66.87-.1.72-.72,1.19-1.44,1.19H5.11ZM10.36,8.52c.14-.28-.07-.6-.35-.66-.19-.04-.38,0-.52.13-.11.1-.21.29-.15.47.07.19.31.29.49.31.2.01.43-.05.53-.25ZM14.5,13.7c.03-1.07-.33-2.05-.96-2.86-.88-1.13-2.24-1.74-3.67-1.73-1.3.02-2.53.52-3.39,1.51-.74.85-1.17,1.94-1.14,3.08h9.16ZM14.79,15.18c.53-.05.85-.62.68-.81-.04-.05-.11-.07-.2-.07H4.48c-.12,0-.15.19-.13.28.08.32.38.6.75.6h9.69Z" />
        <Path d="M10.92,19.64c-.21.25-.5.37-.81.36s-.57-.15-.76-.41c-.44-.68-.08-1.51.49-2.04-1.07-.71-2.29-.38-3.23.38-.1.08-.27.04-.35-.05-.09-.1-.09-.25-.02-.39,1.19-.96,2.76-1.34,4.04-.32,1.23-.78,2.71-.84,3.9.01.09.12.1.26.03.37s-.24.18-.37.09c-.97-.67-2.16-.66-3.16-.06.46.61.69,1.43.23,2.04ZM10.43,19.34c.37-.32.12-.99-.18-1.4-.24.23-.42.48-.51.79s.03.63.3.71c.13.04.28,0,.39-.1Z" />
        <Path d="M10.25,6.28c0,.18-.12.29-.27.3s-.31-.09-.31-.25v-1.13c0-.17.09-.29.25-.31.13-.02.32.08.32.25v1.14Z" />
        <Path d="M11.64,6.88c-.1.16-.28.19-.41.1-.16-.1-.16-.28-.06-.44l.52-.83c.09-.14.28-.17.41-.08.14.1.15.28.06.43l-.51.81Z" />
        <Path d="M8.77,6.6c.1.16,0,.33-.13.4-.17.09-.31-.01-.4-.17l-.51-.83c-.08-.13,0-.32.12-.37.14-.07.31-.04.4.11l.52.87Z" />
        <Path d="M15.61,19.33c-.33-.02-.5-.33-.41-.6s.4-.42.66-.27c.19.11.27.32.22.52s-.23.37-.47.35Z" />
        <Path d="M6.77,12.77c-.04.17-.21.24-.35.21-.11-.02-.25-.15-.22-.3.25-1.19,1.09-2.16,2.24-2.56.15-.05.31.07.35.18.05.14-.01.31-.17.36-.94.34-1.62,1.12-1.85,2.11Z" />
      </G>
    </Svg>
  );
}

/**
 * Fixed bottom nav — matches the Claude Design's (`Apartment Prototype.dc.html`)
 * bottom-chrome pixel-for-pixel, including its actual animation mechanism
 * (not an approximation of it):
 *
 * - The bar itself SLIDES — its `left`/`right` insets swap between
 *   `14/104` (undrilled) and `104/14` (drilled in). Because both pairs sum
 *   to the same 118px, the bar's WIDTH never changes, only which edge it
 *   hugs — it physically slides across, it doesn't resize.
 * - Inside it, a double-width track holds the main tabs and the Apartment
 *   order-type tabs side by side and shifts by exactly one bar-width so the
 *   correct half is always the one sitting inside the visible bar.
 * - "Apartment" and "Home" are each a SEPARATE, always-mounted floating
 *   pill (never inside the bar) that slides in from the screen edge as the
 *   bar vacates that side — bleeding half off-screen at rest, per the design.
 *
 * All four pieces (bar position, track shift, both pills' position) are
 * driven off ONE shared progress value so they move in perfect lockstep,
 * exactly as the design's identically-timed CSS transitions do.
 *
 * The bar's own chrome is translucent on iOS (Liquid Glass on 26+, a system
 * blur material below that) rather than a flat solid fill, same reasoning
 * as before this component grew the drilled-in mechanism above — a floating
 * pill nav over scrolling content is exactly the surface Apple's HIG designs
 * that material for. Android keeps a solid `colors.card` pill (Material
 * doesn't use this blurred-chrome convention the way iOS does).
 */
export function HomeBottomNav({ tabs, activeKey, onSelect, drilledIn, apartmentVisible }: HomeBottomNavProps) {
  // Shared with BottomOverlayStack — see the hook's own doc for why this
  // can't just be `useSafeAreaInsets().bottom` read locally in each place.
  const stableInsetBottom = useStableBottomInset();
  const { width: windowWidth } = useWindowDimensions();
  const reduced = useReducedMotion();
  const colors = useColors();

  // Apartment is always rendered as its own pill (below), never as part of
  // this row — filtered defensively here rather than relying on every
  // caller to remember to exclude it from `tabs`. `onSelect('__home__')` is
  // a sentinel the caller resolves to its own default tab — this component
  // doesn't need to know which one that is.
  const mainTabs = tabs.filter((tab) => tab.key !== 'apartment');

  // Bug fix (product report — "bottom tabs width doesn't take full if
  // Apartment is not there"): BAR_FAR (104px) exists ONLY to leave room for
  // the floating Apartment pill bleeding in from the right edge at rest —
  // this used to reserve that space unconditionally, even when
  // `apartmentVisible` is false and no such pill is mounted at all (its own
  // `apartmentPillStyle` view isn't even rendered then — see below), leaving
  // a permanent dead gap on the main tab row's right side for no reason.
  // `drilledIn` can only ever become true via a tap on that same pill (see
  // `(tabs)/index.tsx`'s `selectTab`), so it's structurally impossible to be
  // true while `apartmentVisible` is false — safe to collapse BOTH edges to
  // the near inset in that case, letting the row use the full width, while
  // leaving the apartment-visible case pixel-identical to before.
  const farInset = apartmentVisible ? BAR_FAR : BAR_NEAR;
  const barWidth = Math.max(0, windowWidth - BAR_NEAR - farInset);

  const progress = useSharedValue(drilledIn ? 1 : 0);
  // Bug fix (root cause of the intermittent blank Instant/Today/Advance
  // row): confirmed on-device that when this goes wrong, the order-type
  // segments render with real, correctly-spaced geometry but sit OUTSIDE
  // the bar's own visible clipped window (their accessibility bounds share
  // the clip's right edge with a NEGATIVE width, i.e. the intersection of
  // their true position with the visible window is empty) — exactly what
  // happens if `progress` never actually reaches 1 (`trackStyle`'s
  // `translateX` stays close to 0, its un-shifted position) while
  // `orderTypeHalfStyle`'s own `opacity > 0.001` gate is satisfied almost
  // immediately regardless (a much lower bar to clear) — so the row LOOKS
  // like it should be showing, opacity-wise, while still sitting off-frame.
  // `withTiming` can fail to reach its target if this effect's own
  // animation gets interrupted/superseded (a re-render/remount racing the
  // 340ms transition) with nothing to correct it afterward. This settle
  // timer is a deterministic safety net: ~50ms after the animation should
  // have finished, hard-snap `progress` to the real target regardless of
  // whatever the animation itself actually landed on — cheap (one extra
  // assignment, never visible since it fires after the transition's own
  // duration) and guarantees the track can never get stuck mid-slide.
  useEffect(() => {
    const target = drilledIn ? 1 : 0;
    if (reduced) {
      progress.value = target;
      return;
    }
    progress.value = withTiming(target, { duration: SLIDE_MS, easing: SLIDE_EASING });
    const settle = setTimeout(() => {
      progress.value = target;
    }, SLIDE_MS + 50);
    return () => clearTimeout(settle);
  }, [drilledIn, reduced, progress]);

  const barStyle = useAnimatedStyle(() => ({
    left: interpolate(progress.value, [0, 1], [BAR_NEAR, farInset], Extrapolation.CLAMP),
    right: interpolate(progress.value, [0, 1], [farInset, BAR_NEAR], Extrapolation.CLAMP),
  }));
  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.value, [0, 1], [0, -barWidth], Extrapolation.CLAMP) }],
  }));
  // Belt-and-suspenders on top of the elevation/clip split above: once
  // SETTLED at either end, force the off-side half fully transparent
  // regardless of whether the clip actually worked. This is what
  // guarantees "two tabs active at once" can't get stuck that way even on
  // an Android/device combo where the clip still misbehaves — mid-slide,
  // both halves stay opaque (the transform is what shows the motion).
  const mainHalfStyle = useAnimatedStyle(() => ({ opacity: progress.value < 0.999 ? 1 : 0 }));
  const orderTypeHalfStyle = useAnimatedStyle(() => ({ opacity: progress.value > 0.001 ? 1 : 0 }));
  // Apartment pill: bleeds off the RIGHT edge, fades out as the nav drills in.
  const apartmentPillStyle = useAnimatedStyle(() => ({
    right: interpolate(progress.value, [0, 1], [-6, -130], Extrapolation.CLAMP),
    opacity: interpolate(progress.value, [0, OPACITY_DONE_AT], [1, 0], Extrapolation.CLAMP),
  }));
  // Home pill: bleeds off the LEFT edge, fades in as the nav drills in.
  const homePillStyle = useAnimatedStyle(() => ({
    left: interpolate(progress.value, [0, 1], [-130, -6], Extrapolation.CLAMP),
    opacity: interpolate(progress.value, [1 - OPACITY_DONE_AT, 1], [0, 1], Extrapolation.CLAMP),
  }));

  // Product instruction, 2026-09-03 — "gap between Apartment↔other tabs and
  // Home↔other tabs should be equal": both pills share the exact same
  // offsets/padding already (BAR_NEAR/BAR_FAR, the -6/-130 bleed values), so
  // the gaps were only UNEQUAL because "Apartment" (9 letters) renders wider
  // than "Home" (4 letters) at the same padding — a longer label pushes that
  // pill's near edge further from the main bar than the shorter one. Fixing
  // this by measuring each pill's real rendered width (font-scale/locale
  // safe — no guessed pixel constant) and applying the LARGER of the two as
  // a shared explicit width to both, so they end up visually identical
  // regardless of label length, without touching `NavTabButton`/`NavSegment`
  // (the other tabs) at all.
  const [apartmentPillWidth, setApartmentPillWidth] = useState(0);
  const [homePillWidth, setHomePillWidth] = useState(0);
  const sharedPillWidth = apartmentPillWidth > 0 && homePillWidth > 0 ? Math.max(apartmentPillWidth, homePillWidth) : undefined;

  const bottomOffset = HOME_NAV_BAR_BOTTOM_GAP + stableInsetBottom;
  const setMeasuredHeight = useHomeNavBarStore((s) => s.setMeasuredHeight);

  const onLayout = (e: LayoutChangeEvent) => {
    setMeasuredHeight(e.nativeEvent.layout.height);
  };

  // Explicit height on both rows (not content-implied) — this, together
  // with routing every tab segment through the ONE shared `NavSegment`
  // component, is what guarantees the bar measures out to the exact same
  // height in both nav modes, regardless of any platform text-metric quirk.
  const track = (
    <Animated.View style={[{ flexDirection: 'row' }, trackStyle]}>
      <Animated.View
        style={[{ width: barWidth, height: NAV_SEGMENT_HEIGHT, flexDirection: 'row', gap: 2 }, mainHalfStyle]}
        pointerEvents={drilledIn ? 'none' : 'auto'}>
        {mainTabs.map((tab) => (
          <NavTabButton key={tab.key} tab={tab} active={tab.key === activeKey} onPress={() => onSelect(tab.key)} />
        ))}
      </Animated.View>
      <Animated.View
        style={[{ width: barWidth, height: NAV_SEGMENT_HEIGHT, flexDirection: 'row', gap: 2 }, orderTypeHalfStyle]}
        pointerEvents={drilledIn ? 'auto' : 'none'}>
        <ApartmentOrderTypeTabs />
      </Animated.View>
    </Animated.View>
  );

  // Common to all three chrome variants below — overflow:hidden + the radius
  // is what clips the double-width track to just the visible bar-width half.
  const barChromeStyle = {
    overflow: 'hidden' as const,
    borderRadius: 999,
    paddingTop: 6,
    paddingRight: 14,
    paddingBottom: 6,
    paddingLeft: 6,
  };

  let barChrome;
  // iOS 26+ Liquid Glass — a floating pill nav sitting over scrolling content
  // is exactly the surface Apple's HIG designs this material for. `GlassView`
  // is a native host component (not a plain `View`), so every layout value it
  // needs is passed via `style` rather than `className`, to avoid depending on
  // NativeWind's utility-class transform reaching a non-standard native view.
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    barChrome = (
      <GlassView
        glassEffectStyle="regular"
        isInteractive
        // Raw glass alone let busy content underneath (the hero gradient,
        // photos) bleed through strongly enough that label contrast suffered
        // — this tint gives the glass a contrast floor to sit on, same
        // reasoning as the `BlurView` branch below.
        tintColor={accentTint(colors.card, 0.55)}
        onLayout={onLayout}
        style={barChromeStyle}>
        {track}
      </GlassView>
    );
  } else if (Platform.OS === 'ios') {
    // Pre-iOS 26 (no Liquid Glass yet) — still shouldn't be a flat solid pill.
    // Native iOS tab/toolbars have been translucent/blurred since iOS 7, well
    // before Liquid Glass existed, so this is the historically-correct
    // "native feeling" look for this range, not just a stand-in.
    // `systemChromeMaterial` is Apple's own tint for navigation chrome and
    // adapts to light/dark automatically — no manual `colorScheme` handling
    // needed here.
    barChrome = (
      <BlurView
        intensity={80}
        tint="systemChromeMaterial"
        onLayout={onLayout}
        style={[
          barChromeStyle,
          {
            // Same reasoning as the Liquid Glass branch's `tintColor` above —
            // pure blur with nothing behind it let busy content underneath
            // wash out label contrast. A translucent `colors.card` layer
            // gives the blur a contrast floor without flattening it into a
            // solid opaque pill.
            backgroundColor: accentTint(colors.card, 0.55),
          },
        ]}>
        {track}
      </BlurView>
    );
  } else {
    // Android — solid `colors.card` pill, unchanged from before this file
    // grew the two iOS-only chrome variants above.
    //
    // Bug fix (product report, 2026-09-05 — "tabs getting flicked/mismatched
    // switching to Apartment"): this `overflow:'hidden'` View is the ONLY
    // thing clipping the double-width `track` down to one visible half — and
    // on Android, the paper/Fabric renderer is allowed to "flatten" a plain
    // `View` that looks layout-inert into its parent as a pure optimization,
    // which silently drops the clip along with it. A View with a transformed
    // child (the track's `translateX`) is exactly the case that optimization
    // doesn't know is unsafe to flatten — this is the "even on an Android/
    // device combo where the clip still misbehaves" case the opacity
    // belt-and-suspenders above already anticipated, just never actually
    // prevented at the source. `collapsable={false}` forces this View to
    // stay a REAL native node so its clip can never be optimized away —
    // fixes the failure mode instead of only papering over it once settled.
    barChrome = (
      <View
        collapsable={false}
        onLayout={onLayout}
        style={[barChromeStyle, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
        {track}
      </View>
    );
  }

  return (
    <>
      {/* Elevation (Android) forces its own compositing layer — put it on
          this OUTER view only. Stacked with overflow:hidden + borderRadius
          + a transformed child (the track, above) on the SAME view, Android
          can fail to clip that child at all, which looks exactly like "the
          other half stays visible after switching" — hence the split. */}
      <Animated.View style={[shadow.card, barStyle, { position: 'absolute', bottom: bottomOffset, borderRadius: 999, zIndex: 15 }]}>
        {barChrome}
      </Animated.View>

      {/* Standalone "Apartment" pill — mounted whenever `apartmentVisible`
          (hidden entirely, not just disabled, when the resident's location
          has no registered apartment complex — see the prop's own doc),
          slides off the right edge as the nav drills in. Solid-filled
          (never a soft tint like the tabs), half-rounded, per the design. */}
      {apartmentVisible ? (
        <Animated.View
          pointerEvents={drilledIn ? 'none' : 'auto'}
          style={[apartmentPillStyle, { position: 'absolute', bottom: bottomOffset, zIndex: 16 }]}>
          <Pressable
            onPress={() => onSelect('apartment')}
            onLayout={(e) => setApartmentPillWidth(e.nativeEvent.layout.width)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeKey === 'apartment' }}
            accessibilityLabel="Apartment"
            className="active:opacity-90"
            style={[
              shadow.card,
              {
                height: HOME_NAV_BAR_HEIGHT,
                // Bug fix: a hard `width` here could freeze in a value
                // measured from the FIRST layout pass — before a custom
                // font finishes loading — permanently too narrow for the
                // text once the real font metrics land, which is exactly
                // what clipped "Apartment" down to wrapping its own last
                // letter onto a second line. `minWidth` is a floor, not a
                // cap: it still equalizes this pill with Home's (narrower)
                // one, but can never squeeze either below whatever room its
                // own content actually needs.
                minWidth: sharedPillWidth,
                paddingLeft: 20,
                paddingRight: 18,
                borderTopLeftRadius: 999,
                borderBottomLeftRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                backgroundColor: activeKey === 'apartment' ? palette.apartmentPill.active : palette.apartmentPill.inactive,
              },
            ]}>
            <ApartmentTabIcon size={17} color="#fff" />
            <AppText variant="overline" numberOfLines={1} style={{ color: '#fff', fontSize: 9.5, letterSpacing: 0.3 }}>
              Apartment
            </AppText>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Standalone "Home" pill — always mounted, slides off the left edge
          as the nav drills in (mirror image of the Apartment pill). Now has
          its own dedicated glyph (`HomeIcon` above) — it used to reuse the
          Apartment pill's own building icon since no distinct Home asset
          existed yet. */}
      <Animated.View
        pointerEvents={drilledIn ? 'auto' : 'none'}
        style={[homePillStyle, { position: 'absolute', bottom: bottomOffset, zIndex: 16 }]}>
        <Pressable
          onPress={() => onSelect('__home__')}
          onLayout={(e) => setHomePillWidth(e.nativeEvent.layout.width)}
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
          className="active:opacity-90"
          style={[
            shadow.card,
            {
              height: HOME_NAV_BAR_HEIGHT,
              // Same "floor, not a cap" reasoning as the Apartment pill above.
              minWidth: sharedPillWidth,
              paddingLeft: 20,
              paddingRight: 18,
              borderTopRightRadius: 999,
              borderBottomRightRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              backgroundColor: palette.apartmentPill.active,
            },
          ]}>
          <HomeIcon size={17} color="#fff" />
          <AppText variant="overline" numberOfLines={1} style={{ color: '#fff', fontSize: 9.5, letterSpacing: 0.3 }}>
            Home
          </AppText>
        </Pressable>
      </Animated.View>
    </>
  );
}

/** Thin adapter over the shared `NavSegment` — resolves this tab's own
 * accent (per-tab, from `tabThemeFor`) and hands off to the exact same
 * render logic `ApartmentOrderTypeTabs`'s segments use, so the two rows
 * can never visually drift apart from each other again. */
function NavTabButton({
  tab,
  active,
  onPress,
}: {
  tab: HomeTab;
  active: boolean;
  onPress: () => void;
}) {
  const accent = tabThemeFor(tab.key).accent;
  // Product instruction — active-tab tint now matches `master`'s own
  // `NavTabButton` value (0.14) instead of the design's `accent+'20'`
  // (32/255 ≈ 0.125) hex-alpha shorthand this used to use.
  const tintColor = accentTint(accent, 0.14);
  return <NavSegment icon={tab.icon} label={tab.label} accent={accent} tintColor={tintColor} active={active} onPress={onPress} />;
}
