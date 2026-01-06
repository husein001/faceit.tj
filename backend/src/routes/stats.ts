import { Router } from 'express';
import { query, queryOne } from '../config/database';
import { io } from '../index';

const router = Router();

// GET /api/stats - Получить публичную статистику платформы
router.get('/', async (req, res) => {
  try {
    // Игроков онлайн (количество подключенных аутентифицированных сокетов)
    const sockets = await io.fetchSockets();
    const onlinePlayers = sockets.filter((s: any) => s.userId).length;

    // Матчей сегодня
    const matchesTodayResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM matches
       WHERE created_at >= CURRENT_DATE`
    );
    const matchesToday = parseInt(matchesTodayResult?.count || '0', 10);

    // Всего игроков (зарегистрированных)
    const totalPlayersResult = await queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM users'
    );
    const totalPlayers = parseInt(totalPlayersResult?.count || '0', 10);

    // Сыгравших матчи (уникальные игроки, которые участвовали хотя бы в одном завершенном матче)
    const playersWithMatchesResult = await queryOne<{ count: string }>(
      `SELECT COUNT(DISTINCT mp.user_id) as count
       FROM match_players mp
       JOIN matches m ON mp.match_id = m.id
       WHERE m.status = 'finished'`
    );
    const playersWithMatches = parseInt(playersWithMatchesResult?.count || '0', 10);

    res.json({
      onlinePlayers,
      matchesToday,
      totalPlayers,
      playersWithMatches,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
