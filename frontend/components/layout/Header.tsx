'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getSteamLoginUrl } from '@/lib/auth';
import { premiumApi } from '@/lib/api';

export default function Header() {
  const { user, isAuthenticated, isLoading, fetchUser, logout } = useAuth();
  const [steamLoginUrl, setSteamLoginUrl] = useState('#');
  const [premiumEnabled, setPremiumEnabled] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Устанавливаем URL для Steam только на клиенте
  useEffect(() => {
    setSteamLoginUrl(getSteamLoginUrl());
  }, []);

  // Проверяем включен ли премиум
  useEffect(() => {
    premiumApi.getInfo().then((info) => {
      setPremiumEnabled(info.enabled);
    }).catch(() => {});
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-primary/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="size-8 text-primary">
              <svg className="w-full h-full" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </div>
            <span className="text-xl font-black tracking-wider uppercase">
              FACEIT<span className="text-primary">.TJ</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/play" className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-lg">sports_esports</span>
              НАЙТИ ИГРУ
            </Link>
            <Link href="/lobby/create" className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-primary transition-colors">
              <span className="material-symbols-outlined text-lg">add_circle</span>
              СОЗДАТЬ ЛОББИ
            </Link>
            {premiumEnabled && (
              <Link href="/premium" className="flex items-center gap-2 text-sm font-medium text-primary drop-shadow-[0_0_8px_rgba(0,217,255,0.4)]">
                <span className="material-symbols-outlined text-lg">workspace_premium</span>
                ПРЕМИУМ
              </Link>
            )}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-4">
            {isLoading ? (
              <div className="h-9 w-20 bg-background-secondary rounded animate-pulse" />
            ) : isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/profile"
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  {user.avatarUrl && (
                    <img
                      src={user.avatarUrl}
                      alt={user.username}
                      className="w-8 h-8 rounded-full border border-primary/30"
                    />
                  )}
                  <span className="text-sm font-medium hidden sm:block">{user.username}</span>
                  <span className="text-xs text-gray-400 hidden sm:block">
                    {user.mmr} MMR
                  </span>
                </Link>
                <button
                  onClick={() => logout()}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">logout</span>
                </button>
              </div>
            ) : (
              <a
                href={steamLoginUrl}
                className="hidden sm:flex h-9 px-4 items-center justify-center rounded bg-primary/10 text-primary text-sm font-bold border border-primary/20 hover:bg-primary hover:text-background-dark transition-all duration-300"
              >
                <span className="material-symbols-outlined text-lg mr-2">login</span>
                ВОЙТИ ЧЕРЕЗ STEAM
              </a>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
