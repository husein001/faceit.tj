// ВАЖНО: dotenv должен загрузиться ДО любых импортов, использующих process.env
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Определяем окружение
const isProduction = process.env.NODE_ENV === 'production';

// Ищем .env файл (приоритет .env.production в продакшене)
const envPaths = isProduction ? [
  path.resolve(process.cwd(), '.env.production'),
  path.resolve(process.cwd(), '../.env.production'),
  path.resolve(__dirname, '../.env.production'),
  path.resolve(__dirname, '../../.env.production'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
] : [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env'),
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`Loading env from: ${envPath} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
    dotenv.config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn('WARNING: No .env file found!');
}

console.log('ENV check:', {
  API_URL: process.env.API_URL,
  FRONTEND_URL: process.env.FRONTEND_URL,
});

// Теперь безопасно импортировать остальные модули
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';

import { testConnection } from './config/database';
import { redis, testRedisConnection } from './config/redis';
import { initSocketHandlers } from './socket';
import authRoutes from './routes/auth';
import matchmakingRoutes from './routes/matchmaking';
import lobbyRoutes from './routes/lobby';
import matchesRoutes from './routes/matches';
import webhookRoutes from './routes/webhook';
import premiumRoutes from './routes/premium';
import adminRoutes from './routes/admin';
import statsRoutes from './routes/stats';
import { startMatchmakerWorker } from './workers/matchmaker.worker';
import { startServerHealthWorker } from './workers/server-health.worker';
import { startLobbyTimeoutWorker } from './workers/lobby-timeout.worker';
import { startServerScalerWorker } from './workers/server-scaler.worker';
import { startServerPoolWorker } from './workers/server-pool.worker';
import { gameServerManager, serverMonitor } from './services/game-server';
import serversRoutes from './routes/servers';

const app = express();
const httpServer = createServer(app);

// Socket.io setup
export const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/matchmaking', matchmakingRoutes);
app.use('/api/lobby', lobbyRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/premium', premiumRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/servers', serversRoutes);

// Initialize Socket.io handlers
initSocketHandlers(io);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

async function startServer() {
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('Failed to connect to database. Exiting...');
    process.exit(1);
  }

  // Test Redis connection
  await redis.connect();
  const redisConnected = await testRedisConnection();
  if (!redisConnected) {
    console.error('Failed to connect to Redis. Exiting...');
    process.exit(1);
  }

  // Start game server manager and monitor
  gameServerManager.start();
  serverMonitor.start();

  // Start workers
  startMatchmakerWorker();
  startServerHealthWorker();
  startLobbyTimeoutWorker();
  startServerPoolWorker(); // Поднимает MIN_SERVERS серверов при старте

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API URL: ${process.env.API_URL || `http://localhost:${PORT}`}`);
  });
}

startServer().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');

  // Stop game server components
  gameServerManager.stop();
  serverMonitor.stop();

  await redis.quit();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
