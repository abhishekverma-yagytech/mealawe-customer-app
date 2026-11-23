import { Redirect, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { FlatList, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { ChatBubble, ChatComposer, useSupportChat, type ChatMessage } from '@/features/chat';
import { useScreenTracking } from '@/services/netcore';
import { palette } from '@/theme';
import { useAuthStore } from '@/store/authStore';

const STATUS_LABEL: Record<string, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  disconnected: 'Disconnected',
};

export default function SupportChatScreen() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  useScreenTracking(isAuthenticated ? 'support_chat' : null);

  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const { session, messages, status, adminTyping, myUserId, sendMessage, setTyping } = useSupportChat();

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages.length]);

  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  const ended = session?.status === 'closed';
  const statusText = ended ? 'Chat ended' : STATUS_LABEL[status];
  const statusColor = ended
    ? palette.neutral.gray500
    : status === 'connected'
      ? palette.brand.green
      : palette.accent.rating;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: 'Live chat' }} />
      <StatusBar style="auto" />

      <View className="flex-row items-center gap-1.5 border-b border-border px-4 py-2">
        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: statusColor }} />
        <AppText variant="caption" className="text-muted-foreground">
          {statusText}
        </AppText>
      </View>

      <KeyboardAvoidingView className="flex-1" behavior="padding" keyboardVerticalOffset={insets.top + 8}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m._id}
          contentContainerStyle={{ paddingVertical: 12, gap: 10 }}
          renderItem={({ item }) => <ChatBubble message={item} isMine={item.senderId === myUserId} />}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-10" style={{ paddingTop: 60 }}>
              <AppText variant="title" className="text-center text-foreground">
                Hi, how can we help?
              </AppText>
              <AppText variant="bodySm" className="mt-1 text-center text-muted-foreground">
                Send a message and a support agent will be with you shortly.
              </AppText>
            </View>
          }
          ListFooterComponent={
            adminTyping ? (
              <View className="flex-row px-4">
                <View className="rounded-2xl border border-border bg-card px-3.5 py-2.5">
                  <AppText variant="body" className="text-muted-foreground">
                    Typing…
                  </AppText>
                </View>
              </View>
            ) : null
          }
        />

        <View style={{ paddingBottom: insets.bottom }}>
          <ChatComposer disabled={ended} onSend={sendMessage} onTypingChange={setTyping} />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
