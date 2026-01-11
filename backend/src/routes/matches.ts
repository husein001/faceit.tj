import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest, optionalAuthMiddleware } from '../middleware/auth.middleware';
import {
  findMatchById,
  getMatchWithPlayers,
  getActiveMatches,
  getUserMatchHistory,
} from '../models/match.model';
import { generateGet5Config } from '../services/get5.service';
import { generateMatchZyConfig } from '../services/matchzy.service';
import { getUsersByIds } from '../models/user.model';
import { MapName } from '../types';

const router = Router();

// Get match details
router.get('/:id', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = await getMatchWithPlayers(id);

    if (!data) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const { match, players } = data;

    res.json({
      id: match.id,
      matchType: match.match_type,
      status: match.status,
      map: match.map,
      team1Score: match.team1_score,
      team2Score: match.team2_score,
      startedAt: match.started_at,
      endedAt: match.ended_at,
      createdAt: match.created_at,
      players: players.map(p => ({
        id: p.user_id,
        team: p.team,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        connected: p.connected,
        user: (p as any).user,
      })),
    });
  } catch (error) {
    console.error('Error getting match:', error);
    res.status(500).json({ error: 'Failed to get match' });
  }
});

// MatchZy config endpoint (called by CS2 server) - DEFAULT
router.get('/:id/config', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const plugin = (req.query.plugin as string) || 'matchzy';

    const data = await getMatchWithPlayers(id);

    if (!data) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const { match, players } = data;

    // Get user details
    const userIds = players.map(p => p.user_id);
    const users = await getUsersByIds(userIds);

    // Split users by team
    const team1Users = users.filter(u => players.find(p => p.user_id === u.id && p.team === 1));
    const team2Users = users.filter(u => players.find(p => p.user_id === u.id && p.team === 2));

    let config;
    if (plugin === 'get5') {
      config = generateGet5Config(match.id, team1Users, team2Users, match.map as MapName);
    } else {
      // Default to MatchZy
      config = generateMatchZyConfig(match.id, team1Users, team2Users, match.map as MapName);
    }

    res.json(config);
  } catch (error) {
    console.error('Error getting match config:', error);
    res.status(500).json({ error: 'Failed to get match config' });
  }
});

// Explicit MatchZy config endpoint
router.get('/:id/matchzy-config', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = await getMatchWithPlayers(id);

    if (!data) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const { match, players } = data;

    // Get user details
    const userIds = players.map(p => p.user_id);
    const users = await getUsersByIds(userIds);

    // Split users by team
    const team1Users = users.filter(u => players.find(p => p.user_id === u.id && p.team === 1));
    const team2Users = users.filter(u => players.find(p => p.user_id === u.id && p.team === 2));

    const config = generateMatchZyConfig(match.id, team1Users, team2Users, match.map as MapName);

    res.json(config);
  } catch (error) {
    console.error('Error getting MatchZy config:', error);
    res.status(500).json({ error: 'Failed to get match config' });
  }
});

// Get active matches
router.get('/', async (req: Request, res: Response) => {
  try {
    const matches = await getActiveMatches();

    res.json(matches.map(m => ({
      id: m.id,
      matchType: m.match_type,
      status: m.status,
      map: m.map,
      team1Score: m.team1_score,
      team2Score: m.team2_score,
      startedAt: m.started_at,
    })));
  } catch (error) {
    console.error('Error getting active matches:', error);
    res.status(500).json({ error: 'Failed to get active matches' });
  }
});

// Get user's active matches (waiting/live)
router.get('/my-active', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { getUserActiveMatches } = await import('../models/match.model');
    const matches = await getUserActiveMatches(userId);

    res.json(matches);
  } catch (error) {
    console.error('Error getting active matches:', error);
    res.status(500).json({ error: 'Failed to get active matches' });
  }
});

// Get user match history
router.get('/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit = parseInt(req.query.limit as string) || 20;

    const matches = await getUserMatchHistory(userId, Math.min(limit, 100));

    res.json(matches.map(m => ({
      id: m.id,
      matchType: m.match_type,
      map: m.map,
      team1Score: m.team1_score,
      team2Score: m.team2_score,
      endedAt: m.ended_at,
    })));
  } catch (error) {
    console.error('Error getting match history:', error);
    res.status(500).json({ error: 'Failed to get match history' });
  }
});

export default router;
