'use client';

import { create } from 'zustand';
import { matchmakingApi } from '@/lib/api';

interface MatchFoundData {
  matchId: string;
  map: string;
  connectCommand: string;
  server: {
    ip: string;
    port: number;
    name: string;
  };
  team1: Array<{ id: string; username: string; mmr: number }>;
  team2: Array<{ id: string; username: string; mmr: number }>;
}

interface MatchmakingState {
  isInQueue: boolean;
  queueCount: number;
  isSearching: boolean;
  matchFound: MatchFoundData | null;
  error: string | null;
  joinQueue: (token: string) => Promise<void>;
  leaveQueue: (token: string) => Promise<void>;
  setQueueCount: (count: number) => void;
  setMatchFound: (data: MatchFoundData | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useMatchmaking = create<MatchmakingState>((set, get) => ({
  isInQueue: false,
  queueCount: 0,
  isSearching: false,
  matchFound: null,
  error: null,

  joinQueue: async (token: string) => {
    set({ isSearching: true, error: null });
    try {
      const result = await matchmakingApi.join(token);
      set({
        isInQueue: true,
        queueCount: result.queueCount,
        isSearching: false,
      });
    } catch (error: any) {
      set({
        error: error.message,
        isSearching: false,
      });
      throw error;
    }
  },

  leaveQueue: async (token: string) => {
    try {
      await matchmakingApi.leave(token);
      set({
        isInQueue: false,
        isSearching: false,
      });
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    }
  },

  setQueueCount: (count: number) => set({ queueCount: count }),

  setMatchFound: (data: MatchFoundData | null) => set({
    matchFound: data,
    isInQueue: false,
    isSearching: false,
  }),

  setError: (error: string | null) => set({ error }),

  reset: () => set({
    isInQueue: false,
    queueCount: 0,
    isSearching: false,
    matchFound: null,
    error: null,
  }),
}));
