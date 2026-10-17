/**
 * SocketContext — single shared Socket.io connection for the entire app.
 *
 * Usage:
 *   const { socket, isConnected } = useSocket();
 *   // subscribe to an event
 *   useEffect(() => {
 *     if (!socket) return;
 *     const handler = (data) => { ... };
 *     socket.on('score:update', handler);
 *     return () => socket.off('score:update', handler);
 *   }, [socket]);
 *
 * Rules:
 *   - Only ONE io() call lives in this file.
 *   - Components never call io() themselves; they use useSocket() instead.
 *   - The socket authenticates once the user's token is available.
 *   - On logout (token → null) the socket disconnects; on login it reconnects.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { token, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Defer socket connection so it doesn't compete with first paint / LCP
    const delay = window.setTimeout(() => {
      const s = io(SOCKET_URL, {
        ...(token ? { auth: { token } } : {}),
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });

      s.on('connect', () => {
        setIsConnected(true);
        if (isAuthenticated) {
          s.emit('join:user');
        }
      });

      s.on('disconnect', () => setIsConnected(false));
      s.on('connect_error', (err) => {
        console.warn('[Socket] Connection error:', err.message);
        setIsConnected(false);
      });

      setSocket(s);
    }, 2000);

    return () => {
      window.clearTimeout(delay);
      if (socket) {
        socket.disconnect();
      }
      setSocket(null);
      setIsConnected(false);
    };
    // Re-create socket when token changes (login / logout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const joinMatch = (matchId) => {
    if (socket && matchId) socket.emit('join:match', matchId);
  };

  const leaveMatch = (matchId) => {
    if (socket && matchId) socket.emit('leave:match', matchId);
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, joinMatch, leaveMatch }}>
      {children}
    </SocketContext.Provider>
  );
};

/**
 * useSocket() — access the shared Socket.io instance.
 * Returns { socket, isConnected }.
 * Safe to call from any component; socket may be null during SSR or before mount.
 */
export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return ctx;
};
