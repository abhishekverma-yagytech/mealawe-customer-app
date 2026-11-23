import type { ComponentType } from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Bell, Heart, Sparkles } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { FaqAccordion, type FaqItem } from '@/components/ui/FaqAccordion';
import {
  IconAdvance,
  IconChefHat,
  IconChevronLeft,
  IconClock,
  IconDelivery,
  IconFlame,
  IconHome,
  IconInfo,
  IconReceipt,
  IconRefresh,
  IconShield,
  IconStore,
  IconUser,
  IconZap,
  type IconProps,
} from '@/components/ui/icons';
import { ORDER_TYPES, ORDER_TYPE_LABEL } from '../pricing';
import type { OrderType } from '../types';
import { accentTint, palette, useApartmentColors } from '@/theme';

/** Figma "Apartment" flow (node 34-2969); stays one mounted component, switching sections via local state rather than a route push. */
type EducationSection = 'landing' | 'howItWorks' | 'faq';

// Local content — transcribed verbatim from Figma; kept here (not `pricing.ts`) since it's screen copy, not shared order-type business logic.

interface OrderTypeFeature {
  icon: ComponentType<IconProps>;
  title: string;
  caption: string;
}

interface OrderTypeContent {
  icon: ComponentType<IconProps>;
  /** Small pill under the big type title, e.g. "Ready in 10 min". */
  pillLabel: string;
  /** Instant only — the design shows a named dish, not a generic icon. */
  dishName?: string;
  dishTagline?: string;
  description: string;
  features: [OrderTypeFeature, OrderTypeFeature, OrderTypeFeature];
}

const ORDER_TYPE_CONTENT: Record<OrderType, OrderTypeContent> = {
  instant: {
    icon: IconZap,
    pillLabel: 'Ready in 10 min',
    dishName: 'Masala Dosa',
    dishTagline: 'Crispy & tasty',
    description:
      'Freshly cooked and ready in about 10 minutes. Order from quick-cook meals. Our home kitchens start cooking after your order and prepare it fresh.',
    features: [
      { icon: IconZap, title: 'Super quick', caption: 'Ready in ~10 min when you order' },
      { icon: IconChefHat, title: 'Cooked fresh', caption: 'Starts cooking after your order' },
      { icon: IconFlame, title: 'Hot & tasty', caption: 'Delivered hot or ready for pickup' },
    ],
  },
  today: {
    icon: IconClock,
    pillLabel: 'Order before kitchen cooking starts',
    description:
      "Book today's meals from your neighbourhood home kitchens. Place your order before the start of cooking for breakfast, lunch, high-tea or dinner.",
    features: [
      { icon: IconClock, title: 'Timely orders', caption: 'Help kitchens plan better' },
      { icon: IconChefHat, title: 'Freshly cooked', caption: "With the kitchen's own ingredients" },
      { icon: IconHome, title: 'Enjoy homely', caption: 'Meals from trusted homes' },
    ],
  },
  advance: {
    icon: IconAdvance,
    pillLabel: 'Plan for tomorrow or day after',
    description:
      "Plan ahead and order from kitchen's special menu. Schedule your meals for tomorrow or the day after. Perfect for events, gatherings or when you like to plan ahead.",
    features: [
      { icon: IconChefHat, title: "Chef's specials", caption: 'Curated dishes for advance orders' },
      { icon: IconAdvance, title: 'Plan ahead', caption: 'Tomorrow or day after' },
      { icon: IconShield, title: 'No last minute rush', caption: 'Enjoy stress-free mealtime' },
    ],
  },
};

