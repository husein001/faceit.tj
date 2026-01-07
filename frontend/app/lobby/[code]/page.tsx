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
}

interface LobbyData {
  matchId: string;
  lobbyCode: string;
  map: string;
  status: string;
  hostId: string;
  expiresAt: string;
  connectCommand: string | null;
  players: LobbyPlayer[];
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

    on('lobby_player_joined', handlePlayerJoined);
    on('lobby_player_left', handlePlayerLeft);
    on('lobby_started', handleLobbyStarted);
    on('lobby_cancelled', handleLobbyCancelled);

    return () => {
      off('lobby_player_joined');
      off('lobby_player_left');
      off('lobby_started');
      off('lobby_cancelled');
    };
  }, [on, off, router]);

  // Countdown timer
  useEffect(() => {
    if (timeRemaining > 0) {
      const interval = setInterval(() => {
        setTimeRemaining((t) => Math.max(0, t - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timeRemaining]);

  const handleJoin = async () => {
    if (!token) return;
    try {
      await lobbyApi.join(token, code);
      // Refresh lobby data
      const data = await lobbyApi.get(code);
      setLobby(data);
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

  const copyLink = () => {
    navigator.clipboard.writeText(`https://faceit.tj/lobby/${code}`);
    setCopied('link');
    setTimeout(() => setCopied(null), 2000);
  };

  const copyConnect = () => {
    if (lobby?.connectCommand) {
      navigator.clipboard.writeText(lobby.connectCommand);
      setCopied('connect');
      setTimeout(() => setCopied(null), 2000);
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

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-[1400px] mx-auto">
        {error && (
          <div className="bg-danger/20 border border-danger/30 rounded-lg p-4 mb-6">
            <p className="text-danger">{error}</p>
          </div>
        )}

        {/* Lobby Header */}
        <div className="glass-panel rounded-2xl p-6 mb-6">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="h-24 w-40 rounded-lg bg-gradient-to-br from-background-secondary to-background-dark flex items-center justify-center border border-white/10">
                <span className="font-bold text-white uppercase">
                  {lobby.map.replace('de_', '')}
                </span>
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
              {!isInLobby && isAuthenticated && (
                <button
                  onClick={handleJoin}
                  className="px-6 py-3 bg-primary text-background-dark font-bold rounded-lg hover:shadow-neon transition-all"
                >
                  Join Lobby
                </button>
              )}
              {isInLobby && !isHost && (
                <button
                  onClick={handleLeave}
                  className="px-4 py-2 bg-background-dark text-danger border border-danger/30 hover:bg-danger/10 rounded-lg font-bold text-sm"
                >
                  Leave
                </button>
              )}
              {isHost && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-background-dark text-danger border border-danger/30 hover:bg-danger/10 rounded-lg font-bold text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Teams */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Team 1 */}
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
                <PlayerCard key={player.id} player={player} isHost={player.id === lobby.hostId} />
              ))}
              {[...Array(5 - team1Players.length)].map((_, i) => (
                <EmptySlot key={`empty1-${i}`} />
              ))}
            </div>
          </div>

          {/* Team 2 */}
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
                <PlayerCard key={player.id} player={player} isHost={player.id === lobby.hostId} />
              ))}
              {[...Array(5 - team2Players.length)].map((_, i) => (
                <EmptySlot key={`empty2-${i}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Connect Command */}
        {lobby.connectCommand && (
          <div className="glass-panel rounded-xl p-6">
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl text-green-500">play_arrow</span>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Connect to Server</p>
                  <p className="text-xs text-gray-500">Open CS2 console and paste command</p>
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
      </div>
    </div>
  );
}

function PlayerCard({ player, isHost }: { player: LobbyPlayer; isHost: boolean }) {
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
        <div className="absolute -bottom-1 -right-1 size-3 bg-green-500 rounded-full border-2 border-background-dark" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white font-bold truncate">{player.username}</p>
          {isHost && (
            <span className="material-symbols-outlined text-yellow-500 text-base">crown</span>
          )}
        </div>
        <p className="text-xs text-gray-400">{player.mmr} MMR</p>
      </div>
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="flex items-center justify-center gap-3 h-[72px] rounded-lg border border-dashed border-white/10 bg-white/5 text-gray-500">
      <span className="material-symbols-outlined text-sm animate-pulse">hourglass_empty</span>
      <span className="font-medium text-sm">Waiting for player...</span>
    </div>
  );
}
