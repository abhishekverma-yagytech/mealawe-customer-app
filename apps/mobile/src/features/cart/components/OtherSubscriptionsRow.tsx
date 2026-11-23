import { ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { PlanCard, type MealPackage } from '@/features/subscription';
import type { AccentTone } from '@/theme';

interface OtherSubscriptionsRowProps {
  packages: MealPackage[];
  /** Total meals over the whole plan (days × meals/day) for a given package —
   * `cart.tsx` computes this per-package from the current item's meal-time
   * selection, since a sibling package carries no meal-time of its own. */
  mealCountFor: (pkg: MealPackage) => number;
  onAdd: (pkg: MealPackage) => void;
  /** Order-mode accent, threaded straight through to each `PlanCard` — same
   * `tone={item.isDineIn ? 'food' : undefined}` the Total Bill row and the
   * Proceed to Pay button on this screen already use, per the app's
   * Order-Mode CTA Rule. */
  tone?: AccentTone;
}

/**
 * Sibling packages in the same category as the plan already in the cart.
 * Tapping the card's "Add" button requests replacing the current plan — see
 * `cart.tsx`'s `requestPlanSwap`, which confirms before calling
 * `setSubscription`. Deliberately NOT a whole-card tap: this row sits inside
 * a scrolling cart the user is otherwise just reading/scrolling through, so
 * a plan-replace confirmation needs its own explicit tap target.
 */
export function OtherSubscriptionsRow({ packages, mealCountFor, onAdd, tone }: OtherSubscriptionsRowProps) {
  if (packages.length === 0) {
    return null;
  }
  return (
    <View style={{ gap: 10 }}>
      <AppText variant="overline" className="text-muted-foreground">
        OTHER PLANS
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {packages.map((pkg) => (
          <View key={pkg._id} style={{ width: 190 }}>
            <PlanCard pkg={pkg} onAdd={() => onAdd(pkg)} mealCount={mealCountFor(pkg)} tone={tone} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
