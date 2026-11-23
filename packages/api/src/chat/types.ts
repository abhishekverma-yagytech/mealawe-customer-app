export type ChatSenderRole = 'user' | 'admin' | 'bot';

export interface ChatAttachment {
  url: string;
  type: 'image' | 'file';
}

export interface ChatMessage {
  _id: string;
  sessionId: string;
  senderRole: ChatSenderRole;
  senderId: string;
  senderName?: string;
  text?: string;
  attachments?: ChatAttachment[];
  createdAt?: string;
  readAt?: string;
}

export interface ChatSessionUser {
  id: string;
  name?: string;
  phoneNo?: string;
}

export interface ChatSession {
  _id: string;
  user: ChatSessionUser;
  subject?: string;
  status: 'open' | 'closed';
  startedAt?: string;
  endedAt?: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
}

export type ChatConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
