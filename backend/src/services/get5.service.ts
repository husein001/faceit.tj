import { Get5Config, User, MAP_POOL, MapName } from '../types';

export function generateGet5Config(
  matchId: string,
  team1: User[],
  team2: User[],
  mapName: MapName
): Get5Config {
  const team1Players: Record<string, string> = {};
  const team2Players: Record<string, string> = {};

  team1.forEach(player => {
    team1Players[player.steam_id] = player.username;
  });

  team2.forEach(player => {
    team2Players[player.steam_id] = player.username;
  });

  return {
    matchid: matchId,
    num_maps: 1,
    maplist: [mapName],
    skip_veto: true,
    side_type: 'standard',
    players_per_team: 5,
    min_players_to_ready: 5,
    team1: {
      name: 'Team 1',
      players: team1Players,
    },
    team2: {
      name: 'Team 2',
      players: team2Players,
    },
    cvars: {
      mp_teamname_1: 'Team 1',
      mp_teamname_2: 'Team 2',
      mp_overtime_enable: 1,
      mp_overtime_maxrounds: 6,
      mp_maxrounds: 24,
      sv_coaching_enabled: 0,
    },
  };
}

export function selectRandomMap(): MapName {
  const randomIndex = Math.floor(Math.random() * MAP_POOL.length);
  return MAP_POOL[randomIndex];
}

export function isValidMap(mapName: string): mapName is MapName {
  return MAP_POOL.includes(mapName as MapName);
}

export function getMapDisplayName(mapName: MapName): string {
  const displayNames: Record<MapName, string> = {
    de_dust2: 'Dust II',
    de_mirage: 'Mirage',
    de_inferno: 'Inferno',
    de_nuke: 'Nuke',
    de_overpass: 'Overpass',
    de_vertigo: 'Vertigo',
    de_ancient: 'Ancient',
  };
  return displayNames[mapName];
}

export function getMapImage(mapName: MapName): string {
  // These would be actual map preview images in production
  const mapImages: Record<MapName, string> = {
    de_dust2: '/maps/dust2.jpg',
    de_mirage: '/maps/mirage.jpg',
    de_inferno: '/maps/inferno.jpg',
    de_nuke: '/maps/nuke.jpg',
    de_overpass: '/maps/overpass.jpg',
    de_vertigo: '/maps/vertigo.jpg',
    de_ancient: '/maps/ancient.jpg',
  };
  return mapImages[mapName];
}
