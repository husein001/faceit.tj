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
  assignServerToMatch,
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
        // Если есть сервер - показать connect command
        let connectCommand = null;
        let serverInfo = null;
        if (existingData.match.server_id) {
          const server = await findServerById(existingData.match.server_id);
          const serverPassword = existingData.match.lobby_code?.toLowerCase() || '';
          connectCommand = server ? `connect ${server.ip}:${server.port}; password ${serverPassword}` : null;
          serverInfo = server ? { name: server.name, ip: server.ip, port: server.port } : null;
        }

        res.json({
          success: true,
          existing: true,
          lobbyCode: existingData.match.lobby_code,
          matchId: existingData.match.id,
          map: existingData.match.map,
          status: existingData.match.status,
          expiresAt: existingData.match.lobby_expires_at,
          connectCommand,
          server: serverInfo,
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

    // Generate unique lobby code
    let lobbyCode = generateLobbyCode();

    // Check if code already exists (very unlikely)
    let existingLobby = await findMatchByLobbyCode(lobbyCode);
    while (existingLobby) {
      lobbyCode = generateLobbyCode();
      existingLobby = await findMatchByLobbyCode(lobbyCode);
    }

    // Create the match/lobby БЕЗ сервера (server_id = null)
    // Сервер будет назначен когда хост нажмёт "Старт" и будет 2+ игроков
    const match = await createMatch(null, 'custom', map, userId, lobbyCode);

    // Add host as first player (team 1 by default)
    await addMatchPlayer(match.id, userId, 1);

    // Update user's active lobby
    await setUserActiveLobby(userId, match.id);

    res.json({
      success: true,
      lobbyCode,
      matchId: match.id,
      map,
      expiresAt: match.lobby_expires_at,
      connectCommand: null, // Сервер ещё не назначен
      server: null,
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

    // Получить сервер для connect command (если назначен)
    let connectCommand = null;
    let serverInfo = null;
    if (match.server_id) {
      const server = await findServerById(match.server_id);
      const serverPassword = match.lobby_code?.toLowerCase() || '';
      connectCommand = server ? `connect ${server.ip}:${server.port}; password ${serverPassword}` : null;
      serverInfo = server ? { name: server.name, ip: server.ip, port: server.port } : null;
    }

    res.json({
      matchId: match.id,
      lobbyCode: match.lobby_code,
      map: match.map,
      status: match.status,
      hostId: match.created_by,
      expiresAt: match.lobby_expires_at,
      connectCommand,
      server: serverInfo,
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

// Join lobby (with team selection)
router.post('/:code/join', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { code } = req.params;
    const { team: requestedTeam } = req.body; // 1 or 2

    const match = await findMatchByLobbyCode(code.toUpperCase());

    if (!match) {
      res.status(404).json({ error: 'Lobby not found' });
      return;
    }

    if (match.status !== 'waiting' && match.status !== 'live') {
      res.status(400).json({ error: 'Lobby is no longer accepting players' });
      return;
    }

    const players = await getMatchPlayers(match.id);

    // Check if already in lobby
    if (players.some(p => p.user_id === userId)) {
      res.status(400).json({ error: 'Already in this lobby' });
      return;
    }

    // Validate requested team
    const team = (requestedTeam === 1 || requestedTeam === 2) ? requestedTeam : 1;

    // Check if team is full (5 players max per team)
    const teamCount = players.filter(p => p.team === team).length;
    if (teamCount >= 5) {
      res.status(400).json({ error: `Команда ${team === 1 ? 'CT' : 'T'} заполнена` });
      return;
    }

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

    // Получить connect command (если сервер уже назначен)
    let connectCommand = null;
    if (match.server_id) {
      const server = await findServerById(match.server_id);
      const serverPassword = match.lobby_code?.toLowerCase() || '';
      connectCommand = server ? `connect ${server.ip}:${server.port}; password ${serverPassword}` : null;
    }

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

// Switch team
router.post('/:code/switch-team', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { code } = req.params;
    const { team: newTeam } = req.body; // 1 or 2

    if (newTeam !== 1 && newTeam !== 2) {
      res.status(400).json({ error: 'Invalid team' });
      return;
    }

    const match = await findMatchByLobbyCode(code.toUpperCase());

    if (!match) {
      res.status(404).json({ error: 'Lobby not found' });
      return;
    }

    if (match.status !== 'waiting') {
      res.status(400).json({ error: 'Cannot switch teams after match started' });
      return;
    }

    const players = await getMatchPlayers(match.id);
    const currentPlayer = players.find(p => p.user_id === userId);

    if (!currentPlayer) {
      res.status(400).json({ error: 'You are not in this lobby' });
      return;
    }

    if (currentPlayer.team === newTeam) {
      res.status(400).json({ error: 'Already in this team' });
      return;
    }

    // Check if new team is full
    const newTeamCount = players.filter(p => p.team === newTeam).length;
    if (newTeamCount >= 5) {
      res.status(400).json({ error: `Команда ${newTeam === 1 ? 'CT' : 'T'} заполнена` });
      return;
    }

    // Update player's team
    const { updatePlayerTeam } = await import('../models/match.model');
    await updatePlayerTeam(match.id, userId, newTeam as 1 | 2);

    // Notify all players
    const user = await findUserById(userId);
    io.to(`lobby:${match.id}`).emit('lobby_player_switched', {
      userId,
      username: user?.username,
      avatarUrl: user?.avatar_url,
      mmr: user?.mmr,
      oldTeam: currentPlayer.team,
      newTeam,
    });

    res.json({ success: true, team: newTeam });
  } catch (error: any) {
    console.error('Error switching team:', error);
    res.status(500).json({ error: error.message || 'Failed to switch team' });
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

    // СЕЙЧАС бронируем сервер (не при создании лобби!)
    const server = await findIdleServer();
    if (!server) {
      res.status(503).json({ error: 'Нет свободных серверов. Попробуйте позже.' });
      return;
    }

    // Назначить сервер матчу и обновить статусы
    await assignServerToMatch(match.id, server.id);
    await updateServerStatus(server.id, 'IN_GAME', match.id);

    const serverPassword = match.lobby_code?.toLowerCase() || '';
    const { gameServerManager } = await import('../services/game-server');

    // СНАЧАЛА настраиваем сервер (БЛОКИРУЮЩИЙ вызов - игроки не должны заходить пока не настроено!)
    console.log(`Configuring server ${server.id} for match ${match.id}: map=${match.map}, password=${serverPassword}`);

    try {
      // 1. Установить пароль СНАЧАЛА (чтобы никто не зашёл раньше времени)
      console.log('Setting server password...');
      const pwResult = await Promise.race([
        gameServerManager.executeRcon(server.id, `sv_password "${serverPassword}"`),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Password RCON timeout')), 8000))
      ]);
      console.log('Password set result:', pwResult);

      // 2. Сменить карту на выбранную
      console.log(`Changing map to ${match.map}...`);
      const mapResult = await Promise.race([
        gameServerManager.executeRcon(server.id, `changelevel ${match.map}`),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Map change RCON timeout')), 15000))
      ]);
      console.log('Map change result:', mapResult);

      // 3. Подождать загрузки карты (карта загружается ~5-10 секунд)
      console.log('Waiting for map to load...');
      await new Promise(resolve => setTimeout(resolve, 8000));

      // 4. Переустановить пароль после смены карты (changelevel может сбросить настройки)
      console.log('Re-setting password after map change...');
      await Promise.race([
        gameServerManager.executeRcon(server.id, `sv_password "${serverPassword}"`),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Password reset RCON timeout')), 5000))
      ]);

      console.log(`Server ${server.id} configured successfully: map=${match.map}, password=${serverPassword}`);
    } catch (err) {
      console.error('Failed to configure server:', err);
      // Всё равно продолжаем - сервер может работать, просто конфиг не применился
      // Попробуем ещё раз асинхронно
      (async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 3000));
          await gameServerManager.executeRcon(server.id, `sv_password "${serverPassword}"`);
          await gameServerManager.executeRcon(server.id, `changelevel ${match.map}`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          await gameServerManager.executeRcon(server.id, `sv_password "${serverPassword}"`);
          console.log('Retry server config succeeded');
        } catch (retryErr) {
          console.error('Retry server config also failed:', retryErr);
        }
      })();
    }

    // Теперь обновляем статус матча
    await updateMatchStatus(match.id, 'live');

    const connectCommand = `connect ${server.ip}:${server.port}; password ${serverPassword}`;

    // MatchZy конфиг (опционально, асинхронно)
    (async () => {
      try {
        const configUrl = `${process.env.API_URL}/api/matches/${match.id}/config`;
        // Загрузить MatchZy конфиг
        const loadResult = await gameServerManager.loadMatchZyMatch(server.id, configUrl);
        if (loadResult.success) {
          console.log('MatchZy config loaded successfully');
        } else {
          console.log('MatchZy load result:', loadResult.error || 'no response');
          // Fallback to Get5 if MatchZy not available
          try {
            await loadGet5Match(server.id, configUrl + '?plugin=get5');
            console.log('Fallback to Get5 config loaded');
          } catch (e2) {
            console.error('Get5 fallback also failed:', e2);
          }
        }
      } catch (e) {
        console.error('MatchZy load failed (non-critical):', e);
      }
    })();

    // Notify all players
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
      server: {
        name: server.name,
        ip: server.ip,
        port: server.port,
      },
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

    // Update match status FIRST
    await updateMatchStatus(match.id, 'cancelled');

    // Release server in DB IMMEDIATELY
    if (match.server_id) {
      await updateServerStatus(match.server_id, 'IDLE');
    }

    // Clear active_lobby у ВСЕХ игроков в лобби
    const players = await getMatchPlayers(match.id);
    await Promise.all([
      ...players.map(player => setUserActiveLobby(player.user_id, null)),
      setUserActiveLobby(userId, null), // Host тоже
    ]);

    // Notify all players
    io.to(`lobby:${match.id}`).emit('lobby_cancelled', {
      matchId: match.id,
      reason: 'Host cancelled the lobby',
    });

    // Send response BEFORE RCON cleanup
    res.json({ success: true });

    // Cleanup server ASYNC (не блокируем ответ) - set random password so nobody can connect
    if (match.server_id) {
      const serverId = match.server_id;
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
          console.log(`Server ${serverId} cleaned up with idle password after cancel`);
        } catch (err) {
          console.error('Failed to cleanup server (non-blocking):', err);
        }
      })();
    }
  } catch (error) {
    console.error('Error cancelling lobby:', error);
    res.status(500).json({ error: 'Failed to cancel lobby' });
  }
});

export default router;
