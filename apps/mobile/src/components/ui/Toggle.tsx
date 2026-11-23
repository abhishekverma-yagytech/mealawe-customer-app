import { Pressable, View } from 'react-native';

import { useColors } from '@/theme';

interface ToggleProps {
  value: boolean;
  onChange: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
}

/**
 * Pill + knob switch — the app's one toggle primitive. Replaces the hand-rolled
 * track/knob markup that was duplicated between the subscription and bulk cart
 * screens' wallet/cashback rows.
 */
export function Toggle({ value, onChange, accessibilityLabel, disabled = false }: ToggleProps) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onChange}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={{ opacity: disabled ? 0.5 : 1 }}
      className="active:opacity-80">
      <View
        style={{
          height: 26,
          width: 44,
          borderRadius: 13,
          padding: 3,
          justifyContent: 'center',
          alignItems: value ? 'flex-end' : 'flex-start',
          backgroundColor: value ? colors.primary : colors.border,
        }}>
        <View style={{ height: 20, width: 20, borderRadius: 10, backgroundColor: '#fff' }} />
      </View>
    </Pressable>
  );
}
