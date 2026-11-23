import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { createLiveActivity, type LiveActivityLayout } from 'expo-widgets';

/**
 * iOS Lock Screen + Dynamic Island content for an active delivery — the JSX
 * counterpart to Android's ongoing notification (`riderTrackingNotification.ts`).
 * This is "Phase 3" of `docs/LIVE-ORDER-TRACKING-PLAN.md`, implemented via
 * `expo-widgets` (the actively-maintained first-party successor to the now
 * fully-deprecated `expo-live-activity`) instead of a hand-written SwiftUI
 * extension target — the layout below compiles to native SwiftUI through
 * the config plugin at build time.
 *
 * The `name` here ('MealaweDeliveryActivity') must match the `widgets[].name`
 * entry in `app.json`'s `expo-widgets` plugin config exactly.
 */
export interface DeliveryActivityProps {
  restaurantName: string;
  statusLabel: string;
  etaText: string;
}

function deliveryActivityLayout(props: DeliveryActivityProps): LiveActivityLayout {
  'widget';

  return {
    banner: (
      <VStack alignment="leading" spacing={4}>
        <Text>{props.restaurantName}</Text>
        <HStack>
          <Text>{props.statusLabel}</Text>
          <Spacer />
          <Text>{props.etaText}</Text>
        </HStack>
      </VStack>
    ),
    compactLeading: <Text>🛵</Text>,
    compactTrailing: <Text>{props.etaText}</Text>,
    minimal: <Text>🛵</Text>,
    expandedCenter: (
      <VStack spacing={2}>
        <Text>{props.statusLabel}</Text>
        <Text>{props.etaText}</Text>
      </VStack>
    ),
  };
}

export const mealaweDeliveryActivity = createLiveActivity<DeliveryActivityProps>(
  'MealaweDeliveryActivity',
  deliveryActivityLayout,
);
