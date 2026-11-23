import { Send } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { palette } from '@/theme';

const TYPING_IDLE_MS = 1500;

interface ChatComposerProps {
  disabled?: boolean;
  onSend: (text: string) => void;
  onTypingChange: (isTyping: boolean) => void;
}

export function ChatComposer({ disabled, onSend, onTypingChange }: ChatComposerProps) {
  const [text, setText] = useState('');
  const isTypingRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (isTypingRef.current) onTypingChange(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function onChangeText(next: string) {
    setText(next);
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTypingChange(true);
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      isTypingRef.current = false;
      onTypingChange(false);
    }, TYPING_IDLE_MS);
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
    if (idleTimer.current) clearTimeout(idleTimer.current);
    isTypingRef.current = false;
    onTypingChange(false);
  }

  return (
    <View className="flex-row items-end gap-2 border-t border-border bg-card px-3 py-2.5">
      <TextInput
        value={text}
        onChangeText={onChangeText}
        placeholder="Type a message…"
        placeholderTextColor={palette.neutral.gray500}
        multiline
        editable={!disabled}
        className="max-h-28 flex-1 rounded-2xl border border-border bg-background px-3.5 py-2.5 text-body-lg text-foreground"
      />
      <Pressable
        onPress={submit}
        disabled={disabled || !text.trim()}
        accessibilityRole="button"
        accessibilityLabel="Send message"
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: text.trim() ? palette.brand.green : palette.neutral.gray400,
        }}
        className="active:opacity-80">
        <Send size={18} color="#fff" />
      </Pressable>
    </View>
  );
}
