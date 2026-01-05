import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types';
import { redis, USER_SOCKET_PREFIX } from '../config/redis';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  steamId?: string;
}

export function initSocketHandlers(io: SocketServer): void {
  // Middleware for authentication
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      // Allow unauthenticated connections for public data
      return next();
    }

    try {
      const decoded = jwt.verify(token as string, process.env.JWT_SECRET || 'secret') as JwtPayload;
      socket.userId = decoded.userId;
      socket.steamId = decoded.steamId;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    console.log(`Socket connected: ${socket.id} (user: ${socket.userId || 'anonymous'})`);

    // Join user-specific room if authenticated
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);

      // Store socket ID in Redis for cross-server communication
      await redis.set(`${USER_SOCKET_PREFIX}${socket.userId}`, socket.id, 'EX', 3600);
    }

    // Join queue updates room
    socket.join('queue');

    // Handle joining lobby room
    socket.on('join_lobby', (lobbyId: string) => {
      socket.join(`lobby:${lobbyId}`);
      console.log(`Socket ${socket.id} joined lobby:${lobbyId}`);
    });

    // Handle leaving lobby room
    socket.on('leave_lobby', (lobbyId: string) => {
      socket.leave(`lobby:${lobbyId}`);
      console.log(`Socket ${socket.id} left lobby:${lobbyId}`);
    });

    // Handle joining match room (for live updates)
    socket.on('join_match', (matchId: string) => {
      socket.join(`match:${matchId}`);
      console.log(`Socket ${socket.id} joined match:${matchId}`);
    });

    // Handle leaving match room
    socket.on('leave_match', (matchId: string) => {
      socket.leave(`match:${matchId}`);
      console.log(`Socket ${socket.id} left match:${matchId}`);
    });

    // Handle queue join (convenience method)
    socket.on('join_queue', async () => {
      if (!socket.userId) {
        socket.emit('error', { message: 'Authentication required' });
        return;
      }

      try {
        const { joinQueue } = await import('../services/matchmaking.service');
        const joined = await joinQueue(socket.userId);

        if (joined) {
          socket.emit('queue_joined', { success: true });
        } else {
          socket.emit('queue_joined', { success: false, message: 'Already in queue' });
        }
      } catch (error: any) {
        socket.emit('error', { message: error.message });
      }
    });

    // Handle queue leave
    socket.on('leave_queue', async () => {
      if (!socket.userId) {
        return;
      }

      try {
        const { leaveQueue } = await import('../services/matchmaking.service');
        await leaveQueue(socket.userId);
        socket.emit('queue_left', { success: true });
      } catch (error: any) {
        socket.emit('error', { message: error.message });
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      console.log(`Socket disconnected: ${socket.id}`);

      if (socket.userId) {
        // Remove from Redis
        await redis.del(`${USER_SOCKET_PREFIX}${socket.userId}`);

        // Optionally remove from queue on disconnect
        // Uncomment if you want this behavior:
        // const { leaveQueue } = await import('../services/matchmaking.service');
        // await leaveQueue(socket.userId);
      }
    });
  });

  console.log('Socket.io handlers initialized');
}

// Helper function to emit to a specific user
export async function emitToUser(io: SocketServer, userId: string, event: string, data: any): Promise<void> {
  io.to(`user:${userId}`).emit(event, data);
}

// Helper function to broadcast to all users in queue
export function emitToQueue(io: SocketServer, event: string, data: any): void {
  io.to('queue').emit(event, data);
}

// Helper function to emit to a lobby
export function emitToLobby(io: SocketServer, lobbyId: string, event: string, data: any): void {
  io.to(`lobby:${lobbyId}`).emit(event, data);
}

// Helper function to emit to a match
export function emitToMatch(io: SocketServer, matchId: string, event: string, data: any): void {
  io.to(`match:${matchId}`).emit(event, data);
}
