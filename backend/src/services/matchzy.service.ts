import { User, MapName, MAP_POOL } from '../types';

// MatchZy Match Configuration
export interface MatchZyConfig {
  matchid: string;
  team1: MatchZyTeam;
  team2: MatchZyTeam;
  num_maps: number;
  maplist: string[];
  map_sides: string[];
  clinch_series: boolean;
  players_per_team: number;
  cvars: Record<string, string>;
}

export interface MatchZyTeam {
  id: string;
  name: string;
  players: Record<string, string>; // steamid64 -> name
}

// MatchZy Event Types
export interface MatchZyEvent {
  event: string;
  matchid: string;
  [key: string]: any;
}

export interface MatchZyMatchStartEvent extends MatchZyEvent {
  event: 'match_start' | 'series_start';
  map_number: number;
  map_name: string;
}

export interface MatchZyRoundEndEvent extends MatchZyEvent {
  event: 'round_end';
  round_number: number;
  round_winner: 'team1' | 'team2' | 'ct' | 't';
  team1_score: number;
  team2_score: number;
  reason: number;
}

export interface MatchZyPlayerDeathEvent extends MatchZyEvent {
  event: 'player_death';
  attacker: MatchZyPlayer;
  victim: MatchZyPlayer;
  weapon: string;
  headshot: boolean;
  penetrated: boolean;
  thrusmoke: boolean;
  noscope: boolean;
  attackerblind: boolean;
}

export interface MatchZyPlayer {
  steamid: string;
  name: string;
  team: 'team1' | 'team2' | 'ct' | 't';
  side?: 'ct' | 't';
}

export interface MatchZyPlayerConnectEvent extends MatchZyEvent {
  event: 'player_connect';
  player: MatchZyPlayer;
}

export interface MatchZyPlayerDisconnectEvent extends MatchZyEvent {
  event: 'player_disconnect';
  player: MatchZyPlayer;
}

export interface MatchZyMatchEndEvent extends MatchZyEvent {
  event: 'match_end' | 'series_end';
  team1_score: number;
  team2_score: number;
  winner: 'team1' | 'team2' | 'none';
  time_until_restore?: number;
}

export interface MatchZyMapResultEvent extends MatchZyEvent {
  event: 'map_result';
  map_number: number;
  map_name: string;
  team1_score: number;
  team2_score: number;
  winner: 'team1' | 'team2';
}

export interface MatchZyPlayerStatsEvent extends MatchZyEvent {
  event: 'round_stats_update' | 'map_stats_update';
  player: MatchZyPlayer;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  headshots: number;
  flash_assists: number;
  utility_damage: number;
  enemies_flashed: number;
  adr?: number;
}

// Generate MatchZy configuration for a match
export function generateMatchZyConfig(
  matchId: string,
  team1: User[],
  team2: User[],
  mapName: MapName
): MatchZyConfig {
  const webhookUrl = process.env.MATCHZY_WEBHOOK_URL || process.env.API_URL + '/api/webhook/matchzy';
  const apiKey = process.env.MATCHZY_API_KEY || process.env.GET5_API_KEY || 'faceit-tj-secret';

  return {
    matchid: matchId,
    team1: {
      id: 'team1',
      name: 'Counter-Terrorists',
      players: team1.reduce((acc, user) => {
        acc[user.steam_id] = user.username;
        return acc;
      }, {} as Record<string, string>),
    },
    team2: {
      id: 'team2',
      name: 'Terrorists',
      players: team2.reduce((acc, user) => {
        acc[user.steam_id] = user.username;
        return acc;
      }, {} as Record<string, string>),
    },
    num_maps: 1,
    maplist: [mapName],
    map_sides: ['knife'], // knife round for side selection
    clinch_series: true,
    players_per_team: 5,
    cvars: {
      // MatchZy specific CVARs
      'matchzy_remote_log_url': webhookUrl,
      'matchzy_remote_log_header_key': 'x-matchzy-key',
      'matchzy_remote_log_header_value': apiKey,
      // Match settings
      'mp_maxrounds': '24',
      'mp_overtime_enable': '1',
      'mp_overtime_maxrounds': '6',
      'sv_coaching_enabled': '0',
      // Game settings
      'mp_team_timeout_time': '30',
      'mp_team_timeout_max': '2',
      'sv_damage_print_enable': '0',
    },
  };
}

// Convert Steam ID formats
export function convertSteamId(steamId: string): string {
  // If already in 64-bit format
  if (steamId.match(/^7656119\d{10}$/)) {
    return steamId;
  }

  // Convert STEAM_X:Y:Z format to 64-bit
  const match = steamId.match(/^STEAM_(\d):(\d):(\d+)$/);
  if (match) {
    const y = parseInt(match[2]);
    const z = parseInt(match[3]);
    const id64 = BigInt('76561197960265728') + BigInt(z * 2) + BigInt(y);
    return id64.toString();
  }

  // Convert [U:1:X] format to 64-bit
  const match2 = steamId.match(/^\[U:1:(\d+)\]$/);
  if (match2) {
    const id64 = BigInt('76561197960265728') + BigInt(match2[1]);
    return id64.toString();
  }

  return steamId;
}

// Validate map name
export function isValidMap(mapName: string): mapName is MapName {
  return MAP_POOL.includes(mapName as MapName);
}

// Select random map
export function selectRandomMap(): MapName {
  const randomIndex = Math.floor(Math.random() * MAP_POOL.length);
  return MAP_POOL[randomIndex];
}

// Get map display name
export function getMapDisplayName(mapName: MapName): string {
  const displayNames: Record<MapName, string> = {
    de_dust2: 'Dust II',
    de_mirage: 'Mirage',
    de_inferno: 'Inferno',
    de_nuke: 'Nuke',
    de_overpass: 'Overpass',
    de_ancient: 'Ancient',
  };
  return displayNames[mapName] || mapName;
}

// RCON commands for MatchZy
export const MATCHZY_COMMANDS = {
  loadMatch: (configUrl: string) => `matchzy_loadmatch_url "${configUrl}"`,
  endMatch: () => 'matchzy_endmatch',
  forceReady: () => 'matchzy_forceready',
  pause: () => 'matchzy_pause',
  unpause: () => 'matchzy_unpause',
  restart: () => 'mp_restartgame 1',
  getStatus: () => 'matchzy_status',
};
