import { redis, QUEUE_PREFIX } from '../config/redis';
import { User, QueuePlayer } from '../types';
import { findUserById, getUsersByIds } from '../models/user.model';
import { findIdleServer, updateServerStatus } from '../models/server.model';
import { createMatch, addMatchPlayer, getMatchPlayers, updatePlayerConnected, updateMatchStatus } from '../models/match.model';
import { balanceTeams } from './balance.service';
import { generateGet5Config, selectRandomMap } from './get5.service';
import { loadGet5Match, kickAllPlayers } from './server.service';
import { io } from '../index';

const QUEUE_KEY = `${QUEUE_PREFIX}main`;
const CONNECTION_TIMEOUT = 3 * 60 * 1000; // 3 minutes

export async function joinQueue(userId: string): Promise<boolean> {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Check if already in queue
  const existing = await redis.zscore(QUEUE_KEY, userId);
  if (existing !== null) {
    return false; // Already in queue
  }

  // Add to sorted set with MMR as score for potential future MMR-based matching
  await redis.zadd(QUEUE_KEY, Date.now(), userId);

  // Store user MMR in hash for quick access
  await redis.hset(`${QUEUE_PREFIX}data:${userId}`, {
    userId: user.id,
    mmr: user.mmr.toString(),
    queuedAt: Date.now().toString(),
  });

  // Notify all connected clients about queue update
  const queueCount = await getQueueCount();
  io.emit('queue_update', { count: queueCount });

  return true;
}

export async function leaveQueue(userId: string): Promise<boolean> {
  const removed = await redis.zrem(QUEUE_KEY, userId);
  await redis.del(`${QUEUE_PREFIX}data:${userId}`);

  if (removed > 0) {
    const queueCount = await getQueueCount();
    io.emit('queue_update', { count: queueCount });
    return true;
  }

  return false;
}

export async function getQueueCount(): Promise<number> {
  return redis.zcard(QUEUE_KEY);
}

export async function isInQueue(userId: string): Promise<boolean> {
  const score = await redis.zscore(QUEUE_KEY, userId);
  return score !== null;
}

export async function getQueuePlayers(limit: number = 10): Promise<QueuePlayer[]> {
  // Get oldest players first (FIFO)
  const userIds = await redis.zrange(QUEUE_KEY, 0, limit - 1);

  const players: QueuePlayer[] = [];

  for (const oderId of userIds) {
    const data = await redis.hgetall(`${QUEUE_PREFIX}data:${oderId}`);
    if (data && data.userId) {
      players.push({
        userId: data.userId,
        mmr: parseInt(data.mmr, 10),
        queuedAt: new Date(parseInt(data.queuedAt, 10)),
      });
    }
  }

  return players;
}

export async function processQueue(): Promise<void> {
  const count = await getQueueCount();

  if (count < 10) {
    return; // Not enough players
  }

  // Get 10 oldest players
  const userIds = await redis.zrange(QUEUE_KEY, 0, 9);

  if (userIds.length < 10) {
    return;
  }

  // Find an idle server
  const server = await findIdleServer();
  if (!server) {
    console.log('No idle servers available');
    return;
  }

  try {
    // Get user data
    const users = await getUsersByIds(userIds);
    if (users.length < 10) {
      console.log('Could not fetch all user data');
      return;
    }

    // Balance teams
    const { team1, team2 } = balanceTeams(users);

    // Select random map
    const map = selectRandomMap();

    // Create match
    const match = await createMatch(server.id, 'matchmaking', map);

    // Add players to match
    for (const player of team1) {
      await addMatchPlayer(match.id, player.id, 1);
    }
    for (const player of team2) {
      await addMatchPlayer(match.id, player.id, 2);
    }

    // Update server status
    await updateServerStatus(server.id, 'LOADING', match.id);

    // Generate Get5 config
    const config = generateGet5Config(match.id, team1, team2, map);

    // Load match on server
    const configUrl = `${process.env.API_URL}/api/matches/${match.id}/config`;
    await loadGet5Match(server.id, configUrl);

    // Remove players from queue
    for (const oderId of userIds) {
      await redis.zrem(QUEUE_KEY, oderId);
      await redis.del(`${QUEUE_PREFIX}data:${oderId}`);
    }

    // Notify players about match found
    const connectCommand = `connect ${server.ip}:${server.port}`;

    for (const user of users) {
      io.to(`user:${user.id}`).emit('match_found', {
        matchId: match.id,
        map,
        server: {
          ip: server.ip,
          port: server.port,
          name: server.name,
        },
        connectCommand,
        team1: team1.map(p => ({ id: p.id, username: p.username, mmr: p.mmr })),
        team2: team2.map(p => ({ id: p.id, username: p.username, mmr: p.mmr })),
      });
    }

    // Update queue count
    const queueCount = await getQueueCount();
    io.emit('queue_update', { count: queueCount });

    // Schedule connection check
    setTimeout(() => checkPlayerConnections(match.id), CONNECTION_TIMEOUT);

    console.log(`Match ${match.id} created on server ${server.name}`);
  } catch (error) {
    console.error('Error processing queue:', error);
    // Release server if match creation failed
    await updateServerStatus(server.id, 'IDLE');
  }
}

export async function checkPlayerConnections(matchId: string): Promise<void> {
  const players = await getMatchPlayers(matchId);
  const connectedCount = players.filter(p => p.connected).length;

  if (connectedCount < 10) {
    console.log(`Match ${matchId} cancelled: only ${connectedCount}/10 players connected`);
    await cancelMatch(matchId);
  }
}

export async function cancelMatch(matchId: string): Promise<void> {
  const { findMatchById } = await import('../models/match.model');
  const match = await findMatchById(matchId);

  if (!match) return;

  // Update match status
  await updateMatchStatus(matchId, 'cancelled');

  // Kick all players from server
  try {
    await kickAllPlayers(match.server_id);
  } catch (error) {
    console.error('Failed to kick players:', error);
  }

  // Release server
  await updateServerStatus(match.server_id, 'IDLE');

  // Get players and notify them
  const players = await getMatchPlayers(matchId);

  for (const player of players) {
    io.to(`user:${player.user_id}`).emit('match_cancelled', {
      matchId,
      reason: 'Not all players connected within 3 minutes',
    });
  }

  console.log(`Match ${matchId} cancelled`);
}

export async function markPlayerConnected(matchId: string, userId: string): Promise<void> {
  await updatePlayerConnected(matchId, userId, true);

  // Check if all players connected
  const players = await getMatchPlayers(matchId);
  const connectedCount = players.filter(p => p.connected).length;

  if (connectedCount === 10) {
    await updateMatchStatus(matchId, 'live');
    await updateServerStatus(
      (await import('../models/match.model')).findMatchById(matchId).then(m => m?.server_id || ''),
      'IN_GAME'
    );
  }
}
