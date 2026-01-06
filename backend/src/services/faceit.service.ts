/**
 * Faceit API Service
 * Fetches player data from Faceit to get their Elo/Level for initial MMR
 */

interface FaceitPlayer {
  player_id: string;
  nickname: string;
  games: {
    cs2?: {
      skill_level: number;  // 1-10
      faceit_elo: number;   // ~100-3000+
    };
    csgo?: {
      skill_level: number;
      faceit_elo: number;
    };
  };
}

interface FaceitMMRResult {
  found: boolean;
  elo: number | null;
  level: number | null;
  convertedMMR: number;
  source: 'faceit_cs2' | 'faceit_csgo' | 'default';
}

const FACEIT_API_URL = 'https://open.faceit.com/data/v4';
const DEFAULT_MMR = 1000;

/**
 * Convert Faceit Elo to our MMR system
 * Faceit Elo ranges: ~100 (new) to ~3000+ (pro)
 * Our MMR: starts at 1000, similar scale
 */
function convertFaceitEloToMMR(faceitElo: number): number {
  // Faceit Elo is roughly similar to our MMR scale
  // Average players are around 1000-1500 Elo
  // We'll use it directly but ensure minimum of 500
  return Math.max(500, Math.round(faceitElo));
}

/**
 * Convert Faceit Level (1-10) to MMR as fallback
 */
function convertFaceitLevelToMMR(level: number): number {
  // Level 1: 500, Level 5: 1000, Level 10: 2000
  const mmrMap: Record<number, number> = {
    1: 500,
    2: 650,
    3: 800,
    4: 900,
    5: 1000,
    6: 1150,
    7: 1350,
    8: 1550,
    9: 1800,
    10: 2100,
  };
  return mmrMap[level] || DEFAULT_MMR;
}

/**
 * Fetch player data from Faceit API by Steam ID
 */
export async function getFaceitPlayerBySteamId(steamId: string): Promise<FaceitMMRResult> {
  const apiKey = process.env.FACEIT_API_KEY;

  if (!apiKey) {
    console.warn('FACEIT_API_KEY not set, using default MMR');
    return {
      found: false,
      elo: null,
      level: null,
      convertedMMR: DEFAULT_MMR,
      source: 'default',
    };
  }

  try {
    // Try CS2 first
    let response = await fetch(
      `${FACEIT_API_URL}/players?game=cs2&game_player_id=${steamId}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      }
    );

    // If not found in CS2, try CSGO
    if (response.status === 404) {
      response = await fetch(
        `${FACEIT_API_URL}/players?game=csgo&game_player_id=${steamId}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
          },
        }
      );
    }

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Faceit player not found for Steam ID: ${steamId}`);
        return {
          found: false,
          elo: null,
          level: null,
          convertedMMR: DEFAULT_MMR,
          source: 'default',
        };
      }
      throw new Error(`Faceit API error: ${response.status}`);
    }

    const player: FaceitPlayer = await response.json();

    // Check CS2 data first, then CSGO
    const cs2Data = player.games?.cs2;
    const csgoData = player.games?.csgo;

    if (cs2Data?.faceit_elo) {
      const convertedMMR = convertFaceitEloToMMR(cs2Data.faceit_elo);
      console.log(`Faceit CS2 player found: ${player.nickname}, Elo: ${cs2Data.faceit_elo}, Level: ${cs2Data.skill_level}, Converted MMR: ${convertedMMR}`);
      return {
        found: true,
        elo: cs2Data.faceit_elo,
        level: cs2Data.skill_level,
        convertedMMR,
        source: 'faceit_cs2',
      };
    }

    if (csgoData?.faceit_elo) {
      const convertedMMR = convertFaceitEloToMMR(csgoData.faceit_elo);
      console.log(`Faceit CSGO player found: ${player.nickname}, Elo: ${csgoData.faceit_elo}, Level: ${csgoData.skill_level}, Converted MMR: ${convertedMMR}`);
      return {
        found: true,
        elo: csgoData.faceit_elo,
        level: csgoData.skill_level,
        convertedMMR,
        source: 'faceit_csgo',
      };
    }

    // Player exists but no CS2/CSGO data
    console.log(`Faceit player ${player.nickname} has no CS2/CSGO data`);
    return {
      found: true,
      elo: null,
      level: null,
      convertedMMR: DEFAULT_MMR,
      source: 'default',
    };

  } catch (error) {
    console.error('Error fetching Faceit player data:', error);
    return {
      found: false,
      elo: null,
      level: null,
      convertedMMR: DEFAULT_MMR,
      source: 'default',
    };
  }
}

/**
 * Get initial MMR for a new user based on their Faceit stats
 */
export async function getInitialMMR(steamId: string): Promise<number> {
  const result = await getFaceitPlayerBySteamId(steamId);
  return result.convertedMMR;
}
