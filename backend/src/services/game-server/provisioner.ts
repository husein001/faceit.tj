import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  GameServerConfig,
  ServerOperationResult,
} from './types';
import { gameServerManager } from './manager';
import { createServer, findServerById } from '../../models/server.model';
import { query } from '../../config/database';

const execAsync = promisify(exec);

interface DockerContainer {
  id: string;
  name: string;
  port: number;
  rconPassword: string;
  status: 'running' | 'stopped' | 'starting';
  createdAt: Date;
}

interface DockerConfig {
  image: string;
  network: string;
  gsltToken: string;
  steamApiKey: string;
  webhookUrl: string;
  tickrate: number;
  maxPlayers: number;
  startMap: string;
}

class ServerProvisioner extends EventEmitter {
  private static instance: ServerProvisioner;
  private containers: Map<string, DockerContainer> = new Map();
  private isInitialized: boolean = false;
  private config: DockerConfig;
  private portStart: number;
  private portEnd: number;
  private usedPorts: Set<number> = new Set();

  private constructor() {
    super();
    this.config = this.loadConfig();
    this.portStart = parseInt(process.env.SERVER_PORT_START || '27015', 10);
    this.portEnd = parseInt(process.env.SERVER_PORT_END || '27030', 10);
  }

  static getInstance(): ServerProvisioner {
    if (!ServerProvisioner.instance) {
      ServerProvisioner.instance = new ServerProvisioner();
    }
    return ServerProvisioner.instance;
  }

