import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  gameServerManager,
  serverProvisioner,
  serverMonitor,
  GameServerConfig,
} from '../services/game-server';
import { getAllServers, findServerById } from '../models/server.model';
import { MAP_POOL } from '../types';

const router = Router();

interface AdminRequest extends Request {
  admin?: { login: string };
}

// Middleware для проверки админ токена
function adminAuthMiddleware(req: AdminRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { login: string; isAdmin: boolean };
    if (!decoded.isAdmin) {
      res.status(403).json({ error: 'Доступ запрещён' });
      return;
    }
    req.admin = { login: decoded.login };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Недействительный токен' });
  }
}

// ============ SERVER MANAGEMENT ============

// Получить состояние менеджера
router.get('/state', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const state = await gameServerManager.getState();
    res.json(state);
  } catch (error) {
    console.error('Error getting manager state:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить все серверы
router.get('/', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const servers = await getAllServers();
    res.json(servers);
  } catch (error) {
    console.error('Error getting servers:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить информацию о сервере
router.get('/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const serverInfo = await gameServerManager.getServerInfo(id);

    if (!serverInfo) {
      res.status(404).json({ error: 'Сервер не найден' });
      return;
    }

    res.json(serverInfo);
  } catch (error) {
    console.error('Error getting server info:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить метрики сервера
router.get('/:id/metrics', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 60;

    const metrics = serverMonitor.getMetricsHistory(id, limit);
    const latest = serverMonitor.getLatestMetrics(id);

    res.json({
      latest,
      history: metrics,
    });
  } catch (error) {
    console.error('Error getting server metrics:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить логи сервера
router.get('/:id/logs', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const level = req.query.level as 'info' | 'warn' | 'error' | undefined;
    const limit = parseInt(req.query.limit as string) || 100;

    const logs = serverMonitor.getLogs(id, { level, limit });
    res.json(logs);
  } catch (error) {
    console.error('Error getting server logs:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить подключенных игроков
router.get('/:id/players', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const players = await gameServerManager.getConnectedPlayers(id);
    res.json({ players });
  } catch (error) {
    console.error('Error getting players:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============ SERVER OPERATIONS ============

// Выполнить RCON команду
router.post('/:id/rcon', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { command } = req.body;

    if (!command) {
      res.status(400).json({ error: 'Command is required' });
      return;
    }

    const result = await gameServerManager.executeRcon(id, command);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ response: result.response });
  } catch (error) {
    console.error('Error executing RCON:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Сменить карту
router.post('/:id/map', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { map } = req.body;

    if (!map || !MAP_POOL.includes(map)) {
      res.status(400).json({
        error: 'Invalid map',
        validMaps: MAP_POOL,
      });
      return;
    }

    const result = await gameServerManager.changeMap(id, map);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: `Map changed to ${map}` });
  } catch (error) {
    console.error('Error changing map:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Выгнать всех игроков
router.post('/:id/kick-all', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await gameServerManager.kickAllPlayers(id);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'All players kicked' });
  } catch (error) {
    console.error('Error kicking players:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Перезапустить матч
router.post('/:id/restart-match', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await gameServerManager.restartMatch(id);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Match restarted' });
  } catch (error) {
    console.error('Error restarting match:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Освободить сервер
router.post('/:id/release', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const success = await gameServerManager.releaseServer(id);

    if (!success) {
      res.status(500).json({ error: 'Failed to release server' });
      return;
    }

    res.json({ success: true, message: 'Server released' });
  } catch (error) {
    console.error('Error releasing server:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============ GET5 OPERATIONS ============

// Получить статус Get5
router.get('/:id/get5', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const status = await gameServerManager.getGet5Status(id);

    if (!status) {
      res.status(404).json({ error: 'Get5 status not available' });
      return;
    }

    res.json(status);
  } catch (error) {
    console.error('Error getting Get5 status:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Загрузить Get5 матч
router.post('/:id/get5/load', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { configUrl } = req.body;

    if (!configUrl) {
      res.status(400).json({ error: 'configUrl is required' });
      return;
    }

    const result = await gameServerManager.loadGet5Match(id, configUrl);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Match loaded' });
  } catch (error) {
    console.error('Error loading Get5 match:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Завершить Get5 матч
router.post('/:id/get5/end', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await gameServerManager.endGet5Match(id);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Match ended' });
  } catch (error) {
    console.error('Error ending Get5 match:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Force ready Get5
router.post('/:id/get5/force-ready', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await gameServerManager.forceReadyGet5(id);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Force ready executed' });
  } catch (error) {
    console.error('Error force ready Get5:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Пауза Get5
router.post('/:id/get5/pause', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await gameServerManager.pauseGet5Match(id);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Match paused' });
  } catch (error) {
    console.error('Error pausing Get5:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Unpause Get5
router.post('/:id/get5/unpause', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await gameServerManager.unpauseGet5Match(id);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Match unpaused' });
  } catch (error) {
    console.error('Error unpausing Get5:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============ PROVISIONING ============

// Создать новый сервер
router.post('/provision', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const config: GameServerConfig = {
      name: req.body.name,
      ip: req.body.ip,
      port: req.body.port,
      rconPassword: req.body.rconPassword,
      tickrate: req.body.tickrate || 128,
      maxPlayers: req.body.maxPlayers || 10,
      gameMode: req.body.gameMode || 'competitive',
      map: req.body.map || 'de_dust2',
    };

    const result = await serverProvisioner.provision(config);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      serverId: result.serverId,
      message: 'Server provisioned successfully',
    });
  } catch (error) {
    console.error('Error provisioning server:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить сервер
router.delete('/:id/deprovision', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await serverProvisioner.deprovision(id);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Server deprovisioned' });
  } catch (error) {
    console.error('Error deprovisioning server:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Перезапустить сервер (Docker контейнер)
router.post('/:id/restart', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await serverProvisioner.restart(id);

    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Server restarted' });
  } catch (error) {
    console.error('Error restarting server:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить логи Docker контейнера
router.get('/:id/docker-logs', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const lines = parseInt(req.query.lines as string) || 100;

    const logs = await serverProvisioner.getLogs(id, lines);
    res.json({ logs });
  } catch (error) {
    console.error('Error getting docker logs:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить статистику Docker контейнера
router.get('/:id/docker-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const stats = await serverProvisioner.getContainerStats(id);

    if (!stats) {
      res.status(404).json({ error: 'Stats not available' });
      return;
    }

    res.json(stats);
  } catch (error) {
    console.error('Error getting docker stats:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить информацию о провизионере
router.get('/provisioner/info', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const config = serverProvisioner.getConfig();
    const usedPorts = serverProvisioner.getUsedPorts();
    const availablePorts = serverProvisioner.getAvailablePortCount();
    const containers = serverProvisioner.getActiveContainers();

    res.json({
      type: 'docker',
      image: config.image,
      network: config.network,
      usedPorts,
      availablePorts,
      activeContainers: containers.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============ MONITORING ============

// Получить статистику мониторинга
router.get('/monitor/statistics', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const stats = await serverMonitor.getStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить активные алерты
router.get('/monitor/alerts', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const serverId = req.query.serverId as string | undefined;
    const alerts = serverMonitor.getActiveAlerts(serverId);
    res.json(alerts);
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить правила алертов
router.get('/monitor/alert-rules', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const rules = serverMonitor.getAlertRules();
    res.json(rules);
  } catch (error) {
    console.error('Error getting alert rules:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить правило алерта
router.patch('/monitor/alert-rules/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const rule = serverMonitor.updateAlertRule(id, updates);
    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    res.json(rule);
  } catch (error) {
    console.error('Error updating alert rule:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============ BULK OPERATIONS ============

// Выполнить RCON на всех серверах
router.post('/bulk/rcon', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { command } = req.body;

    if (!command) {
      res.status(400).json({ error: 'Command is required' });
      return;
    }

    const results = await gameServerManager.executeRconOnAll(command);
    const response: Record<string, { success: boolean; response?: string; error?: string }> = {};

    for (const [serverId, result] of results) {
      response[serverId] = result;
    }

    res.json(response);
  } catch (error) {
    console.error('Error executing bulk RCON:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Health check всех серверов
router.post('/bulk/health-check', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const results = await gameServerManager.checkAllServersHealth();
    const response: Record<string, boolean> = {};

    for (const [serverId, isHealthy] of results) {
      response[serverId] = isHealthy;
    }

    res.json(response);
  } catch (error) {
    console.error('Error checking health:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
