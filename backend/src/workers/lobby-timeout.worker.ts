import { getExpiredLobbies, updateMatchStatus } from '../models/match.model';
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
      console.log(`Lobby ${lobby.lobby_code} expired, cancelling...`);

      // Update match status
      await updateMatchStatus(lobby.id, 'cancelled');

      // Release server
      await updateServerStatus(lobby.server_id, 'IDLE');

      // Clear host's active lobby
      if (lobby.created_by) {
        await setUserActiveLobby(lobby.created_by, null);
      }

      // Notify all players in lobby
      io.to(`lobby:${lobby.id}`).emit('lobby_cancelled', {
        matchId: lobby.id,
        reason: 'Lobby expired (5 minute timeout)',
      });

      console.log(`Lobby ${lobby.lobby_code} cancelled due to timeout`);
    } catch (error) {
      console.error(`Error cancelling expired lobby ${lobby.id}:`, error);
    }
  }
}
