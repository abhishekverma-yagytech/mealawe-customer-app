import { Stack, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { FaqAccordion } from '@/components/ui/FaqAccordion';
import { IconChat, IconMail, IconPhone } from '@/components/ui/icons';
import { supportApi, type Faq, type SupportContacts } from '@/features/support';
import { useScreenTracking } from '@/services/netcore';
import { palette } from '@/theme';
import { useAuthStore } from '@/store';

export default function HelpScreen() {
  useScreenTracking('help');

  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const [contacts, setContacts] = useState<SupportContacts>({});
  const [faqs, setFaqs] = useState<Faq[]>([]);

  useEffect(() => {
    supportApi.getSupportContacts().then(setContacts).catch(() => {});
    supportApi.getFaqs().then(setFaqs).catch(() => {});
  }, []);

  const digits = (contacts.phone ?? '').replace(/[^\d]/g, '');

  function chat() {
    router.push('/support-chat' as Href);
  }
  function call() {
    if (digits) Linking.openURL(`tel:${digits}`).catch(() => {});
  }
  function email() {
    if (!contacts.email) return;
    const subject = encodeURIComponent(`${profile?.userName ?? ''} - ${profile?.phoneNo ?? ''}`);
    Linking.openURL(`mailto:${contacts.email}?subject=${subject}`).catch(() => {});
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Help & support' }} />
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <AppText variant="body" className="text-muted-foreground">
          We&apos;re here to help. Reach us any way you like.
        </AppText>

        <View className="flex-row gap-3">
          <ContactAction icon={IconChat} label="Chat" onPress={chat} />
          <ContactAction icon={IconPhone} label="Call" onPress={call} disabled={!digits} />
          <ContactAction icon={IconMail} label="Email" onPress={email} disabled={!contacts.email} />
        </View>

        {faqs.length > 0 && (
          <AppText variant="title" className="mt-2 text-foreground">
            Frequently asked
          </AppText>
        )}

        <FaqAccordion items={faqs} />
      </ScrollView>
    </View>
  );
}

function ContactAction({
  icon: Icon,
  label,
  onPress,
  disabled,
}: {
  icon: typeof IconChat;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="flex-1 items-center gap-2 rounded-2xl border border-border bg-card py-4 active:opacity-80 disabled:opacity-50"
      accessibilityRole="button"
      accessibilityLabel={label}>
      <View className="h-11 w-11 items-center justify-center rounded-full bg-muted">
        <Icon size={22} color={palette.brand.green} />
      </View>
      <AppText variant="label" className="text-foreground">
        {label}
      </AppText>
    </Pressable>
  );
}
