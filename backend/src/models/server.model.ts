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

export async function updateServer(
  id: string,
  data: { name?: string; ip?: string; port?: number; rconPassword?: string; internalIp?: string }
): Promise<Server | null> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.ip !== undefined) {
    updates.push(`ip = $${paramIndex++}`);
    values.push(data.ip);
  }
  if (data.port !== undefined) {
    updates.push(`port = $${paramIndex++}`);
    values.push(data.port);
  }
  if (data.rconPassword !== undefined) {
    updates.push(`rcon_password = $${paramIndex++}`);
    values.push(data.rconPassword);
  }
  if (data.internalIp !== undefined) {
    updates.push(`internal_ip = $${paramIndex++}`);
    values.push(data.internalIp);
  }

  if (updates.length === 0) return null;

  values.push(id);
  return queryOne<Server>(
    `UPDATE servers SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
}

export async function deleteServer(id: string): Promise<boolean> {
  const result = await query('DELETE FROM servers WHERE id = $1', [id]);
  return true;
}

export async function setServerOnline(id: string): Promise<Server | null> {
  return queryOne<Server>(
    `UPDATE servers SET status = 'IDLE', last_heartbeat = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
}

export async function setServerOffline(id: string): Promise<Server | null> {
  return queryOne<Server>(
    `UPDATE servers SET status = 'OFFLINE' WHERE id = $1 RETURNING *`,
    [id]
  );
}

// Find servers that are IN_GAME but their match is no longer active
export async function findStuckServers(): Promise<Server[]> {
  return query<Server>(
    `SELECT s.* FROM servers s
     LEFT JOIN matches m ON s.current_match_id = m.id
     WHERE s.status = 'IN_GAME'
     AND (
       s.current_match_id IS NULL
       OR m.id IS NULL
       OR m.status NOT IN ('waiting', 'live')
     )`
  );
}

// Find servers IN_GAME for more than X minutes with no active match
export async function findAbandonedServers(minutesThreshold: number = 5): Promise<Server[]> {
  return query<Server>(
    `SELECT s.* FROM servers s
     LEFT JOIN matches m ON s.current_match_id = m.id
     WHERE s.status = 'IN_GAME'
     AND s.last_heartbeat < NOW() - INTERVAL '${minutesThreshold} minutes'`
  );
}
