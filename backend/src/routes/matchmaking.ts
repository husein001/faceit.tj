import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.middleware';
import { joinQueue, leaveQueue, getQueueCount, isInQueue } from '../services/matchmaking.service';

const router = Router();

// Join matchmaking queue
router.post('/join', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const joined = await joinQueue(userId);

    if (!joined) {
      res.status(400).json({ error: 'Already in queue' });
      return;
    }

    const count = await getQueueCount();

    res.json({
      success: true,
      queueCount: count,
      message: 'Joined matchmaking queue',
    });
  } catch (error: any) {
    console.error('Error joining queue:', error);
    res.status(500).json({ error: error.message || 'Failed to join queue' });
  }
});

// Leave matchmaking queue
router.delete('/leave', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const left = await leaveQueue(userId);

    if (!left) {
      res.status(400).json({ error: 'Not in queue' });
      return;
    }

    res.json({
      success: true,
      message: 'Left matchmaking queue',
    });
  } catch (error: any) {
    console.error('Error leaving queue:', error);
    res.status(500).json({ error: error.message || 'Failed to leave queue' });
  }
});

// Get queue status
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const count = await getQueueCount();

    let inQueue = false;
    if (req.user) {
      inQueue = await isInQueue(req.user.userId);
    }

    res.json({
      queueCount: count,
      inQueue,
    });
  } catch (error) {
    console.error('Error getting queue status:', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

export default router;
