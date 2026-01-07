import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  getPendingRequests,
  getAllRequests,
  approveRequest,
  rejectRequest,
  getRequestStats,
} from '../models/premium.model';
import { getAllServers } from '../models/server.model';
import { getActiveMatches } from '../models/match.model';
import { query } from '../config/database';

const router = Router();

// Admin credentials from ENV
const ADMIN_CREDENTIALS = {
  login: process.env.ADMIN_LOGIN || 'admin',
  password: process.env.ADMIN_PASSWORD || 'faceit2024',
};

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

// Авторизация админа
router.post('/login', (req: Request, res: Response) => {
  const { login, password } = req.body;

  if (login !== ADMIN_CREDENTIALS.login || password !== ADMIN_CREDENTIALS.password) {
    res.status(401).json({ error: 'Неверный логин или пароль' });
    return;
  }

  const token = jwt.sign(
    { login, isAdmin: true },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '24h' }
  );

  res.json({
    success: true,
    token,
    admin: { login },
  });
});

// Проверка авторизации
router.get('/me', adminAuthMiddleware, (req: AdminRequest, res: Response) => {
  res.json({ admin: req.admin });
});

// Статистика
router.get('/stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const [requestStats, usersCount, premiumCount] = await Promise.all([
      getRequestStats(),
      query<{ count: string }>('SELECT COUNT(*) as count FROM users'),
      query<{ count: string }>('SELECT COUNT(*) as count FROM users WHERE is_premium = true'),
    ]);

    res.json({
      requests: requestStats,
      users: {
        total: parseInt(usersCount[0]?.count || '0', 10),
        premium: parseInt(premiumCount[0]?.count || '0', 10),
      },
    });
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Список ожидающих запросов на премиум
router.get('/premium-requests/pending', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const requests = await getPendingRequests();
    res.json(requests);
  } catch (error) {
    console.error('Ошибка получения запросов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Все запросы
router.get('/premium-requests', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const requests = await getAllRequests(limit);
    res.json(requests);
  } catch (error) {
    console.error('Ошибка получения запросов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Одобрить запрос
router.post('/premium-requests/:id/approve', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const adminLogin = req.admin!.login;

    const request = await approveRequest(id, adminLogin, note);

    if (!request) {
      res.status(404).json({ error: 'Запрос не найден' });
      return;
    }

    res.json({
      success: true,
      message: 'Запрос одобрен, премиум активирован',
      request,
    });
  } catch (error) {
    console.error('Ошибка одобрения запроса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Отклонить запрос
router.post('/premium-requests/:id/reject', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const adminLogin = req.admin!.login;

    const request = await rejectRequest(id, adminLogin, note);

    if (!request) {
      res.status(404).json({ error: 'Запрос не найден' });
      return;
    }

    res.json({
      success: true,
      message: 'Запрос отклонён',
      request,
    });
  } catch (error) {
    console.error('Ошибка отклонения запроса:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Список серверов
router.get('/servers', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const servers = await getAllServers();
    res.json(servers);
  } catch (error) {
    console.error('Ошибка получения серверов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Активные матчи
router.get('/matches', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const matches = await getActiveMatches();
    res.json(matches);
  } catch (error) {
    console.error('Ошибка получения матчей:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Список пользователей
router.get('/users', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const users = await query(
      `SELECT id, steam_id, username, avatar_url, mmr, is_premium, premium_until, created_at
       FROM users ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    res.json(users);
  } catch (error) {
    console.error('Ошибка получения пользователей:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
