import { readFile } from 'node:fs/promises';
import { pbkdf2Sync, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db, DbExecutor } from '@/server/db/connection';
import type { AuthStore } from '@/lib/local-auth';
import type { DemoData } from '@/lib/types';
import type { RestOverview, RestStats } from '@/lib/rest/plays';
import { createInitialData } from '@/lib/mock-data';
import { createSystemBackup } from '@/lib/system-backup';
import { createPopulatedTestData } from '../fixtures/populated-data';
import * as schema from '@/server/db/schema';
import { importBackup } from '@/server/db/import-backup';
import { baghdadDate } from '@/server/auth';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as postPlay } from '@/app/api/rest/plays/route';
import { GET as getOverview } from '@/app/api/rest/overview/route';
import { GET as getStats } from '@/app/api/rest/stats/route';

// Real routes, authorization and SQL constraints against embedded PostgreSQL with the
// production migrations; only the network transport is replaced.
const holder = vi.hoisted(() => ({ db: null as unknown as Db }));
vi.mock('@/server/db/connection', async importOriginal => ({
  ...await importOriginal<typeof import('@/server/db/connection')>(),
  withDatabase: <T>(operation: (db: Db) => Promise<T>) => operation(holder.db),
}));

const origin = 'https://center.example';
const password = 'fixture-password-only';
let client: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
let fixture: DemoData;
let auth: AuthStore;
beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', 'synthetic-integration-secret-at-least-32-bytes');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL', '');
  client = new PGlite();
  for (const migration of ['0001_centerpro.sql', '0002_qr_display_account.sql', '0003_game_plays.sql']) {
    await client.exec(await readFile(new URL(`../../drizzle/${migration}`, import.meta.url), 'utf8'));
  }
  database = drizzle(client, { schema }); holder.db = database as unknown as Db;
  const populated = createPopulatedTestData();
  fixture = { ...createInitialData(), departments: populated.departments, employees: populated.employees.slice(0, 3) };
  fixture.employees[1].role = 'ADMIN';
  const salt = Buffer.alloc(16, 42);
  const credential = { salt: salt.toString('base64'), hash: pbkdf2Sync(password, salt, 150_000, 32, 'sha256').toString('base64'), version: 7, updatedAt: '2026-10-12T12:00:00.000Z' };
  auth = { schema: 1, system: { ...credential, username: 'test-owner' }, employees: Object.fromEntries(fixture.employees.map(employee => [employee.id, { ...credential }])) };
  const backup = await createSystemBackup({ data: fixture, auth, theme: null, revision: 10, origin });
  await database.transaction(tx => importBackup(tx as unknown as DbExecutor, backup));
});
afterEach(async () => { await client?.close(); vi.unstubAllEnvs(); });

