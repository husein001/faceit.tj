import {
  gameServerManager,
  serverProvisioner,
  serverMonitor,
  ScalerConfig,
} from '../services/game-server';
import { getAllServers } from '../models/server.model';

const DEFAULT_CONFIG: ScalerConfig = {
  minServers: parseInt(process.env.MIN_SERVERS || '1', 10),
  maxServers: parseInt(process.env.MAX_SERVERS || '10', 10),
  targetIdleServers: parseInt(process.env.TARGET_IDLE_SERVERS || '2', 10),
  scaleUpThreshold: parseFloat(process.env.SCALE_UP_THRESHOLD || '0.8'), // 80%
  scaleDownThreshold: parseFloat(process.env.SCALE_DOWN_THRESHOLD || '0.3'), // 30%
  cooldownPeriod: parseInt(process.env.SCALER_COOLDOWN || '300000', 10), // 5 минут
};

const INTERVAL = 60000; // 1 минута

let intervalId: NodeJS.Timeout | null = null;
let lastScaleOperation: Date | null = null;
let config: ScalerConfig = { ...DEFAULT_CONFIG };
let isEnabled: boolean = process.env.AUTO_SCALING_ENABLED === 'true';

export function startServerScalerWorker(): void {
  if (intervalId) {
    console.log('Server scaler worker already running');
    return;
  }

  if (!isEnabled) {
    console.log('Server scaler worker disabled (AUTO_SCALING_ENABLED !== true)');
    return;
  }

  console.log('Starting server scaler worker', {
    minServers: config.minServers,
    maxServers: config.maxServers,
    targetIdleServers: config.targetIdleServers,
    interval: `${INTERVAL / 1000}s`,
  });

  intervalId = setInterval(async () => {
    try {
      await evaluateAndScale();
    } catch (error) {
      console.error('Server scaler worker error:', error);
    }
  }, INTERVAL);

  // Первый запуск через 30 секунд
  setTimeout(() => evaluateAndScale().catch(console.error), 30000);
}

export function stopServerScalerWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('Server scaler worker stopped');
  }
}

export function updateScalerConfig(newConfig: Partial<ScalerConfig>): void {
  config = { ...config, ...newConfig };
  console.log('Scaler config updated:', config);
}

export function getScalerConfig(): ScalerConfig {
  return { ...config };
}

export function enableScaler(): void {
  isEnabled = true;
  if (!intervalId) {
    startServerScalerWorker();
  }
}

export function disableScaler(): void {
  isEnabled = false;
  stopServerScalerWorker();
}

export function isScalerEnabled(): boolean {
  return isEnabled;
}

