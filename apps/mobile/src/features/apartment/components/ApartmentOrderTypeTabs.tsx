import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import Svg, { G, Path } from 'react-native-svg';

import { NavSegment } from '@/components/ui/NavSegment';
import { type IconProps } from '@/components/ui/icons';
import { accentTint, useApartmentColors } from '@/theme';

import { useApartmentOrderTypeStore } from '../orderTypeStore';
import { ORDER_TYPE_LABEL, ORDER_TYPES } from '../pricing';
import type { OrderType } from '../types';

/** Custom brand SVG for the "Instant" tab, ported as path data. */
function InstantIcon({ size = 20, color = '#474747' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <G fill={color}>
        <Path d="M14.36,10.97h-3.3l.52-5.16h.03c.36,0,.65-.29.65-.65v-.65c0-.36-.29-.65-.65-.65h-4.25l.26-1.94h4.64V0h-4.92c-.81,0-1.49.6-1.6,1.4l-.33,2.47H.65c-.36,0-.65.29-.65.65v.65c0,.36.29.65.65.65h.03l1.15,11.45c.08.83.77,1.45,1.6,1.45h1.46l-.37.55v.74h15.48v-.74l-5.64-8.29ZM13.58,11.61l-5.36,7.74h-1.15l5.36-7.74h1.15ZM10.8,7.18c-.28-.05-.54-.08-.8-.08-1.1,0-2.19.43-3.18.88l.29-2.17h3.83l-.14,1.37ZM4.74,8.87c-.31.1-.61.17-.87.17-1.4,0-2.26-.38-2.26-.65s.86-.65,2.26-.65c.29,0,.63.05,1,.15l-.13.98ZM5.8,5.81h.65l-.33,2.49c-.24.11-.47.21-.69.31l.37-2.8ZM6.38,1.49c.06-.48.48-.84.96-.84h4.27v.65h-3.99c-.32,0-.6.24-.64.56l-.27,2.02h-.65l.32-2.39ZM.65,4.52h10.97v.65H.65v-.65ZM5.15,5.81l-.19,1.44c-.4-.1-.77-.15-1.09-.15-.85,0-1.8.14-2.37.48l-.18-1.77h3.83ZM3.43,18.06c-.5,0-.91-.37-.96-.87l-.79-7.91c.58.28,1.43.39,2.2.39s1.73-.43,2.7-.88c1.12-.52,2.28-1.06,3.43-1.06.23,0,.48.03.73.09l-.31,3.14h-.27l-4.83,7.1h-1.9ZM10.49,11.61h1.15l-5.36,7.74h-1.05l5.26-7.74ZM9,19.35l5.19-7.49,5.1,7.49h-10.28Z" />
        <Path d="M16.13,16.77h.65v.65h-.65v-.65Z" />
        <Path d="M14.84,16.77h.65v.65h-.65v-.65Z" />
        <Path d="M13.55,16.77h.65v.65h-.65v-.65Z" />
        <Path d="M16.13,18.06h.65v.65h-.65v-.65Z" />
        <Path d="M14.84,18.06h.65v.65h-.65v-.65Z" />
        <Path d="M13.55,18.06h.65v.65h-.65v-.65Z" />
        <Path d="M6.13,13.87c0-.29-.11-.57-.32-.78l-.51-.51c-.42-.42-1.14-.42-1.56,0l-.51.51c-.21.21-.32.48-.32.78s.11.57.32.78l.19.19-.19.19c-.21.21-.32.48-.32.78s.11.57.32.78l.51.51c.21.21.48.32.78.32s.57-.11.78-.32l.51-.51c.21-.21.32-.48.32-.78s-.11-.57-.32-.78l-.19-.19.19-.19c.21-.21.32-.48.32-.78ZM3.68,13.55l.51-.51c.09-.09.2-.13.32-.13s.24.05.32.13l.51.51c.09.09.13.2.13.32s-.05.24-.13.32l-.51.51c-.17.17-.47.17-.65,0l-.51-.51c-.09-.09-.13-.2-.13-.32s.05-.24.13-.32ZM5.35,16.13l-.51.51c-.17.17-.47.17-.65,0l-.51-.51c-.09-.09-.13-.2-.13-.32s.05-.24.13-.32l.2-.2c.18.13.4.2.63.2s.45-.07.63-.2l.2.2c.09.09.13.2.13.32s-.05.24-.13.32h0Z" />
        <Path d="M8.2,10c-.42-.42-1.14-.42-1.56,0l-.51.51c-.21.21-.32.48-.32.78s.11.57.32.78l.51.51c.21.21.48.32.78.32s.57-.11.78-.32l.51-.51c.21-.21.32-.48.32-.78s-.11-.57-.32-.78l-.51-.51ZM8.25,11.61l-.51.51c-.17.17-.47.17-.65,0l-.51-.51c-.09-.09-.13-.2-.13-.32s.05-.24.13-.32l.51-.51c.17-.17.47-.17.65,0l.51.51c.09.09.13.2.13.32s-.05.24-.13.32Z" />
      </G>
    </Svg>
  );
}

