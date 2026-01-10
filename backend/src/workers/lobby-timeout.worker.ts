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

      // Если сервер был назначен - очистить через RCON
      if (lobby.server_id) {
        try {
          const { gameServerManager } = await import('../services/game-server');
          await gameServerManager.executeRcon(lobby.server_id, 'sv_password ""');
          await gameServerManager.executeRcon(lobby.server_id, 'kickall');
        } catch (err) {
          console.error('Failed to cleanup server via RCON:', err);
        }

        // Release server - SET TO IDLE
        await updateServerStatus(lobby.server_id, 'IDLE');
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
