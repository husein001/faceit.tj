import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types';
import { findUserById } from '../models/user.model';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    steamId: string;
  };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as JwtPayload;
    req.user = {
      userId: decoded.userId,
      steamId: decoded.steamId,
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as JwtPayload;
    req.user = {
      userId: decoded.userId,
      steamId: decoded.steamId,
    };
  } catch (error) {
    // Token is invalid, but that's ok for optional auth
  }

  next();
}

export function generateToken(userId: string, steamId: string): string {
  return jwt.sign(
    { userId, steamId } as JwtPayload,
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '7d' }
  );
}
