export const SEASON_RANKS = [
  { name: 'Bronze 1', tier: 'bronze', level: 1, min: 0, next: 500 },
  { name: 'Bronze 2', tier: 'bronze', level: 2, min: 500, next: 1000 },
  { name: 'Bronze 3', tier: 'bronze', level: 3, min: 1000, next: 1500 },
  { name: 'Silver 1', tier: 'silver', level: 1, min: 1500, next: 2000 },
  { name: 'Silver 2', tier: 'silver', level: 2, min: 2000, next: 2500 },
  { name: 'Silver 3', tier: 'silver', level: 3, min: 2500, next: 3000 },
  { name: 'Gold 1', tier: 'gold', level: 1, min: 3000, next: 3500 },
  { name: 'Gold 2', tier: 'gold', level: 2, min: 3500, next: 4000 },
  { name: 'Gold 3', tier: 'gold', level: 3, min: 4000, next: 4500 },
  { name: 'Platinum 1', tier: 'platinum', level: 1, min: 4500, next: 5000 },
  { name: 'Platinum 2', tier: 'platinum', level: 2, min: 5000, next: 5500 },
  { name: 'Platinum 3', tier: 'platinum', level: 3, min: 5500, next: 6000 },
  { name: 'Diamond 1', tier: 'diamond', level: 1, min: 6000, next: 6500 },
  { name: 'Diamond 2', tier: 'diamond', level: 2, min: 6500, next: 7000 },
  { name: 'Diamond 3', tier: 'diamond', level: 3, min: 7000, next: 7500 },
  { name: 'Emerald 1', tier: 'emerald', level: 1, min: 7500, next: 8000 },
  { name: 'Emerald 2', tier: 'emerald', level: 2, min: 8000, next: 8500 },
  { name: 'Emerald 3', tier: 'emerald', level: 3, min: 8500, next: 9000 },
  { name: 'Master 1', tier: 'master', level: 1, min: 9000, next: 10000 },
  { name: 'Master 2', tier: 'master', level: 2, min: 10000, next: 11000 },
  { name: 'Master 3', tier: 'master', level: 3, min: 11000, next: 12000 },
  { name: 'Grandmaster', tier: 'grandmaster', level: null, min: 12000, next: null },
] as const;

export type SeasonRank = (typeof SEASON_RANKS)[number];

export function getSeasonRank(score: number): SeasonRank {
  const normalized = Math.max(0, score);
  return [...SEASON_RANKS].reverse().find(rank => normalized >= rank.min) ?? SEASON_RANKS[0];
}

export function getRankProgress(score: number) {
  const rank = getSeasonRank(score);
  if (rank.next === null) return { rank, progress: 100, pointsToNext: 0 };
  const progress = Math.max(0, Math.min(100, ((Math.max(score, rank.min) - rank.min) / (rank.next - rank.min)) * 100));
  return { rank, progress, pointsToNext: Math.max(0, rank.next - score) };
}
