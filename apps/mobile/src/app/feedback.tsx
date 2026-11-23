import { BottomSheetView, type BottomSheetModal } from '@gorhom/bottom-sheet';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { CircleAlert } from 'lucide-react-native';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { AppSheet } from '@/components/ui/AppSheet';
import { AppText } from '@/components/ui/AppText';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { IconCheckCircle, IconComplaint, IconLogIn, IconPraise, IconSuggestion } from '@/components/ui/icons';
import { supportApi, type FeedbackType } from '@/features/support';
import { useScreenTracking } from '@/services/netcore';
import { palette, FONT_FAMILY } from '@/theme';
import { useAuthStore } from '@/store';

const TYPES: { key: FeedbackType; label: string; icon: typeof IconPraise }[] = [
  { key: 'suggestion', label: 'Suggestion', icon: IconSuggestion },
  { key: 'praise', label: 'Praise', icon: IconPraise },
  { key: 'complaint', label: 'Complaint', icon: IconComplaint },
];

export default function FeedbackScreen() {
  useScreenTracking('feedback');

  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const [type, setType] = useState<FeedbackType>('suggestion');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<'login' | 'error' | null>(null);
  const thankYouSheetRef = useRef<BottomSheetModal>(null);

  async function submit() {
    const text = comment.trim();
    if (!text) return;
    if (!profile?._id) {
      setDialog('login');
      return;
    }
    setSaving(true);
    try {
      await supportApi.submitFeedback({
        feedbackType: type,
        feedbackComment: text,
        feedbackFrom_id: profile._id,
        feedbackFrom_name: profile.userName,
        feedbackFrom_phoneNo: profile.phoneNo,
        feedbackFrom_userType: 'customer',
      });
      setComment('');
      setType('suggestion');
      thankYouSheetRef.current?.present();
    } catch {
      setDialog('error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Feedback' }} />
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
        <AppText variant="label" className="text-foreground">
          What&apos;s on your mind?
        </AppText>
        <View className="flex-row gap-2">
          {TYPES.map(({ key, label, icon: Icon }) => {
            const active = key === type;
            return (
              <Pressable
                key={key}
                onPress={() => setType(key)}
                className={
                  active
                    ? 'flex-1 items-center gap-1.5 rounded-2xl border-2 border-primary bg-muted py-3 active:opacity-80'
                    : 'flex-1 items-center gap-1.5 rounded-2xl border border-border py-3 active:opacity-80'
                }
                accessibilityRole="button"
                accessibilityState={{ selected: active }}>
                <Icon size={22} color={active ? palette.brand.green : palette.neutral.gray500} />
                <AppText variant="caption" className={active ? 'text-primary' : 'text-muted-foreground'}>
                  {label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <View className="rounded-2xl border border-border bg-muted px-4 py-3">
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Share your thoughts, ideas or concerns…"
            placeholderTextColor={palette.neutral.gray500}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            className="min-h-[160px] text-body-lg text-foreground"
            style={{ fontFamily: FONT_FAMILY.regular }}
          />
        </View>

        <Pressable
          onPress={submit}
          disabled={!comment.trim() || saving}
          className="items-center rounded-2xl bg-primary py-3.5 active:opacity-80 disabled:opacity-60"
          accessibilityRole="button">
          <AppText variant="label" className="text-primary-foreground">
            {saving ? 'Sending…' : 'Submit feedback'}
          </AppText>
        </Pressable>
      </ScrollView>

      <ConfirmDialog
        visible={dialog !== null}
        icon={dialog === 'login' ? IconLogIn : CircleAlert}
        title={dialog === 'login' ? 'Login required' : 'Could not send'}
        message={
          dialog === 'login' ? 'Please log in to send feedback.' : 'Something went wrong. Please try again.'
        }
        confirmLabel="OK"
        onConfirm={() => setDialog(null)}
        onCancel={() => setDialog(null)}
      />

      <AppSheet ref={thankYouSheetRef} onDismiss={() => router.back()}>
        <BottomSheetView style={{ padding: 24, paddingBottom: 40, alignItems: 'center', gap: 12 }}>
          <View
            className="h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: `${palette.brand.green}1F` }}>
            <IconCheckCircle size={28} color={palette.brand.green} />
          </View>
          <AppText variant="h3" className="text-center text-foreground">
            Thank you!
          </AppText>
          <AppText variant="body" className="text-center text-muted-foreground">
            Thanks for your valuable feedback.
          </AppText>
          <Pressable
            onPress={() => thankYouSheetRef.current?.dismiss()}
            className="mt-2 w-full items-center rounded-2xl bg-primary py-3.5 active:opacity-80"
            accessibilityRole="button">
            <AppText variant="label" className="text-primary-foreground">
              OK
            </AppText>
          </Pressable>
        </BottomSheetView>
      </AppSheet>
    </View>
  );
}