  private loadConfig(): DockerConfig {
    return {
      image: process.env.CS2_DOCKER_IMAGE || 'joedwards32/cs2',
      network: process.env.DOCKER_NETWORK || 'faceit_network',
      gsltToken: process.env.GSLT_TOKEN || '',
      steamApiKey: process.env.CS2_STEAM_API_KEY || process.env.STEAM_API_KEY || '',
      webhookUrl: process.env.GET5_WEBHOOK_URL || '',
      tickrate: parseInt(process.env.CS2_TICKRATE || '128', 10),
      maxPlayers: parseInt(process.env.CS2_MAXPLAYERS || '10', 10),
      startMap: process.env.CS2_STARTMAP || 'de_dust2',
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('Initializing Docker ServerProvisioner...');

    try {
      // Проверить Docker
      await execAsync('docker info');
      console.log('Docker connection established');

      // Загрузить существующие контейнеры из БД
      await this.syncContainersFromDb();

      // Проверить образ
      await this.ensureImage();

      // Создать shared volume для CS2 (скачивается один раз, используется всеми серверами)
      await this.ensureSharedVolume();

      this.isInitialized = true;
      this.emit('provisioner:initialized');
      console.log('ServerProvisioner initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Docker provisioner:', error);
      throw new Error('Docker is not available');
    }
  }

  private async syncContainersFromDb(): Promise<void> {
    try {
      const servers = await query<{ id: string; port: number; name: string }>(
        `SELECT id, port, name FROM servers WHERE status != 'OFFLINE'`
      );

      for (const server of servers) {
        this.usedPorts.add(server.port);
        console.log(`Synced server ${server.name} on port ${server.port}`);
      }
    } catch (error) {
      console.error('Failed to sync containers from DB:', error);
    }
  }

  private async ensureImage(): Promise<void> {
    try {
      await execAsync(`docker image inspect ${this.config.image}`);
      console.log(`Docker image ${this.config.image} found`);
    } catch {
      console.log(`Pulling Docker image ${this.config.image}...`);
      await execAsync(`docker pull ${this.config.image}`);
      console.log(`Docker image ${this.config.image} pulled successfully`);
    }
  }

  private async ensureSharedVolume(): Promise<void> {
    const volumeName = 'cs2-shared';
    try {
      await execAsync(`docker volume inspect ${volumeName}`);
      console.log(`Shared volume ${volumeName} exists`);
    } catch {
      console.log(`Creating shared volume ${volumeName}...`);
      await execAsync(`docker volume create ${volumeName}`);
      console.log(`Shared volume ${volumeName} created`);
    }
  }

  private async isCs2Installed(): Promise<boolean> {
    try {
      // Проверяем наличие CS2 в shared volume
      const { stdout } = await execAsync(
        `docker run --rm -v cs2-shared:/data alpine ls /data/game/bin/linuxsteamrt64/cs2 2>/dev/null || echo "not_found"`
      );
      return !stdout.includes('not_found');
    } catch {
      return false;
    }
  }

  async preloadCs2(): Promise<void> {
    console.log('Pre-loading CS2 to shared volume...');
    const isInstalled = await this.isCs2Installed();
    if (isInstalled) {
      console.log('CS2 already installed in shared volume');
      return;
    }

    console.log('CS2 not found, starting preload container (this may take 30-60 minutes)...');
    const preloadContainer = 'cs2-preload';

    try {
      await execAsync(`docker rm -f ${preloadContainer} 2>/dev/null`).catch(() => {});

      const cmd = [
        'docker run -d',
        `--name ${preloadContainer}`,
        `-v cs2-shared:/home/steam/cs2-dedicated`,
        `-e SRCDS_TOKEN=${this.config.gsltToken}`,
        `-e CS2_PORT=27015`,
        this.config.image,
      ].join(' ');

      await execAsync(cmd);
      console.log('Preload container started, waiting for CS2 download...');

      await this.waitForContainer(preloadContainer, 3600000);

      await execAsync(`docker stop ${preloadContainer}`);
      await execAsync(`docker rm ${preloadContainer}`);

      console.log('CS2 pre-loaded successfully');
    } catch (error) {
      console.error('Failed to preload CS2:', error);
      await execAsync(`docker rm -f ${preloadContainer} 2>/dev/null`).catch(() => {});
    }
  }

  async migrateExistingVolume(oldVolumeName: string): Promise<void> {
    const isInstalled = await this.isCs2Installed();
    if (isInstalled) {
      console.log('Shared volume already has CS2, skipping migration');
      return;
    }

    console.log(`Migrating ${oldVolumeName} to cs2-shared...`);
    try {
      await execAsync(`docker volume inspect ${oldVolumeName}`);
      await execAsync(`docker volume create cs2-shared 2>/dev/null || true`);
      await execAsync(
        `docker run --rm -v ${oldVolumeName}:/source:ro -v cs2-shared:/dest alpine sh -c "cp -a /source/. /dest/"`
      );
      console.log('Migration completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
    }
  }

  // ============ PORT MANAGEMENT ============

  private allocatePort(): number | null {
    for (let port = this.portStart; port <= this.portEnd; port++) {
      if (!this.usedPorts.has(port)) {
        this.usedPorts.add(port);
        return port;
      }
    }
    return null;
  }

  private releasePort(port: number): void {
    this.usedPorts.delete(port);
  }

  // ============ DOCKER PROVISIONING ============

  async provision(config: GameServerConfig): Promise<ServerOperationResult> {
    await this.initialize();

    const port = this.allocatePort();
    if (!port) {
      return { success: false, error: 'No available ports in pool' };
    }

    const rconPassword = this.generatePassword();
    const serverPassword = ''; // Публичный сервер
    const containerName = `cs2-faceit-${port}`;

    console.log(`Provisioning CS2 server on port ${port}...`);

    try {
      // Проверить что контейнер не существует
      try {
        await execAsync(`docker rm -f ${containerName} 2>/dev/null`);
      } catch {
        // Игнорируем ошибку если контейнера нет
      }

      // Используем shared volume для всех серверов (CS2 скачивается один раз)
      const volumeName = 'cs2-shared';

      // Создать и запустить контейнер
      const dockerCmd = this.buildDockerCommand({
        containerName,
        port,
        rconPassword,
        serverPassword,
        volumeName,
      });

      console.log(`Running: docker run ${containerName} (shared volume: ${volumeName})`);
      await execAsync(dockerCmd);

      // Проверяем установлен ли CS2 - если да, короткий таймаут; если нет, долгий
      const cs2Installed = await this.isCs2Installed();
      const waitTimeout = cs2Installed ? 180000 : 3600000; // 3 мин если есть, 60 мин если нет
      console.log(`CS2 ${cs2Installed ? 'installed in template' : 'not installed'}, waiting ${waitTimeout / 1000}s for container...`);

      await this.waitForContainer(containerName, waitTimeout);

      // Получить Docker IP контейнера (для RCON)
      const dockerIp = await this.getDockerContainerIp(containerName);

      // Внешний IP для игроков
      const externalIp = process.env.EXTERNAL_IP || process.env.SERVER_IP || dockerIp;

      // Зарегистрировать сервер в БД
      const server = await createServer(
        config.name || `Faceit.TJ #${port}`,
        externalIp,  // Внешний IP для connect команды
        port,        // Внешний порт для connect
        rconPassword,
        dockerIp     // Docker IP для RCON подключения
      );

      // Сохранить информацию о контейнере
      this.containers.set(server.id, {
        id: containerName,
        name: containerName,
        port,
        rconPassword,
        status: 'running',
        createdAt: new Date(),
      });

      this.emit('server:provisioned', {
        serverId: server.id,
        containerName,
        port,
      });

      console.log(`CS2 server provisioned: ${server.id} on port ${port}`);

      return {
        success: true,
        serverId: server.id,
        message: `Server started on port ${port}`,
      };
    } catch (error) {
      this.releasePort(port);
      console.error('Failed to provision Docker server:', error);

      // Попытка очистки
      try {
        await execAsync(`docker rm -f ${containerName} 2>/dev/null`);
      } catch {
        // Игнорируем
      }

      return { success: false, error: String(error) };
    }
  }

  private buildDockerCommand(params: {
    containerName: string;
    port: number;
    rconPassword: string;
    serverPassword: string;
    volumeName: string;
  }): string {
    const { containerName, port, rconPassword, serverPassword, volumeName } = params;

    const envVars = [
      `SRCDS_TOKEN=${this.config.gsltToken}`,
      `CS2_RCONPW=${rconPassword}`,
      `CS2_PW=${serverPassword}`,
      `CS2_PORT=27015`,
      `CS2_MAXPLAYERS=${this.config.maxPlayers}`,
      `CS2_GAMETYPE=0`,
      `CS2_GAMEMODE=1`,
      `CS2_MAPGROUP=mg_active`,
      `CS2_STARTMAP=${this.config.startMap}`,
      `CS2_ADDITIONAL_ARGS=-tickrate ${this.config.tickrate} +sv_lan 0 +game_type 0 +game_mode 1`,
      `STEAMAPPVALIDATE=0`,
    ];

    const cmd = [
      'docker run -d',
      `--name ${containerName}`,
      `--network ${this.config.network}`,
      `--restart unless-stopped`,
      // Порты
      `-p ${port}:27015/tcp`,
      `-p ${port}:27015/udp`,
      `-p ${port + 100}:27020/udp`, // GOTV
      // Volume для этого сервера (создаётся из template)
      `-v ${volumeName}:/home/steam/cs2-dedicated`,
      // Ресурсы (адаптивно под сервер)
      `--memory=${process.env.CS2_MEMORY_LIMIT || '4g'}`,
      `--cpus=${process.env.CS2_CPU_LIMIT || '1'}`,
      // Переменные окружения
      ...envVars.map(e => `-e "${e}"`),
      // Image
      this.config.image,
    ];

    return cmd.join(' ');
  }

  private async waitForContainer(containerName: string, timeout: number = 60000): Promise<void> {
    const startTime = Date.now();
    console.log(`Waiting for container ${containerName} to start...`);

    while (Date.now() - startTime < timeout) {
      try {
        const { stdout } = await execAsync(
          `docker inspect -f '{{.State.Running}}' ${containerName}`
        );

        if (stdout.trim() === 'true') {
          // Проверить что сервер слушает порт
          const { stdout: logs } = await execAsync(
            `docker logs ${containerName} 2>&1 | tail -20`
          );

          if (logs.includes('VAC secure mode') || logs.includes('Game server connected')) {
            console.log(`Container ${containerName} is ready`);
            return;
          }
        }
      } catch {
        // Контейнер ещё не готов
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    throw new Error(`Container ${containerName} failed to start within ${timeout / 1000}s`);
  }

  private async getDockerContainerIp(containerName: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${containerName}`
      );
      return stdout.trim() || 'localhost';
    } catch {
      return 'localhost';
    }
  }

  // ============ DEPROVISION ============

  async deprovision(serverId: string): Promise<ServerOperationResult> {
    const container = this.containers.get(serverId);
    const server = await findServerById(serverId);

    if (!server) {
      return { success: false, error: 'Server not found' };
    }

    const containerName = container?.id || `cs2-faceit-${server.port}`;

    try {
      console.log(`Deprovisioning server ${serverId} (${containerName})...`);

      // Остановить и удалить контейнер
      await execAsync(`docker stop ${containerName}`);
      await execAsync(`docker rm ${containerName}`);

      // Shared volume НЕ удаляем - он используется всеми серверами

      // Освободить порт
      this.releasePort(server.port);

      // Удалить из БД
      await query(`DELETE FROM servers WHERE id = $1`, [serverId]);

      // Удалить из памяти
      this.containers.delete(serverId);

      this.emit('server:deprovisioned', { serverId });
      console.log(`Server ${serverId} deprovisioned successfully`);

      return { success: true };
    } catch (error) {
      console.error(`Failed to deprovision server ${serverId}:`, error);
      return { success: false, error: String(error) };
    }
  }

  // ============ RESTART ============

  async restart(serverId: string): Promise<ServerOperationResult> {
    const container = this.containers.get(serverId);
    const server = await findServerById(serverId);

    if (!server) {
      return { success: false, error: 'Server not found' };
    }

    const containerName = container?.id || `cs2-faceit-${server.port}`;

    try {
      console.log(`Restarting server ${serverId} (${containerName})...`);

      await execAsync(`docker restart ${containerName}`);
      await this.waitForContainer(containerName, 120000);

      this.emit('server:restarted', { serverId });
      console.log(`Server ${serverId} restarted successfully`);

      return { success: true };
    } catch (error) {
      console.error(`Failed to restart server ${serverId}:`, error);
      return { success: false, error: String(error) };
    }
  }

  // ============ LOGS ============

  async getLogs(serverId: string, lines: number = 100): Promise<string> {
    const container = this.containers.get(serverId);
    const server = await findServerById(serverId);

    if (!server) {
      return 'Server not found';
    }

    const containerName = container?.id || `cs2-faceit-${server.port}`;

    try {
      const { stdout } = await execAsync(
        `docker logs --tail ${lines} ${containerName} 2>&1`
      );
      return stdout;
    } catch (error) {
      return `Failed to get logs: ${error}`;
    }
  }

  // ============ STATS ============

  async getContainerStats(serverId: string): Promise<{
    cpu: number;
    memory: number;
    memoryLimit: number;
  } | null> {
    const container = this.containers.get(serverId);
    const server = await findServerById(serverId);

    if (!server) return null;

    const containerName = container?.id || `cs2-faceit-${server.port}`;

    try {
      const { stdout } = await execAsync(
        `docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}}" ${containerName}`
      );

      const [cpuStr, memStr] = stdout.trim().split(',');
      const cpu = parseFloat(cpuStr.replace('%', '')) || 0;

      // Parse memory: "1.5GiB / 4GiB"
      const memMatch = memStr.match(/([\d.]+)(\w+)\s*\/\s*([\d.]+)(\w+)/);
      let memory = 0;
      let memoryLimit = 0;

      if (memMatch) {
        memory = this.parseMemory(memMatch[1], memMatch[2]);
        memoryLimit = this.parseMemory(memMatch[3], memMatch[4]);
      }

      return { cpu, memory, memoryLimit };
    } catch {
      return null;
    }
  }

