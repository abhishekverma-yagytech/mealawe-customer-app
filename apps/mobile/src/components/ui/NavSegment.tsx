import { useEffect, useRef } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { palette, useColors } from '@/theme';

import { AppText } from './AppText';
import type { IconProps } from './icons';

/** Fixed content height for one nav segment (icon + label), independent of
 * font metrics — explicit rather than content-implied so it can NEVER
 * drift by even a pixel between call sites. That's exactly what let
 * `HomeBottomNav`'s main tabs and `ApartmentOrderTypeTabs`'s order-type
 * tabs render with different apparent heights/pill shapes despite starting
 * from identical style VALUES — an implied (padding + line-height) height
 * can still be nudged apart by platform text metrics; an explicit number
 * cannot. 17px icon + 2px gap + a deliberately tight 12px label line-height
 * (not the `overline` variant's own 14px, which stayed in play even after
 * the font-size itself was overridden down to 8px) + 8px padding top/bottom
 * — chosen so the BAR's total height (this + its own 6px top/bottom
 * padding) lands on exactly 59px, matching the Home/Apartment pills' own
 * fixed height, so the whole nav sits on one consistent baseline. */
export const NAV_SEGMENT_HEIGHT = 17 + 2 + 12 + 8 * 2;

/**
 * The single, shared "one nav tab" primitive — SOURCE OF TRUTH for every
 * bottom-nav tab segment in the app. `HomeBottomNav`'s main tabs
 * (Subscription/Bulk/On Demand/Navmool) AND `ApartmentOrderTypeTabs`'s
 * order-type tabs (Instant/Today/Advance/Bulk) both render through this
 * exact function now — not two separately-maintained-but-supposedly-
 * identical copies, which is how they drifted apart in the first place.
 *
 * Product instruction — "active tab design should be taken from master
 * branch, apply it to Apartment mode too": the active/inactive TREATMENT
 * (shape, fill, and color) now matches `master`'s original `NavTabButton`
 * exactly — a full-width (not content-sized/inset) `rounded-2xl` tint fill,
 * theme-aware inactive colors (`palette.neutral.gray500`/
 * `colors.mutedForeground`, dark-mode correct, replacing this file's own
 * earlier fixed hex greys) — while keeping this session's own current
 * STRUCTURE untouched (the Apartment/Home floating pills, the drilled-in
 * sliding bar mechanism, `ApartmentOrderTypeTabs` living in the bottom nav)
 * — only this shared primitive's own visual rendering changed, not where or
 * how it's used. The icon size and label's own compact 8px/12px sizing stay
 * as they are (not master's larger default `overline` size) specifically so
 * `NAV_SEGMENT_HEIGHT` doesn't shift — that fixed number is what keeps the
 * whole bar landing on exactly 59px, matching the Home/Apartment pills' own
 * height (see that constant's own comment); widening the label here would
 * have broken that alignment for no visual gain master's own design doesn't
 * even have (master never had to match a separate floating pill's height).
 * The tint fades in/out (rather than snapping) and the icon does a small
 * "pop" on the tap that activates it — both unchanged, driven from here so
 * every tab in the app gets the same feel for free.
 */
