/**
 * Socket.IO client singleton.
 * Shared across the entire app so we only open ONE connection.
 */
import { io } from 'socket.io-client';

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

let _socket = null;

/** Return the current socket (may be null if not yet connected). */
export function getSocket() {
  return _socket;
}

/**
 * Connect (or reuse) the socket with the given JWT access token.
 * Safe to call multiple times — only creates a new connection if one
 * doesn't already exist or the previous one was disconnected.
 */
export function connectSocket(token) {
  if (_socket?.connected) return _socket;

  // Clean up a stale, disconnected socket before creating a new one
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }

  _socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  return _socket;
}

/** Gracefully disconnect and clear the singleton. */
export function disconnectSocket() {
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }
}
