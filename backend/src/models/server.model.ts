import { query, queryOne } from '../config/database';
import { Server, ServerStatus } from '../types';

export async function findIdleServer(): Promise<Server | null> {
  return queryOne<Server>(
    `SELECT * FROM servers
     WHERE status = 'IDLE'
     ORDER BY last_heartbeat DESC NULLS LAST
     LIMIT 1`
  );
}

export async function findServerById(id: string): Promise<Server | null> {
  return queryOne<Server>(
    'SELECT * FROM servers WHERE id = $1',
    [id]
  );
}

export async function getAllServers(): Promise<Server[]> {
  return query<Server>('SELECT * FROM servers ORDER BY name');
}

export async function updateServerStatus(
  serverId: string,
  status: ServerStatus,
  matchId?: string | null,
  reservedUntil?: Date | null
): Promise<Server | null> {
  return queryOne<Server>(
    `UPDATE servers
     SET status = $2,
         current_match_id = $3,
         reserved_until = $4,
         last_heartbeat = NOW()
     WHERE id = $1
     RETURNING *`,
    [serverId, status, matchId || null, reservedUntil || null]
  );
}

export async function updateServerHeartbeat(serverId: string): Promise<void> {
  await query(
    'UPDATE servers SET last_heartbeat = NOW() WHERE id = $1',
    [serverId]
  );
}

export async function markServerOffline(serverId: string): Promise<void> {
  await query(
    `UPDATE servers SET status = 'OFFLINE' WHERE id = $1`,
    [serverId]
  );
}

export async function createServer(
  name: string,
  ip: string,
  port: number,
  rconPassword: string,
  internalIp?: string
): Promise<Server> {
  const rows = await query<Server>(
    `INSERT INTO servers (name, ip, port, rcon_password, internal_ip)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, ip, port, rconPassword, internalIp || null]
  );
  return rows[0];
}

export async function findServerByIpPort(ip: string, port: number): Promise<Server | null> {
  return queryOne<Server>(
    'SELECT * FROM servers WHERE ip = $1 AND port = $2',
    [ip, port]
  );
}

export async function getExpiredReservations(): Promise<Server[]> {
  return query<Server>(
    `SELECT * FROM servers
     WHERE status = 'RESERVED'
     AND reserved_until < NOW()`
  );
}
