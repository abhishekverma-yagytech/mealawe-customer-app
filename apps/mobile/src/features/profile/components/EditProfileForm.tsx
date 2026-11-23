import { Lock } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { z } from 'zod';

import { AppText } from '@/components/ui/AppText';
import { IconCheckCircle } from '@/components/ui/icons';
import { TextField } from '@/features/auth/components/TextField';
import { palette } from '@/theme';

export interface EditProfileValues {
  userName: string;
  email: string;
}

interface EditProfileFormProps {
  initial: EditProfileValues;
  /** Read-only context shown but not editable. */
  phone?: string;
  referral?: string;
  submitting?: boolean;
  onSubmit: (values: EditProfileValues) => void;
}

const schema = z.object({
  userName: z.string().trim().min(2, 'Enter your full name'),
  email: z
    .string()
    .trim()
    .email('Enter a valid email')
    .optional()
    .or(z.literal('')),
});

/**
 * Editable customer-details form. Child component of the profile-edit screen —
 * owns only the fields + validation; the screen owns loading + persistence.
 * Mirrors mealaweApp's my-account form (name + email editable; phone/referral read-only).
 */
export function EditProfileForm({
  initial,
  phone,
  referral,
  submitting = false,
  onSubmit,
}: EditProfileFormProps) {
  const [userName, setUserName] = useState(initial.userName);
  const [email, setEmail] = useState(initial.email);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit() {
    const result = schema.safeParse({ userName, email });
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) {
        next[String(issue.path[0])] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit({ userName: result.data.userName, email: result.data.email ?? '' });
  }

  return (
    <View className="gap-4">
      <TextField
        label="Full name"
        required
        value={userName}
        onChangeText={setUserName}
        placeholder="Your name"
        error={errors.userName}
        autoCapitalize="words"
      />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        error={errors.email}
      />

      {!!phone && (
        <View className="gap-2 opacity-70">
          <AppText variant="label" className="text-foreground">
            Mobile number
          </AppText>
          <View className="flex-row items-center justify-between rounded-2xl border border-border bg-muted px-4 py-3.5">
            <AppText variant="bodyLg" className="text-foreground">
              {phone}
            </AppText>
            <View className="flex-row items-center gap-1">
              <IconCheckCircle size={14} color={palette.status.success} />
              <AppText variant="caption" style={{ color: palette.status.success }}>
                Verified
              </AppText>
            </View>
          </View>
        </View>
      )}

      {!!referral && (
        <View className="gap-2 opacity-70">
          <AppText variant="label" className="text-foreground">
            Your referral code
          </AppText>
          <View className="flex-row items-center justify-between rounded-2xl border border-border bg-muted px-4 py-3.5">
            <AppText variant="bodyLg" className="text-foreground">
              {referral}
            </AppText>
            <Lock size={16} color={palette.neutral.gray500} />
          </View>
        </View>
      )}

      <Pressable
        onPress={submit}
        disabled={submitting}
        className="mt-2 items-center rounded-2xl bg-primary py-3.5 active:opacity-80 disabled:opacity-60"
        accessibilityRole="button">
        <AppText variant="label" className="text-primary-foreground">
          {submitting ? 'Saving…' : 'Save changes'}
        </AppText>
      </Pressable>
    </View>
  );
}
