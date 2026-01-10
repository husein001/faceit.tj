import { query } from '../config/database';
import { updateMatchStatus, getMatchPlayers } from '../models/match.model';
import { updateServerStatus, findServerById } from '../models/server.model';
import { setUserActiveLobby } from '../models/user.model';
import { io } from '../index';

const INTERVAL = 60000; // Check every 60 seconds
const ABANDONED_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes without any player = abandoned

let intervalId: NodeJS.Timeout | null = null;

interface LiveMatch {
  id: string;
  server_id: string | null;
  created_by: string | null;
  lobby_code: string | null;
  started_at: Date | null;
}

export function startMatchCleanupWorker(): void {
  if (intervalId) {
    console.log('Match cleanup worker already running');
    return;
  }

  console.log('Starting match cleanup worker (interval: 60s)');

  intervalId = setInterval(async () => {
    try {
      await checkAbandonedMatches();
    } catch (error) {
      console.error('Match cleanup worker error:', error);
    }
  }, INTERVAL);
}

export function stopMatchCleanupWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('Match cleanup worker stopped');
  }
}

async function checkAbandonedMatches(): Promise<void> {
  // Find live matches that started more than ABANDONED_TIMEOUT ago
  const abandonedMatches = await query<LiveMatch>(
    `SELECT m.id, m.server_id, m.created_by, m.lobby_code, m.started_at
     FROM matches m
     WHERE m.status = 'live'
     AND m.started_at < NOW() - INTERVAL '${Math.floor(ABANDONED_TIMEOUT_MS / 1000)} seconds'`
  );

  for (const match of abandonedMatches) {
    try {
      // Check if any players are connected to the server
      let hasConnectedPlayers = false;

      if (match.server_id) {
        try {
          const { gameServerManager } = await import('../services/game-server');
          const connectedPlayers = await Promise.race([
            gameServerManager.getConnectedPlayers(match.server_id),
            new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 5000))
          ]) as string[];

          hasConnectedPlayers = connectedPlayers.length > 0;
        } catch (err) {
          console.error(`Failed to check connected players for match ${match.id}:`, err);
          // If we can't check, assume abandoned after timeout
          hasConnectedPlayers = false;
        }
      }

      if (!hasConnectedPlayers) {
        console.log(`Match ${match.id} (${match.lobby_code}) has no connected players, cleaning up...`);
        await cleanupMatch(match);
      }
    } catch (error) {
      console.error(`Error checking match ${match.id}:`, error);
    }
  }
}

async function cleanupMatch(match: LiveMatch): Promise<void> {
  // Update match status to cancelled/finished
  await updateMatchStatus(match.id, 'cancelled');

  // Release server
  if (match.server_id) {
    await updateServerStatus(match.server_id, 'IDLE');

    // Async RCON cleanup
    const serverId = match.server_id;
    (async () => {
      try {
        const { gameServerManager } = await import('../services/game-server');
        await Promise.race([
          gameServerManager.executeRcon(serverId, 'sv_password ""'),
          new Promise((_, reject) => setTimeout(() => reject('timeout'), 5000))
        ]);
        await Promise.race([
          gameServerManager.executeRcon(serverId, 'kickall'),
          new Promise((_, reject) => setTimeout(() => reject('timeout'), 5000))
        ]);
        console.log(`Server ${serverId} cleaned up after abandoned match`);
      } catch (err) {
        console.error('Failed to cleanup server:', err);
      }
    })();
  }

  // Clear all players' active lobby
  const players = await getMatchPlayers(match.id);
  await Promise.all(
    players.map(player => setUserActiveLobby(player.user_id, null))
  );

  // Clear host's active lobby
  if (match.created_by) {
    await setUserActiveLobby(match.created_by, null);
  }

  // Notify any remaining socket connections
  io.to(`lobby:${match.id}`).emit('lobby_cancelled', {
    matchId: match.id,
    reason: 'Матч отменён - нет активных игроков',
  });

  console.log(`Match ${match.id} (${match.lobby_code}) cleaned up - no players connected`);
}
