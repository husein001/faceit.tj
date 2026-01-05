import { User, BalancedTeams } from '../types';

/**
 * Balance teams using snake draft based on MMR
 * Players are sorted by MMR and distributed in snake pattern:
 * Team 1: 1st, 4th, 5th, 8th, 9th...
 * Team 2: 2nd, 3rd, 6th, 7th, 10th...
 */
export function balanceTeams(players: User[]): BalancedTeams {
  if (players.length < 2) {
    throw new Error('Need at least 2 players to balance teams');
  }

  // Sort players by MMR (highest first)
  const sorted = [...players].sort((a, b) => b.mmr - a.mmr);

  const team1: User[] = [];
  const team2: User[] = [];

  // Snake draft: 1,4,5,8,9 to team1; 2,3,6,7,10 to team2
  sorted.forEach((player, index) => {
    // Pattern repeats every 4 players
    const position = index % 4;
    if (position === 0 || position === 3) {
      team1.push(player);
    } else {
      team2.push(player);
    }
  });

  return { team1, team2 };
}

/**
 * Calculate total MMR for a team
 */
export function calculateTeamMMR(team: User[]): number {
  return team.reduce((sum, player) => sum + player.mmr, 0);
}

/**
 * Calculate average MMR for a team
 */
export function calculateAverageMMR(team: User[]): number {
  if (team.length === 0) return 0;
  return Math.round(calculateTeamMMR(team) / team.length);
}

/**
 * Calculate MMR difference between teams
 */
export function calculateMMRDifference(team1: User[], team2: User[]): number {
  return Math.abs(calculateTeamMMR(team1) - calculateTeamMMR(team2));
}

/**
 * Calculate MMR change after match
 * Based on expected vs actual outcome
 */
export function calculateMMRChange(
  playerMMR: number,
  opponentAverageMMR: number,
  won: boolean,
  scoreDifference: number = 0
): number {
  const K = 32; // Base MMR change factor

  // Expected win probability using Elo formula
  const expectedScore = 1 / (1 + Math.pow(10, (opponentAverageMMR - playerMMR) / 400));

  // Actual score: 1 for win, 0 for loss
  const actualScore = won ? 1 : 0;

  // Base MMR change
  let mmrChange = Math.round(K * (actualScore - expectedScore));

  // Bonus/penalty based on score difference (max 16 rounds)
  const scoreFactor = Math.min(Math.abs(scoreDifference) / 16, 1);
  if (won) {
    mmrChange += Math.round(scoreFactor * 5); // Bonus for dominant win
  } else {
    mmrChange -= Math.round(scoreFactor * 3); // Smaller penalty for close loss
  }

  // Ensure minimum change
  if (won && mmrChange < 5) mmrChange = 5;
  if (!won && mmrChange > -5) mmrChange = -5;

  // Cap maximum change
  if (mmrChange > 50) mmrChange = 50;
  if (mmrChange < -50) mmrChange = -50;

  return mmrChange;
}
