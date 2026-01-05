import { processQueue } from '../services/matchmaking.service';

const INTERVAL = 5000; // 5 seconds

let intervalId: NodeJS.Timeout | null = null;

export function startMatchmakerWorker(): void {
  if (intervalId) {
    console.log('Matchmaker worker already running');
    return;
  }

  console.log('Starting matchmaker worker (interval: 5s)');

  intervalId = setInterval(async () => {
    try {
      await processQueue();
    } catch (error) {
      console.error('Matchmaker worker error:', error);
    }
  }, INTERVAL);

  // Run immediately on start
  processQueue().catch(console.error);
}

export function stopMatchmakerWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('Matchmaker worker stopped');
  }
}
