import { Router, Request, Response } from 'express';
import { findMatchById, updateMatchStatus, updateMatchScore, updatePlayerConnected, updatePlayerStats, getMatchPlayers } from '../models/match.model';
import { updateServerStatus } from '../models/server.model';
import { findUserBySteamId, updateUserMMR, getUsersByIds } from '../models/user.model';
import { calculateMMRChange, calculateAverageMMR } from '../services/balance.service';
import { Get5Event } from '../types';
import { MatchZyEvent, convertSteamId } from '../services/matchzy.service';
import { io } from '../index';

const router = Router();

// ============ MATCHZY WEBHOOK ============

router.post('/matchzy', async (req: Request, res: Response) => {
  try {
    // Verify API key
    const apiKey = req.headers['x-matchzy-key'] || req.headers['authorization'];
    const expectedKey = process.env.MATCHZY_API_KEY || process.env.GET5_API_KEY;

    if (expectedKey && apiKey !== expectedKey) {
      console.log('MatchZy webhook: Invalid API key');
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    const event: MatchZyEvent = req.body;
    console.log('MatchZy event:', event.event, event.matchid, JSON.stringify(event).substring(0, 200));

    // Handle events that don't require match lookup
    if (event.event === 'log_message') {
      console.log('MatchZy log:', event.message);
      res.json({ success: true });
      return;
    }

    const match = await findMatchById(event.matchid);
    if (!match) {
      console.log('MatchZy webhook: Match not found', event.matchid);
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    switch (event.event) {
      // Match lifecycle
      case 'match_start':
      case 'series_start':
        await handleMatchzyMatchStart(event);
        break;

      case 'going_live':
        await handleMatchzyGoingLive(event);
        break;

      // Round events
      case 'round_start':
        await handleMatchzyRoundStart(event);
        break;

      case 'round_end':
        await handleMatchzyRoundEnd(event);
        break;

      // Player events
      case 'player_connect':
        await handleMatchzyPlayerConnect(event);
        break;

      case 'player_disconnect':
        await handleMatchzyPlayerDisconnect(event);
        break;

      case 'player_death':
        await handleMatchzyPlayerDeath(event);
        break;

      // Stats events
      case 'round_stats_update':
      case 'player_stats':
        await handleMatchzyPlayerStats(event);
        break;

      // Match end events
      case 'map_result':
        await handleMatchzyMapResult(event);
        break;

      case 'match_end':
      case 'series_end':
        await handleMatchzyMatchEnd(event);
        break;

      // Side selection
      case 'knife_start':
        await handleMatchzyKnifeStart(event);
        break;

      case 'knife_won':
        await handleMatchzyKnifeWon(event);
        break;

      case 'side_picked':
        await handleMatchzySidePicked(event);
        break;

      // Team ready
      case 'team_ready':
        await handleMatchzyTeamReady(event);
        break;

      // Bomb events
      case 'bomb_planted':
        await handleMatchzyBombPlanted(event);
        break;

      case 'bomb_defused':
        await handleMatchzyBombDefused(event);
        break;

      case 'bomb_exploded':
        await handleMatchzyBombExploded(event);
        break;

      default:
        console.log('Unhandled MatchZy event:', event.event);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing MatchZy webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// MatchZy Event Handlers
async function handleMatchzyMatchStart(event: MatchZyEvent): Promise<void> {
  const match = await findMatchById(event.matchid);
  if (!match) return;

  await updateMatchStatus(event.matchid, 'live');
  if (match.server_id) {
    await updateServerStatus(match.server_id, 'IN_GAME', match.id);
  }

  io.to(`match:${event.matchid}`).emit('match_started', {
    matchId: event.matchid,
    map: event.map_name || match.map,
  });

  io.to(`lobby:${match.id}`).emit('match_started', {
    matchId: event.matchid,
    map: event.map_name || match.map,
  });

  console.log(`Match ${event.matchid} started on map ${event.map_name || match.map}`);
}

async function handleMatchzyGoingLive(event: MatchZyEvent): Promise<void> {
  io.to(`match:${event.matchid}`).emit('match_going_live', {
    matchId: event.matchid,
  });

  io.to(`lobby:${event.matchid}`).emit('match_going_live', {
    matchId: event.matchid,
  });

  console.log(`Match ${event.matchid} going live!`);
}

async function handleMatchzyRoundStart(event: MatchZyEvent): Promise<void> {
  io.to(`match:${event.matchid}`).emit('round_start', {
    matchId: event.matchid,
    roundNumber: event.round_number,
  });
}

async function handleMatchzyRoundEnd(event: MatchZyEvent): Promise<void> {
  const { team1_score, team2_score, round_number, round_winner, reason } = event;

  await updateMatchScore(event.matchid, team1_score, team2_score);

  // Broadcast score update to match room
  io.to(`match:${event.matchid}`).emit('round_end', {
    matchId: event.matchid,
    roundNumber: round_number,
    winner: round_winner,
    reason: reason,
    score: {
      team1: team1_score,
      team2: team2_score,
    },
  });

  // Also emit to lobby room
  io.to(`lobby:${event.matchid}`).emit('match_score_update', {
    matchId: event.matchid,
    team1Score: team1_score,
    team2Score: team2_score,
  });

  // Global broadcast for live matches list
  io.emit('match_live_update', {
    matchId: event.matchid,
    score: {
      team1: team1_score,
      team2: team2_score,
    },
  });

  console.log(`Match ${event.matchid} round ${round_number} ended: ${team1_score}-${team2_score}`);
}

async function handleMatchzyPlayerConnect(event: MatchZyEvent): Promise<void> {
  const steamId = event.player?.steamid || event.steamid;
  if (!steamId) return;

  const steamId64 = convertSteamId(steamId);
  const user = await findUserBySteamId(steamId64);

  if (!user) {
    console.log('Unknown player connected:', steamId64);
    return;
  }

  await updatePlayerConnected(event.matchid, user.id, true);

  io.to(`match:${event.matchid}`).emit('player_connected', {
    matchId: event.matchid,
    oduserId: user.id,
    username: user.username,
    avatarUrl: user.avatar_url,
    team: event.player?.team,
  });

  io.to(`lobby:${event.matchid}`).emit('player_connected', {
    matchId: event.matchid,
    userId: user.id,
    username: user.username,
  });

  console.log(`Player ${user.username} connected to match ${event.matchid}`);
}

async function handleMatchzyPlayerDisconnect(event: MatchZyEvent): Promise<void> {
  const steamId = event.player?.steamid || event.steamid;
  if (!steamId) return;

  const steamId64 = convertSteamId(steamId);
  const user = await findUserBySteamId(steamId64);
  if (!user) return;

  await updatePlayerConnected(event.matchid, user.id, false);

  io.to(`match:${event.matchid}`).emit('player_disconnected', {
    matchId: event.matchid,
    userId: user.id,
    username: user.username,
  });

  io.to(`lobby:${event.matchid}`).emit('player_disconnected', {
    matchId: event.matchid,
    userId: user.id,
    username: user.username,
  });

  console.log(`Player ${user.username} disconnected from match ${event.matchid}`);
}

async function handleMatchzyPlayerDeath(event: MatchZyEvent): Promise<void> {
  const { attacker, victim, weapon, headshot, penetrated, thrusmoke, noscope, attackerblind } = event;

  // Emit kill feed event to clients
  io.to(`match:${event.matchid}`).emit('player_death', {
    matchId: event.matchid,
    attacker: attacker ? {
      steamid: attacker.steamid,
      name: attacker.name,
      team: attacker.team,
    } : null,
    victim: {
      steamid: victim.steamid,
      name: victim.name,
      team: victim.team,
    },
    weapon,
    headshot: headshot || false,
    penetrated: penetrated || false,
    thrusmoke: thrusmoke || false,
    noscope: noscope || false,
    attackerblind: attackerblind || false,
  });
}

async function handleMatchzyPlayerStats(event: MatchZyEvent): Promise<void> {
  const steamId = event.player?.steamid || event.steamid;
  if (!steamId) return;

  const steamId64 = convertSteamId(steamId);
  const user = await findUserBySteamId(steamId64);
  if (!user) return;

  const { kills, deaths, assists } = event;

  // Update player stats in database
  await updatePlayerStats(event.matchid, user.id, kills || 0, deaths || 0, assists || 0);

  // Emit stats update to clients
  io.to(`match:${event.matchid}`).emit('player_stats_update', {
    matchId: event.matchid,
    userId: user.id,
    username: user.username,
    stats: {
      kills: kills || 0,
      deaths: deaths || 0,
      assists: assists || 0,
      damage: event.damage || 0,
      headshots: event.headshots || 0,
      adr: event.adr || 0,
    },
  });
}

async function handleMatchzyMapResult(event: MatchZyEvent): Promise<void> {
  const { team1_score, team2_score, winner, map_name } = event;

  await updateMatchScore(event.matchid, team1_score, team2_score);

  io.to(`match:${event.matchid}`).emit('map_result', {
    matchId: event.matchid,
    map: map_name,
    team1Score: team1_score,
    team2Score: team2_score,
    winner,
  });

  console.log(`Match ${event.matchid} map result: ${team1_score}-${team2_score} (winner: ${winner})`);
}

async function handleMatchzyMatchEnd(event: MatchZyEvent): Promise<void> {
  const match = await findMatchById(event.matchid);
  if (!match) return;

  const { team1_score, team2_score, winner } = event;

  // Update final score
  await updateMatchScore(event.matchid, team1_score, team2_score);
  await updateMatchStatus(event.matchid, 'finished');

  // Release server with idle password
  if (match.server_id) {
    await updateServerStatus(match.server_id, 'IDLE', null, null);

    // Set idle password async
    (async () => {
      try {
        const { gameServerManager } = await import('../services/game-server');
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let idlePassword = 'idle_';
        for (let i = 0; i < 8; i++) {
          idlePassword += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        await gameServerManager.executeRcon(match.server_id!, `sv_password "${idlePassword}"`);
        console.log(`Server ${match.server_id} set to idle after match end`);
      } catch (err) {
        console.error('Failed to set idle password:', err);
      }
    })();
  }

  // Calculate and apply MMR changes
  const winningTeam = winner === 'team1' ? 1 : winner === 'team2' ? 2 : null;
  if (winningTeam) {
    await calculateAndApplyMMRChanges(event.matchid, winningTeam);
  }

  // Clear active lobby for all players
  const players = await getMatchPlayers(event.matchid);
  const { setUserActiveLobby } = await import('../models/user.model');
  await Promise.all(players.map(p => setUserActiveLobby(p.user_id, null)));

  // Notify clients
  io.to(`match:${event.matchid}`).emit('match_finished', {
    matchId: event.matchid,
    winner,
    team1Score: team1_score,
    team2Score: team2_score,
  });

  io.to(`lobby:${match.id}`).emit('match_finished', {
    matchId: event.matchid,
    winner,
    team1Score: team1_score,
    team2Score: team2_score,
  });

  // Global broadcast
  io.emit('match_finished', {
    matchId: event.matchid,
    winner,
    team1Score: team1_score,
    team2Score: team2_score,
  });

  console.log(`Match ${event.matchid} finished: ${team1_score}-${team2_score} (winner: ${winner})`);
}

async function handleMatchzyKnifeStart(event: MatchZyEvent): Promise<void> {
  io.to(`match:${event.matchid}`).emit('knife_round_start', {
    matchId: event.matchid,
  });

  io.to(`lobby:${event.matchid}`).emit('knife_round_start', {
    matchId: event.matchid,
  });
}

async function handleMatchzyKnifeWon(event: MatchZyEvent): Promise<void> {
  io.to(`match:${event.matchid}`).emit('knife_round_won', {
    matchId: event.matchid,
    winner: event.winner || event.team,
  });

  io.to(`lobby:${event.matchid}`).emit('knife_round_won', {
    matchId: event.matchid,
    winner: event.winner || event.team,
  });
}

async function handleMatchzySidePicked(event: MatchZyEvent): Promise<void> {
  io.to(`match:${event.matchid}`).emit('side_picked', {
    matchId: event.matchid,
    team: event.team,
    side: event.side,
  });

  io.to(`lobby:${event.matchid}`).emit('side_picked', {
    matchId: event.matchid,
    team: event.team,
    side: event.side,
  });
}

async function handleMatchzyTeamReady(event: MatchZyEvent): Promise<void> {
  io.to(`match:${event.matchid}`).emit('team_ready', {
    matchId: event.matchid,
    team: event.team,
  });

  io.to(`lobby:${event.matchid}`).emit('team_ready', {
    matchId: event.matchid,
    team: event.team,
  });
}

async function handleMatchzyBombPlanted(event: MatchZyEvent): Promise<void> {
  io.to(`match:${event.matchid}`).emit('bomb_planted', {
    matchId: event.matchid,
    site: event.site,
    player: event.player,
    roundNumber: event.round_number,
  });
}

async function handleMatchzyBombDefused(event: MatchZyEvent): Promise<void> {
  io.to(`match:${event.matchid}`).emit('bomb_defused', {
    matchId: event.matchid,
    player: event.player,
    roundNumber: event.round_number,
  });
}

async function handleMatchzyBombExploded(event: MatchZyEvent): Promise<void> {
  io.to(`match:${event.matchid}`).emit('bomb_exploded', {
    matchId: event.matchid,
    site: event.site,
    roundNumber: event.round_number,
  });
}

// ============ GET5 WEBHOOK (Legacy support) ============

router.post('/get5', async (req: Request, res: Response) => {
  try {
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

// Get5 handlers (legacy)
async function handleSeriesStart(event: Get5Event): Promise<void> {
  const match = await findMatchById(event.matchid);
  if (!match) return;

  await updateMatchStatus(event.matchid, 'live');
  await updateServerStatus(match.server_id, 'IN_GAME');

  io.to(`match:${event.matchid}`).emit('match_started', {
    matchId: event.matchid,
  });
}

async function handleRoundEnd(event: Get5Event): Promise<void> {
  const { team1_score, team2_score } = event;
  await updateMatchScore(event.matchid, team1_score, team2_score);

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

// Shared helper function
async function calculateAndApplyMMRChanges(matchId: string, winningTeam: 1 | 2): Promise<void> {
  const players = await getMatchPlayers(matchId);
  const userIds = players.map(p => p.user_id);
  const users = await getUsersByIds(userIds);

  const team1Users = users.filter(u => players.find(p => p.user_id === u.id && p.team === 1));
  const team2Users = users.filter(u => players.find(p => p.user_id === u.id && p.team === 2));

  const team1AvgMMR = calculateAverageMMR(team1Users);
  const team2AvgMMR = calculateAverageMMR(team2Users);

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

  console.log(`MMR changes applied for match ${matchId}`);
}

export default router;
