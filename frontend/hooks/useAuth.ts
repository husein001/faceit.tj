'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '@/lib/api';
import { getToken, setToken, removeToken } from '@/lib/auth';

interface User {
  id: string;
  steamId: string;
  username: string;
  avatarUrl: string | null;
  mmr: number;
  isPremium: boolean;
  premiumUntil: string | null;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (token: string) => {
        set({ isLoading: true });
        try {
          setToken(token);
          const user = await authApi.getMe(token);
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          removeToken();
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
          throw error;
        }
      },

      logout: async () => {
        const { token } = get();
        try {
          if (token) {
            await authApi.logout(token);
          }
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          removeToken();
          set({
            user: null,
            token: null,
            isAuthenticated: false,
          });
        }
      },

      fetchUser: async () => {
        const token = getToken();
        if (!token) {
          set({ isAuthenticated: false, user: null });
          return;
        }

        set({ isLoading: true });
        try {
          const user = await authApi.getMe(token);
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          removeToken();
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
);
