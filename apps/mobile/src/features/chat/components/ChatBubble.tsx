import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { palette } from '@/theme';

import type { ChatMessage } from '../types';

function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

interface ChatBubbleProps {
  message: ChatMessage;
  isMine: boolean;
}

export function ChatBubble({ message, isMine }: ChatBubbleProps) {
  return (
    <View className={`flex-row ${isMine ? 'justify-end' : 'justify-start'} px-4`}>
      <View style={{ maxWidth: '78%', gap: 2 }}>
        {!isMine && message.senderName ? (
          <AppText variant="caption" className="ml-1 text-muted-foreground">
            {message.senderRole === 'bot' ? 'Mealawe Bot' : message.senderName}
          </AppText>
        ) : null}
        <View
          className={`rounded-2xl px-3.5 py-2.5 ${isMine ? '' : 'border border-border bg-card'}`}
          style={isMine ? { backgroundColor: palette.brand.green } : undefined}>
          {message.text ? (
            <AppText variant="body" className={isMine ? 'text-white' : 'text-foreground'}>
              {message.text}
            </AppText>
          ) : null}
        </View>
        <AppText
          variant="caption"
          className="text-muted-foreground"
          style={{ textAlign: isMine ? 'right' : 'left', marginHorizontal: 2 }}>
          {formatTime(message.createdAt)}
        </AppText>
      </View>
    </View>
  );
}