async function evaluateAndScale(): Promise<void> {
  // Проверить cooldown
  if (lastScaleOperation) {
    const timeSinceLastOperation = Date.now() - lastScaleOperation.getTime();
    if (timeSinceLastOperation < config.cooldownPeriod) {
      return; // Ещё в cooldown периоде
    }
  }

  const servers = await getAllServers();
  const onlineServers = servers.filter(s => s.status !== 'OFFLINE');
  const idleServers = servers.filter(s => s.status === 'IDLE');
  const busyServers = onlineServers.filter(s => s.status !== 'IDLE');

  const totalServers = servers.length;
  const idleCount = idleServers.length;
  const busyCount = busyServers.length;

  // Расчёт загруженности
  const utilizationRate = totalServers > 0 ? busyCount / totalServers : 0;

  // Получить размер очереди
  const queueSize = await gameServerManager.getQueueSize();

  console.log(`[Scaler] Servers: ${totalServers} total, ${idleCount} idle, ${busyCount} busy | Queue: ${queueSize} | Utilization: ${Math.round(utilizationRate * 100)}%`);

  // ============ SCALE UP LOGIC ============
  if (shouldScaleUp(totalServers, idleCount, utilizationRate, queueSize)) {
    const serversToAdd = calculateServersToAdd(totalServers, idleCount, queueSize);
    console.log(`[Scaler] Scaling UP: adding ${serversToAdd} server(s)`);

    for (let i = 0; i < serversToAdd; i++) {
      try {
        const result = await serverProvisioner.provision({
          name: `Auto-scaled Server ${Date.now()}`,
          ip: '',
          port: 0,
          rconPassword: '',
        });

        if (result.success) {
          console.log(`[Scaler] Provisioned server: ${result.serverId}`);
          serverMonitor.log(result.serverId!, 'info', 'Server auto-provisioned by scaler');
        } else {
          console.error(`[Scaler] Failed to provision server: ${result.error}`);
          break; // Остановить если ошибка
        }
      } catch (error) {
        console.error('[Scaler] Provisioning error:', error);
        break;
      }
    }

    lastScaleOperation = new Date();
  }

  // ============ SCALE DOWN LOGIC ============
  else if (shouldScaleDown(totalServers, idleCount, utilizationRate)) {
    const serversToRemove = calculateServersToRemove(totalServers, idleCount);
    console.log(`[Scaler] Scaling DOWN: removing ${serversToRemove} server(s)`);

    // Удаляем только idle серверы
    const serversToDeprovision = idleServers.slice(0, serversToRemove);

    for (const server of serversToDeprovision) {
      try {
        const result = await serverProvisioner.deprovision(server.id);

        if (result.success) {
          console.log(`[Scaler] Deprovisioned server: ${server.id}`);
        } else {
          console.error(`[Scaler] Failed to deprovision server ${server.id}: ${result.error}`);
        }
      } catch (error) {
        console.error(`[Scaler] Deprovisioning error for ${server.id}:`, error);
      }
    }

    lastScaleOperation = new Date();
  }
}

function shouldScaleUp(
  totalServers: number,
  idleCount: number,
  utilizationRate: number,
  queueSize: number
): boolean {
  // Не превышать максимум
  if (totalServers >= config.maxServers) {
    return false;
  }

  // Если очередь большая - нужны серверы
  if (queueSize >= 10) {
    return true;
  }

  // Если мало свободных серверов
  if (idleCount < config.targetIdleServers) {
    return true;
  }

  // Если высокая загрузка
  if (utilizationRate >= config.scaleUpThreshold) {
    return true;
  }

  return false;
}

function shouldScaleDown(
  totalServers: number,
  idleCount: number,
  utilizationRate: number
): boolean {
  // Не меньше минимума
  if (totalServers <= config.minServers) {
    return false;
  }

  // Если слишком много свободных серверов
  if (idleCount > config.targetIdleServers + 2) {
    return true;
  }

  // Если низкая загрузка
  if (utilizationRate < config.scaleDownThreshold && idleCount > config.targetIdleServers) {
    return true;
  }

  return false;
}

function calculateServersToAdd(
  totalServers: number,
  idleCount: number,
  queueSize: number
): number {
  // Сколько нужно для очереди (1 сервер на 10 игроков)
  const neededForQueue = Math.ceil(queueSize / 10);

  // Сколько нужно для поддержания idle пула
  const neededForIdlePool = Math.max(0, config.targetIdleServers - idleCount);

  // Общая потребность
  const needed = Math.max(neededForQueue, neededForIdlePool);

  // Ограничить максимумом
  const maxCanAdd = config.maxServers - totalServers;

  // Добавлять по 1-2 за раз для плавного масштабирования
  return Math.min(needed, maxCanAdd, 2);
}

function calculateServersToRemove(
  totalServers: number,
  idleCount: number
): number {
  // Сколько лишних idle серверов
  const excessIdle = idleCount - config.targetIdleServers;

  // Сколько можно удалить без нарушения минимума
  const maxCanRemove = totalServers - config.minServers;

  // Удалять по 1 за раз для плавного масштабирования
  return Math.min(excessIdle, maxCanRemove, 1);
}

// Export для API
export function getScalerStatus(): {
  enabled: boolean;
  config: ScalerConfig;
  lastScaleOperation: Date | null;
} {
  return {
    enabled: isEnabled,
    config: { ...config },
    lastScaleOperation,
  };
}
