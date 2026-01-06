import { Router, Request, Response } from 'express';
import passport from 'passport';
import { Strategy as SteamStrategy } from 'passport-steam';
import { findUserBySteamId, createUser } from '../models/user.model';
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

// Флаг для ленивой инициализации
let steamStrategyInitialized = false;

// Инициализация Steam Strategy ЛЕНИВО (после загрузки .env)
function initSteamStrategy() {
  if (steamStrategyInitialized) return;

  const apiUrl = process.env.API_URL || 'http://localhost:3001';
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  console.log('Initializing Steam Strategy with:', { apiUrl, frontendUrl });

  passport.use(new SteamStrategy({
    returnURL: `${apiUrl}/api/auth/steam/callback`,
    realm: apiUrl,
    apiKey: process.env.STEAM_API_KEY || '',
  }, async (identifier: string, profile: any, done: Function) => {
    try {
      const steamId = profile.id;
      const username = profile.displayName;
      const avatarUrl = profile.photos?.[2]?.value || profile.photos?.[0]?.value || null;

      // Find or create user
      let user = await findUserBySteamId(steamId);

      if (!user) {
        user = await createUser(steamId, username, avatarUrl);
      }

      done(null, user);
    } catch (error) {
      done(error);
    }
  }));

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const { findUserById } = await import('../models/user.model');
      const user = await findUserById(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  steamStrategyInitialized = true;
}

// Initialize Passport
router.use(passport.initialize());

// Steam Auth Redirect - инициализируем стратегию при первом запросе
router.get('/steam', (req, res, next) => {
  initSteamStrategy();
  passport.authenticate('steam')(req, res, next);
});

// Steam Auth Callback - тоже инициализируем стратегию
router.get('/steam/callback', (req: Request, res: Response, next) => {
  initSteamStrategy();

  passport.authenticate('steam', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/auth/error`
  })(req, res, (err: any) => {
    if (err) {
      console.error('Steam auth error:', err);
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error`);
    }

    const user = req.user as any;

    if (!user) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error`);
    }

    // Generate JWT token
    const token = generateToken(user.id, user.steam_id);

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    console.log('Redirecting to:', `${frontendUrl}/auth/callback?token=${token}`);
    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  });
});

// Logout
router.post('/logout', authMiddleware, (req: AuthRequest, res: Response) => {
  // JWT is stateless, so we just return success
  // Client should delete the token
  res.json({ success: true });
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { findUserById } = await import('../models/user.model');
    const user = await findUserById(req.user!.userId);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      steamId: user.steam_id,
      username: user.username,
      avatarUrl: user.avatar_url,
      mmr: user.mmr,
      isPremium: user.is_premium,
      premiumUntil: user.premium_until,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
