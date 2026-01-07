import { EventEmitter } from 'events';
import {
  ServerMetrics,
  ServerEvent,
  ServerLog,
} from './types';
import { gameServerManager } from './manager';
import { getAllServers, updateServerStatus, markServerOffline } from '../../models/server.model';
import { Server, ServerStatus } from '../../types';
import { io } from '../../index';

interface AlertRule {
  id: string;
  name: string;
  metric: keyof ServerMetrics;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  duration: number; // как долго условие должно выполняться (мс)
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
}

interface Alert {
  id: string;
  ruleId: string;
  serverId: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

class ServerMonitor extends EventEmitter {
  private static instance: ServerMonitor;
  private metricsInterval: NodeJS.Timeout | null = null;
  private healthInterval: NodeJS.Timeout | null = null;
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private serverLogs: Map<string, ServerLog[]> = new Map();
  private metricsHistory: Map<string, ServerMetrics[]> = new Map();
  private isRunning: boolean = false;

  private readonly METRICS_INTERVAL = 60000; // 1 минута
  private readonly HEALTH_INTERVAL = 30000; // 30 секунд
  private readonly OFFLINE_THRESHOLD = 90000; // 1.5 минуты
  private readonly MAX_LOGS_PER_SERVER = 1000;
  private readonly MAX_METRICS_HISTORY = 1440; // 24 часа при 1 мин интервале

  private constructor() {
    super();
    this.initDefaultAlertRules();
  }

  static getInstance(): ServerMonitor {
    if (!ServerMonitor.instance) {
      ServerMonitor.instance = new ServerMonitor();
    }
    return ServerMonitor.instance;
  }