/** Custom brand SVG for the "Today" tab. */
function TodayIcon({ size = 20, color = '#474747' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <G fill={color}>
        <Path d="M2.03,11.89c1.7-.7,3.64.17,4.26,1.94.32.92.19,2.02-.37,2.84.63.32,1.27.55,1.95.7.2.04.31.22.28.41s-.22.3-.43.25c-.79-.18-1.54-.44-2.24-.84-1.22,1.19-3.15,1.22-4.4.08-.59-.54-.98-1.26-1.06-2.07-.11-1.19.42-2.33,1.42-2.99-.92-2.9-.15-6.07,1.92-8.26,1.21-1.3,2.79-2.17,4.53-2.52,2.93-.59,5.99.42,7.99,2.64.82.91,1.42,1.99,1.78,3.16.54,1.74.51,3.6-.12,5.3-.05.15-.29.16-.39.12-.12-.05-.26-.2-.21-.36.43-1.23.55-2.52.34-3.81-.23-1.4-.83-2.72-1.75-3.8-.81-.96-1.85-1.68-3.01-2.15-3.34-1.35-7.1-.28-9.25,2.58-1.42,1.95-1.92,4.41-1.22,6.79ZM5.94,14.76c-.06-1.55-1.39-2.68-2.89-2.58s-2.64,1.39-2.52,2.9,1.4,2.58,2.85,2.49,2.61-1.31,2.55-2.81Z" />
        <Path d="M19.99,18.01c0,.37-.36.72-.75.72h-9.8c-.41,0-.74-.33-.78-.73v-.41c0-.16.14-.3.3-.3h.46c-.1-2.45,1.64-4.51,4.03-4.94-.23-.31-.23-.7,0-.97.13-.15.33-.23.54-.24h.62c.33,0,.62.21.7.53.06.24,0,.47-.15.67,1.89.33,3.38,1.62,3.91,3.44.14.49.19.98.17,1.5h.47c.17.01.3.17.3.33v.39ZM14.44,12.26c.24-.1.46-.3.36-.49-.04-.07-.13-.12-.21-.12h-.63c-.06,0-.15.09-.17.15-.07.27.39.56.65.45ZM18.73,17.29c.05-1.17-.38-2.25-1.13-3.08-1.14-1.24-2.89-1.71-4.51-1.25-1.92.55-3.23,2.33-3.16,4.32h8.8ZM19.2,18.22c.23,0,.34-.25.27-.42h-10.29c-.03.1-.01.23.05.31s.17.11.29.11h9.68Z" />
        <Path d="M12.71,7.56c.14-.08.27-.06.36.02.07.06.12.29,0,.36l-2.53,1.54c.16.58-.16,1.13-.71,1.28s-1.1-.17-1.25-.71.16-1.11.73-1.27v-2.95c0-.16.09-.27.25-.29.13,0,.26.1.26.26v2.98c.18.06.31.12.45.26l2.43-1.48ZM9.26,10.18c.22.15.49.13.67-.05.21-.21.18-.56-.04-.74s-.54-.15-.72.07c-.17.21-.16.55.09.72Z" />
        <Path d="M9.82,3.42c0,.16-.08.27-.22.29-.12.02-.29-.07-.29-.22v-.73c0-.15.14-.24.27-.24.14,0,.24.11.24.27v.63Z" />
        <Path d="M16.55,9.98h-.63c-.16,0-.26-.12-.26-.25,0-.16.12-.26.28-.26h.56c.16,0,.29.08.3.24.01.14-.08.27-.25.27Z" />
        <Path d="M3.19,9.98h-.59c-.16,0-.28-.1-.28-.25,0-.14.12-.26.28-.26h.6c.15,0,.25.13.25.26s-.1.25-.26.25Z" />
        <Path d="M4.15,6.27c.14.08.18.23.11.36-.07.12-.22.17-.35.09l-.51-.29c-.13-.08-.16-.24-.09-.36.08-.14.24-.14.37-.06l.47.27Z" />
        <Path d="M15.18,6.73c-.13.07-.29-.02-.33-.13-.05-.13,0-.26.13-.33l.54-.3c.13-.07.29.03.33.14.06.16-.02.27-.15.34l-.51.28Z" />
        <Path d="M13.05,4.32c-.08.13-.21.17-.33.12s-.19-.2-.12-.33l.27-.49c.07-.13.23-.18.35-.12.15.08.16.25.08.39l-.25.43Z" />
        <Path d="M6.54,4.09c.07.12.02.25-.1.33-.08.05-.26.06-.32-.06l-.31-.55c-.07-.12.01-.26.12-.32.1-.05.25-.04.32.08l.29.52Z" />
        <Path d="M1.74,15.25c-.11-.11-.15-.24-.08-.36.07-.11.26-.17.37-.06l.68.67,1.71-1.7c.1-.1.28-.06.35.02.08.09.1.24,0,.34l-1.84,1.84c-.14.14-.31.1-.44-.02l-.76-.74Z" />
        <Path d="M11.24,16.45c-.02.14-.16.2-.26.2-.09,0-.25-.07-.24-.21.1-1.16.82-2.19,1.88-2.66.13-.06.27,0,.33.11.04.08.03.27-.09.33-.91.4-1.52,1.24-1.63,2.24Z" />
      </G>
    </Svg>
  );
}

