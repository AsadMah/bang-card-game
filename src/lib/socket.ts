import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = typeof window !== 'undefined' ? window.location.origin : '';
    console.log('[socket] Creating connection to:', url);
    socket = io(url, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
    });
    socket.on('connect', () => console.log('[socket] Connected:', socket?.id));
    socket.on('connect_error', (err) => console.error('[socket] Connection error:', err.message));
    socket.on('disconnect', (reason) => console.log('[socket] Disconnected:', reason));
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