export function NavSegment({
  icon: Icon,
  label,
  accent,
  tintColor,
  active,
  onPress,
  renderOwnBackground = true,
  onMeasured,
  edgeInsetEnd = 0,
  columnWidthPercent,
}: {
  icon: React.ComponentType<IconProps>;
  label: string;
  /** Icon/label color when active. */
  accent: string;
  /** Background when active — typically `accentTint(accent, 32/255)`. */
  tintColor: string;
  active: boolean;
  onPress: () => void;
  /**
   * False when a PARENT row already paints a sliding indicator behind every
   * segment (see `ApartmentOrderTypeTabs`'s iOS indicator) — this segment
   * then only colors its own icon/label and skips its own tinted pill,
   * since painting both would double up on the highlight. Defaults to true
   * — the plain "each tab tints itself" mode `HomeBottomNav`'s main row
   * still uses everywhere.
   */
  renderOwnBackground?: boolean;
  /**
   * Reports this segment's own `{x, width}` (relative to its row) so a
   * parent-owned sliding indicator can align to the real measured position
   * instead of a hand-derived formula. Only wired up by rows that render
   * one — see `renderOwnBackground`.
   */
  onMeasured?: (x: number, width: number) => void;
  /**
   * Extra END-side (right, LTR) margin in px, ON TOP of the base 3px inset
   * below — only for a segment that sits LAST in its row, directly against
   * the bar's own rounded cap. Bug fix (product report — Advance's active
   * tint still visibly poking past the pill's curve even with the base 3px
   * inset in place, on-device, despite that inset appearing geometrically
   * sufficient on paper against this bar's own measured height/radius —
   * something about how Android composites/clips a Reanimated-driven child
   * here doesn't fully honor the outer `overflow:'hidden'` + `borderRadius`
   * clip right at the curve, so this leans on geometry alone (never
   * reaching that zone in the first place) rather than trusting the clip to
   * save it). Left at 0 (unchanged) for every other segment — Today/Instant
   * keep their exact prior size/position; only the one tab that actually
   * sits against a curve gets pulled in further.
   */
  edgeInsetEnd?: number;
  /**
   * Bug fix (product report — "Instant has more width then Today then Advance,
   * manage width... same width for each tab"): this column used to size via
   * plain `flex-1`, which SHOULD split a row's width equally regardless of
   * content — but each label here is unlabelled-length text with no explicit
   * `flexShrink`/`minWidth` pin, and on-device the three columns visibly did
   * NOT end up equal (longer labels effectively claiming more of the row than
   * a strict equal split, however Yoga is arriving at that). Rather than
   * chase which exact flex-content interaction causes that, an explicit
   * `{width}%` (e.g. 100/3 for a 3-tab row) removes content length from the
   * equation entirely — every column gets the identical, deterministic share
   * of the row no matter how long its own label is. Optional (undefined ⇒
   * the original `flex-1` class still applies) so `HomeBottomNav`'s own main
   * tab row — not reported as having this problem — stays byte-for-byte
   * unchanged; only `ApartmentOrderTypeTabs`'s call site sets this.
   */
  columnWidthPercent?: number;
}) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const progress = useSharedValue(active ? 1 : 0);
  const scale = useSharedValue(1);
  // Skips the pop on first mount for a tab that's already active (mirrors
  // `progress`'s own already-tinted starting value above) — only a real
  // switch-to-active tap should pop, not the initial render.
  const mountedRef = useRef(false);

  // Bug fix (product report — "bottom tab active design mismatching background
  // and active color"): the icon/label color above snaps INSTANTLY the moment
  // `active` changes (a plain conditional in a style, not animated), while this
  // tint used to fade in/out over 180ms via `withTiming` — same start time,
  // but the background visibly lagged behind the already-active-colored
  // label for up to that long, reading as the wrong tab being highlighted mid-
  // switch. Snapping the tint too (matching what reduced-motion already did)
  // keeps both changing in the exact same render — no window where they can
  // ever show two different tabs as active.
  useEffect(() => {
    progress.value = active ? 1 : 0;
  }, [active, progress]);

  // The Zomato-style tab-switch "pop" — the icon overshoots then springs
  // back to size, instead of the tint fade being the only feedback.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (!active || reduced) {
      return;
    }
    scale.value = withSequence(
      withTiming(1.22, { duration: 120, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 8, stiffness: 180 }),
    );
  }, [active, reduced, scale]);

  const tintStyle = useAnimatedStyle(() => ({
    backgroundColor: renderOwnBackground ? interpolateColor(progress.value, [0, 1], ['transparent', tintColor]) : 'transparent',
  }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onLayout = onMeasured
    ? (e: LayoutChangeEvent) => onMeasured(e.nativeEvent.layout.x, e.nativeEvent.layout.width)
    : undefined;

  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      // `flex-1` only when no explicit column width was given — see `columnWidthPercent`'s own doc.
      className={columnWidthPercent === undefined ? 'flex-1 items-center active:opacity-80' : 'items-center active:opacity-80'}
      style={columnWidthPercent !== undefined ? { width: `${columnWidthPercent}%` } : undefined}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}>
      {/* Content-sized (not `w-full`), centered by the Pressable's own
          `items-center` — reads as a pill with visible margin on both
          sides, not a box stretching edge-to-edge of its cell. The
          Pressable itself stays full-width/flex-1 for the tap target (and
          is what `onMeasured` reports), so touch area/measurement doesn't
          shrink along with the visual pill. */}
      {/* `rounded-full` (NativeWind's own utility), not an inline
          `borderRadius: 999` — mixing a raw numeric radius into the same
          `style` object as a `className`-driven View is exactly the kind of
          pairing where a CSS-interop layer can silently lose the inline
          value to specificity/processing order, which reads on-device as
          "square" despite the source clearly asking for a pill. Routing the
          radius through the same utility-class mechanism as the rest of
          this View's styling removes that risk entirely. */}
      <Animated.View
        className="items-center justify-center rounded-full"
        style={[{ height: NAV_SEGMENT_HEIGHT, gap: 2, paddingHorizontal: 10 }, tintStyle]}>
        <Animated.View style={iconStyle}>
          <Icon size={17} color={active ? accent : '#a8ada4'} />
        </Animated.View>
        <AppText variant="overline" numberOfLines={1} style={{ color: active ? accent : '#737a72', fontSize: 8, lineHeight: 12, letterSpacing: 0.2 }}>
          {label}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}
