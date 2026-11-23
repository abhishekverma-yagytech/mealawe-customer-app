import { ENDPOINTS, http } from '@mealawe/core';

import type { ChatMessage } from './types';

/** Prior messages for a resumed session — live messages after this arrive over the socket. */
export async function fetchChatHistory(sessionId: string, userId: string): Promise<ChatMessage[]> {
  try {
    const raw = await http.get<unknown>(
      `${ENDPOINTS.supportChat.messages}/${sessionId}/messages?userId=${encodeURIComponent(userId)}`,
    );
    return Array.isArray(raw) ? (raw as ChatMessage[]) : [];
  } catch {
    return [];
  }
}
