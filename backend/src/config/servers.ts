import dotenv from 'dotenv';

dotenv.config();

export interface ServerConfig {
  name: string;
  ip: string;
  port: number;
  rconPassword: string;
}

export function loadServersFromEnv(): ServerConfig[] {
  const servers: ServerConfig[] = [];
  let index = 1;

  while (process.env[`SERVER_${index}_IP`]) {
    servers.push({
      name: process.env[`SERVER_${index}_NAME`] || `Server #${index}`,
      ip: process.env[`SERVER_${index}_IP`]!,
      port: parseInt(process.env[`SERVER_${index}_PORT`] || '27015', 10),
      rconPassword: process.env[`SERVER_${index}_RCON`] || '',
    });
    index++;
  }

  return servers;
}

export const gameServers = loadServersFromEnv();

console.log(`Loaded ${gameServers.length} game servers from environment`);
