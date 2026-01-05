import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { checkUserPremium } from '../models/user.model';

export async function premiumMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const isPremium = await checkUserPremium(req.user.userId);

  if (!isPremium) {
    res.status(403).json({ error: 'Premium subscription required' });
    return;
  }

  next();
}
