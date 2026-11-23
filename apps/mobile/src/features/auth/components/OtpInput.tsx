import { useEffect, useRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useSmsUserConsent } from '@eabdullazyanov/react-native-sms-user-consent';

import { AppText } from '@/components/ui/AppText';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
}

/**
 * 6-box OTP field. A single transparent TextInput overlays the boxes and
 * captures numeric input; each box renders one digit.
 *
 * Autofill: iOS gets it "for free" from `textContentType="oneTimeCode"`
 * below (the system QuickType suggestion) — no extra code needed there.
 * Android has no equivalent built-in mechanism reliable enough on its own;
 * `autoComplete="sms-otp"` is just a soft hint many OEM keyboards ignore
 * (Xiaomi/Vivo/Oppo etc.), which is why it worked inconsistently. Google's
 * SMS User Consent API (`useSmsUserConsent`) is the real, deterministic fix:
 * no permissions, no app-signature hash needed in the SMS body (unlike the
 * older SMS Retriever API), just a one-tap system dialog when a code-shaped
 * SMS arrives. It's a no-op returning '' on iOS, so it's safe to always call.
 */
export function OtpInput({ value, onChange, length = 6 }: OtpInputProps) {
  const inputRef = useRef<TextInput>(null);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const consentedCode = useSmsUserConsent(length);

  useEffect(() => {
    if (consentedCode) onChange(consentedCode);
  }, [consentedCode, onChange]);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} className="flex-row justify-between">
      {digits.map((digit, i) => {
        const active = value.length === i;
        return (
          <View
            key={i}
            className={`h-14 w-12 items-center justify-center rounded-xl border ${
              active ? 'border-primary bg-card' : 'border-border bg-muted'
            }`}>
            <AppText variant="h3" className="text-foreground">
              {digit}
            </AppText>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus
        // iOS QuickType suggestion when an SMS arrives. Kept as a harmless
        // extra hint on Android too, alongside `useSmsUserConsent` above
        // (the actually-reliable path there).
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        importantForAutofill="yes"
        className="absolute h-full w-full opacity-0"
      />
    </Pressable>
  );
}
