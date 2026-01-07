import { query, queryOne } from '../config/database';
import { Match, MatchPlayer, MatchStatus, User } from '../types';

export async function createMatch(
  serverId: string,
  matchType: 'matchmaking' | 'custom',
  map: string,
  createdBy?: string,
  lobbyCode?: string
): Promise<Match> {
  const lobbyExpiresAt = matchType === 'custom'
    ? new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    : null;

  const reservedUntil = matchType === 'custom'
    ? new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours
    : null;

  const rows = await query<Match>(
    `INSERT INTO matches (server_id, match_type, map, created_by, lobby_code, lobby_expires_at, reserved_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [serverId, matchType, map, createdBy || null, lobbyCode || null, lobbyExpiresAt, reservedUntil]
  );
  return rows[0];
}

export async function findMatchById(id: string): Promise<Match | null> {
  return queryOne<Match>(
    'SELECT * FROM matches WHERE id = $1',
    [id]
  );
}

export async function findMatchByLobbyCode(code: string): Promise<Match | null> {
  return queryOne<Match>(
    `SELECT * FROM matches WHERE lobby_code = $1 AND status IN ('waiting', 'live') ORDER BY created_at DESC LIMIT 1`,
    [code]
  );
}

export async function updateMatchStatus(matchId: string, status: MatchStatus): Promise<Match | null> {
  const updates: string[] = ['status = $2'];

  if (status === 'live') {
    updates.push('started_at = NOW()');
  } else if (status === 'finished' || status === 'cancelled') {
    updates.push('ended_at = NOW()');
  }

  return queryOne<Match>(
    `UPDATE matches SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    [matchId, status]
  );
}

export async function updateMatchScore(
  matchId: string,
  team1Score: number,
  team2Score: number
): Promise<Match | null> {
  return queryOne<Match>(
    `UPDATE matches SET team1_score = $2, team2_score = $3 WHERE id = $1 RETURNING *`,
    [matchId, team1Score, team2Score]
  );
}

export async function addMatchPlayer(
  matchId: string,
  userId: string,
  team: 1 | 2
): Promise<MatchPlayer> {
  const rows = await query<MatchPlayer>(
    `INSERT INTO match_players (match_id, user_id, team)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [matchId, userId, team]
  );
  return rows[0];
}

export async function getMatchPlayers(matchId: string): Promise<MatchPlayer[]> {
  return query<MatchPlayer>(
    'SELECT * FROM match_players WHERE match_id = $1',
    [matchId]
  );
}

export async function updatePlayerConnected(
  matchId: string,
  userId: string,
  connected: boolean
): Promise<void> {
  await query(
    `UPDATE match_players
     SET connected = $3, connected_at = CASE WHEN $3 THEN NOW() ELSE connected_at END
     WHERE match_id = $1 AND user_id = $2`,
    [matchId, userId, connected]
  );
}

export async function updatePlayerStats(
  matchId: string,
  userId: string,
  kills: number,
  deaths: number,
  assists: number
): Promise<void> {
  await query(
    `UPDATE match_players
     SET kills = $3, deaths = $4, assists = $5
     WHERE match_id = $1 AND user_id = $2`,
    [matchId, userId, kills, deaths, assists]
  );
}

export async function getExpiredLobbies(): Promise<Match[]> {
  return query<Match>(
    `SELECT * FROM matches
     WHERE match_type = 'custom'
     AND status = 'waiting'
     AND lobby_expires_at < NOW()`
  );
}

export async function getActiveMatches(): Promise<Match[]> {
  return query<Match>(
    `SELECT * FROM matches WHERE status IN ('waiting', 'live') ORDER BY created_at DESC`
  );
}

export async function getUserMatchHistory(userId: string, limit: number = 20): Promise<Match[]> {
  return query<Match>(
    `SELECT m.* FROM matches m
     JOIN match_players mp ON m.id = mp.match_id
     WHERE mp.user_id = $1 AND m.status = 'finished'
     ORDER BY m.ended_at DESC
     LIMIT $2`,
    [userId, limit]
  );
}

export async function getMatchWithPlayers(matchId: string): Promise<{match: Match; players: (MatchPlayer & {user: User})[]} | null> {
  const match = await findMatchById(matchId);
  if (!match) return null;

  const players = await query<MatchPlayer & {user: User}>(
    `SELECT mp.*,
            json_build_object(
              'id', u.id,
              'steam_id', u.steam_id,
              'username', u.username,
              'avatar_url', u.avatar_url,
              'mmr', u.mmr
            ) as user
     FROM match_players mp
     JOIN users u ON mp.user_id = u.id
     WHERE mp.match_id = $1`,
    [matchId]
  );

  return { match, players };
}

export async function countPlayersInMatch(matchId: string): Promise<number> {
  const result = await queryOne<{count: string}>(
    'SELECT COUNT(*) as count FROM match_players WHERE match_id = $1',
    [matchId]
  );
  return parseInt(result?.count || '0', 10);
}

export async function removePlayerFromMatch(matchId: string, userId: string): Promise<void> {
  await query(
    'DELETE FROM match_players WHERE match_id = $1 AND user_id = $2',
    [matchId, userId]
  );
}

export function generateLobbyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