function request(path: string, body?: unknown, cookie?: string): Request {
  return new Request(`${origin}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function signIn(username: string) {
  const response = await login(request('/api/auth/login', { username, password, remember: false }));
  expect(response.status, await response.clone().text()).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0];
}
function play(overrides: Record<string, unknown> = {}) {
  return { id: randomUUID(), game: 'snake', startedAt: new Date(Date.now() - 60_000).toISOString(), durationMs: 55_000, score: 12, outcome: 'end', ...overrides };
}

describe('rest area API on real PostgreSQL', () => {
  it('records employee plays, keeps the daily word to one round a day and builds leaderboards', async () => {
    const employee = await signIn(fixture.employees[0].username);
    expect((await postPlay(request('/api/rest/plays', play(), employee))).status).toBe(200);
    const wordle = play({ game: 'wordle', score: 4, outcome: 'win' });
    expect((await postPlay(request('/api/rest/plays', wordle, employee))).status).toBe(200);
    // A retry of the same round (lost response) is accepted without a duplicate row.
    expect((await postPlay(request('/api/rest/plays', wordle, employee))).status).toBe(200);
    const again = await postPlay(request('/api/rest/plays', play({ game: 'wordle', score: 6, outcome: 'win' }), employee));
    expect(again.status).toBe(409);
    const rows = await database.select().from(schema.gamePlays);
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.game === 'wordle')?.playDate).toBe(baghdadDate(new Date()));
    const overview = await (await getOverview(request('/api/rest/overview', undefined, employee))).json() as RestOverview;
    expect(overview.mine.wordleToday).toEqual({ score: 4, outcome: 'win' });
    expect(overview.mine.best.snake).toBe(12);
    expect(overview.leaderboards.snake?.[0]).toMatchObject({ name: fixture.employees[0].name, best: 12, plays: 1 });
    expect(overview.leaderboards.wordle?.[0]).toMatchObject({ name: fixture.employees[0].name, best: 4 });
  }, 30_000);

  it('records any employee-linked account, lets the system owner view boards without saving, and rejects anonymous plays', async () => {
    expect((await postPlay(request('/api/rest/plays', play()))).status).toBe(401);
    expect((await getOverview(request('/api/rest/overview'))).status).toBe(401);
    const manager = await signIn(fixture.employees[1].username);
    expect((await postPlay(request('/api/rest/plays', play({ score: 30 }), manager))).status).toBe(200);
    const owner = await signIn('test-owner');
    expect((await postPlay(request('/api/rest/plays', play(), owner))).status).toBe(403);
    const ownerView = await getOverview(request('/api/rest/overview', undefined, owner));
    expect(ownerView.status).toBe(200);
    const board = await ownerView.json() as RestOverview;
    expect(board.mine).toEqual({ best: {}, wordleToday: null });
    expect(board.leaderboards.snake?.[0]).toMatchObject({ name: fixture.employees[1].name, best: 30 });
  }, 30_000);

  it('rejects implausible plays and limits bursts', async () => {
    const employee = await signIn(fixture.employees[0].username);
    for (const tampered of [play({ score: 5000 }), play({ startedAt: new Date(Date.now() + 10 * 60_000).toISOString() }), play({ durationMs: 10 * 60 * 60_000 }), play({ game: 'xo', score: 3, outcome: 'win' }), play({ outcome: 'win' })]) {
      expect((await postPlay(request('/api/rest/plays', tampered, employee))).status, JSON.stringify(tampered)).toBe(400);
    }
    expect(await database.select().from(schema.gamePlays)).toHaveLength(0);
    for (let index = 0; index < 20; index += 1) expect((await postPlay(request('/api/rest/plays', play(), employee))).status).toBe(200);
    expect((await postPlay(request('/api/rest/plays', play(), employee))).status).toBe(429);
  }, 60_000);

  it('shows who played what, when and for how long to the owner only', async () => {
    const employee = await signIn(fixture.employees[0].username);
    await postPlay(request('/api/rest/plays', play({ durationMs: 90_000 }), employee));
    await postPlay(request('/api/rest/plays', play({ game: 'xo', score: 0, outcome: 'draw', durationMs: 30_000 }), employee));
    expect((await getStats(request('/api/rest/stats', undefined, employee))).status).toBe(403);
    expect((await getStats(request('/api/rest/stats', undefined, await signIn(fixture.employees[1].username)))).status).toBe(403);
    const response = await getStats(request('/api/rest/stats?days=7', undefined, await signIn('test-owner')));
    expect(response.status).toBe(200);
    const stats = await response.json() as RestStats;
    expect(stats.totals).toEqual({ plays: 2, players: 1, totalMs: 120_000 });
    expect(stats.employees[0]).toMatchObject({ name: fixture.employees[0].name, plays: 2, totalMs: 120_000 });
    expect(stats.employees[0].games.snake).toMatchObject({ plays: 1, totalMs: 90_000, best: 12 });
    expect(stats.recent).toHaveLength(2);
    expect(stats.games.find(game => game.game === 'xo')).toMatchObject({ plays: 1, players: 1 });
  }, 30_000);
});
