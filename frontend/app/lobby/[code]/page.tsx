'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { lobbyApi } from '@/lib/api';

interface LobbyPlayer {
  id: string;
  team: 1 | 2;
  username: string;
  avatarUrl: string | null;
  mmr: number;
  connected?: boolean;
}

interface LobbyData {
  matchId: string;
  lobbyCode: string;
  map: string;
  status: string;
  hostId: string;
  expiresAt: string;
  connectCommand: string | null;
  server: { name: string; ip: string; port: number } | null;
  players: LobbyPlayer[];
}

interface MatchLiveState {
  team1Score: number;
  team2Score: number;
  phase: 'waiting' | 'knife' | 'live' | 'halftime' | 'overtime' | 'finished';
  roundNumber: number;
}

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token, isAuthenticated } = useAuth();
  const { on, off, emit } = useSocket();
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [matchLive, setMatchLive] = useState<MatchLiveState>({
    team1Score: 0,
    team2Score: 0,
    phase: 'waiting',
    roundNumber: 0,
  });
  const [matchEvents, setMatchEvents] = useState<string[]>([]);

  const code = params.code as string;
  const isHost = lobby?.hostId === user?.id;

  // Fetch lobby data
  useEffect(() => {
    const fetchLobby = async () => {
      try {
        const data = await lobbyApi.get(code);
        setLobby(data);
        setIsLoading(false);

        // Calculate remaining time
        if (data.expiresAt) {
          const remaining = Math.max(0, new Date(data.expiresAt).getTime() - Date.now());
          setTimeRemaining(Math.floor(remaining / 1000));
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load lobby');
        setIsLoading(false);
      }
    };

    fetchLobby();
  }, [code]);

  // Join lobby room for socket events
  useEffect(() => {
    if (lobby) {
      emit('join_lobby', lobby.matchId);
      return () => {
        emit('leave_lobby', lobby.matchId);
      };
    }
  }, [lobby, emit]);

  // Socket event listeners
  useEffect(() => {
    const handlePlayerJoined = (data: any) => {
      setLobby((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: [...prev.players, {
            id: data.userId,
            team: data.team,
            username: data.username,
            avatarUrl: data.avatarUrl,
            mmr: data.mmr,
          }],
        };
      });
    };

    const handlePlayerLeft = (data: { userId: string }) => {
      setLobby((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.filter((p) => p.id !== data.userId),
        };
      });
    };

    const handleLobbyStarted = (data: any) => {
      // Обновить лобби с новым connectCommand
      setLobby((prev) => prev ? { ...prev, connectCommand: data.connectCommand } : prev);
    };

    const handleLobbyCancelled = (data: any) => {
      setError(data.reason || 'Lobby was cancelled');
      setTimeout(() => router.push('/play'), 3000);
    };

    const handlePlayerSwitched = (data: any) => {
      setLobby((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.id === data.userId ? { ...p, team: data.newTeam } : p
          ),
        };
      });
    };

    // Match live events
    const handleMatchScoreUpdate = (data: any) => {
      setMatchLive((prev) => ({
        ...prev,
        team1Score: data.team1Score ?? data.score?.team1 ?? prev.team1Score,
        team2Score: data.team2Score ?? data.score?.team2 ?? prev.team2Score,
      }));
    };

    const handleRoundEnd = (data: any) => {
      setMatchLive((prev) => ({
        ...prev,
        team1Score: data.score?.team1 ?? prev.team1Score,
        team2Score: data.score?.team2 ?? prev.team2Score,
        roundNumber: data.roundNumber ?? prev.roundNumber,
        phase: 'live',
      }));
      addMatchEvent(`Раунд ${data.roundNumber} завершён: ${data.score?.team1}-${data.score?.team2}`);
    };

    const handleKnifeRoundStart = () => {
      setMatchLive((prev) => ({ ...prev, phase: 'knife' }));
      addMatchEvent('Knife раунд начался!');
    };

    const handleKnifeRoundWon = (data: any) => {
      addMatchEvent(`${data.winner === 'team1' ? 'CT' : 'T'} выиграли knife раунд`);
    };

    const handleMatchGoingLive = () => {
      setMatchLive((prev) => ({ ...prev, phase: 'live' }));
      addMatchEvent('Матч начинается!');
    };

    const handleMatchFinished = (data: any) => {
      setMatchLive((prev) => ({
        ...prev,
        team1Score: data.team1Score ?? prev.team1Score,
        team2Score: data.team2Score ?? prev.team2Score,
        phase: 'finished',
      }));
      setLobby((prev) => prev ? { ...prev, status: 'finished' } : prev);
      addMatchEvent(`Матч завершён! ${data.winner === 'team1' ? 'CT' : 'T'} победили ${data.team1Score}-${data.team2Score}`);
    };

    const handlePlayerConnected = (data: any) => {
      setLobby((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.id === data.userId ? { ...p, connected: true } : p
          ),
        };
      });
      addMatchEvent(`${data.username} подключился к серверу`);
    };

    const handlePlayerDisconnected = (data: any) => {
      setLobby((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.id === data.userId ? { ...p, connected: false } : p
          ),
        };
      });
      addMatchEvent(`${data.username} отключился от сервера`);
    };

    on('lobby_player_joined', handlePlayerJoined);
    on('lobby_player_left', handlePlayerLeft);
    on('lobby_started', handleLobbyStarted);
    on('lobby_cancelled', handleLobbyCancelled);
    on('lobby_player_switched', handlePlayerSwitched);
    // Match events
    on('match_score_update', handleMatchScoreUpdate);
    on('round_end', handleRoundEnd);
    on('knife_round_start', handleKnifeRoundStart);
    on('knife_round_won', handleKnifeRoundWon);
    on('match_going_live', handleMatchGoingLive);
    on('match_finished', handleMatchFinished);
    on('player_connected', handlePlayerConnected);
    on('player_disconnected', handlePlayerDisconnected);

    return () => {
      off('lobby_player_joined');
      off('lobby_player_left');
      off('lobby_started');
      off('lobby_cancelled');
      off('lobby_player_switched');
      off('match_score_update');
      off('round_end');
      off('knife_round_start');
      off('knife_round_won');
      off('match_going_live');
      off('match_finished');
      off('player_connected');
      off('player_disconnected');
    };
  }, [on, off, router]);

  // Helper to add match events (keep last 10)
  const addMatchEvent = (event: string) => {
    setMatchEvents((prev) => [...prev.slice(-9), event]);
  };

  // Countdown timer
  useEffect(() => {
    if (timeRemaining > 0) {
      const interval = setInterval(() => {
        setTimeRemaining((t) => Math.max(0, t - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timeRemaining]);

  const handleJoinTeam = async (team: 1 | 2) => {
    if (!token) return;
    setError(null);
    try {
      await lobbyApi.join(token, code, team);
      // Refresh lobby data
      const data = await lobbyApi.get(code);
      setLobby(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSwitchTeam = async (newTeam: 1 | 2) => {
    if (!token || !user) return;
    setError(null);
    try {
      await lobbyApi.switchTeam(token, code, newTeam);
      // Update local state immediately (socket event may also arrive)
      setLobby((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.id === user.id ? { ...p, team: newTeam } : p
          ),
        };
      });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLeave = async () => {
    if (!token) return;
    try {
      await lobbyApi.leave(token, code);
      router.push('/play');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCancel = async () => {
    if (!token) return;
    try {
      await lobbyApi.cancel(token, code);
      router.push('/play');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleStart = async () => {
    if (!token) return;
    setIsStarting(true);
    setError(null);
    try {
      const result = await lobbyApi.start(token, code);
      // Update lobby with connect command from response
      setLobby((prev) => prev ? {
        ...prev,
        connectCommand: result.connectCommand,
        server: result.server,
        status: 'live',
      } : prev);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsStarting(false);
    }
  };

  const copyToClipboard = async (text: string): Promise<boolean> => {
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.error('Clipboard API failed:', err);
      }
    }

    // Fallback for HTTP or older browsers
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    } catch (err) {
      console.error('Fallback copy failed:', err);
      return false;
    }
  };

  const copyLink = async () => {
    const success = await copyToClipboard(`https://faceit.tj/lobby/${code}`);
    if (success) {
      setCopied('link');
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const copyConnect = async () => {
    if (lobby?.connectCommand) {
      const success = await copyToClipboard(lobby.connectCommand);
      if (success) {
        setCopied('connect');
        setTimeout(() => setCopied(null), 2000);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return { mins, secs };
  };

  const time = formatTime(timeRemaining);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !lobby) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-panel rounded-2xl p-8 max-w-md text-center">
          <span className="material-symbols-outlined text-6xl text-danger mb-4">error</span>
          <h1 className="text-2xl font-bold text-white mb-4">Error</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <a
            href="/play"
            className="inline-block px-6 py-3 bg-primary text-background-dark font-bold rounded-lg"
          >
            Back to Play
          </a>
        </div>
      </div>
    );
  }

  if (!lobby) return null;

  const team1Players = lobby.players.filter((p) => p.team === 1);
  const team2Players = lobby.players.filter((p) => p.team === 2);
  const isInLobby = lobby.players.some((p) => p.id === user?.id);
  const isExpired = timeRemaining <= 0 && lobby.status === 'waiting' && !lobby.connectCommand;

  // Map images mapping
  const getMapImage = (mapName: string): string => {
    const mapImages: Record<string, string> = {
      'de_dust2': '/maps/dust2.jpeg',
      'de_mirage': '/maps/mirage.jpeg',
      'de_inferno': '/maps/inferno.jpeg',
      'de_nuke': '/maps/nuke.jpeg',
      'de_ancient': '/maps/ancient.jpeg',
      'de_overpass': '/maps/overpass.jpeg',
      'de_train': '/maps/train.jpeg',
      'de_anubis': '/maps/anubis.jpeg',
      'de_vertigo': '/maps/vertigo.jpeg',
    };
    return mapImages[mapName] || '/maps/dust2.jpeg';
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-[1400px] mx-auto">
        {error && (
          <div className="bg-danger/20 border border-danger/30 rounded-lg p-4 mb-6">
            <p className="text-danger">{error}</p>
          </div>
        )}

        {/* Expired Banner */}
        {isExpired && (
          <div className="glass-panel rounded-2xl p-8 mb-6 text-center border border-danger/30">
            <span className="material-symbols-outlined text-6xl text-danger mb-4">timer_off</span>
            <h2 className="text-2xl font-bold text-white mb-2">Время истекло</h2>
            <p className="text-gray-400 mb-6">
              Время для сбора игроков истекло. Лобби будет автоматически закрыто.
            </p>
            <div className="flex gap-4 justify-center">
              <a
                href="/lobby/create"
                className="px-6 py-3 bg-primary text-background-dark font-bold rounded-lg hover:shadow-neon transition-all"
              >
                Создать новое лобби
              </a>
              <a
                href="/play"
                className="px-6 py-3 bg-background-dark text-white border border-white/20 font-bold rounded-lg hover:bg-white/10 transition-all"
              >
                Найти игру
              </a>
            </div>
          </div>
        )}

        {/* Lobby Header */}
        <div className="glass-panel rounded-2xl p-6 mb-6">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="h-24 w-40 rounded-lg overflow-hidden border border-white/10 relative">
                <img
                  src={getMapImage(lobby.map)}
                  alt={lobby.map}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-center pb-2">
                  <span className="font-bold text-white uppercase text-sm">
                    {lobby.map.replace('de_', '')}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-primary text-sm font-medium uppercase">Competitive 5v5</p>
                <h1 className="text-3xl font-black text-white">Lobby #{code}</h1>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-2 text-gray-400 text-sm hover:text-white transition-colors"
                >
                  <span>{copied === 'link' ? 'Copied!' : 'Copy Link'}</span>
                  <span className="material-symbols-outlined text-base">
                    {copied === 'link' ? 'check' : 'content_copy'}
                  </span>
                </button>
              </div>
            </div>

            {/* Timer */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-2">
                <div className="bg-background-dark border border-accent-blue px-4 py-3 rounded-lg text-center min-w-[70px]">
                  <span className="text-2xl font-bold text-primary tabular-nums">
                    {time.mins.toString().padStart(2, '0')}
                  </span>
                  <span className="block text-[10px] uppercase text-gray-500 font-bold">Min</span>
                </div>
                <span className="text-2xl font-bold text-gray-600 self-start mt-3">:</span>
                <div className="bg-background-dark border border-accent-blue px-4 py-3 rounded-lg text-center min-w-[70px]">
                  <span className="text-2xl font-bold text-primary tabular-nums">
                    {time.secs.toString().padStart(2, '0')}
                  </span>
                  <span className="block text-[10px] uppercase text-gray-500 font-bold">Sec</span>
                </div>
              </div>
              <p className="text-xs text-gray-500">Time to gather players</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              {isInLobby && !isHost && !isExpired && (
                <button
                  onClick={handleLeave}
                  className="px-4 py-2 bg-background-dark text-danger border border-danger/30 hover:bg-danger/10 rounded-lg font-bold text-sm"
                >
                  Покинуть
                </button>
              )}
              {isHost && lobby.status === 'waiting' && !lobby.connectCommand && !isExpired && (
                <button
                  onClick={handleStart}
                  disabled={lobby.players.length < 2 || isStarting}
                  className={`px-6 py-3 font-bold rounded-lg transition-all flex items-center gap-2 ${
                    lobby.players.length >= 2
                      ? 'bg-green-500 text-white hover:bg-green-400 hover:shadow-[0_0_20px_rgba(34,197,94,0.5)]'
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isStarting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Поиск сервера...
                    </>
                  ) : lobby.players.length >= 2 ? (
                    <>
                      <span className="material-symbols-outlined">play_arrow</span>
                      Начать игру
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">hourglass_empty</span>
                      Ждём игроков ({lobby.players.length}/2)
                    </>
                  )}
                </button>
              )}
              {isHost && !isExpired && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-background-dark text-danger border border-danger/30 hover:bg-danger/10 rounded-lg font-bold text-sm"
                >
                  Отменить
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Teams */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Team 1 - Counter-Terrorists */}
          <div className="glass-panel rounded-xl overflow-hidden">
            <div className="p-4 border-b border-white/5 bg-gradient-to-r from-blue-900/20 to-transparent flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded bg-blue-500/20 flex items-center justify-center border border-blue-500/40 text-blue-400">
                  <span className="material-symbols-outlined">shield</span>
                </div>
                <h3 className="text-lg font-bold text-white">Counter-Terrorists</h3>
              </div>
              <span className="text-xs font-bold px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {team1Players.length}/5
              </span>
            </div>
            <div className="p-4 space-y-3">
              {team1Players.map((player) => (
                <PlayerCard key={player.id} player={player} isHost={player.id === lobby.hostId} showConnectionStatus={!!lobby.connectCommand} />
              ))}
              {[...Array(5 - team1Players.length)].map((_, i) => (
                <EmptySlot
                  key={`empty1-${i}`}
                  team={1}
                  canJoin={isAuthenticated && !isInLobby && lobby.status === 'waiting' && !isExpired}
                  canSwitch={isInLobby && lobby.players.find(p => p.id === user?.id)?.team === 2 && lobby.status === 'waiting' && !isExpired}
                  onJoin={() => handleJoinTeam(1)}
                  onSwitch={() => handleSwitchTeam(1)}
                />
              ))}
            </div>
          </div>

          {/* Team 2 - Terrorists */}
          <div className="glass-panel rounded-xl overflow-hidden">
            <div className="p-4 border-b border-white/5 bg-gradient-to-r from-yellow-900/20 to-transparent flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded bg-yellow-600/20 flex items-center justify-center border border-yellow-600/40 text-yellow-500">
                  <span className="material-symbols-outlined">target</span>
                </div>
                <h3 className="text-lg font-bold text-white">Terrorists</h3>
              </div>
              <span className="text-xs font-bold px-2 py-1 rounded bg-yellow-600/10 text-yellow-500 border border-yellow-600/20">
                {team2Players.length}/5
              </span>
            </div>
            <div className="p-4 space-y-3">
              {team2Players.map((player) => (
                <PlayerCard key={player.id} player={player} isHost={player.id === lobby.hostId} showConnectionStatus={!!lobby.connectCommand} />
              ))}
              {[...Array(5 - team2Players.length)].map((_, i) => (
                <EmptySlot
                  key={`empty2-${i}`}
                  team={2}
                  canJoin={isAuthenticated && !isInLobby && lobby.status === 'waiting' && !isExpired}
                  canSwitch={isInLobby && lobby.players.find(p => p.id === user?.id)?.team === 1 && lobby.status === 'waiting' && !isExpired}
                  onJoin={() => handleJoinTeam(2)}
                  onSwitch={() => handleSwitchTeam(2)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Live Score Panel - показывается когда матч идёт */}
        {lobby.connectCommand && (matchLive.phase !== 'waiting' || matchLive.team1Score > 0 || matchLive.team2Score > 0) && (
          <div className="glass-panel rounded-xl p-6 mb-6">
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-red-500 animate-pulse">fiber_manual_record</span>
                <span className="text-sm font-bold text-red-500 uppercase">
                  {matchLive.phase === 'knife' ? 'Knife Round' :
                   matchLive.phase === 'live' ? 'Live' :
                   matchLive.phase === 'halftime' ? 'Halftime' :
                   matchLive.phase === 'overtime' ? 'Overtime' :
                   matchLive.phase === 'finished' ? 'Завершён' : 'В процессе'}
                </span>
                {matchLive.roundNumber > 0 && (
                  <span className="text-xs text-gray-500 ml-2">Раунд {matchLive.roundNumber}</span>
                )}
              </div>
              <div className="flex items-center gap-8">
                <div className="text-center">
                  <div className="text-6xl font-black text-blue-400 tabular-nums">{matchLive.team1Score}</div>
                  <div className="text-sm text-gray-400 mt-1">Counter-Terrorists</div>
                </div>
                <div className="text-3xl font-bold text-gray-600">:</div>
                <div className="text-center">
                  <div className="text-6xl font-black text-yellow-400 tabular-nums">{matchLive.team2Score}</div>
                  <div className="text-sm text-gray-400 mt-1">Terrorists</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Connect Command */}
        {lobby.connectCommand && (
          <div className="glass-panel rounded-xl p-6 mb-6">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl text-green-500">play_arrow</span>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Подключиться к серверу</p>
                  <p className="text-xs text-gray-500">Откройте консоль CS2 и вставьте команду</p>
                </div>
              </div>
              <div className="flex-1 flex items-center gap-2 w-full md:w-auto">
                <code className="flex-1 bg-background-dark px-4 py-3 rounded-lg text-primary font-mono text-lg border border-primary/30">
                  {lobby.connectCommand}
                </code>
                <button
                  onClick={copyConnect}
                  className="p-3 bg-primary text-background-dark rounded-lg hover:shadow-neon transition-all"
                >
                  <span className="material-symbols-outlined">
                    {copied === 'connect' ? 'check' : 'content_copy'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Match Events Log */}
        {matchEvents.length > 0 && (
          <div className="glass-panel rounded-xl p-4">
            <h3 className="text-sm font-bold text-gray-400 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-base">history</span>
              События матча
            </h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {matchEvents.map((event, i) => (
                <div key={i} className="text-sm text-gray-500 py-1 border-b border-white/5 last:border-0">
                  {event}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerCard({ player, isHost, showConnectionStatus }: { player: LobbyPlayer; isHost: boolean; showConnectionStatus?: boolean }) {
  const isConnected = player.connected !== false; // default to true if not set

  return (
    <div className={`flex items-center gap-4 bg-background-dark p-3 rounded-lg ${isHost ? 'border-l-4 border-primary' : ''}`}>
      <div className="relative shrink-0">
        {player.avatarUrl ? (
          <img src={player.avatarUrl} alt={player.username} className="size-12 rounded-lg" />
        ) : (
          <div className="size-12 rounded-lg bg-background-secondary flex items-center justify-center">
            <span className="material-symbols-outlined text-gray-500">person</span>
          </div>
        )}
        <div className={`absolute -bottom-1 -right-1 size-3 rounded-full border-2 border-background-dark ${
          showConnectionStatus
            ? (isConnected ? 'bg-green-500' : 'bg-gray-500')
            : 'bg-green-500'
        }`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`font-bold truncate ${showConnectionStatus && !isConnected ? 'text-gray-500' : 'text-white'}`}>
            {player.username}
          </p>
          {isHost && (
            <span className="material-symbols-outlined text-yellow-500 text-base">crown</span>
          )}
          {showConnectionStatus && (
            <span className={`text-xs ${isConnected ? 'text-green-500' : 'text-gray-500'}`}>
              {isConnected ? 'В игре' : 'Офлайн'}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400">{player.mmr} MMR</p>
      </div>
    </div>
  );
}

function EmptySlot({
  team,
  canJoin,
  canSwitch,
  onJoin,
  onSwitch,
}: {
  team: 1 | 2;
  canJoin: boolean;
  canSwitch: boolean;
  onJoin: () => void;
  onSwitch: () => void;
}) {
  const isClickable = canJoin || canSwitch;
  const teamColor = team === 1 ? 'blue' : 'yellow';

  if (!isClickable) {
    return (
      <div className="flex items-center justify-center gap-3 h-[72px] rounded-lg border border-dashed border-white/10 bg-white/5 text-gray-500">
        <span className="material-symbols-outlined text-sm animate-pulse">hourglass_empty</span>
        <span className="font-medium text-sm">Ожидание игрока...</span>
      </div>
    );
  }

  return (
    <button
      onClick={canJoin ? onJoin : onSwitch}
      className={`w-full flex items-center justify-center gap-3 h-[72px] rounded-lg border-2 border-dashed transition-all cursor-pointer ${
        team === 1
          ? 'border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 hover:border-blue-500/60 text-blue-400'
          : 'border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20 hover:border-yellow-500/60 text-yellow-400'
      }`}
    >
      <span className="material-symbols-outlined text-lg">
        {canJoin ? 'person_add' : 'swap_horiz'}
      </span>
      <span className="font-medium text-sm">
        {canJoin ? 'Присоединиться' : 'Перейти сюда'}
      </span>
    </button>
  );
}
