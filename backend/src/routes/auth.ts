import { Router, Request, Response } from 'express';
import passport from 'passport';
import { Strategy as SteamStrategy } from 'passport-steam';
import { findUserBySteamId, createUser } from '../models/user.model';
import { generateToken, authMiddleware, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

// Configure Passport Steam Strategy
passport.use(new SteamStrategy({
  returnURL: `${process.env.API_URL}/api/auth/steam/callback`,
  realm: process.env.API_URL || 'http://localhost:3001',
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

// Initialize Passport
router.use(passport.initialize());

// Steam Auth Redirect
router.get('/steam', passport.authenticate('steam'));

// Steam Auth Callback
router.get('/steam/callback',
  passport.authenticate('steam', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/auth/error` }),
  (req: Request, res: Response) => {
    const user = req.user as any;

    if (!user) {
      res.redirect(`${process.env.FRONTEND_URL}/auth/error`);
      return;
    }

    // Generate JWT token
    const token = generateToken(user.id, user.steam_id);

    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  }
);

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
