import { query, queryOne } from '../config/database';
import { User } from '../types';
import { getInitialMMR } from '../services/faceit.service';

export async function findUserBySteamId(steamId: string): Promise<User | null> {
  return queryOne<User>(
    'SELECT * FROM users WHERE steam_id = $1',
    [steamId]
  );
}

export async function findUserById(id: string): Promise<User | null> {
  return queryOne<User>(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
}

export async function createUser(steamId: string, username: string, avatarUrl: string | null): Promise<User> {
  // Fetch initial MMR from Faceit (or default 1000)
  const initialMMR = await getInitialMMR(steamId);
  console.log(`Creating user ${username} with initial MMR: ${initialMMR}`);

  const rows = await query<User>(
    `INSERT INTO users (steam_id, username, avatar_url, mmr)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [steamId, username, avatarUrl, initialMMR]
  );
  return rows[0];
}

export async function updateUserMMR(userId: string, mmrChange: number): Promise<User | null> {
  return queryOne<User>(
    `UPDATE users SET mmr = mmr + $2 WHERE id = $1 RETURNING *`,
    [userId, mmrChange]
  );
}

export async function setUserActiveLobby(userId: string, lobbyId: string | null): Promise<void> {
  await query(
    'UPDATE users SET active_lobby_id = $2 WHERE id = $1',
    [userId, lobbyId]
  );
}

export async function checkUserPremium(userId: string): Promise<boolean> {
  const user = await queryOne<User>(
    'SELECT is_premium, premium_until FROM users WHERE id = $1',
    [userId]
  );

  if (!user) return false;
  if (!user.is_premium) return false;
  if (user.premium_until && new Date(user.premium_until) < new Date()) return false;

  return true;
}

export async function getUsersByIds(userIds: string[]): Promise<User[]> {
  if (userIds.length === 0) return [];

  const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');
  return query<User>(
    `SELECT * FROM users WHERE id IN (${placeholders})`,
    userIds
  );
}
