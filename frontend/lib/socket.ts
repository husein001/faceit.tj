'use client';

import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(token?: string): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  } else if (token) {
    socket.auth = { token };
  }

  return socket;
}

export function connectSocket(token?: string): Socket {
  const s = getSocket(token);
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Event types
export interface QueueUpdateEvent {
  count: number;
}

export interface MatchFoundEvent {
  matchId: string;
  map: string;
  server: {
    ip: string;
    port: number;
    name: string;
  };
  connectCommand: string;
  team1: Array<{ id: string; username: string; mmr: number }>;
  team2: Array<{ id: string; username: string; mmr: number }>;
}

export interface MatchCancelledEvent {
  matchId: string;
  reason: string;
}

export interface LobbyPlayerJoinedEvent {
  userId: string;
  username: string;
  avatarUrl: string;
  mmr: number;
  team: 1 | 2;
}

export interface LobbyPlayerLeftEvent {
  userId: string;
}

export interface LobbyStartedEvent {
  matchId: string;
  connectCommand: string;
  server: {
    ip: string;
    port: number;
    name: string;
  };
}

export interface LobbyCancelledEvent {
  matchId: string;
  reason: string;
}

export interface MatchLiveUpdateEvent {
  matchId: string;
  score: {
    team1: number;
    team2: number;
  };
}
