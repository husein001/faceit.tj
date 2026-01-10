import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import {
  createPremiumRequest,
  getUserPendingRequest,
} from '../models/premium.model';
import { findUserById } from '../models/user.model';
import { getPremiumSettings } from '../models/settings.model';

const router = Router();

// Информация о премиуме
router.get('/info', async (req, res) => {
  const settings = await getPremiumSettings();

  res.json({
    enabled: settings.enabled,
    price: settings.price,
    currency: settings.currency,
    duration: `${settings.duration_days} дней`,
    phone: '+992 XXX XXX XXX', // Номер для оплаты
    features: [
      'Создание кастомных лобби',
      'Выбор карты',
      'Приглашение друзей по ссылке',
      'Приоритетный доступ к серверам',
    ],
  });
});

// Отправить запрос на покупку премиума
router.post('/request', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { phoneNumber } = req.body;

    if (!phoneNumber || phoneNumber.length < 9) {
      res.status(400).json({ error: 'Укажите корректный номер телефона' });
      return;
    }

    // Проверяем, есть ли уже активный премиум
    const user = await findUserById(userId);
    if (user?.is_premium && user.premium_until && new Date(user.premium_until) > new Date()) {
      res.status(400).json({ error: 'У вас уже есть активная подписка' });
      return;
    }

    // Проверяем, есть ли уже ожидающий запрос
    const existingRequest = await getUserPendingRequest(userId);
    if (existingRequest) {
      res.status(400).json({
        error: 'У вас уже есть запрос на рассмотрении',
        requestId: existingRequest.id,
        createdAt: existingRequest.created_at,
      });
      return;
    }

    // Создаём запрос
    const request = await createPremiumRequest(userId, phoneNumber);

    res.json({
      success: true,
      message: 'Запрос отправлен! Ожидайте подтверждения после проверки оплаты.',
      requestId: request.id,
      status: request.status,
    });
  } catch (error: any) {
    console.error('Ошибка создания запроса на премиум:', error);
    res.status(500).json({ error: 'Не удалось отправить запрос' });
  }
});

// Проверить статус запроса
router.get('/status', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const user = await findUserById(userId);
    const pendingRequest = await getUserPendingRequest(userId);

    res.json({
      isPremium: user?.is_premium || false,
      premiumUntil: user?.premium_until,
      hasPendingRequest: !!pendingRequest,
      pendingRequest: pendingRequest ? {
        id: pendingRequest.id,
        phoneNumber: pendingRequest.phone_number,
        amount: pendingRequest.amount,
        createdAt: pendingRequest.created_at,
      } : null,
    });
  } catch (error) {
    console.error('Ошибка получения статуса премиума:', error);
    res.status(500).json({ error: 'Не удалось получить статус' });
  }
});

export default router;
