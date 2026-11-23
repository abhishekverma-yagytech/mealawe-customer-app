import type { ComponentType } from 'react';

import {
  IconFlame,
  IconGift,
  IconInfo,
  IconLeaf,
  IconMapPin,
  IconOffer,
  IconShield,
  IconStar,
  IconUtensils,
  type IconProps,
} from '@/components/ui/icons';
import type { AccentTone } from '@/theme';

/**
 * The icon key set for `SubscriptionCategory.includedItemsVeg[].icon` /
 * `.includedItemsNonVeg[].icon` — reuses the app's existing `AccentTone` keys
 * verbatim (no new icon design work) so a value the dashboard writes renders
 * correctly here with zero translation. See SUBSCRIPTION_CATALOG_DYNAMIC_PLAN.md §8.
 */
export const INCLUDED_ITEM_ICON_KEYS: readonly AccentTone[] = [
  'veg',
  'nonveg',
  'offer',
  'plan',
  'info',
  'location',
  'reward',
  'food',
  'rating',
];

const ICON_COMPONENTS: Record<AccentTone, ComponentType<IconProps>> = {
  veg: IconLeaf,
  nonveg: IconFlame,
  offer: IconOffer,
  plan: IconShield,
  info: IconInfo,
  location: IconMapPin,
  reward: IconGift,
  food: IconUtensils,
  rating: IconStar,
};

function isAccentTone(key: string | undefined): key is AccentTone {
  return !!key && (INCLUDED_ITEM_ICON_KEYS as readonly string[]).includes(key);
}

/** The tone to color an included-item icon by — falls back to `food` for an unrecognized/legacy key. */
export function toneForIncludedItem(icon: string | undefined): AccentTone {
  return isAccentTone(icon) ? icon : 'food';
}

/** The Lucide icon component for an included-item icon key — falls back to a generic utensils glyph. */
export function iconForIncludedItem(icon: string | undefined): ComponentType<IconProps> {
  return isAccentTone(icon) ? ICON_COMPONENTS[icon] : IconUtensils;
}
