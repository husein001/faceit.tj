import { EventEmitter } from 'events';
import Rcon from 'rcon-srcds';
import { Server, ServerStatus } from '../../types';
import {
  GameServerInfo,
  GameServerConfig,
  Get5Status,
  ManagerState,
  RconResult,
  ServerEvent,
  ServerMetrics,
  PortPool,
} from './types';
import {
  getAllServers,
  findServerById,
  findIdleServer,
  updateServerStatus,
  updateServerHeartbeat,
  createServer,
  markServerOffline,
} from '../../models/server.model';
import { redis } from '../../config/redis';

class GameServerManager extends EventEmitter {
  private static instance: GameServerManager;
  private rconConnections: Map<string, Rcon> = new Map();
  private serverMetrics: Map<string, ServerMetrics[]> = new Map();
  private portPool: PortPool;
  private isRunning: boolean = false;

  private constructor() {
    super();
    this.portPool = {
      start: 27015,
      end: 27115,
      reserved: new Set(),
    };
  }

  static getInstance(): GameServerManager {
    if (!GameServerManager.instance) {
      GameServerManager.instance = new GameServerManager();
    }
    return GameServerManager.instance;
  }

  // ============ RCON CONNECTION MANAGEMENT ============

  private getRconKey(server: Server): string {
    const host = server.internal_ip || server.ip;
    return `${host}:${server.port}`;
  }

  async getRconConnection(server: Server): Promise<Rcon> {
    const key = this.getRconKey(server);
    // Используем internal_ip для RCON если задан (Docker IP), иначе внешний ip
    const rconHost = server.internal_ip || server.ip;

    if (this.rconConnections.has(key)) {
      const existing = this.rconConnections.get(key)!;
      if (existing.authenticated) {
        return existing;
      }
      this.rconConnections.delete(key);
    }

    const rcon = new Rcon({
      host: rconHost,
      port: server.port,
      timeout: 5000,
    });

    try {
      await rcon.authenticate(server.rcon_password);
      this.rconConnections.set(key, rcon);
      return rcon;
    } catch (error) {
      throw new Error(`Failed to connect to RCON ${key}: ${error}`);
    }
  }

  async executeRcon(serverId: string, command: string): Promise<RconResult> {
    const server = await findServerById(serverId);
    if (!server) {
      return { success: false, error: 'Server not found' };
    }

    try {
      const rcon = await this.getRconConnection(server);
      const response = await rcon.execute(command);
      return { success: true, response: String(response) };
    } catch (error) {
      console.error(`RCON command failed for ${serverId}:`, error);
      return { success: false, error: String(error) };
    }
  }

  closeRconConnection(server: Server): void {
    const key = this.getRconKey(server);
    const rcon = this.rconConnections.get(key);
    if (rcon) {
      rcon.disconnect();
      this.rconConnections.delete(key);
    }
  }

  // ============ SERVER POOL MANAGEMENT ============

  async getState(): Promise<ManagerState> {
    const servers = await getAllServers();
    const queueSize = await this.getQueueSize();

    return {
      isRunning: this.isRunning,
      totalServers: servers.length,
      activeServers: servers.filter(s => s.status !== 'OFFLINE').length,
      idleServers: servers.filter(s => s.status === 'IDLE').length,
      inGameServers: servers.filter(s => s.status === 'IN_GAME').length,
      offlineServers: servers.filter(s => s.status === 'OFFLINE').length,
      queueSize,
    };
  }

  async getAllServers(): Promise<Server[]> {
    return getAllServers();
  }

  async getServerInfo(serverId: string): Promise<GameServerInfo | null> {
    const server = await findServerById(serverId);
    if (!server) return null;

    try {
      const statusResult = await this.executeRcon(serverId, 'status');
      if (!statusResult.success) {
        return this.createOfflineServerInfo(server);
      }

      const stats = this.parseStatusOutput(statusResult.response || '');
      const get5Status = await this.getGet5Status(serverId);

      return {
        ...server,
        playerCount: stats.playerCount,
        maxPlayers: stats.maxPlayers,
        currentMap: stats.map,
        tickrate: stats.tickrate,
        uptime: stats.uptime,
        cpu: 0,
        memory: 0,
        network: { bytesIn: 0, bytesOut: 0 },
        get5Status,
      };
    } catch (error) {
      return this.createOfflineServerInfo(server);
    }
  }

  private createOfflineServerInfo(server: Server): GameServerInfo {
    return {
      ...server,
      playerCount: 0,
      maxPlayers: 10,
      currentMap: 'unknown',
      tickrate: 0,
      uptime: 0,
      cpu: 0,
      memory: 0,
      network: { bytesIn: 0, bytesOut: 0 },
    };
  }

