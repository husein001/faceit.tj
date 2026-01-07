import { serverProvisioner } from '../services/game-server';
import { getAllServers } from '../models/server.model';

const MIN_IDLE_SERVERS = parseInt(process.env.MIN_SERVERS || '2', 10);
const MAX_SERVERS = parseInt(process.env.MAX_SERVERS || '10', 10);
const CHECK_INTERVAL = 30000; // 30 секунд

let intervalId: NodeJS.Timeout | null = null;
let isProvisioning: boolean = false;

export async function startServerPoolWorker(): Promise<void> {
  if (intervalId) {
    console.log('Server pool worker already running');
    return;
  }

  console.log(`Starting server pool worker (min idle: ${MIN_IDLE_SERVERS}, max: ${MAX_SERVERS})`);

  // Сразу при старте проверить и поднять серверы
  await ensureMinimumServers();

  // Периодическая проверка
  intervalId = setInterval(async () => {
    try {
      await ensureMinimumServers();
    } catch (error) {
      console.error('Server pool worker error:', error);
    }
  }, CHECK_INTERVAL);
}

export function stopServerPoolWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('Server pool worker stopped');
  }
}

async function ensureMinimumServers(): Promise<void> {
  // Не запускать параллельно несколько провизионингов
  if (isProvisioning) {
    return;
  }

  try {
    const servers = await getAllServers();
    const idleServers = servers.filter(s => s.status === 'IDLE');
    const totalServers = servers.filter(s => s.status !== 'OFFLINE').length;

    const idleCount = idleServers.length;
    const neededServers = MIN_IDLE_SERVERS - idleCount;

    if (neededServers > 0 && totalServers < MAX_SERVERS) {
      const toProvision = Math.min(neededServers, MAX_SERVERS - totalServers);
      console.log(`[Pool] Idle servers: ${idleCount}/${MIN_IDLE_SERVERS}, provisioning ${toProvision} more...`);

      isProvisioning = true;

      for (let i = 0; i < toProvision; i++) {
        try {
          const result = await serverProvisioner.provision({
            name: `Faceit.TJ Server`,
            ip: '',
            port: 0,
            rconPassword: '',
          });

          if (result.success) {
            console.log(`[Pool] Server provisioned: ${result.serverId}`);
          } else {
            console.error(`[Pool] Failed to provision: ${result.error}`);
            break; // Остановить если ошибка
          }
        } catch (error) {
          console.error('[Pool] Provisioning error:', error);
          break;
        }
      }

      isProvisioning = false;
    }
  } catch (error) {
    isProvisioning = false;
    console.error('[Pool] Error checking servers:', error);
  }
}

// Функция для немедленного пополнения пула (вызывается после взятия сервера)
export async function replenishPool(): Promise<void> {
  // Запустить проверку через 5 секунд (не блокировать текущий запрос)
  setTimeout(() => {
    ensureMinimumServers().catch(console.error);
  }, 5000);
}
