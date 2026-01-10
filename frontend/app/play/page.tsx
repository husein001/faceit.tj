'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { useMatchmaking } from '@/hooks/useMatchmaking';
import { getSteamLoginUrl } from '@/lib/auth';

const MAPS = [
  { id: 'de_dust2', name: 'Dust II', image: '/maps/dust2.jpeg' },
  { id: 'de_mirage', name: 'Mirage', image: '/maps/mirage.jpeg' },
  { id: 'de_inferno', name: 'Inferno', image: '/maps/inferno.jpeg' },
  { id: 'de_nuke', name: 'Nuke', image: '/maps/nuke.jpeg' },
  { id: 'de_overpass', name: 'Overpass', image: '/maps/overpass.jpeg' },
  { id: 'de_ancient', name: 'Ancient', image: '/maps/ancient.jpeg' },
];

export default function PlayPage() {
  const router = useRouter();
  const { user, token, isAuthenticated, isLoading: authLoading } = useAuth();
  const { on, off } = useSocket();
  const {
    isInQueue,
    queueCount,
    isSearching,
    matchFound,
    error,
    joinQueue,
    leaveQueue,
    setQueueCount,
    setMatchFound,
    reset,
  } = useMatchmaking();

  const [searchTime, setSearchTime] = useState(0);
  const [steamLoginUrl, setSteamLoginUrl] = useState('#');

  // Устанавливаем Steam URL только на клиенте
  useEffect(() => {
    setSteamLoginUrl(getSteamLoginUrl());
  }, []);

  // Listen for socket events
  useEffect(() => {
    const handleQueueUpdate = (data: { count: number }) => {
      setQueueCount(data.count);
    };

    const handleMatchFound = (data: any) => {
      setMatchFound(data);
    };

    const handleMatchCancelled = () => {
      reset();
    };

    const unsubQueue = on('queue_update', handleQueueUpdate);
    const unsubMatch = on('match_found', handleMatchFound);
    const unsubCancel = on('match_cancelled', handleMatchCancelled);

    return () => {
      off('queue_update', handleQueueUpdate);
      off('match_found', handleMatchFound);
      off('match_cancelled', handleMatchCancelled);
    };
  }, [on, off, setQueueCount, setMatchFound, reset]);

  // Search timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isInQueue) {
      interval = setInterval(() => {
        setSearchTime((t) => t + 1);
      }, 1000);
    } else {
      setSearchTime(0);
    }
    return () => clearInterval(interval);
  }, [isInQueue]);

  const handleJoinQueue = async () => {
    if (!token) return;
    try {
      await joinQueue(token);
    } catch (err) {
      console.error('Failed to join queue:', err);
    }
  };

  const handleLeaveQueue = async () => {
    if (!token) return;
    try {
      await leaveQueue(token);
    } catch (err) {
      console.error('Failed to leave queue:', err);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const copyConnectCommand = () => {
    if (matchFound?.connectCommand) {
      navigator.clipboard.writeText(matchFound.connectCommand);
    }
  };

  // Show match found modal
  if (matchFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-panel rounded-2xl p-8 max-w-lg w-full text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-5xl text-green-500">check_circle</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">МАТЧ НАЙДЕН!</h1>
          <p className="text-gray-400 mb-6">
            Карта: <span className="text-primary font-bold">{matchFound.map.replace('de_', '').toUpperCase()}</span>
          </p>

          <div className="bg-background-dark rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-400 mb-2">Команда для подключения:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-background-secondary px-3 py-2 rounded text-primary font-mono text-sm">
                {matchFound.connectCommand}
              </code>
              <button
                onClick={copyConnectCommand}
                className="p-2 bg-background-secondary rounded hover:bg-primary/20 transition-colors"
              >
                <span className="material-symbols-outlined text-primary">content_copy</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-background-dark rounded-lg p-4">
              <p className="text-xs text-blue-400 font-bold mb-2">КОМАНДА 1</p>
              {matchFound.team1.map((p) => (
                <p key={p.id} className="text-sm text-gray-300">{p.username}</p>
              ))}
            </div>
            <div className="bg-background-dark rounded-lg p-4">
              <p className="text-xs text-yellow-400 font-bold mb-2">КОМАНДА 2</p>
              {matchFound.team2.map((p) => (
                <p key={p.id} className="text-sm text-gray-300">{p.username}</p>
              ))}
            </div>
          </div>

          <p className="text-sm text-yellow-400 animate-pulse">
            Подключитесь в течение 3 минут, иначе матч будет отменён!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1200px] h-[500px] bg-primary/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-[1440px] mx-auto px-4 md:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-white/5 mb-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight uppercase text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
              МАТЧМЕЙКИНГ
            </h1>
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <span className="material-symbols-outlined text-base">dns</span>
              <span>Регион: Центральная Азия</span>
              <span className="w-1 h-1 rounded-full bg-gray-400" />
              <span className="text-primary">5v5 Соревновательный</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Map Pool */}
          <div className="lg:col-span-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">map</span>
                ПУЛ КАРТ
              </h3>
              <span className="text-xs font-bold bg-accent-blue px-2 py-1 rounded text-primary">
                СЛУЧАЙНЫЙ ВЫБОР
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {MAPS.map((map) => (
                <div
                  key={map.id}
                  className="group relative aspect-[3/4] md:aspect-[4/5] rounded-lg overflow-hidden border border-white/10 hover:border-primary/50 transition-all"
                >
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                    style={{ backgroundImage: `url(${map.image})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3">
                    <span className="font-bold text-white text-lg tracking-wide uppercase">
                      {map.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Queue Actions */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            {!isAuthenticated ? (
              // Not logged in
              <div className="glass-panel rounded-xl p-6 text-center">
                <span className="material-symbols-outlined text-5xl text-gray-500 mb-4">login</span>
                <h3 className="text-xl font-bold mb-2">Требуется авторизация</h3>
                <p className="text-gray-400 mb-6">Войдите через Steam для поиска матча</p>
                <a
                  href={steamLoginUrl}
                  className="inline-flex items-center justify-center gap-2 w-full py-4 bg-primary text-background-dark font-black uppercase rounded-lg shadow-neon hover:shadow-neon-hover transition-all"
                >
                  <span className="material-symbols-outlined">login</span>
                  Войти через Steam
                </a>
              </div>
            ) : isInQueue ? (
              // In queue
              <>
                <div className="glass-panel rounded-xl overflow-hidden border-t-2 border-primary">
                  <div className="p-5 flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-primary font-bold text-lg leading-tight flex items-center gap-2">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
                          </span>
                          ПОИСК...
                        </h4>
                        <p className="text-gray-400 text-sm mt-1">Режим: 5v5 Соревновательный</p>
                      </div>
                      <div className="size-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-background-dark rounded-lg p-3 text-center border border-white/5">
                        <p className="text-xs text-gray-500 font-bold uppercase">В очереди</p>
                        <p className="text-xl font-mono font-bold text-white">{queueCount}</p>
                      </div>
                      <div className="bg-background-dark rounded-lg p-3 text-center border border-white/5">
                        <p className="text-xs text-gray-500 font-bold uppercase">Время</p>
                        <p className="text-xl font-mono font-bold text-white">{formatTime(searchTime)}</p>
                      </div>
                    </div>

                    <button
                      onClick={handleLeaveQueue}
                      disabled={isSearching}
                      className="w-full py-3 rounded-lg bg-danger/10 text-danger hover:bg-danger hover:text-white border border-danger/20 hover:border-danger transition-all font-bold text-sm tracking-wide uppercase flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-lg">close</span>
                      ОТМЕНИТЬ ПОИСК
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // Not in queue
              <>
                <button
                  onClick={handleJoinQueue}
                  disabled={isSearching}
                  className="group relative w-full overflow-hidden rounded-xl bg-primary hover:bg-primary-hover text-background-dark transition-all duration-300 shadow-neon hover:shadow-neon-strong transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                  <div className="relative py-6 px-8 flex items-center justify-center gap-3">
                    <span className="material-symbols-outlined text-4xl font-black">play_arrow</span>
                    <span className="text-2xl font-black uppercase tracking-tight">НАЙТИ МАТЧ</span>
                  </div>
                </button>

                <div className="glass-panel rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Игроков в очереди</span>
                    <span className="text-white font-bold">{queueCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Ваш MMR</span>
                    <span className="text-primary font-bold">{user?.mmr || 1000}</span>
                  </div>
                </div>
              </>
            )}

            {error && (
              <div className="bg-danger/20 border border-danger/30 rounded-lg p-4 text-center">
                <p className="text-danger text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