/** Landing-screen order-type card copy — shorter than the how-it-works content above. */
const LANDING_CARD_SUBTITLE: Record<OrderType, string> = {
  instant: 'Ready in 10 min',
  today: 'Order before cooking starts',
  advance: 'Tomorrow & day after',
};

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'What is Mealawe Apartment?',
    answer:
      'Mealawe Apartment brings freshly cooked, homely food from trusted home kitchens inside your society. You can choose Instant, Today or Advance meals with pickup or delivery.',
    icon: IconInfo,
    iconColor: palette.brand.green,
  },
  {
    question: 'What is the difference between Instant, Today and Advance?',
    answer:
      'Instant is ready in about 10 minutes from quick-cook meals. Today is booked ahead of the kitchen’s cooking start time for that meal slot. Advance is planned a day or two ahead from a kitchen’s special menu.',
    icon: IconRefresh,
    iconColor: palette.accent.offer,
  },
  {
    question: 'How does the Today cut-off time work?',
    answer:
      'Each kitchen sets a cooking start time per meal slot (breakfast, lunch, high-tea or dinner). Orders placed before that time are included in that slot’s cooking — after it, the order moves to the next available slot.',
    icon: IconClock,
    iconColor: palette.status.danger,
  },
  {
    question: 'Who prepares the food?',
    answer: 'Verified home kitchens inside your society prepare every order fresh, using their own ingredients and recipes.',
    icon: IconChefHat,
    iconColor: palette.brand.green,
  },
  {
    question: 'Who delivers my order?',
    answer: 'A Mealawe delivery partner picks up your order from the kitchen and brings it to your doorstep, or you can choose self-pickup.',
    icon: IconDelivery,
    iconColor: palette.brand.green,
  },
  {
    question: 'Can I pick up the order myself?',
    answer: 'Yes — choose self-pickup at checkout and collect your order directly from the kitchen once it’s ready.',
    icon: IconStore,
    iconColor: palette.brand.green,
  },
  {
    question: 'Is the food safe and hygienic?',
    answer: 'Every partner kitchen is verified and follows Mealawe’s hygiene guidelines before it’s allowed to list on the platform.',
    icon: IconShield,
    iconColor: palette.brand.green,
  },
];

// Advance's accent is purple here, intentionally distinct from the shared (muted green) `palette.apartmentOrderType.advance` used elsewhere.
const ADVANCE_PURPLE = { light: '#6c4fb0', dark: '#b79ce8' };

export interface ApartmentEducationScreenProps {
  /** Called when the header's back arrow is pressed from the landing section (i.e. leaving the screen entirely). Defaults to `router.back()`. */
  onBack?: () => void;
}

/** The Apartment "education" flow (landing, how-it-works, FAQ) as one component with a sticky bottom nav; not wired into a route — caller decides how to mount it. */
export function ApartmentEducationScreen({ onBack }: ApartmentEducationScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, orderType: orderTypeColors, isDark } = useApartmentColors();
  const [section, setSection] = useState<EducationSection>('landing');
  const [orderType, setOrderType] = useState<OrderType>('instant');
  const [favouritesNotice, setFavouritesNotice] = useState(false);

  const advanceAccent = isDark ? ADVANCE_PURPLE.dark : ADVANCE_PURPLE.light;

  // Instant/Today use the shared per-order-type palette; Advance uses the local purple above.
  function accentFor(type: OrderType): string {
    return type === 'advance' ? advanceAccent : orderTypeColors[type].accent;
  }

  function openOrderType(type: OrderType) {
    setOrderType(type);
    setSection('howItWorks');
  }

  function handleBack() {
    if (section !== 'landing') {
      setSection('landing');
      return;
    }
    if (onBack) onBack();
    else router.back();
  }

  function goToMenu() {
    // Mirrors "Explore Menu" — the real Apartment catalog lives at the tabs' Apartment vertical.
    router.push('/(tabs)' as Href);
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.page }}>
      {/* Header — back chevron + title, bell only while inside the how-it-works section. */}
      <View
        className="flex-row items-center px-4 pb-3"
        style={{ paddingTop: insets.top + 8, backgroundColor: colors.page }}>
        <Pressable
          onPress={handleBack}
          hitSlop={12}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="Back">
          <IconChevronLeft size={22} color={colors.ink} />
        </Pressable>
        <AppText variant="title" className="flex-1 text-center" style={{ color: colors.ink }}>
          Apartment
        </AppText>
        <View className="h-9 w-9 items-center justify-center">
          {section === 'howItWorks' ? <Bell size={20} color={colors.ink} /> : null}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 24 }}
        showsVerticalScrollIndicator={false}>
        {section === 'landing' && (
          <LandingSection
            colors={colors}
            accentFor={accentFor}
            onSelectOrderType={openOrderType}
            onOpenFaq={() => setSection('faq')}
            onExploreMenu={goToMenu}
          />
        )}
        {section === 'howItWorks' && (
          <HowItWorksSection
            colors={colors}
            orderType={orderType}
            onChangeOrderType={setOrderType}
            accentFor={accentFor}
            onExploreMenu={goToMenu}
          />
        )}
        {section === 'faq' && <FaqSection colors={colors} />}
      </ScrollView>

      {/* Sticky bottom nav — a flex sibling of the ScrollView (not absolutely positioned), so it never covers content. */}
      <BottomNav
        colors={colors}
        insets={insets}
        favouritesNotice={favouritesNotice}
        onDismissFavouritesNotice={() => setFavouritesNotice(false)}
        onPressHome={() => router.push('/(tabs)' as Href)}
        onPressMyOrders={() => router.push('/my-orders' as Href)}
        onPressFavourites={() => setFavouritesNotice(true)}
        onPressProfile={() => router.push('/profile' as Href)}
      />
    </View>
  );
}

