import { and, count, eq, gte, inArray, max, sql } from 'drizzle-orm';
import { GAMES, type GameId } from '@/lib/rest/games';
import { PLAYS_PER_MINUTE_LIMIT, playProblem, restStats, type NewPlay, type PlayRecord, type RestOverview, type RestStats } from '@/lib/rest/plays';
import { baghdadDate, requireIdentity, type StateContext } from './auth/state';
import { gamePlays } from './db/schema';
import { ApiError } from './http';

const RANKED = GAMES.filter(game => game.ranked && game.id !== 'wordle').map(game => game.id);

function names(context: StateContext): Map<string, string> {
  return new Map(context.data.employees.map(employee => [employee.id, employee.name]));
}

function playingEmployee(context: StateContext): string {
  const actor = requireIdentity(context).actor;
  const employee = actor.role === 'EMPLOYEE' && actor.employeeId ? context.data.employees.find(item => item.id === actor.employeeId) : undefined;
  if (!employee?.active || employee.role !== 'EMPLOYEE') throw new ApiError(403, 'قسم الاستراحة متاح لحسابات الموظفين فقط.');
  return employee.id;
}

const toRecord = (row: typeof gamePlays.$inferSelect): PlayRecord => ({
  id: row.id, employeeId: row.employeeId, game: row.game as GameId, startedAt: row.startedAt.toISOString(),
  durationMs: row.durationMs, score: row.score, outcome: row.outcome as PlayRecord['outcome'], playDate: row.playDate,
});

export async function recordPlay(context: StateContext, input: NewPlay): Promise<{ id: string }> {
  const employeeId = playingEmployee(context);
  const problem = playProblem(input, context.now);
  if (problem) throw new ApiError(400, problem);
  const minuteAgo = new Date(context.now.getTime() - 60_000);
  const [recent] = await context.tx.select({ value: count() }).from(gamePlays).where(and(eq(gamePlays.employeeId, employeeId), gte(gamePlays.createdAt, minuteAgo)));
  if ((recent?.value ?? 0) >= PLAYS_PER_MINUTE_LIMIT) throw new ApiError(429, 'محاولات كثيرة خلال وقت قصير. انتظر دقيقة ثم أعد المحاولة.');
  const playDate = baghdadDate(context.now);
  if (input.game === 'wordle') {
    const [played] = await context.tx.select({ id: gamePlays.id }).from(gamePlays).where(and(eq(gamePlays.employeeId, employeeId), eq(gamePlays.game, 'wordle'), eq(gamePlays.playDate, playDate)));
    if (played && played.id !== input.id) throw new ApiError(409, 'لعبت كلمة اليوم مسبقاً. عُد غداً لكلمة جديدة.');
  }
  // The client-generated id makes retries after a lost response harmless.
  await context.tx.insert(gamePlays).values({ id: input.id, employeeId, game: input.game, startedAt: new Date(input.startedAt), durationMs: input.durationMs, score: input.score, outcome: input.outcome, playDate }).onConflictDoNothing({ target: gamePlays.id });
  return { id: input.id };
}

export async function restOverview(context: StateContext): Promise<RestOverview> {
  const employeeId = playingEmployee(context);
  const today = baghdadDate(context.now);
  const who = names(context);
  const best = await context.tx.select({ employeeId: gamePlays.employeeId, game: gamePlays.game, best: max(gamePlays.score), plays: count() })
    .from(gamePlays).where(inArray(gamePlays.game, RANKED)).groupBy(gamePlays.employeeId, gamePlays.game);
  const wordle = await context.tx.select().from(gamePlays).where(and(eq(gamePlays.game, 'wordle'), eq(gamePlays.playDate, today)));
  const leaderboards: RestOverview['leaderboards'] = {};
  for (const game of RANKED) {
    leaderboards[game] = best.filter(row => row.game === game && (row.best ?? 0) > 0)
      .map(row => ({ employeeId: row.employeeId, name: who.get(row.employeeId) ?? 'موظف', best: row.best ?? 0, plays: row.plays }))
      .sort((a, b) => b.best - a.best || a.plays - b.plays || a.name.localeCompare(b.name, 'ar')).slice(0, 10);
  }
  // The daily word ranks today's solvers by fewest attempts (higher score), then by speed.
  leaderboards.wordle = wordle.filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.durationMs - b.durationMs)
    .slice(0, 10).map(row => ({ employeeId: row.employeeId, name: who.get(row.employeeId) ?? 'موظف', best: row.score, plays: 1 }));
  const mineToday = wordle.find(row => row.employeeId === employeeId);
  const mineBest: RestOverview['mine']['best'] = {};
  for (const row of best) if (row.employeeId === employeeId) mineBest[row.game as GameId] = row.best ?? 0;
  return { today, leaderboards, mine: { best: mineBest, wordleToday: mineToday ? { score: mineToday.score, outcome: mineToday.outcome as PlayRecord['outcome'] } : null } };
}

/** Owner-only: who played what, when and for how long. `days` = null means all time. */
export async function restStatistics(context: StateContext, days: number | null): Promise<RestStats> {
  const actor = requireIdentity(context).actor;
  if (actor.role !== 'SUPER_ADMIN') throw new ApiError(403, 'إحصائيات الاستراحة متاحة للمدير العام فقط.');
  const since = days ? new Date(context.now.getTime() - days * 86_400_000) : null;
  const rows = await context.tx.select().from(gamePlays).where(since ? gte(gamePlays.startedAt, since) : sql`true`).orderBy(sql`${gamePlays.startedAt} desc`).limit(20_000);
  return restStats(rows.map(toRecord), names(context));
}
