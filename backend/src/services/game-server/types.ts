import { Server, ServerStatus } from '../../types';

// Конфигурация для запуска сервера
export interface GameServerConfig {
  name: string;
  ip: string;
  port: number;
  rconPassword: string;
  tickrate?: number;
  maxPlayers?: number;
  gameMode?: 'competitive' | 'casual' | 'deathmatch';
  map?: string;
  get5Config?: {
    apiUrl: string;
    apiKey: string;
  };
}

// Расширенная информация о сервере
export interface GameServerInfo extends Server {
  playerCount: number;
  maxPlayers: number;
  currentMap: string;
  tickrate: number;
  uptime: number; // секунды
  cpu: number; // процент
  memory: number; // MB
  network: {
    bytesIn: number;
    bytesOut: number;
  };
  get5Status?: Get5Status;
}

// Статус Get5 матча на сервере
export interface Get5Status {
  pluginVersion: string;
  gamestate: 'none' | 'warmup' | 'knife' | 'waiting_for_knife_decision' | 'going_live' | 'live' | 'post_game';
  paused: boolean;
  matchId: string | null;
  mapNumber: number;
  team1: {
    name: string;
    score: number;
    ready: boolean;
    side: 'ct' | 't';
  };
  team2: {
    name: string;
    score: number;
    ready: boolean;
    side: 'ct' | 't';
  };
}

// Метрики сервера для мониторинга
export interface ServerMetrics {
  serverId: string;
  timestamp: Date;
  playerCount: number;
  cpu: number;
  memory: number;
  tickrate: number;
  var: number; // sv_var
  ping: number; // средний пинг игроков
  loss: number; // packet loss
  choke: number; // choke
}

// Событие сервера
export interface ServerEvent {
  serverId: string;
  type: 'start' | 'stop' | 'crash' | 'player_connect' | 'player_disconnect' | 'match_start' | 'match_end' | 'error' | 'warning';
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Конфигурация провизионера
export interface ProvisionerConfig {
  type: 'docker' | 'ssh' | 'local' | 'pterodactyl';

  // Docker настройки
  docker?: {
    host?: string;
    socketPath?: string;
    image: string;
    network?: string;
  };

  // SSH настройки
  ssh?: {
    host: string;
    port: number;
    username: string;
    privateKey?: string;
    password?: string;
  };

  // Pterodactyl настройки
  pterodactyl?: {
    apiUrl: string;
    apiKey: string;
    nodeId: number;
  };

  // Общие настройки CS2 сервера
  cs2?: {
    steamcmdPath?: string;
    serverPath: string;
    gsltToken?: string; // Game Server Login Token
    serverCfg?: string;
    get5Cfg?: string;
  };
}

// Лимиты для автомасштабирования
export interface ScalerConfig {
  minServers: number;
  maxServers: number;
  targetIdleServers: number; // сколько серверов должно быть свободно
  scaleUpThreshold: number; // когда добавлять сервер (% занятых)
  scaleDownThreshold: number; // когда убирать сервер (% занятых)
  cooldownPeriod: number; // минимальное время между операциями (мс)
}

// Результат операции с сервером
export interface ServerOperationResult {
  success: boolean;
  serverId?: string;
  message?: string;
  error?: string;
}

// Пул портов для серверов
export interface PortPool {
  start: number;
  end: number;
  reserved: Set<number>;
}

// Состояние менеджера
export interface ManagerState {
  isRunning: boolean;
  totalServers: number;
  activeServers: number;
  idleServers: number;
  inGameServers: number;
  offlineServers: number;
  queueSize: number;
  lastScaleOperation?: Date;
}

// Команда RCON
export interface RconCommand {
  command: string;
  timeout?: number;
}

// Результат RCON
export interface RconResult {
  success: boolean;
  response?: string;
  error?: string;
}

// Логи сервера
export interface ServerLog {
  serverId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: Date;
  source?: string;
}

// Шаблон сервера для быстрого развёртывания
export interface ServerTemplate {
  id: string;
  name: string;
  description: string;
  config: GameServerConfig;
  provisionerConfig: ProvisionerConfig;
}
