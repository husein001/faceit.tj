import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { premiumMiddleware } from '../middleware/premium.middleware';
import { findUserById, setUserActiveLobby } from '../models/user.model';
import { findIdleServer, updateServerStatus, findServerById } from '../models/server.model';
import {
  createMatch,
  findMatchByLobbyCode,
  addMatchPlayer,
  getMatchPlayers,
  updateMatchStatus,
  countPlayersInMatch,
  removePlayerFromMatch,
  generateLobbyCode,
  getMatchWithPlayers,
} from '../models/match.model';
import { isValidMap, generateGet5Config } from '../services/get5.service';
import { loadGet5Match } from '../services/server.service';
import { io } from '../index';
import { MapName } from '../types';

const router = Router();

// Create custom lobby (Premium only)
router.post('/create', authMiddleware, premiumMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { map } = req.body;

    // Validate map
    if (!map || !isValidMap(map)) {
      res.status(400).json({ error: 'Invalid map selected' });
      return;
    }

    // Check if user already has an active lobby - return it instead of error
    const user = await findUserById(userId);
    if (user?.active_lobby_id) {
      const existingData = await getMatchWithPlayers(user.active_lobby_id);
      if (existingData && (existingData.match.status === 'waiting' || existingData.match.status === 'live')) {
        const server = await findServerById(existingData.match.server_id);
        const serverPassword = existingData.match.lobby_code?.toLowerCase() || '';
        const connectCommand = server ? `connect ${server.ip}:${server.port}; password ${serverPassword}` : null;

        res.json({
          success: true,
          existing: true,
          lobbyCode: existingData.match.lobby_code,
          matchId: existingData.match.id,
          map: existingData.match.map,
          status: existingData.match.status,
          expiresAt: existingData.match.lobby_expires_at,
          connectCommand,
          server: server ? {
            name: server.name,
            ip: server.ip,
            port: server.port,
          } : null,
          players: existingData.players.map(p => ({
            id: p.user_id,
            team: p.team,
            username: (p as any).user?.username,
            avatarUrl: (p as any).user?.avatar_url,
            mmr: (p as any).user?.mmr,
          })),
        });
        return;
      } else {
        // Лобби закончилось - очистить active_lobby_id
        await setUserActiveLobby(userId, null);
      }
    }

    // Найти свободный сервер (админ должен добавить серверы через админку)
    const server = await findIdleServer();

    if (!server) {
      res.status(503).json({ error: 'Нет свободных серверов. Попробуйте позже.' });
      return;
    }

    // Generate unique lobby code
    let lobbyCode = generateLobbyCode();

    // Check if code already exists (very unlikely)
    let existingLobby = await findMatchByLobbyCode(lobbyCode);
    while (existingLobby) {
      lobbyCode = generateLobbyCode();
      existingLobby = await findMatchByLobbyCode(lobbyCode);
    }

    // Create the match/lobby
    const match = await createMatch(server.id, 'custom', map, userId, lobbyCode);

    // Пометить сервер как занятый (IN_GAME)
    await updateServerStatus(server.id, 'IN_GAME', match.id);

    // Add host as first player (team 1 by default)
    await addMatchPlayer(match.id, userId, 1);

    // Update user's active lobby
    await setUserActiveLobby(userId, match.id);

    // Генерируем пароль для сервера (только участники лобби могут зайти)
    const serverPassword = lobbyCode.toLowerCase();

    // Настроить сервер: карта + пароль
    try {
      const { gameServerManager } = await import('../services/game-server');
      // Сменить карту
      await gameServerManager.executeRcon(server.id, `changelevel ${map}`);
      // Подождать загрузки карты
      await new Promise(resolve => setTimeout(resolve, 3000));
      // Установить пароль
      await gameServerManager.executeRcon(server.id, `sv_password "${serverPassword}"`);
      console.log(`Server configured: map=${map}, password set`);
    } catch (err) {
      console.error('Failed to configure server:', err);
    }

    // Connect command с паролем
    const connectCommand = `connect ${server.ip}:${server.port}; password ${serverPassword}`;

    res.json({
      success: true,
      lobbyCode,
      matchId: match.id,
      map,
      expiresAt: match.lobby_expires_at,
      connectCommand,
      server: {
        name: server.name,
        ip: server.ip,
        port: server.port,
      },
    });
  } catch (error: any) {
    console.error('Error creating lobby:', error);
    res.status(500).json({ error: error.message || 'Failed to create lobby' });
  }
});

