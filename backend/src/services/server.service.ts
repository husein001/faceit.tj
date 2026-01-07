import Rcon from 'rcon-srcds';
import { Server } from '../types';
import { findServerById, updateServerStatus, updateServerHeartbeat } from '../models/server.model';

const rconConnections: Map<string, Rcon> = new Map();

export async function getRconConnection(server: Server): Promise<Rcon> {
  // Используем internal_ip для RCON если задан (Docker IP), иначе внешний ip
  const rconHost = server.internal_ip || server.ip;
  const key = `${rconHost}:${server.port}`;

  if (rconConnections.has(key)) {
    const existing = rconConnections.get(key)!;
    if (existing.authenticated) {
      return existing;
    }
    // Connection is stale, remove it
    rconConnections.delete(key);
  }

  const rcon = new Rcon({
    host: rconHost,
    port: server.port,
    timeout: 5000,
  });

  try {
    await rcon.authenticate(server.rcon_password);
    rconConnections.set(key, rcon);
    return rcon;
  } catch (error) {
    throw new Error(`Failed to connect to RCON: ${error}`);
  }
}

export async function sendRconCommand(serverId: string, command: string): Promise<string> {
  const server = await findServerById(serverId);
  if (!server) {
    throw new Error('Server not found');
  }

  try {
    const rcon = await getRconConnection(server);
    const response = await rcon.execute(command);
    return response;
  } catch (error) {
    console.error(`RCON command failed for server ${serverId}:`, error);
    throw error;
  }
}

export async function kickAllPlayers(serverId: string): Promise<void> {
  await sendRconCommand(serverId, 'kickall');
}

export async function loadGet5Match(serverId: string, configUrl: string): Promise<void> {
  await sendRconCommand(serverId, `get5_loadmatch_url "${configUrl}"`);
}

export async function endGet5Match(serverId: string): Promise<void> {
  await sendRconCommand(serverId, 'get5_endmatch');
}

export async function checkServerStatus(serverId: string): Promise<boolean> {
  try {
    const server = await findServerById(serverId);
    if (!server) return false;

    const rcon = await getRconConnection(server);
    const response = await rcon.execute('status');

    // Update heartbeat on successful connection
    await updateServerHeartbeat(serverId);

    return response.includes('hostname');
  } catch (error) {
    console.error(`Server ${serverId} health check failed:`, error);
    return false;
  }
}

export async function getConnectedPlayers(serverId: string): Promise<string[]> {
  try {
    const response = await sendRconCommand(serverId, 'status');
    const lines = response.split('\n');
    const steamIds: string[] = [];

    // Parse status output for Steam IDs
    // Format: # userid name uniqueid connected ping loss state rate
    for (const line of lines) {
      const match = line.match(/STEAM_\d:\d:\d+/);
      if (match) {
        steamIds.push(match[0]);
      }
      // Also check for newer Steam ID format
      const match64 = line.match(/\[U:\d:\d+\]/);
      if (match64) {
        steamIds.push(match64[0]);
      }
    }

    return steamIds;
  } catch (error) {
    console.error('Failed to get connected players:', error);
    return [];
  }
}

export async function changeMap(serverId: string, mapName: string): Promise<void> {
  await sendRconCommand(serverId, `changelevel ${mapName}`);
}

export async function executeConfig(serverId: string, configName: string): Promise<void> {
  await sendRconCommand(serverId, `exec ${configName}`);
}

export function closeRconConnection(server: Server): void {
  const rconHost = server.internal_ip || server.ip;
  const key = `${rconHost}:${server.port}`;
  const rcon = rconConnections.get(key);
  if (rcon) {
    rcon.disconnect();
    rconConnections.delete(key);
  }
}

export function closeAllRconConnections(): void {
  for (const [key, rcon] of rconConnections) {
    rcon.disconnect();
  }
  rconConnections.clear();
}