  private parseMemory(value: string, unit: string): number {
    const num = parseFloat(value);
    switch (unit.toLowerCase()) {
      case 'gib':
      case 'gb':
        return num * 1024;
      case 'mib':
      case 'mb':
        return num;
      case 'kib':
      case 'kb':
        return num / 1024;
      default:
        return num;
    }
  }

  // ============ UTILITIES ============

  private generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  getActiveContainers(): DockerContainer[] {
    return Array.from(this.containers.values());
  }

  getUsedPorts(): number[] {
    return Array.from(this.usedPorts);
  }

  getAvailablePortCount(): number {
    return (this.portEnd - this.portStart + 1) - this.usedPorts.size;
  }

  getConfig(): DockerConfig {
    return { ...this.config };
  }

  async getStatus(): Promise<{
    initialized: boolean;
    cs2Installed: boolean;
    usedPorts: number[];
    availablePorts: number;
    activeContainers: number;
  }> {
    const cs2Installed = await this.isCs2Installed();
    return {
      initialized: this.isInitialized,
      cs2Installed,
      usedPorts: this.getUsedPorts(),
      availablePorts: this.getAvailablePortCount(),
      activeContainers: this.containers.size,
    };
  }
}

export const serverProvisioner = ServerProvisioner.getInstance();
