import { Text, VStack } from '@expo/ui/swift-ui';
import { createWidget } from 'expo-widgets';

/**
 * Home-screen widget — "Section 8.3" of the Performance/UX proposal. Scoped
 * to v1's recommendation (`docs/PLATFORM-NATIVE-FEATURES-PLAN.md` Phase A):
 * a "reorder your usual" snapshot rather than a live order-status widget,
 * since live status is already covered by the Live Activity (`liveActivity.tsx`)
 * and the Android ongoing notification — a second live surface would
 * duplicate that for materially more complexity.
 *
 * The `name` here ('MealaweOrderWidget') must match the `widgets[].name`
 * entry in `app.json`'s `expo-widgets` plugin config exactly.
 */
export interface OrderWidgetProps {
  title: string;
  subtitle: string;
}

function orderWidgetLayout(props: OrderWidgetProps) {
  'widget';

  return (
    <VStack alignment="leading" spacing={4}>
      <Text>{props.title}</Text>
      <Text>{props.subtitle}</Text>
    </VStack>
  );
}

export const mealaweOrderWidget = createWidget<OrderWidgetProps>('MealaweOrderWidget', orderWidgetLayout);