  private parseStatusOutput(output: string): {
    playerCount: number;
    maxPlayers: number;
    map: string;
    tickrate: number;
    uptime: number;
  } {
    const result = {
      playerCount: 0,
      maxPlayers: 10,
      map: 'unknown',
      tickrate: 128,
      uptime: 0,
    };

    const lines = output.split('\n');
    for (const line of lines) {
      // Parse players: "players : 5 humans, 0 bots (10/0 max)"
      const playersMatch = line.match(/players\s*:\s*(\d+)\s*humans.*\((\d+)/i);
      if (playersMatch) {
        result.playerCount = parseInt(playersMatch[1], 10);
        result.maxPlayers = parseInt(playersMatch[2], 10);
      }

      // Parse map: "map     : de_dust2"
      const mapMatch = line.match(/^map\s*:\s*(\S+)/i);
      if (mapMatch) {
        result.map = mapMatch[1];
      }

      // Parse tickrate from "server tick rate"
      const tickMatch = line.match(/tick\s*(?:rate)?\s*:\s*(\d+)/i);
      if (tickMatch) {
        result.tickrate = parseInt(tickMatch[1], 10);
      }
    }

    return result;
  }

  // ============ GET5 INTEGRATION ============

  async getGet5Status(serverId: string): Promise<Get5Status | undefined> {
    const result = await this.executeRcon(serverId, 'get5_status');
    if (!result.success || !result.response) return undefined;

    try {
      // Get5 возвращает JSON
      const status = JSON.parse(result.response);
      return {
        pluginVersion: status.plugin_version || 'unknown',
        gamestate: status.gamestate || 'none',
        paused: status.paused || false,
        matchId: status.matchid || null,
        mapNumber: status.map_number || 0,
        team1: {
          name: status.team1?.name || 'Team 1',
          score: status.team1?.series_score || 0,
          ready: status.team1?.ready || false,
          side: status.team1?.side || 'ct',
        },
        team2: {
          name: status.team2?.name || 'Team 2',
          score: status.team2?.series_score || 0,
          ready: status.team2?.ready || false,
          side: status.team2?.side || 't',
        },
      };
    } catch {
      return undefined;
    }
  }

  async loadGet5Match(serverId: string, configUrl: string): Promise<RconResult> {
    return this.executeRcon(serverId, `get5_loadmatch_url "${configUrl}"`);
  }

  async endGet5Match(serverId: string): Promise<RconResult> {
    return this.executeRcon(serverId, 'get5_endmatch');
  }

  async forceReadyGet5(serverId: string): Promise<RconResult> {
    return this.executeRcon(serverId, 'get5_forceready');
  }

  async pauseGet5Match(serverId: string): Promise<RconResult> {
    return this.executeRcon(serverId, 'sm_pause');
  }

  async unpauseGet5Match(serverId: string): Promise<RconResult> {
    return this.executeRcon(serverId, 'sm_unpause');
  }

  // ============ MATCHZY INTEGRATION ============

  async getMatchZyStatus(serverId: string): Promise<any | undefined> {
    const result = await this.executeRcon(serverId, 'matchzy_status');
    if (!result.success || !result.response) return undefined;

    try {
      // MatchZy возвращает JSON статус
      const status = JSON.parse(result.response);
      return {
        pluginVersion: status.plugin_version || 'unknown',
        gamestate: status.matchzy_gamestate || status.gamestate || 'none',
        paused: status.is_paused || status.paused || false,
        matchId: status.matchid || null,
        mapNumber: status.map_number || 0,
        team1: {
          name: status.team1?.name || 'Team 1',
          score: status.team1?.score || 0,
          ready: status.team1?.ready || false,
          side: status.team1?.side || 'ct',
        },
        team2: {
          name: status.team2?.name || 'Team 2',
          score: status.team2?.score || 0,
          ready: status.team2?.ready || false,
          side: status.team2?.side || 't',
        },
      };
    } catch {
      return undefined;
    }
  }

  async loadMatchZyMatch(serverId: string, configUrl: string): Promise<RconResult> {
    return this.executeRcon(serverId, `matchzy_loadmatch_url "${configUrl}"`);
  }

  async endMatchZyMatch(serverId: string): Promise<RconResult> {
    return this.executeRcon(serverId, 'matchzy_endmatch');
  }

  async forceReadyMatchZy(serverId: string): Promise<RconResult> {
    return this.executeRcon(serverId, 'matchzy_forceready');
  }

  async pauseMatchZyMatch(serverId: string): Promise<RconResult> {
    return this.executeRcon(serverId, 'matchzy_pause');
  }

  async unpauseMatchZyMatch(serverId: string): Promise<RconResult> {
    return this.executeRcon(serverId, 'matchzy_unpause');
  }

  async restoreMatchZyMatch(serverId: string, round: number): Promise<RconResult> {
    return this.executeRcon(serverId, `matchzy_restore ${round}`);
  }

  async setMatchZyTeamName(serverId: string, team: 1 | 2, name: string): Promise<RconResult> {
    return this.executeRcon(serverId, `matchzy_team${team}_name "${name}"`);
  }

  // Universal method - works with both MatchZy and Get5
  async loadMatch(serverId: string, configUrl: string, plugin: 'matchzy' | 'get5' = 'matchzy'): Promise<RconResult> {
    if (plugin === 'matchzy') {
      return this.loadMatchZyMatch(serverId, configUrl);
    } else {
      return this.loadGet5Match(serverId, configUrl);
    }
  }

  async endMatch(serverId: string, plugin: 'matchzy' | 'get5' = 'matchzy'): Promise<RconResult> {
    if (plugin === 'matchzy') {
      return this.endMatchZyMatch(serverId);
    } else {
      return this.endGet5Match(serverId);
    }
  }

  async getMatchStatus(serverId: string, plugin: 'matchzy' | 'get5' = 'matchzy'): Promise<any | undefined> {
    if (plugin === 'matchzy') {
      return this.getMatchZyStatus(serverId);
    } else {
      return this.getGet5Status(serverId);
    }
  }

  // ============ SERVER LIFECYCLE ============

  async reserveServer(matchId: string, duration: number = 7200000): Promise<Server | null> {
    const server = await findIdleServer();
    if (!server) return null;

    const reservedUntil = new Date(Date.now() + duration);
    await updateServerStatus(server.id, 'RESERVED', matchId, reservedUntil);

    this.emit('server:reserved', { serverId: server.id, matchId });
    return server;
  }

  async releaseServer(serverId: string): Promise<boolean> {
    const server = await findServerById(serverId);
    if (!server) return false;

    // Завершить Get5 матч если есть
    await this.endGet5Match(serverId);

    // Выгнать всех игроков
    await this.executeRcon(serverId, 'kickall');

    // Вернуть на дефолтную карту
    await this.executeRcon(serverId, 'changelevel de_dust2');

    // Обновить статус
    await updateServerStatus(serverId, 'IDLE', null, null);

    this.emit('server:released', { serverId });
    return true;
  }

  async setServerStatus(serverId: string, status: ServerStatus): Promise<boolean> {
    const server = await findServerById(serverId);
    if (!server) return false;

    await updateServerStatus(serverId, status, server.current_match_id, server.reserved_until);
    this.emit('server:status_changed', { serverId, status });
    return true;
  }

  async prepareServerForMatch(serverId: string, map: string): Promise<boolean> {
    try {
      // Загрузить карту
      await this.executeRcon(serverId, `changelevel ${map}`);

      // Подождать загрузки карты
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Выполнить конфиги
      await this.executeRcon(serverId, 'exec server.cfg');
      await this.executeRcon(serverId, 'exec gamemode_competitive.cfg');

      await updateServerStatus(serverId, 'LOADING');
      return true;
    } catch (error) {
      console.error(`Failed to prepare server ${serverId}:`, error);
      return false;
    }
  }

  // ============ QUEUE MANAGEMENT ============

  async getQueueSize(): Promise<number> {
    try {
      const queueData = await redis.get('matchmaking:queue');
      if (!queueData) return 0;
      const queue = JSON.parse(queueData);
      return Array.isArray(queue) ? queue.length : 0;
    } catch {
      return 0;
    }
  }

  // ============ PORT MANAGEMENT ============

  allocatePort(): number | null {
    for (let port = this.portPool.start; port <= this.portPool.end; port++) {
      if (!this.portPool.reserved.has(port)) {
        this.portPool.reserved.add(port);
        return port;
      }
    }
    return null;
  }

  releasePort(port: number): void {
    this.portPool.reserved.delete(port);
  }

  // ============ SERVER REGISTRATION ============

  async registerServer(config: GameServerConfig): Promise<Server> {
    const server = await createServer(
      config.name,
      config.ip,
      config.port,
      config.rconPassword
    );

    this.portPool.reserved.add(config.port);

    // Проверить соединение
    const isOnline = await this.checkServerHealth(server.id);
    if (!isOnline) {
      await markServerOffline(server.id);
    }

    this.emit('server:registered', { serverId: server.id });
    return server;
  }

  // ============ HEALTH CHECKS ============

  async checkServerHealth(serverId: string): Promise<boolean> {
    try {
      const server = await findServerById(serverId);
      if (!server) return false;

      const result = await this.executeRcon(serverId, 'status');
      if (result.success) {
        await updateServerHeartbeat(serverId);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async checkAllServersHealth(): Promise<Map<string, boolean>> {
    const servers = await getAllServers();
    const results = new Map<string, boolean>();

    await Promise.all(
      servers.map(async (server) => {
        const isHealthy = await this.checkServerHealth(server.id);
        results.set(server.id, isHealthy);

        if (!isHealthy && server.status !== 'OFFLINE') {
          await markServerOffline(server.id);
          this.emit('server:offline', { serverId: server.id });
        } else if (isHealthy && server.status === 'OFFLINE') {
          await updateServerStatus(server.id, 'IDLE');
          this.emit('server:online', { serverId: server.id });
        }
      })
    );

    return results;
  }

  // ============ METRICS ============

  async collectServerMetrics(serverId: string): Promise<ServerMetrics | null> {
    const server = await findServerById(serverId);
    if (!server) return null;

    try {
      const [statusResult, statsResult] = await Promise.all([
        this.executeRcon(serverId, 'status'),
        this.executeRcon(serverId, 'stats'),
      ]);

      if (!statusResult.success) return null;

      const stats = this.parseStatusOutput(statusResult.response || '');
      const performanceStats = this.parseStatsOutput(statsResult.response || '');

      const metrics: ServerMetrics = {
        serverId,
        timestamp: new Date(),
        playerCount: stats.playerCount,
        cpu: performanceStats.cpu,
        memory: performanceStats.mem,
        tickrate: stats.tickrate,
        var: performanceStats.var,
        ping: performanceStats.ping,
        loss: performanceStats.loss,
        choke: performanceStats.choke,
      };

      // Сохранить метрики (последние 60 записей = 1 час при интервале 1 минута)
      const serverMetrics = this.serverMetrics.get(serverId) || [];
      serverMetrics.push(metrics);
      if (serverMetrics.length > 60) {
        serverMetrics.shift();
      }
      this.serverMetrics.set(serverId, serverMetrics);

      return metrics;
    } catch {
      return null;
    }
  }

  private parseStatsOutput(output: string): {
    cpu: number;
    mem: number;
    var: number;
    ping: number;
    loss: number;
    choke: number;
  } {
    const result = { cpu: 0, mem: 0, var: 0, ping: 0, loss: 0, choke: 0 };

    const lines = output.split('\n');
    for (const line of lines) {
      // CPU, mem, var в формате: "CPU   In    Out   Uptime  Maps   FPS   Players  Svms    +-ms   ~tick"
      const values = line.trim().split(/\s+/);
      if (values.length >= 6 && !isNaN(parseFloat(values[0]))) {
        result.cpu = parseFloat(values[0]) || 0;
      }
    }

    return result;
  }

  getServerMetricsHistory(serverId: string): ServerMetrics[] {
    return this.serverMetrics.get(serverId) || [];
  }

  // ============ BULK COMMANDS ============

  async executeRconOnAll(command: string): Promise<Map<string, RconResult>> {
    const servers = await getAllServers();
    const results = new Map<string, RconResult>();

    await Promise.all(
      servers.map(async (server) => {
        const result = await this.executeRcon(server.id, command);
        results.set(server.id, result);
      })
    );

    return results;
  }

  async kickAllPlayers(serverId: string): Promise<RconResult> {
    return this.executeRcon(serverId, 'kickall');
  }

  async changeMap(serverId: string, mapName: string): Promise<RconResult> {
    return this.executeRcon(serverId, `changelevel ${mapName}`);
  }

  async restartMatch(serverId: string): Promise<RconResult> {
    return this.executeRcon(serverId, 'mp_restartgame 1');
  }

  // ============ CONNECTED PLAYERS ============

  async getConnectedPlayers(serverId: string): Promise<string[]> {
    const result = await this.executeRcon(serverId, 'status');
    if (!result.success || !result.response) return [];

    const steamIds: string[] = [];
    const lines = result.response.split('\n');

    for (const line of lines) {
      // STEAM_X:Y:Z формат
      const steamMatch = line.match(/STEAM_\d:\d:\d+/);
      if (steamMatch) {
        steamIds.push(steamMatch[0]);
      }

      // [U:1:XXXXX] формат
      const steam3Match = line.match(/\[U:\d:\d+\]/);
      if (steam3Match) {
        steamIds.push(steam3Match[0]);
      }
    }

    return steamIds;
  }

  // ============ LIFECYCLE ============

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.emit('manager:started');
    console.log('GameServerManager started');
  }

  stop(): void {
    if (!this.isRunning) return;

    // Закрыть все RCON соединения
    for (const [key, rcon] of this.rconConnections) {
      rcon.disconnect();
    }
    this.rconConnections.clear();

    this.isRunning = false;
    this.emit('manager:stopped');
    console.log('GameServerManager stopped');
  }
}

export const gameServerManager = GameServerManager.getInstance();