  private initDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high-cpu',
        name: 'High CPU Usage',
        metric: 'cpu',
        operator: 'gt',
        threshold: 90,
        duration: 300000, // 5 минут
        severity: 'high',
        enabled: true,
      },
      {
        id: 'high-var',
        name: 'High Server Variance',
        metric: 'var',
        operator: 'gt',
        threshold: 5,
        duration: 60000, // 1 минута
        severity: 'medium',
        enabled: true,
      },
      {
        id: 'low-tickrate',
        name: 'Low Tickrate',
        metric: 'tickrate',
        operator: 'lt',
        threshold: 60,
        duration: 30000, // 30 секунд
        severity: 'critical',
        enabled: true,
      },
      {
        id: 'high-packet-loss',
        name: 'High Packet Loss',
        metric: 'loss',
        operator: 'gt',
        threshold: 5,
        duration: 60000,
        severity: 'medium',
        enabled: true,
      },
    ];

    for (const rule of defaultRules) {
      this.alertRules.set(rule.id, rule);
    }
  }

  // ============ LIFECYCLE ============

  start(): void {
    if (this.isRunning) {
      console.log('ServerMonitor already running');
      return;
    }

    console.log('Starting ServerMonitor');
    this.isRunning = true;

    // Запустить сбор метрик
    this.metricsInterval = setInterval(async () => {
      await this.collectAllMetrics();
    }, this.METRICS_INTERVAL);

    // Запустить health checks
    this.healthInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.HEALTH_INTERVAL);

    // Первоначальный сбор
    setTimeout(() => {
      this.collectAllMetrics().catch(console.error);
      this.performHealthChecks().catch(console.error);
    }, 5000);

    this.emit('monitor:started');
  }

  stop(): void {
    if (!this.isRunning) return;

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }

    this.isRunning = false;
    this.emit('monitor:stopped');
    console.log('ServerMonitor stopped');
  }

  // ============ METRICS COLLECTION ============

  async collectAllMetrics(): Promise<void> {
    const servers = await getAllServers();

    await Promise.all(
      servers.map(async (server) => {
        if (server.status === 'OFFLINE') return;

        try {
          const metrics = await gameServerManager.collectServerMetrics(server.id);
          if (metrics) {
            this.storeMetrics(server.id, metrics);
            this.checkAlertRules(server.id, metrics);
            this.emit('metrics:collected', { serverId: server.id, metrics });
          }
        } catch (error) {
          this.log(server.id, 'error', `Failed to collect metrics: ${error}`);
        }
      })
    );
  }

  private storeMetrics(serverId: string, metrics: ServerMetrics): void {
    const history = this.metricsHistory.get(serverId) || [];
    history.push(metrics);

    // Ограничить историю
    if (history.length > this.MAX_METRICS_HISTORY) {
      history.shift();
    }

    this.metricsHistory.set(serverId, history);
  }

  getMetricsHistory(serverId: string, limit?: number): ServerMetrics[] {
    const history = this.metricsHistory.get(serverId) || [];
    if (limit && limit < history.length) {
      return history.slice(-limit);
    }
    return history;
  }

  getLatestMetrics(serverId: string): ServerMetrics | null {
    const history = this.metricsHistory.get(serverId);
    if (!history || history.length === 0) return null;
    return history[history.length - 1];
  }

  // ============ HEALTH CHECKS ============

  async performHealthChecks(): Promise<void> {
    const servers = await getAllServers();
    const now = Date.now();

    for (const server of servers) {
      try {
        const isOnline = await gameServerManager.checkServerHealth(server.id);

        if (isOnline) {
          // Сервер онлайн
          if (server.status === 'OFFLINE') {
            await updateServerStatus(server.id, 'IDLE');
            this.log(server.id, 'info', 'Server came back online');
            this.emit('server:online', { serverId: server.id });
            this.broadcastServerStatus(server.id, 'IDLE');
          }
        } else {
          // Сервер не отвечает
          const lastHeartbeat = server.last_heartbeat
            ? new Date(server.last_heartbeat).getTime()
            : 0;
          const timeSinceHeartbeat = now - lastHeartbeat;

          if (timeSinceHeartbeat > this.OFFLINE_THRESHOLD && server.status !== 'OFFLINE') {
            await markServerOffline(server.id);
            this.log(server.id, 'error', `Server went offline (no heartbeat for ${Math.round(timeSinceHeartbeat / 1000)}s)`);
            this.emit('server:offline', { serverId: server.id });
            this.broadcastServerStatus(server.id, 'OFFLINE');

            // Создать критический алерт
            this.createAlert({
              ruleId: 'server-offline',
              serverId: server.id,
              message: `Server ${server.name} is offline`,
              severity: 'critical',
            });
          }
        }
      } catch (error) {
        this.log(server.id, 'error', `Health check error: ${error}`);
      }
    }
  }

  private broadcastServerStatus(serverId: string, status: ServerStatus): void {
    try {
      io.emit('server:status_changed', { serverId, status });
    } catch {
      // Socket.io может быть не инициализирован
    }
  }

  // ============ ALERT SYSTEM ============

  private checkAlertRules(serverId: string, metrics: ServerMetrics): void {
    for (const [ruleId, rule] of this.alertRules) {
      if (!rule.enabled) continue;

      const value = metrics[rule.metric];
      if (typeof value !== 'number') continue;

      const isTriggered = this.evaluateCondition(value, rule.operator, rule.threshold);
      const alertKey = `${serverId}:${ruleId}`;
      const existingAlert = this.activeAlerts.get(alertKey);

      if (isTriggered) {
        if (!existingAlert) {
          this.createAlert({
            ruleId: rule.id,
            serverId,
            message: `${rule.name}: ${rule.metric} is ${value} (threshold: ${rule.threshold})`,
            severity: rule.severity,
          });
        }
      } else if (existingAlert && !existingAlert.resolved) {
        this.resolveAlert(alertKey);
      }
    }
  }

  private evaluateCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'eq': return value === threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      default: return false;
    }
  }

  createAlert(params: {
    ruleId: string;
    serverId: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }): Alert {
    const alert: Alert = {
      id: `${params.serverId}:${params.ruleId}:${Date.now()}`,
      ruleId: params.ruleId,
      serverId: params.serverId,
      message: params.message,
      severity: params.severity,
      timestamp: new Date(),
      resolved: false,
    };

    const alertKey = `${params.serverId}:${params.ruleId}`;
    this.activeAlerts.set(alertKey, alert);

    this.log(params.serverId, 'warn', `Alert: ${params.message}`);
    this.emit('alert:created', alert);

    // Broadcast to admin
    try {
      io.emit('admin:alert', alert);
    } catch {
      // Socket.io может быть не инициализирован
    }

    return alert;
  }

  resolveAlert(alertKey: string): void {
    const alert = this.activeAlerts.get(alertKey);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      this.emit('alert:resolved', alert);
    }
  }

  getActiveAlerts(serverId?: string): Alert[] {
    const alerts = Array.from(this.activeAlerts.values())
      .filter(a => !a.resolved);

    if (serverId) {
      return alerts.filter(a => a.serverId === serverId);
    }
    return alerts;
  }

  // ============ ALERT RULES MANAGEMENT ============

  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    this.emit('alert_rule:added', rule);
  }

  removeAlertRule(ruleId: string): boolean {
    const deleted = this.alertRules.delete(ruleId);
    if (deleted) {
      this.emit('alert_rule:removed', { ruleId });
    }
    return deleted;
  }

  updateAlertRule(ruleId: string, updates: Partial<AlertRule>): AlertRule | null {
    const rule = this.alertRules.get(ruleId);
    if (!rule) return null;

    const updated = { ...rule, ...updates };
    this.alertRules.set(ruleId, updated);
    this.emit('alert_rule:updated', updated);
    return updated;
  }

  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  // ============ LOGGING ============

  log(serverId: string, level: 'info' | 'warn' | 'error', message: string, source?: string): void {
    const logEntry: ServerLog = {
      serverId,
      level,
      message,
      timestamp: new Date(),
      source,
    };

    const logs = this.serverLogs.get(serverId) || [];
    logs.push(logEntry);

    // Ограничить количество логов
    if (logs.length > this.MAX_LOGS_PER_SERVER) {
      logs.shift();
    }

    this.serverLogs.set(serverId, logs);
    this.emit('log', logEntry);

    // Console output
    const prefix = `[${serverId.substring(0, 8)}]`;
    switch (level) {
      case 'error':
        console.error(`${prefix} ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} ${message}`);
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  }

  getLogs(serverId: string, options?: {
    level?: 'info' | 'warn' | 'error';
    limit?: number;
    since?: Date;
  }): ServerLog[] {
    let logs = this.serverLogs.get(serverId) || [];

    if (options?.level) {
      logs = logs.filter(l => l.level === options.level);
    }

    if (options?.since) {
      logs = logs.filter(l => l.timestamp >= options.since!);
    }

    if (options?.limit && options.limit < logs.length) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  clearLogs(serverId: string): void {
    this.serverLogs.delete(serverId);
  }

  // ============ EVENTS ============

  recordEvent(event: ServerEvent): void {
    this.log(event.serverId, 'info', `Event: ${event.type} - ${event.message}`, 'event');
    this.emit('server:event', event);
  }

  // ============ STATISTICS ============

  async getStatistics(): Promise<{
    totalServers: number;
    onlineServers: number;
    offlineServers: number;
    inGameServers: number;
    totalPlayers: number;
    avgTickrate: number;
    avgCpu: number;
    activeAlerts: number;
  }> {
    const servers = await getAllServers();
    const onlineServers = servers.filter(s => s.status !== 'OFFLINE');

    let totalPlayers = 0;
    let totalTickrate = 0;
    let totalCpu = 0;
    let metricsCount = 0;

    for (const server of onlineServers) {
      const metrics = this.getLatestMetrics(server.id);
      if (metrics) {
        totalPlayers += metrics.playerCount;
        totalTickrate += metrics.tickrate;
        totalCpu += metrics.cpu;
        metricsCount++;
      }
    }

    return {
      totalServers: servers.length,
      onlineServers: onlineServers.length,
      offlineServers: servers.filter(s => s.status === 'OFFLINE').length,
      inGameServers: servers.filter(s => s.status === 'IN_GAME').length,
      totalPlayers,
      avgTickrate: metricsCount > 0 ? Math.round(totalTickrate / metricsCount) : 0,
      avgCpu: metricsCount > 0 ? Math.round(totalCpu / metricsCount) : 0,
      activeAlerts: this.getActiveAlerts().length,
    };
  }
}

export const serverMonitor = ServerMonitor.getInstance();
