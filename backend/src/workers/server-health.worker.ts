import { getAllServers, markServerOffline, updateServerHeartbeat } from '../models/server.model';
import { checkServerStatus } from '../services/server.service';

const INTERVAL = 30000; // 30 seconds
const OFFLINE_THRESHOLD = 60000; // 1 minute

let intervalId: NodeJS.Timeout | null = null;

export function startServerHealthWorker(): void {
  if (intervalId) {
    console.log('Server health worker already running');
    return;
  }

  console.log('Starting server health worker (interval: 30s)');

  intervalId = setInterval(async () => {
    try {
      await checkAllServers();
    } catch (error) {
      console.error('Server health worker error:', error);
    }
  }, INTERVAL);

  // Run initial check after 10 seconds
  setTimeout(() => checkAllServers().catch(console.error), 10000);
}

export function stopServerHealthWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('Server health worker stopped');
  }
}

async function checkAllServers(): Promise<void> {
  const servers = await getAllServers();

  for (const server of servers) {
    try {
      const isOnline = await checkServerStatus(server.id);

      if (isOnline) {
        await updateServerHeartbeat(server.id);
      } else {
        // Check if server has been offline for too long
        if (server.last_heartbeat) {
          const timeSinceHeartbeat = Date.now() - new Date(server.last_heartbeat).getTime();
          if (timeSinceHeartbeat > OFFLINE_THRESHOLD && server.status !== 'OFFLINE') {
            console.log(`Server ${server.name} marked as offline`);
            await markServerOffline(server.id);
          }
        }
      }
    } catch (error) {
      console.error(`Health check failed for server ${server.name}:`, error);
    }
  }
}
