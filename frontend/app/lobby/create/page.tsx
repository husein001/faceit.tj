'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { lobbyApi } from '@/lib/api';
import { getSteamLoginUrl } from '@/lib/auth';

const MAPS = [
  { id: 'de_dust2', name: 'Dust II', image: '/maps/dust2.jpeg' },
  { id: 'de_mirage', name: 'Mirage', image: '/maps/mirage.jpeg' },
  { id: 'de_inferno', name: 'Inferno', image: '/maps/inferno.jpeg' },
  { id: 'de_nuke', name: 'Nuke', image: '/maps/nuke.jpeg' },
  { id: 'de_overpass', name: 'Overpass', image: '/maps/overpass.jpeg' },
  { id: 'de_ancient', name: 'Ancient', image: '/maps/ancient.jpeg' },
];

export default function CreateLobbyPage() {
  const router = useRouter();
  const { user, token, isAuthenticated } = useAuth();
  const [selectedMap, setSelectedMap] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steamLoginUrl, setSteamLoginUrl] = useState('#');

  useEffect(() => {
    setSteamLoginUrl(getSteamLoginUrl());
  }, []);

  const handleCreateLobby = async () => {
    if (!token || !selectedMap) return;

    setIsCreating(true);
    setError(null);

    try {
      const result = await lobbyApi.create(token, selectedMap);
      router.push(`/lobby/${result.lobbyCode}`);
    } catch (err: any) {
      setError(err.message || 'Не удалось создать лобби');
      setIsCreating(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-panel rounded-2xl p-8 max-w-md w-full text-center">
          <span className="material-symbols-outlined text-6xl text-gray-500 mb-4">login</span>
          <h1 className="text-2xl font-bold text-white mb-4">Требуется авторизация</h1>
          <p className="text-gray-400 mb-6">Войдите через Steam, чтобы создать лобби</p>
          <a
            href={steamLoginUrl}
            className="inline-flex items-center justify-center gap-2 w-full py-4 bg-primary text-background-dark font-black uppercase rounded-lg shadow-neon hover:shadow-neon-hover transition-all"
          >
            <span className="material-symbols-outlined">login</span>
            Войти через Steam
          </a>
        </div>
      </div>
    );
  }

  if (!user?.isPremium) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-panel rounded-2xl p-8 max-w-md w-full text-center">
          <span className="material-symbols-outlined text-6xl text-yellow-500 mb-4">workspace_premium</span>
          <h1 className="text-2xl font-bold text-white mb-4">Требуется премиум</h1>
          <p className="text-gray-400 mb-6">
            Создание лобби — премиум функция.
            Улучшите свой аккаунт, чтобы получить доступ.
          </p>
          <a
            href="/premium"
            className="inline-flex items-center justify-center gap-2 w-full py-4 bg-primary text-background-dark font-black uppercase rounded-lg shadow-neon hover:shadow-neon-hover transition-all"
          >
            <span className="material-symbols-outlined">workspace_premium</span>
            Получить Премиум
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-black text-white uppercase mb-2">Создать лобби</h1>
          <p className="text-gray-400">Выберите карту и создайте своё лобби</p>
        </div>

        {error && (
          <div className="bg-danger/20 border border-danger/30 rounded-lg p-4 mb-6">
            <p className="text-danger">{error}</p>
          </div>
        )}

        <div className="glass-panel rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">map</span>
            Выберите карту
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {MAPS.map((map) => (
              <button
                key={map.id}
                onClick={() => setSelectedMap(map.id)}
                className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all ${
                  selectedMap === map.id
                    ? 'border-primary shadow-neon'
                    : 'border-white/10 hover:border-primary/50'
                }`}
              >
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${map.image})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-3">
                  <span className="font-bold text-white uppercase">{map.name}</span>
                </div>
                {selectedMap === map.id && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <span className="material-symbols-outlined text-background-dark text-sm">check</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">info</span>
            Информация о лобби
          </h2>
          <ul className="space-y-2 text-gray-400 text-sm">
            <li className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">timer</span>
              5 минут на сбор игроков после создания
            </li>
            <li className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">groups</span>
              Минимум 2 игрока для старта
            </li>
            <li className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">schedule</span>
              Сервер забронирован на 2 часа
            </li>
          </ul>
        </div>

        <button
          onClick={handleCreateLobby}
          disabled={!selectedMap || isCreating}
          className="w-full py-4 bg-primary text-background-dark font-black text-xl uppercase rounded-lg shadow-neon hover:shadow-neon-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isCreating ? (
            <>
              <div className="w-6 h-6 border-2 border-background-dark border-t-transparent rounded-full animate-spin" />
              Создание...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined">add</span>
              Создать лобби
            </>
          )}
        </button>
      </div>
    </div>
  );
}
