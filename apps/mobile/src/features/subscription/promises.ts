import type { ComponentType } from 'react';

import { IconCalendar, IconClock, IconLeaf, IconRepeat, IconShield, type IconProps } from '@/components/ui/icons';
import type { AccentTone } from '@/theme';

/** One feature tile — icon + short two-line label, shown in `IconFeatureStrip`. */
export interface PromiseItem {
  icon: ComponentType<IconProps>;
  label: string;
  tone: AccentTone;
}

/** Exactly 4 promises for the `PromiseStrip` trust strip on the subscription detail screen. */
export const PROMISES: readonly PromiseItem[] = [
  { icon: IconLeaf, label: 'Freshly\nPrepared', tone: 'veg' },
  { icon: IconClock, label: 'Weekly\nMenu', tone: 'info' },
  { icon: IconShield, label: 'Flexible\nPlans', tone: 'plan' },
  { icon: IconCalendar, label: 'Pause or\nreschedule', tone: 'offer' },
];

/** Exactly 4 features for the Home bestseller banner's feature strip. */
export const BESTSELLER_FEATURES: readonly PromiseItem[] = [
  { icon: IconLeaf, label: "Fresh\nIngredient's", tone: 'veg' },
  { icon: IconCalendar, label: 'Weekly\nmenu', tone: 'info' },
  { icon: IconRepeat, label: 'Flexible\nPlans', tone: 'plan' },
  { icon: IconShield, label: 'Hygienic\n& safe', tone: 'offer' },
];
