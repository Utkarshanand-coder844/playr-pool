import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import './env.js';
import { UserModel } from '../models/userModel.js';

import { isOriginAllowed } from './cors.js';

let io = null;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET must be configured before starting the server.');

/**
 * Initialize Socket.io on top of the existing HTTP server.
 * Call this once from server.js, right after creating the http server.
 */
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || isOriginAllowed(origin)) return callback(null, true);
        return callback(new Error('Origin not allowed'), false);
      },
      methods: ['GET', 'POST']
    }
  });

  // Anonymous sockets may receive public live updates. Only a JWT-authenticated
  // socket may enter a personal score-notification room.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next();
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.data.userId = decoded.userId || decoded.id;
      next();
    } catch { next(); }
  });

  io.on('connection', (socket) => {

    // Allow a user to join their personal notification room by userId
    socket.on('join:user', async () => {
      if (socket.data.userId) {
        socket.join(`user:${socket.data.userId}`);
        const user = await UserModel.findById(socket.data.userId);
        if (user?.campus) socket.join(`campus:${user.campus}`);
        socket.join('campus:all');
      }
    });

    // Match live scoring subscription room
    socket.on('join:match', (matchId) => {
      if (matchId && typeof matchId === 'string' && /^[0-9a-f-]{36}$/i.test(matchId)) {
        socket.join(`match:${matchId}`);
      }
    });

    socket.on('leave:match', (matchId) => {
      if (matchId) {
        socket.leave(`match:${matchId}`);
      }
    });

    socket.on('disconnect', () => {
      // no-op — avoid logging every disconnect to reduce log noise
    });
  });

  return io;
};

/**
 * Get the active Socket.io instance from anywhere in the app
 * (e.g. inside adminController, right after a score is saved).
 */
export const getIO = () => {
  if (!io) {
    // Return a no-op stub so the server doesn't crash if Socket.io isn't wired yet
    return {
      emit: () => {},
      to: () => ({ emit: () => {} })
    };
  }
  return io;
};
