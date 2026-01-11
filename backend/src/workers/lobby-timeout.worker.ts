import { getExpiredLobbies, updateMatchStatus, countPlayersInMatch, getMatchPlayers } from '../models/match.model';
import { updateServerStatus } from '../models/server.model';
import { setUserActiveLobby } from '../models/user.model';
import { io } from '../index';

const INTERVAL = 10000; // 10 seconds

let intervalId: NodeJS.Timeout | null = null;

export function startLobbyTimeoutWorker(): void {
  if (intervalId) {
    console.log('Lobby timeout worker already running');
    return;
  }

  console.log('Starting lobby timeout worker (interval: 10s)');

  intervalId = setInterval(async () => {
    try {
      await checkExpiredLobbies();
    } catch (error) {
      console.error('Lobby timeout worker error:', error);
    }
  }, INTERVAL);
}

export function stopLobbyTimeoutWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('Lobby timeout worker stopped');
  }
}

async function checkExpiredLobbies(): Promise<void> {
  const expiredLobbies = await getExpiredLobbies();

  for (const lobby of expiredLobbies) {
    try {
      // Проверить количество игроков
      const playerCount = await countPlayersInMatch(lobby.id);

      // Если 2+ игроков - лобби не истекает (игроки собрались)
      if (playerCount >= 2) {
        console.log(`Lobby ${lobby.lobby_code} has ${playerCount} players, keeping alive`);
        continue;
      }

      console.log(`Lobby ${lobby.lobby_code} expired with only ${playerCount} player(s), cancelling...`);

      // Release server in DB FIRST (не ждём RCON)
      if (lobby.server_id) {
        await updateServerStatus(lobby.server_id, 'IDLE');

        // RCON cleanup async (не блокируем воркер) - set random password so nobody can connect
        const serverId = lobby.server_id;
        (async () => {
          try {
            const { gameServerManager } = await import('../services/game-server');
            // Generate random password for idle server
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
            let idlePassword = 'idle_';
            for (let i = 0; i < 8; i++) {
              idlePassword += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            await Promise.race([
              gameServerManager.executeRcon(serverId, 'kickall'),
              new Promise((_, reject) => setTimeout(() => reject('timeout'), 5000))
            ]);
            await Promise.race([
              gameServerManager.executeRcon(serverId, `sv_password "${idlePassword}"`),
              new Promise((_, reject) => setTimeout(() => reject('timeout'), 5000))
            ]);
          } catch (err) {
            console.error('Failed to cleanup server via RCON:', err);
          }
        })();
      }

      // Update match status
      await updateMatchStatus(lobby.id, 'cancelled');

      // Clear all players' active lobby
      const players = await getMatchPlayers(lobby.id);
      for (const player of players) {
        await setUserActiveLobby(player.user_id, null);
      }

      // Clear host's active lobby
      if (lobby.created_by) {
        await setUserActiveLobby(lobby.created_by, null);
      }

      // Notify all players in lobby
      io.to(`lobby:${lobby.id}`).emit('lobby_cancelled', {
        matchId: lobby.id,
        reason: 'Лобби отменено - не набралось 2 игрока за 5 минут',
      });

      console.log(`Lobby ${lobby.lobby_code} cancelled due to timeout (< 2 players)`);
    } catch (error) {
      console.error(`Error cancelling expired lobby ${lobby.id}:`, error);
    }
  }
}
