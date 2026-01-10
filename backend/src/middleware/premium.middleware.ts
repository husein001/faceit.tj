import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { checkUserPremium } from '../models/user.model';
import { isPremiumEnabled } from '../models/settings.model';

export async function premiumMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Проверяем включен ли премиум в настройках
  const premiumRequired = await isPremiumEnabled();

  // Если премиум выключен - пропускаем всех
  if (!premiumRequired) {
    next();
    return;
  }

  // Если премиум включен - проверяем подписку пользователя
  const isPremium = await checkUserPremium(req.user.userId);

  if (!isPremium) {
    res.status(403).json({ error: 'Premium subscription required' });
    return;
  }

  next();
}