// Landing section (Figma frame "Explore-1")

interface SectionColors {
  page: string;
  card: string;
  ink: string;
  muted: string;
  border: string;
  green: string;
  greenDeep: string;
  gold: string;
}

function LandingSection({
  colors,
  accentFor,
  onSelectOrderType,
  onOpenFaq,
  onExploreMenu,
}: {
  colors: SectionColors;
  accentFor: (type: OrderType) => string;
  onSelectOrderType: (type: OrderType) => void;
  onOpenFaq: () => void;
  onExploreMenu: () => void;
}) {
  return (
    <View style={{ gap: 24 }}>
      <View className="flex-row items-start gap-3">
        <View style={{ flex: 1, gap: 10 }}>
          <View
            className="self-start rounded-full px-3 py-1.5"
            style={{ backgroundColor: accentTint(colors.green, 0.18) }}>
            <AppText variant="overline" style={{ color: colors.green }}>
              Mealawe Apartment
            </AppText>
          </View>
          <AppText variant="display" style={{ color: colors.ink }}>
            Fresh food from your neighborhood
          </AppText>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.green }} />
          <AppText variant="body" style={{ color: colors.muted }}>
            Home kitchens around you, made with love.
          </AppText>
        </View>

        {/* Placeholder — real hero illustration not yet exported from Figma; swap in once it's available. */}
        <View
          className="items-center justify-center rounded-3xl"
          style={{ width: 128, height: 128, backgroundColor: accentTint(colors.green, 0.14) }}>
          <IconHome size={44} color={colors.green} />
        </View>
      </View>

      <View className="flex-row items-center justify-center gap-2">
        <Sparkles size={14} color={colors.gold} />
        <AppText variant="overline" style={{ color: colors.gold }}>
          Choose how you want it
        </AppText>
        <Sparkles size={14} color={colors.gold} />
      </View>

      <View className="flex-row gap-3">
        {ORDER_TYPES.map((type) => {
          const accent = accentFor(type);
          return (
            <Pressable
              key={type}
              onPress={() => onSelectOrderType(type)}
              className="flex-1 items-center gap-2 rounded-2xl border p-3 active:opacity-80"
              style={{ borderColor: colors.border, backgroundColor: colors.card }}>
              <View
                className="h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: accentTint(accent, 0.18) }}>
                {(() => {
                  const Icon = ORDER_TYPE_CONTENT[type].icon;
                  return <Icon size={20} color={accent} />;
                })()}
              </View>
              <AppText variant="label" style={{ color: accent }}>
                {ORDER_TYPE_LABEL[type].toUpperCase()}
              </AppText>
              <AppText variant="caption" className="text-center" style={{ color: colors.muted }}>
                {LANDING_CARD_SUBTITLE[type]}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row gap-3">
        <TrustPill colors={colors} icon={IconShield} label="Trusted by your neighbours" />
        <TrustPill colors={colors} icon={IconHome} label="Homely taste every time" />
      </View>

      <Pressable onPress={onOpenFaq} className="items-center py-1 active:opacity-70" accessibilityRole="button">
        <AppText variant="bodySm" style={{ color: colors.muted, textDecorationLine: 'underline' }}>
          Have questions? See our FAQs
        </AppText>
      </Pressable>

      <Button label="Explore Menu" size="lg" block onPress={onExploreMenu} />
    </View>
  );
}

function TrustPill({ colors, icon: Icon, label }: { colors: SectionColors; icon: ComponentType<IconProps>; label: string }) {
  return (
    <View
      className="flex-1 flex-row items-center gap-2 rounded-2xl border px-3 py-3"
      style={{ borderColor: colors.border, backgroundColor: colors.card }}>
      <Icon size={16} color={colors.green} />
      <AppText variant="caption" style={{ color: colors.ink, flexShrink: 1 }}>
        {label}
      </AppText>
    </View>
  );
}

// How-it-works section (Figma frames "Instant-2" / "Today-3" / "Advance-4")

function HowItWorksSection({
  colors,
  orderType,
  onChangeOrderType,
  accentFor,
  onExploreMenu,
}: {
  colors: SectionColors;
  orderType: OrderType;
  onChangeOrderType: (type: OrderType) => void;
  accentFor: (type: OrderType) => string;
  onExploreMenu: () => void;
}) {
  const content = ORDER_TYPE_CONTENT[orderType];
  const accent = accentFor(orderType);
  const Icon = content.icon;

  return (
    <View style={{ gap: 20 }}>
      <View className="items-center gap-1">
        <View className="flex-row items-center gap-2">
          <Sparkles size={13} color={colors.green} />
          <AppText variant="overline" style={{ color: colors.muted }}>
            How these 3 types of
          </AppText>
          <Sparkles size={13} color={colors.green} />
        </View>
        <AppText variant="h2" style={{ color: colors.green }}>
          Order works
        </AppText>
      </View>

      {/* Local segmented control — its own useState, not the shared order-type store, so reading here doesn't affect actual ordering. */}
      <View
        className="flex-row rounded-2xl border p-1"
        style={{ borderColor: colors.border, backgroundColor: colors.card }}>
        {ORDER_TYPES.map((type) => {
          const isActive = type === orderType;
          const typeAccent = accentFor(type);
          const TypeIcon = ORDER_TYPE_CONTENT[type].icon;
          return (
            <Pressable
              key={type}
              onPress={() => onChangeOrderType(type)}
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl py-2"
              style={{
                borderWidth: isActive ? 1.5 : 0,
                borderColor: typeAccent,
                backgroundColor: isActive ? accentTint(typeAccent, 0.16) : 'transparent',
              }}>
              <TypeIcon size={14} color={isActive ? typeAccent : colors.muted} />
              <AppText variant="caption" style={{ color: isActive ? typeAccent : colors.muted }}>
                {ORDER_TYPE_LABEL[type]}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View className="items-center rounded-3xl p-5" style={{ backgroundColor: colors.card, gap: 14 }}>
        <View className="flex-row items-center gap-2">
          <Icon size={18} color={accent} />
          <AppText variant="h1" style={{ color: accent }}>
            {ORDER_TYPE_LABEL[orderType].toUpperCase()}
          </AppText>
        </View>
        <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: accentTint(accent, 0.16) }}>
          <AppText variant="caption" style={{ color: accent }}>
            {content.pillLabel}
          </AppText>
        </View>

        {/* Placeholder — real photo/3D illustration per order type not yet exported from Figma; swap in once available. */}
        <View
          className="items-center justify-center rounded-full"
          style={{ width: 140, height: 140, backgroundColor: accentTint(accent, 0.14) }}>
          <Icon size={52} color={accent} />
        </View>

        {content.dishName && (
          <View className="items-center" style={{ gap: 2 }}>
            <AppText variant="label" style={{ color: colors.ink }}>
              {content.dishName}
            </AppText>
            <AppText variant="bodySm" style={{ color: accent }}>
              {content.dishTagline}
            </AppText>
          </View>
        )}

        <View style={{ width: '60%', height: 1, backgroundColor: colors.border }} />

        <AppText variant="bodySm" className="text-center" style={{ color: colors.muted }}>
          {content.description}
        </AppText>

        <View className="flex-row" style={{ width: '100%' }}>
          {content.features.map((feature) => (
            <View key={feature.title} className="flex-1 items-center" style={{ gap: 6, paddingHorizontal: 4 }}>
              <feature.icon size={20} color={accent} />
              <AppText variant="caption" className="text-center" style={{ color: colors.ink }}>
                {feature.title}
              </AppText>
              <AppText variant="caption" className="text-center" style={{ color: colors.muted, fontSize: 10.5 }}>
                {feature.caption}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <Button label="Explore Menu" size="lg" block onPress={onExploreMenu} />
    </View>
  );
}

// FAQ section (Figma frame "FAQ-5")

function FaqSection({ colors }: { colors: SectionColors }) {
  return (
    <View style={{ gap: 16 }}>
      <View className="flex-row items-start gap-3">
        <View style={{ flex: 1, gap: 10 }}>
          <AppText variant="display" style={{ color: colors.ink }}>
            Frequently ask questions
          </AppText>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.green }} />
          <AppText variant="body" style={{ color: colors.muted }}>
            Everything you need to know about food in your society.
          </AppText>
        </View>
        {/* Placeholder — real family-at-dinner illustration not yet exported from Figma. */}
        <View
          className="items-center justify-center rounded-3xl"
          style={{ width: 84, height: 84, backgroundColor: accentTint(colors.green, 0.14) }}>
          <IconHome size={32} color={colors.green} />
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <FaqAccordion items={FAQ_ITEMS} />
      </View>
    </View>
  );
}

// Sticky bottom nav

function BottomNav({
  colors,
  insets,
  favouritesNotice,
  onDismissFavouritesNotice,
  onPressHome,
  onPressMyOrders,
  onPressFavourites,
  onPressProfile,
}: {
  colors: SectionColors;
  insets: { bottom: number };
  favouritesNotice: boolean;
  onDismissFavouritesNotice: () => void;
  onPressHome: () => void;
  onPressMyOrders: () => void;
  onPressFavourites: () => void;
  onPressProfile: () => void;
}) {
  return (
    <View>
      {favouritesNotice && (
        <Pressable
          onPress={onDismissFavouritesNotice}
          className="items-center rounded-t-xl py-2"
          style={{ backgroundColor: colors.card }}>
          <AppText variant="caption" style={{ color: colors.muted }}>
            Favourites is coming soon
          </AppText>
        </Pressable>
      )}
      <View
        className="flex-row"
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.card,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
        }}>
        <NavTab colors={colors} icon={IconHome} label="Home" active onPress={onPressHome} />
        <NavTab colors={colors} icon={IconReceipt} label="My Orders" onPress={onPressMyOrders} />
        <NavTab colors={colors} icon={Heart} label="Favourites" onPress={onPressFavourites} />
        <NavTab colors={colors} icon={IconUser} label="Profile" onPress={onPressProfile} />
      </View>
    </View>
  );
}

function NavTab({
  colors,
  icon: Icon,
  label,
  active = false,
  onPress,
}: {
  colors: SectionColors;
  icon: ComponentType<IconProps>;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const color = active ? colors.green : colors.muted;
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 items-center justify-center active:opacity-70"
      style={{ gap: 2, minHeight: 44 }}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Icon size={20} color={color} />
      <AppText variant="caption" style={{ color, fontSize: 10.5 }}>
        {label}
      </AppText>
    </Pressable>
  );
}
