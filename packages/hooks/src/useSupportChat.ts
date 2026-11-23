import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchChatHistory, type ChatConnectionStatus, type ChatMessage, type ChatSession } from '@mealawe/api';
import { useAuthStore } from '@mealawe/state';

import { disconnectChatSocket, getChatSocket } from './chatSocket';

interface StartSessionAck {
  ok?: boolean;
  session?: ChatSession;
  error?: string;
}

interface TypingPayload {
  sessionId: string;
  role: 'user' | 'admin' | 'bot';
  isTyping: boolean;
}

export function useSupportChat() {
  const profile = useAuthStore((s) => s.profile);
  const token = useAuthStore((s) => s.token);

  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatConnectionStatus>('connecting');
  const [adminTyping, setAdminTyping] = useState(false);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token || !profile?._id) return;
    const socket = getChatSocket(token);
    let cancelled = false;

    function onConnect() {
      setStatus('connected');
    }
    function onDisconnect() {
      if (!cancelled) setStatus('reconnecting');
    }
    function onNewMessage(message: ChatMessage) {
      if (message.sessionId !== sessionIdRef.current) return;
      setMessages((prev) => [...prev, message]);
      if (message.senderRole === 'admin') setAdminTyping(false);
    }
    function onTyping(payload: TypingPayload) {
      if (payload.sessionId !== sessionIdRef.current || payload.role !== 'admin') return;
      setAdminTyping(payload.isTyping);
    }
    function onSessionEnded(updated: ChatSession) {
      if (updated._id !== sessionIdRef.current) return;
      setSession(updated);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('new_message', onNewMessage);
    socket.on('typing', onTyping);
    socket.on('session_ended', onSessionEnded);

    (async () => {
      const ack = (await socket.emitWithAck('start_session', {
        userId: profile._id,
        userName: profile.userName,
        userPhoneNo: profile.phoneNo,
        subject: 'General Support',
      })) as StartSessionAck;
      if (cancelled) return;
      if (!ack?.session) {
        setStatus('disconnected');
        return;
      }
      sessionIdRef.current = ack.session._id;
      setSession(ack.session);
      const history = await fetchChatHistory(ack.session._id, profile._id);
      if (!cancelled) setMessages(history);
      socket.emit('mark_read', { sessionId: ack.session._id });
    })();

    return () => {
      cancelled = true;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('new_message', onNewMessage);
      socket.off('typing', onTyping);
      socket.off('session_ended', onSessionEnded);
    };
  }, [token, profile?._id, profile?.userName, profile?.phoneNo]);

  useEffect(() => disconnectChatSocket, []);

  const sendMessage = useCallback(
    (text: string) => {
      const socket = token ? getChatSocket(token) : null;
      if (!socket || !session || !text.trim()) return;
      socket.emit('send_message', {
        sessionId: session._id,
        userId: profile?._id,
        text: text.trim(),
        senderName: profile?.userName,
      });
    },
    [token, session, profile?._id, profile?.userName],
  );

  const setTyping = useCallback(
    (isTyping: boolean) => {
      const socket = token ? getChatSocket(token) : null;
      if (!socket || !session) return;
      socket.emit('typing', { sessionId: session._id, isTyping });
    },
    [token, session],
  );

  const endChat = useCallback(async () => {
    const socket = token ? getChatSocket(token) : null;
    if (!socket || !session) return;
    await socket.emitWithAck('end_session', { sessionId: session._id, userId: profile?._id });
  }, [token, session, profile?._id]);

  return {
    session,
    messages,
    status,
    adminTyping,
    myUserId: profile?._id ?? null,
    sendMessage,
    setTyping,
    endChat,
  };
}
