import { GAMES, GAME_IDS, type GameId, type GameOutcome } from './games';

export interface PlayRecord {
  id: string;
  employeeId: string;
  game: GameId;
  /** ISO timestamp of when the round started. */
  startedAt: string;
  durationMs: number;
  score: number;
  outcome: GameOutcome;
  /** Baghdad calendar date (yyyy-mm-dd) the round was recorded on. */
  playDate: string;
}

export interface NewPlay { id: string; game: GameId; startedAt: string; durationMs: number; score: number; outcome: GameOutcome }

export const MAX_PLAY_MS = 6 * 60 * 60 * 1000;
export const PLAYS_PER_MINUTE_LIMIT = 20;

/** Highest believable score per game; anything above is rejected as tampered. */
const MAX_SCORE: Record<GameId, number> = { wordle: 6, minesweeper: 999, snake: 17 * 17, xo: 0, connect4: 0 };
const OUTCOMES: Record<GameId, readonly GameOutcome[]> = { wordle: ['win', 'loss'], minesweeper: ['win', 'loss'], snake: ['end'], xo: ['win', 'draw'], connect4: ['win', 'draw'] };

/** Returns a user-facing problem, or null when the play is plausible. `now` is the server/browser clock. */
export function playProblem(play: NewPlay, now: Date): string | null {
  if (!GAME_IDS.includes(play.game)) return 'لعبة غير معروفة.';
  const started = Date.parse(play.startedAt);
  if (!Number.isFinite(started) || started > now.getTime() + 60_000 || started < now.getTime() - 24 * 60 * 60 * 1000) return 'وقت بداية اللعب غير صالح.';
  if (!Number.isInteger(play.durationMs) || play.durationMs < 0 || play.durationMs > MAX_PLAY_MS || play.durationMs > now.getTime() - started + 60_000) return 'مدة اللعب غير صالحة.';
  if (!Number.isInteger(play.score) || play.score < 0 || play.score > MAX_SCORE[play.game]) return 'نتيجة اللعب غير صالحة.';
  if (!OUTCOMES[play.game].includes(play.outcome)) return 'نتيجة اللعب غير صالحة.';
  return null;
}

export interface LeaderboardEntry { employeeId: string; name: string; best: number; plays: number }

/** What an employee sees in the Rest area: leaderboards plus their own bests. */
export interface RestOverview {
  today: string;
  leaderboards: Partial<Record<GameId, LeaderboardEntry[]>>;
  mine: { best: Partial<Record<GameId, number>>; wordleToday: Pick<PlayRecord, 'score' | 'outcome'> | null };
}

/** Best score per employee for one game, highest first; ties go to fewer plays (fewer tries). */
export function leaderboard(plays: readonly PlayRecord[], game: GameId, names: ReadonlyMap<string, string>, limit = 10): LeaderboardEntry[] {
  const byEmployee = new Map<string, LeaderboardEntry>();
  for (const play of plays) {
    if (play.game !== game) continue;
    const entry = byEmployee.get(play.employeeId) ?? { employeeId: play.employeeId, name: names.get(play.employeeId) ?? 'موظف', best: 0, plays: 0 };
    entry.best = Math.max(entry.best, play.score); entry.plays += 1;
    byEmployee.set(play.employeeId, entry);
  }
  return [...byEmployee.values()].filter(entry => entry.best > 0).sort((a, b) => b.best - a.best || a.plays - b.plays || a.name.localeCompare(b.name, 'ar')).slice(0, limit);
}

export interface GameStats { game: GameId; plays: number; players: number; totalMs: number; best: number; lastPlayedAt: string | null }
export interface EmployeeGameStats { employeeId: string; name: string; plays: number; totalMs: number; lastPlayedAt: string | null; firstPlayedAt: string | null; games: Partial<Record<GameId, { plays: number; totalMs: number; best: number; lastPlayedAt: string }>> }
export interface RestStats { totals: { plays: number; players: number; totalMs: number }; games: GameStats[]; employees: EmployeeGameStats[]; recent: (PlayRecord & { name: string })[] }

const later = (a: string | null, b: string) => (!a || b > a ? b : a);
const earlier = (a: string | null, b: string) => (!a || b < a ? b : a);

/** Owner statistics: totals, per game, per employee per game, and the latest plays. */
export function restStats(plays: readonly PlayRecord[], names: ReadonlyMap<string, string>, recentLimit = 100): RestStats {
  const games = new Map<GameId, GameStats & { ids: Set<string> }>(GAMES.map(game => [game.id, { game: game.id, plays: 0, players: 0, totalMs: 0, best: 0, lastPlayedAt: null, ids: new Set<string>() }]));
  const employees = new Map<string, EmployeeGameStats>();
  for (const play of plays) {
    const game = games.get(play.game); if (!game) continue;
    game.plays += 1; game.totalMs += play.durationMs; game.best = Math.max(game.best, play.score); game.lastPlayedAt = later(game.lastPlayedAt, play.startedAt); game.ids.add(play.employeeId);
    const employee = employees.get(play.employeeId) ?? { employeeId: play.employeeId, name: names.get(play.employeeId) ?? 'موظف', plays: 0, totalMs: 0, lastPlayedAt: null, firstPlayedAt: null, games: {} };
    employee.plays += 1; employee.totalMs += play.durationMs; employee.lastPlayedAt = later(employee.lastPlayedAt, play.startedAt); employee.firstPlayedAt = earlier(employee.firstPlayedAt, play.startedAt);
    const perGame = employee.games[play.game] ?? { plays: 0, totalMs: 0, best: 0, lastPlayedAt: play.startedAt };
    perGame.plays += 1; perGame.totalMs += play.durationMs; perGame.best = Math.max(perGame.best, play.score); perGame.lastPlayedAt = later(perGame.lastPlayedAt, play.startedAt) ?? play.startedAt;
    employee.games[play.game] = perGame; employees.set(play.employeeId, employee);
  }
  const recent = [...plays].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, recentLimit).map(play => ({ ...play, name: names.get(play.employeeId) ?? 'موظف' }));
  return {
    totals: { plays: plays.length, players: employees.size, totalMs: plays.reduce((sum, play) => sum + play.durationMs, 0) },
    games: [...games.values()].map(({ ids, ...game }) => ({ ...game, players: ids.size })),
    employees: [...employees.values()].sort((a, b) => b.totalMs - a.totalMs || b.plays - a.plays),
    recent,
  };
}

/** Human duration such as "1 س 05 د" or "45 ث". */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} ث`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} د ${String(seconds % 60).padStart(2, '0')} ث`;
  return `${Math.floor(minutes / 60)} س ${String(minutes % 60).padStart(2, '0')} د`;
}
