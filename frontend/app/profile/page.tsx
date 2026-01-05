'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { matchesApi } from '@/lib/api';
import { getSteamLoginUrl } from '@/lib/auth';

interface MatchHistoryItem {
  id: string;
  matchType: string;
  map: string;
  team1Score: number;
  team2Score: number;
  endedAt: string;
}

export default function ProfilePage() {
  const { user, token, isAuthenticated, isLoading } = useAuth();
  const [matchHistory, setMatchHistory] = useState<MatchHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!token) return;
      try {
        const history = await matchesApi.getHistory(token, 10);
        setMatchHistory(history);
      } catch (err) {
        console.error('Failed to fetch match history:', err);
      }
      setHistoryLoading(false);
    };

    if (isAuthenticated) {
      fetchHistory();
    }
  }, [token, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-panel rounded-2xl p-8 max-w-md w-full text-center">
          <span className="material-symbols-outlined text-6xl text-gray-500 mb-4">login</span>
          <h1 className="text-2xl font-bold text-white mb-4">Требуется авторизация</h1>
          <p className="text-gray-400 mb-6">Войдите через Steam для просмотра профиля</p>
          <a
            href={getSteamLoginUrl()}
            className="inline-flex items-center justify-center gap-2 w-full py-4 bg-primary text-background-dark font-black uppercase rounded-lg shadow-neon hover:shadow-neon-hover transition-all"
          >
            <span className="material-symbols-outlined">login</span>
            Войти через Steam
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Profile Header */}
        <div className="glass-panel rounded-2xl p-6 mb-6">
          <div className="flex flex-col md:flex-row items-center gap-6">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="w-24 h-24 rounded-xl border-2 border-primary/30"
              />
            ) : (
              <div className="w-24 h-24 rounded-xl bg-background-secondary flex items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-gray-500">person</span>
              </div>
            )}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-3xl font-black text-white mb-1">{user.username}</h1>
              <p className="text-gray-400 text-sm mb-4">Steam ID: {user.steamId}</p>
              <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                <div className="bg-background-dark rounded-lg px-4 py-2 border border-white/10">
                  <p className="text-xs text-gray-500 uppercase">MMR</p>
                  <p className="text-xl font-bold text-primary">{user.mmr}</p>
                </div>
                <div className="bg-background-dark rounded-lg px-4 py-2 border border-white/10">
                  <p className="text-xs text-gray-500 uppercase">Статус</p>
                  <p className="text-xl font-bold text-white flex items-center gap-2">
                    {user.isPremium ? (
                      <>
                        <span className="material-symbols-outlined text-yellow-500">workspace_premium</span>
                        Премиум
                      </>
                    ) : (
                      'Бесплатный'
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Match History */}
        <div className="glass-panel rounded-2xl p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">history</span>
            История матчей
          </h2>

          {historyLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : matchHistory.length === 0 ? (
            <div className="text-center py-8">
              <span className="material-symbols-outlined text-4xl text-gray-500 mb-2">sports_esports</span>
              <p className="text-gray-400">Пока нет сыгранных матчей</p>
            </div>
          ) : (
            <div className="space-y-3">
              {matchHistory.map((match) => (
                <div
                  key={match.id}
                  className="flex items-center justify-between bg-background-dark rounded-lg p-4 border border-white/5 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-12 rounded bg-background-secondary flex items-center justify-center">
                      <span className="text-xs font-bold text-white uppercase">
                        {match.map.replace('de_', '')}
                      </span>
                    </div>
                    <div>
                      <p className="font-bold text-white">
                        {match.matchType === 'custom' ? 'Кастом' : 'Рейтинговый'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(match.endedAt).toLocaleDateString('ru-RU')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">
                      <span className="text-blue-400">{match.team1Score}</span>
                      <span className="text-gray-500 mx-1">:</span>
                      <span className="text-yellow-400">{match.team2Score}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
