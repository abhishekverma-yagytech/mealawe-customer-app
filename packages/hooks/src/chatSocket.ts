import { io, type Socket } from 'socket.io-client';

import { getCoreConfig } from '@mealawe/core';

let socket: Socket | null = null;

/** Support-chat Socket.IO connection — a module-level singleton so the chat
 * screen's remounts (e.g. navigating away and back) reuse one live socket
 * instead of piling up abandoned connections. */
export function getChatSocket(token: string): Socket {
  if (socket?.connected) return socket;
  socket?.disconnect();
  socket = io(`${getCoreConfig().serverUrl}/support-chat`, {
    path: '/support-chat-socket',
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
  });
  return socket;
}

export function disconnectChatSocket(): void {
  socket?.disconnect();
  socket = null;
}
