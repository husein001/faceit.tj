export interface User {
  id: string;
  steam_id: string;
  username: string;
  avatar_url: string | null;
  mmr: number;
  is_premium: boolean;
  premium_until: Date | null;
  active_lobby_id: string | null;
  created_at: Date;
}

export interface PremiumRequest {
  id: string;
  user_id: string;
  phone_number: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  created_at: Date;
  processed_at: Date | null;
  processed_by: string | null;
}

export interface PremiumRequestWithUser extends PremiumRequest {
  user: User;
}

export interface Server {
  id: string;
  name: string;
  ip: string;
  port: number;
  rcon_password: string;
  status: ServerStatus;
  current_match_id: string | null;
  reserved_until: Date | null;
  last_heartbeat: Date | null;
  created_at: Date;
}

export type ServerStatus = 'IDLE' | 'RESERVED' | 'LOADING' | 'IN_GAME' | 'COOLDOWN' | 'OFFLINE';

export interface Match {
  id: string;
  server_id: string;
  match_type: 'matchmaking' | 'custom';
  status: MatchStatus;
  map: string;
  team1_score: number;
  team2_score: number;
  created_by: string | null;
  lobby_code: string | null;
  lobby_expires_at: Date | null;
  reserved_until: Date | null;
  started_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
}

export type MatchStatus = 'waiting' | 'live' | 'finished' | 'cancelled';

export interface MatchPlayer {
  id: string;
  match_id: string;
  user_id: string;
  team: 1 | 2;
  kills: number;
  deaths: number;
  assists: number;
  connected: boolean;
  connected_at: Date | null;
}

export interface QueuePlayer {
  userId: string;
  mmr: number;
  queuedAt: Date;
  region?: string;
}

export interface Get5Config {
  matchid: string;
  num_maps: number;
  maplist: string[];
  skip_veto: boolean;
  side_type: string;
  players_per_team: number;
  min_players_to_ready: number;
  team1: {
    name: string;
    players: Record<string, string>;
  };
  team2: {
    name: string;
    players: Record<string, string>;
  };
  cvars: Record<string, string | number>;
}

export interface Get5Event {
  event: string;
  matchid: string;
  [key: string]: any;
}

export interface JwtPayload {
  userId: string;
  steamId: string;
}

export interface BalancedTeams {
  team1: User[];
  team2: User[];
}

export const MAP_POOL = [
  'de_dust2',
  'de_mirage',
  'de_inferno',
  'de_nuke',
  'de_overpass',
  'de_ancient'
] as const;

export type MapName = typeof MAP_POOL[number];
