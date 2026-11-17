import { readFile, writeFile } from 'node:fs/promises';
import { pbkdf2Sync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { it, vi } from 'vitest';
import type { Db, DbExecutor } from '@/server/db/connection';
import type { RemoteSnapshot } from '@/lib/server-contract';
import { createSystemBackup } from '@/lib/system-backup';
import { createPopulatedTestData } from '../tests/fixtures/populated-data';
import * as schema from '@/server/db/schema';
import { importBackup } from '@/server/db/import-backup';
import { GET as getState } from '@/app/api/state/route';
import { POST as login } from '@/app/api/auth/login/route';

// Counts database round trips per API request against the real migration on
// embedded PostgreSQL. Every round trip pays the app<->database network latency
// in production, so the count (not PGlite's local time) is the number that matters.
const holder = vi.hoisted(() => ({ db: null as unknown as Db, queries: 0 }));
vi.mock('@/server/db/connection', async importOriginal => ({
  ...await importOriginal<typeof import('@/server/db/connection')>(),
  withDatabase: <T>(operation: (db: Db) => Promise<T>) => operation(holder.db),
}));

const origin = 'https://center.example';
const password = 'fixture-password-only';
const req = (path: string, body?: unknown, cookie?: string) => new Request(`${origin}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), 'User-Agent': 'perf' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

async function measure(label: string, run: () => Promise<Response>, rounds = 15) {
  let bytes = 0; const times: number[] = []; let queries = 0;
  for (let i = 0; i < rounds; i += 1) {
    holder.queries = 0; const start = performance.now();
    const response = await run(); const text = await response.text();
    times.push(performance.now() - start); queries = holder.queries; bytes = Buffer.byteLength(text);
  }
  times.sort((a, b) => a - b);
  return { label, queries, bytes, p50: +times[Math.floor(rounds / 2)].toFixed(1), p95: +times[Math.floor(rounds * 0.95)].toFixed(1) };
}

it('measures /api/state database round trips', async () => {
  vi.stubEnv('SESSION_SECRET', 'synthetic-perf-secret-at-least-32-bytes-long'); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('VERCEL', '');
  const client = new PGlite();
  for (const file of ['0001_centerpro.sql', '0002_qr_display_account.sql', '0003_game_plays.sql']) await client.exec(await readFile(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  holder.db = drizzle(client, { schema, logger: { logQuery: () => { holder.queries += 1; } } }) as unknown as Db;
  const data = createPopulatedTestData();
  const salt = Buffer.alloc(16, 42);
  const credential = { salt: salt.toString('base64'), hash: pbkdf2Sync(password, salt, 150_000, 32, 'sha256').toString('base64'), version: 1, updatedAt: '2026-10-12T12:00:00.000Z' };
  const auth = { schema: 1 as const, system: { ...credential, username: 'perf-owner' }, employees: Object.fromEntries(data.employees.map(e => [e.id, { ...credential }])) };
  const backup = await createSystemBackup({ data, auth, theme: null, revision: 10, origin });
  await holder.db.transaction(tx => importBackup(tx as unknown as DbExecutor, backup));
  const signedIn = await login(req('/api/auth/login', { username: 'perf-owner', password, remember: false }));
  const cookie = signedIn.headers.get('set-cookie')!.split(';')[0];
  const snapshot = await (await getState(req('/api/state', undefined, cookie))).json() as RemoteSnapshot;
  const results = [
    await measure('GET /api/state (full document)', () => getState(req('/api/state', undefined, cookie))),
    await measure('GET /api/state?revision (poll, unchanged)', () => getState(req(`/api/state?revision=${snapshot.revision}`, undefined, cookie))),
    await measure('GET /api/state (anonymous)', () => getState(req('/api/state'))),
  ];
  const rows = results.map(r => `| ${r.label} | ${r.queries} | ${(r.bytes / 1024).toFixed(1)} KB | ${r.p50} ms | ${r.p95} ms |`).join('\n');
  const table = `| Request | DB round trips | Response | p50 (PGlite, no network) | p95 |\n|---|---|---|---|---|\n${rows}\n`;
  console.log(table);
  if (process.env.PERF_OUT) await writeFile(process.env.PERF_OUT, table);
  await client.close();
});