/** Custom brand SVG for the "Advance" tab. */
function AdvanceIcon({ size = 20, color = '#474747' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <G fill={color}>
        <Path d="M13.65,10.25c1.53-.17,2.99.57,3.78,1.81.86,1.36.83,3.05-.05,4.35-1.33,1.97-4.04,2.36-5.85.81-.74-.63-1.23-1.53-1.38-2.51H1.67C.74,14.61.04,13.89,0,12.96c-.02-.16.08-.41.27-.41l1.13-.02c-.13-3.28,2.05-6.19,5.34-6.74-.41-.56-.33-1.28.17-1.74.55-.51,1.38-.47,1.88.1.41.48.45,1.15.02,1.66.69.15,1.31.34,1.92.71v-3.73c.01-.63.57-1.11,1.17-1.12h.6s0-.72,0-.72c0-.18.13-.31.29-.33s.34.11.34.3v.75s3.35,0,3.35,0v-.72c0-.2.14-.33.33-.33.17,0,.32.14.32.33v.71s.64,0,.64,0c.6,0,1.14.52,1.14,1.15v5.77c0,.67-.52,1.21-1.19,1.21h-3.4c-.16,0-.26-.22-.26-.33,0-.14.14-.31.32-.31h3.41c.23-.04.47-.24.48-.51v-4.29s-6.89,0-6.89,0v2.57c1.1.83,1.89,1.94,2.28,3.3ZM18.27,3.72v-.83c0-.31-.23-.57-.55-.57h-.59s0,.39,0,.39c0,.19-.15.32-.32.32-.15,0-.31-.11-.31-.28l-.02-.42h-3.33s-.01.42-.01.42c0,.19-.19.3-.34.29-.19-.02-.29-.17-.29-.36v-.35s-.67,0-.67,0c-.21.05-.44.22-.44.45v.94s6.89,0,6.89,0ZM7.61,4.37c-.39.11-.58.52-.46.87.11.33.47.54.82.43s.57-.47.47-.83-.45-.58-.83-.48ZM10.51,12.54c.49-1.08,1.4-1.84,2.52-2.16-.3-1-.86-1.89-1.64-2.6-1.12-.99-2.56-1.5-4.04-1.4-2.08.15-3.88,1.39-4.74,3.29-.41.91-.62,1.88-.56,2.87h8.46ZM11.23,15.86c1,1.75,3.3,2.19,4.88.99,1.57-1.19,1.78-3.5.4-4.95-1.22-1.29-3.28-1.37-4.62-.18-.7.62-1.1,1.53-1.11,2.47,0,.6.16,1.14.46,1.67ZM10.13,14.06l.14-.87H.68c.11.47.53.86,1.05.86h5.85s2.55,0,2.55,0Z" />
        <Path d="M6.92,19.11c-.29.24-.63.32-.99.23-.28-.07-.57-.28-.71-.59-.17-.36-.13-.8.06-1.16s.5-.63.86-.88c-1.06-.87-2.61-.69-3.62.21-.13.11-.31.1-.4-.04-.08-.11-.05-.28.08-.4,1.27-1.1,3.21-1.26,4.46-.02.78-.28,1.64-.27,2.39.08.17.08.25.24.17.39s-.25.19-.41.11c-.55-.26-1.17-.29-1.79-.13.44.72.53,1.66-.11,2.19ZM6.59,18.7c.4-.34.27-1.09-.06-1.57-.48.24-.89.62-.88,1.16,0,.24.15.43.33.51.2.08.43.05.61-.1Z" />
        <Path d="M14.54,6.37h-.74c-.1,0-.22-.12-.22-.22v-.72c0-.1.12-.22.22-.22h.68c.14,0,.25.13.25.26v.64c0,.1-.09.21-.19.26Z" />
        <Path d="M16.58,6.37h-.7c-.08,0-.2-.15-.2-.23v-.69c0-.15.14-.24.28-.24h.6c.16,0,.27.11.27.27v.6c0,.14-.07.29-.25.3Z" />
        <Path d="M14.47,8.29h-.59c-.15,0-.3-.07-.3-.24v-.67c0-.1.12-.23.22-.23h.68c.16,0,.25.13.25.27v.6c0,.14-.08.27-.25.28Z" />
        <Path d="M16.57,8.29h-.66c-.11,0-.23-.14-.23-.25v-.66c0-.09.12-.24.2-.24h.68c.16,0,.27.11.27.27v.57c0,.15-.06.32-.26.32Z" />
        <Path d="M19.36,11.27c.31-.06.58.15.63.42.06.3-.13.58-.43.63-.28.05-.56-.12-.62-.4s.09-.59.42-.65Z" />
        <Path d="M1.2,7.05c.3-.11.6.05.69.31.1.28-.03.59-.32.69-.27.1-.57-.02-.68-.29s0-.61.3-.72Z" />
        <Path d="M10.22,18.75c-.24.04-.44-.11-.53-.25-.13-.22-.08-.45.04-.61.15-.19.4-.26.62-.17s.34.32.32.55-.19.44-.46.48Z" />
        <Path d="M3.66,10.95c-.05.19-.16.28-.31.3-.12.02-.38-.09-.34-.28.33-1.64,1.54-2.97,3.13-3.49.17-.06.32.12.35.25.03.15-.05.31-.21.37-1.29.46-2.26,1.49-2.61,2.84Z" />
        <Path d="M15.57,14.56h-1.54c-.16,0-.26-.19-.26-.33v-1.79c0-.18.12-.31.29-.33.15-.01.34.1.34.29v1.53s1.12,0,1.12,0c.17,0,.31.13.32.29,0,.12-.09.34-.27.34Z" />
      </G>
    </Svg>
  );
}