// Get lobby info
router.get('/:code', async (req: AuthRequest, res: Response) => {
  try {
    const { code } = req.params;
    const match = await findMatchByLobbyCode(code.toUpperCase());

    if (!match) {
      res.status(404).json({ error: 'Lobby not found' });
      return;
    }

    const data = await getMatchWithPlayers(match.id);
    if (!data) {
      res.status(404).json({ error: 'Lobby not found' });
      return;
    }

    // Получить сервер для connect command
    const server = await findServerById(match.server_id);
    const serverPassword = match.lobby_code?.toLowerCase() || '';
    const connectCommand = server ? `connect ${server.ip}:${server.port}; password ${serverPassword}` : null;

    res.json({
      matchId: match.id,
      lobbyCode: match.lobby_code,
      map: match.map,
      status: match.status,
      hostId: match.created_by,
      expiresAt: match.lobby_expires_at,
      connectCommand,
      players: data.players.map(p => ({
        id: p.user_id,
        team: p.team,
        username: (p as any).user?.username,
        avatarUrl: (p as any).user?.avatar_url,
        mmr: (p as any).user?.mmr,
      })),
    });
  } catch (error) {
    console.error('Error getting lobby:', error);
    res.status(500).json({ error: 'Failed to get lobby info' });
  }
});

// Join lobby
router.post('/:code/join', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { code } = req.params;

    const match = await findMatchByLobbyCode(code.toUpperCase());

    if (!match) {
      res.status(404).json({ error: 'Lobby not found' });
      return;
    }

    if (match.status !== 'waiting' && match.status !== 'live') {
      res.status(400).json({ error: 'Lobby is no longer accepting players' });
      return;
    }

    // Check if already in lobby
    const players = await getMatchPlayers(match.id);
    if (players.some(p => p.user_id === userId)) {
      res.status(400).json({ error: 'Already in this lobby' });
      return;
    }

    // Check if lobby is full (10 players max)
    if (players.length >= 10) {
      res.status(400).json({ error: 'Lobby is full' });
      return;
    }

    // Balance teams - add to team with fewer players
    const team1Count = players.filter(p => p.team === 1).length;
    const team2Count = players.filter(p => p.team === 2).length;
    const team = team1Count <= team2Count ? 1 : 2;

    await addMatchPlayer(match.id, userId, team as 1 | 2);

    // Notify other players in lobby
    const user = await findUserById(userId);
    io.to(`lobby:${match.id}`).emit('lobby_player_joined', {
      userId,
      username: user?.username,
      avatarUrl: user?.avatar_url,
      mmr: user?.mmr,
      team,
    });

    // Получить connect command для нового игрока
    const server = await findServerById(match.server_id);
    const serverPassword = match.lobby_code?.toLowerCase() || '';
    const connectCommand = server ? `connect ${server.ip}:${server.port}; password ${serverPassword}` : null;

    res.json({
      success: true,
      team,
      matchId: match.id,
      connectCommand,
    });
  } catch (error: any) {
    console.error('Error joining lobby:', error);
    res.status(500).json({ error: error.message || 'Failed to join lobby' });
  }
});

// Leave lobby
router.post('/:code/leave', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { code } = req.params;

    const match = await findMatchByLobbyCode(code.toUpperCase());

    if (!match) {
      res.status(404).json({ error: 'Lobby not found' });
      return;
    }

    // Host cannot leave - must cancel
    if (match.created_by === userId) {
      res.status(400).json({ error: 'Host must cancel the lobby instead of leaving' });
      return;
    }

    await removePlayerFromMatch(match.id, userId);

    // Notify other players
    io.to(`lobby:${match.id}`).emit('lobby_player_left', { userId });

    res.json({ success: true });
  } catch (error) {
    console.error('Error leaving lobby:', error);
    res.status(500).json({ error: 'Failed to leave lobby' });
  }
});

