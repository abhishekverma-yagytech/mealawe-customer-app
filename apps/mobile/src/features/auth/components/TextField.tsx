import { type ReactNode, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useColors } from '@/theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  required?: boolean;
  /** rendered before the input (e.g. a +91 dial code) */
  leading?: ReactNode;
  /** rendered after the input (e.g. a spinner / checkmark) */
  trailing?: ReactNode;
}

/**
 * Labeled input matching the mealaweApp field style: muted field that turns
 * card-colored with a green border on focus, red on error.
 */
export function TextField({
  label,
  error,
  required,
  leading,
  trailing,
  onFocus,
  onBlur,
  ...input
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const colors = useColors();

  const borderBg = focused
    ? 'border-primary bg-card'
    : error
      ? 'border-danger bg-muted'
      : 'border-border bg-muted';

  return (
    <View className="gap-2">
      {label ? (
        <AppText variant="label" className="text-foreground">
          {label}
          {required ? (
            <AppText variant="label" className="text-danger">
              {' '}
              *
            </AppText>
          ) : null}
        </AppText>
      ) : null}

      <View className={`flex-row items-center gap-2 rounded-2xl border px-4 ${borderBg}`}>
        {leading}
        <TextInput
          placeholderTextColor={colors.mutedForeground}
          className="flex-1 py-3.5 text-body-lg text-foreground"
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...input}
        />
        {trailing}
      </View>

      {error ? (
        <AppText variant="caption" className="text-danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