const ORDER_TYPE_ICON: Record<OrderType, React.ComponentType<IconProps>> = {
  instant: InstantIcon,
  today: TodayIcon,
  advance: AdvanceIcon,
};

/** Snappy but not bouncy — `overshootClamping` avoids overshoot/spring-back. */
const SLIDE_SPRING = { damping: 26, stiffness: 280, overshootClamping: true };

/** Instant/Today/Advance switcher: iOS shows one sliding pill that cross-fades between accents, Android fades each tab in place. */
export function ApartmentOrderTypeTabs() {
  const orderType = useApartmentOrderTypeStore((s) => s.orderType);
  const setOrderType = useApartmentOrderTypeStore((s) => s.setOrderType);
  const reduced = useReducedMotion();
  // Theme-aware accents, so colors stay correct in dark mode.
  const { orderType: orderTypeColors } = useApartmentColors();

  const activeIndex = Math.max(ORDER_TYPES.indexOf(orderType), 0);
  const indexProgress = useSharedValue(activeIndex);

  // Bug fix (root cause of the sliding indicator visually landing between
  // two tabs — e.g. tapping Today while the indicator is still sliding
  // toward Instant): `withSpring` can fail to reach its target if this
  // effect's own animation is interrupted/superseded by a rapid tap through
  // Instant→Today→Advance before the previous spring settles — exactly the
  // same failure mode `HomeBottomNav.tsx`'s own sliding `progress` value
  // already needed a settle-timer safety net for. ~400ms is a generous
  // upper bound for `SLIDE_SPRING` (damping 26, stiffness 280) to have
  // genuinely settled; hard-snapping afterward is cheap and invisible in
  // the common case (the spring already got there on its own).
  useEffect(() => {
    const target = activeIndex;
    if (reduced) {
      indexProgress.value = target;
      return;
    }
    indexProgress.value = withSpring(target, SLIDE_SPRING);
    const settle = setTimeout(() => {
      indexProgress.value = target;
    }, 400);
    return () => clearTimeout(settle);
  }, [activeIndex, indexProgress, reduced]);

  // Real measured {x, width} per button; indicator interpolates between these directly.
  const layoutXs = useSharedValue<number[]>([]);
  const layoutWidths = useSharedValue<number[]>([]);

  function onButtonLayout(index: number, x: number, width: number) {
    const xs = layoutXs.value.slice();
    xs[index] = x;
    layoutXs.value = xs;
    const widths = layoutWidths.value.slice();
    widths[index] = width;
    layoutWidths.value = widths;
  }

  // Indicator cross-fades through each type's accent color as it slides; 0.22 alpha so Advance's muted grey-green still reads clearly.
  const indicatorColors = useMemo(
    () => ORDER_TYPES.map((type) => accentTint(orderTypeColors[type].accent, 0.22)),
    [orderTypeColors],
  );
  const indicatorInputRange = useMemo(() => ORDER_TYPES.map((_, i) => i), []);

  const indicatorStyle = useAnimatedStyle(() => {
    const xs = layoutXs.value;
    const widths = layoutWidths.value;
    // Not every slot measured yet (first frame) — hide rather than guess.
    if (xs.length < ORDER_TYPES.length || widths.length < ORDER_TYPES.length) {
      return { width: 0, transform: [{ translateX: 0 }] };
    }
    const inputRange = xs.map((_, i) => i);
    // Inset 3px per side to match NavSegment's own tint inset, avoiding a squared-corner clash near the bar's rounded chrome.
    return {
      width: interpolate(indexProgress.value, inputRange, widths, Extrapolation.CLAMP) - 6,
      transform: [{ translateX: interpolate(indexProgress.value, inputRange, xs, Extrapolation.CLAMP) + 3 }],
      backgroundColor: interpolateColor(indexProgress.value, indicatorInputRange, indicatorColors),
    };
  });

  // iOS only — Android fades each tab's own background in place instead.
  const indicator =
    Platform.OS === 'ios' ? (
      // borderRadius: 16 matches NavSegment's own tab shape.
      <Animated.View pointerEvents="none" style={[indicatorStyle, { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 16 }]} />
    ) : null;

  return (
    <>
      {indicator}
      {ORDER_TYPES.map((type, index) => {
        // Each tab paints with its own accent color when active.
        const tone = orderTypeColors[type];
        return (
          <NavSegment
            key={type}
            icon={ORDER_TYPE_ICON[type]}
            label={ORDER_TYPE_LABEL[type]}
            accent={tone.accent}
            tintColor={accentTint(tone.accent, 0.22)}
            active={orderType === type}
            onPress={() => setOrderType(type)}
            renderOwnBackground={Platform.OS !== 'ios'}
            onMeasured={Platform.OS === 'ios' ? (x, width) => onButtonLayout(index, x, width) : undefined}
            // Advance sits against the bar's rounded right cap, so it needs an extra 20px inset to clear the curve.
            edgeInsetEnd={index === ORDER_TYPES.length - 1 ? 20 : undefined}
            // Bug fix: explicit equal-width share of the row so tab widths don't vary with label length.
            columnWidthPercent={100 / ORDER_TYPES.length}
          />
        );
      })}
    </>
  );
}