// Start match (host only)
router.post('/:code/start', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { code } = req.params;

    const match = await findMatchByLobbyCode(code.toUpperCase());

    if (!match) {
      res.status(404).json({ error: 'Lobby not found' });
      return;
    }

    // Only host can start
    if (match.created_by !== userId) {
      res.status(403).json({ error: 'Only the host can start the match' });
      return;
    }

    if (match.status !== 'waiting') {
      res.status(400).json({ error: 'Match has already started or ended' });
      return;
    }

    // Check minimum players (at least 2)
    const playerCount = await countPlayersInMatch(match.id);
    if (playerCount < 2) {
      res.status(400).json({ error: 'Need at least 2 players to start' });
      return;
    }

    // Get players and balance teams if needed
    const data = await getMatchWithPlayers(match.id);
    if (!data) {
      res.status(500).json({ error: 'Failed to get match data' });
      return;
    }

    // Get user details for config
    const { getUsersByIds } = await import('../models/user.model');
    const userIds = data.players.map(p => p.user_id);
    const users = await getUsersByIds(userIds);

    // Split users by team
    const team1Users = users.filter(u => data.players.find(p => p.user_id === u.id && p.team === 1));
    const team2Users = users.filter(u => data.players.find(p => p.user_id === u.id && p.team === 2));

    // Generate Get5 config
    const config = generateGet5Config(match.id, team1Users, team2Users, match.map as MapName);

    // Load match on server
    const { findServerById } = await import('../models/server.model');
    const server = await findServerById(match.server_id);

    if (!server) {
      res.status(500).json({ error: 'Server not found' });
      return;
    }

    const configUrl = `${process.env.API_URL}/api/matches/${match.id}/config`;
    await loadGet5Match(match.server_id, configUrl);

    // Update match status
    await updateMatchStatus(match.id, 'live');
    await updateServerStatus(match.server_id, 'IN_GAME');

    // Notify all players
    const connectCommand = `connect ${server.ip}:${server.port}`;

    io.to(`lobby:${match.id}`).emit('lobby_started', {
      matchId: match.id,
      connectCommand,
      server: {
        ip: server.ip,
        port: server.port,
        name: server.name,
      },
    });

    res.json({
      success: true,
      connectCommand,
    });
  } catch (error: any) {
    console.error('Error starting match:', error);
    res.status(500).json({ error: error.message || 'Failed to start match' });
  }
});

// Cancel lobby (host only)
router.delete('/:code/cancel', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { code } = req.params;

    const match = await findMatchByLobbyCode(code.toUpperCase());

    if (!match) {
      res.status(404).json({ error: 'Lobby not found' });
      return;
    }

    // Only host can cancel
    if (match.created_by !== userId) {
      res.status(403).json({ error: 'Only the host can cancel the lobby' });
      return;
    }

    if (match.status !== 'waiting' && match.status !== 'live') {
      res.status(400).json({ error: 'Cannot cancel a match that has already finished' });
      return;
    }

    // Update match status
    await updateMatchStatus(match.id, 'cancelled');

    // Очистить сервер: убрать пароль, кикнуть игроков
    try {
      const { gameServerManager } = await import('../services/game-server');
      await gameServerManager.executeRcon(match.server_id, 'sv_password ""');
      await gameServerManager.executeRcon(match.server_id, 'kickall');
    } catch (err) {
      console.error('Failed to cleanup server:', err);
    }

    // Release server
    await updateServerStatus(match.server_id, 'IDLE');

    // Clear host's active lobby
    await setUserActiveLobby(userId, null);

    // Notify all players
    io.to(`lobby:${match.id}`).emit('lobby_cancelled', {
      matchId: match.id,
      reason: 'Host cancelled the lobby',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error cancelling lobby:', error);
    res.status(500).json({ error: 'Failed to cancel lobby' });
  }
});

export default router;
