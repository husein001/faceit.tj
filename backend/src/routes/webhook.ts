import { Router, Request, Response } from 'express';
import { findMatchById, updateMatchStatus, updateMatchScore, updatePlayerConnected } from '../models/match.model';
import { updateServerStatus } from '../models/server.model';
import { findUserBySteamId, updateUserMMR } from '../models/user.model';
import { calculateMMRChange, calculateAverageMMR } from '../services/balance.service';
import { Get5Event } from '../types';
import { io } from '../index';

const router = Router();

// Get5 webhook endpoint
router.post('/get5', async (req: Request, res: Response) => {
  try {
    // Verify API key
    const apiKey = req.headers['x-get5-key'] || req.headers['authorization'];
    if (apiKey !== process.env.GET5_API_KEY) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    const event: Get5Event = req.body;
    console.log('Get5 event:', event.event, event.matchid);

    const match = await findMatchById(event.matchid);
    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    switch (event.event) {
      case 'series_start':
        await handleSeriesStart(event);
        break;

      case 'round_end':
        await handleRoundEnd(event);
        break;

      case 'player_connect':
        await handlePlayerConnect(event);
        break;

      case 'player_disconnect':
        await handlePlayerDisconnect(event);
        break;

      case 'series_end':
        await handleSeriesEnd(event);
        break;

      case 'map_result':
        await handleMapResult(event);
        break;

      default:
        console.log('Unhandled Get5 event:', event.event);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing Get5 webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function handleSeriesStart(event: Get5Event): Promise<void> {
  const match = await findMatchById(event.matchid);
  if (!match) return;

  await updateMatchStatus(event.matchid, 'live');
  await updateServerStatus(match.server_id, 'IN_GAME');

  // Notify clients
  io.to(`match:${event.matchid}`).emit('match_started', {
    matchId: event.matchid,
  });
}

async function handleRoundEnd(event: Get5Event): Promise<void> {
  const { team1_score, team2_score } = event;

  await updateMatchScore(event.matchid, team1_score, team2_score);

  // Broadcast score update
  io.emit('match_live_update', {
    matchId: event.matchid,
    score: {
      team1: team1_score,
      team2: team2_score,
    },
  });
}

async function handlePlayerConnect(event: Get5Event): Promise<void> {
  const steamId = event.steamid || event.player?.steamid;
  if (!steamId) return;

  // Convert Steam ID format if needed
  const user = await findUserBySteamId(steamId);
  if (!user) {
    console.log('Unknown player connected:', steamId);
    return;
  }

  await updatePlayerConnected(event.matchid, user.id, true);

  io.to(`match:${event.matchid}`).emit('player_connected', {
    matchId: event.matchid,
    userId: user.id,
    username: user.username,
  });
}

async function handlePlayerDisconnect(event: Get5Event): Promise<void> {
  const steamId = event.steamid || event.player?.steamid;
  if (!steamId) return;

  const user = await findUserBySteamId(steamId);
  if (!user) return;

  await updatePlayerConnected(event.matchid, user.id, false);

  io.to(`match:${event.matchid}`).emit('player_disconnected', {
    matchId: event.matchid,
    userId: user.id,
    username: user.username,
  });
}

async function handleSeriesEnd(event: Get5Event): Promise<void> {
  const match = await findMatchById(event.matchid);
  if (!match) return;

  await updateMatchStatus(event.matchid, 'finished');
  await updateServerStatus(match.server_id, 'IDLE');

  // Calculate MMR changes
  await calculateAndApplyMMRChanges(event.matchid, event.winner === 'team1' ? 1 : 2);

  io.emit('match_finished', {
    matchId: event.matchid,
    winner: event.winner,
    team1Score: match.team1_score,
    team2Score: match.team2_score,
  });
}

async function handleMapResult(event: Get5Event): Promise<void> {
  const { team1_score, team2_score } = event;
  await updateMatchScore(event.matchid, team1_score, team2_score);
}

async function calculateAndApplyMMRChanges(matchId: string, winningTeam: 1 | 2): Promise<void> {
  const { getMatchPlayers } = await import('../models/match.model');
  const { getUsersByIds } = await import('../models/user.model');

  const players = await getMatchPlayers(matchId);
  const userIds = players.map(p => p.user_id);
  const users = await getUsersByIds(userIds);

  const team1Users = users.filter(u => players.find(p => p.user_id === u.id && p.team === 1));
  const team2Users = users.filter(u => players.find(p => p.user_id === u.id && p.team === 2));

  const team1AvgMMR = calculateAverageMMR(team1Users);
  const team2AvgMMR = calculateAverageMMR(team2Users);

  // Apply MMR changes
  for (const user of team1Users) {
    const won = winningTeam === 1;
    const mmrChange = calculateMMRChange(user.mmr, team2AvgMMR, won);
    await updateUserMMR(user.id, mmrChange);
  }

  for (const user of team2Users) {
    const won = winningTeam === 2;
    const mmrChange = calculateMMRChange(user.mmr, team1AvgMMR, won);
    await updateUserMMR(user.id, mmrChange);
  }
}

export default router;
