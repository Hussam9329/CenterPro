import { readFile } from 'node:fs/promises';
import { pbkdf2Sync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPopulatedTestData } from '../fixtures/populated-data';
import { createInitialData } from '@/lib/mock-data';
import { AUTH_PASSWORD_KDF, type AuthStore } from '@/lib/local-auth';
import { createSystemBackup } from '@/lib/system-backup';
import * as schema from '@/server/db/schema';
import type { DbExecutor } from '@/server/db/connection';
import { bumpRevision, loadAuthStore, loadData, lockState, saveData, validateDataReferences } from '@/server/db/repository';
import { importBackup, inspectBackup } from '@/server/db/import-backup';
import { inlinePhotos } from '@/server/photos';

const blobs = vi.hoisted(() => new Map<string, string>());
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (path: string, body: string, options: { access: string; allowOverwrite: boolean }) => {
    if (options.access !== 'private' || options.allowOverwrite !== false) throw new Error('Unsafe storage options');
    if (blobs.has(path)) throw new Error('Already exists');
    blobs.set(path, body); return { pathname: path };
  }),
  get: vi.fn(async (path: string, options: { access: string }) => {
    if (options.access !== 'private') throw new Error('Unsafe storage options');
    const body = blobs.get(path); return body === undefined ? null : { statusCode: 200, stream: new Response(body).body, blob: { size: Buffer.byteLength(body) } };
  }),
}));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYbQAAAAASUVORK5CYII=';
beforeEach(() => { blobs.clear(); });

const clients: PGlite[] = [];
afterEach(async () => { await Promise.all(clients.splice(0).map(client => client.close())); });
async function database() {
  const client = new PGlite(); clients.push(client);
  await client.exec(await readFile(new URL('../../drizzle/0001_centerpro.sql', import.meta.url), 'utf8'));
  return { client, db: drizzle(client, { schema }) };
}
function authFixture(data = createPopulatedTestData()): AuthStore {
  const salt = Buffer.alloc(16, 42);
  const credential = { salt: salt.toString('base64'), hash: pbkdf2Sync('fixture-password-only', salt, AUTH_PASSWORD_KDF.iterations, AUTH_PASSWORD_KDF.derivedKeyBytes, 'sha256').toString('base64'), version: 3, updatedAt: '2026-10-12T12:00:00.000Z' };
  return { schema: 1, system: { ...credential, username: 'owner-fixture' }, employees: data.employees[0] ? { [data.employees[0].id]: { ...credential } } : {} };
}
async function backupFixture() {
  const data = createPopulatedTestData();
  Object.assign(data, { futureRoot: { preserved: true } });
  Object.assign(data.employees[0], { photo: png, futureEmployeeField: ['keep', 0] });
  data.employees[1].active = false;
  data.evaluationSeasons.push({ id: 'season', name: 'Season', startDate: '2026-01-01', endDate: '2026-01-02', state: 'ARCHIVED', openedAt: '2026-01-01T00:00:00Z', openedBy: 'historical', snapshot: { cycleIds: ['cycle'], rows: [] } });
  data.evaluationCycles.push({ id: 'cycle', seasonId: 'season', name: 'Cycle', state: 'ARCHIVED', openedAt: '2026-01-01T00:00:00Z', openedBy: 'historical', snapshot: { rows: [], exams: [{ id: 'exam', name: 'Exam', date: '2026-01-01', rows: [] }] } });
  data.evaluationExams.push({ id: 'exam', cycleId: 'cycle', name: 'Exam', date: '2026-01-01', note: '', state: 'CLOSED', createdAt: '2026-01-01T00:00:00Z', createdBy: 'historical' });
  data.examEvaluations.push({ id: 'score', examId: 'exam', employeeId: data.employees[0].id, papers: 10, correctionErrors: 0, behaviorErrors: 0, note: '', createdAt: '2026-01-01T00:00:00Z', createdBy: 'historical', updatedAt: '2026-01-01T00:00:00Z', updatedBy: 'historical' });
  return createSystemBackup({ data, auth: authFixture(data), theme: 'dark', revision: 17, origin: 'https://example.test', exportedAt: '2026-10-12T12:00:00.000Z' });
}

describe('PostgreSQL migration and full backup import', () => {
  it('starts empty; preserves every collection, extra field, order, snapshot and password verification; re-import is a no-op', async () => {
    const { db } = await database();
    expect(await loadData(db as unknown as DbExecutor)).toEqual(createInitialData());
    const backup = await backupFixture();
    await expect(db.transaction(tx => saveData(tx as unknown as DbExecutor, createInitialData(), backup.payload.data))).rejects.toThrow('Inline images');
    expect(await loadData(db as unknown as DbExecutor)).toEqual(createInitialData());
    expect(await db.transaction(tx => importBackup(tx as unknown as DbExecutor, backup))).toBe('IMPORTED');
    const data = await loadData(db as unknown as DbExecutor);
    expect(await inlinePhotos(data)).toEqual(backup.payload.data);
    expect(JSON.stringify(data)).not.toContain('data:image');
    expect(data.employees[0].photo).toMatch(/^\/api\/photos\/[a-f0-9]{64}$/);
    const auth = await loadAuthStore(db as unknown as DbExecutor);
    expect(auth).toEqual(backup.payload.authentication.credentials);
    expect(pbkdf2Sync('fixture-password-only', Buffer.from(auth.system!.salt, 'base64'), 150_000, 32, 'sha256').toString('base64')).toBe(auth.system!.hash);
    await db.transaction(async tx => {
      await lockState(tx as unknown as DbExecutor);
      const after = structuredClone(data); after.settings.centerName = 'Changed after import';
      await saveData(tx as unknown as DbExecutor, data, after); await bumpRevision(tx as unknown as DbExecutor);
    });
    expect(await db.transaction(tx => importBackup(tx as unknown as DbExecutor, backup))).toBe('ALREADY_IMPORTED');
    expect((await loadData(db as unknown as DbExecutor)).settings.centerName).toBe('Changed after import');
    expect(await db.select().from(schema.imports)).toHaveLength(1);
    expect((await db.select().from(schema.imports))[0].metadata.preferences).toEqual({ theme: 'dark' });
    expect(await db.select().from(schema.sessions)).toHaveLength(0);
  }, 30_000);

  it('rolls back all data/auth/revision after failure and refuses a different import into populated data', async () => {
    const { db } = await database(); const backup = await backupFixture();
    await expect(db.transaction(async tx => { await importBackup(tx as unknown as DbExecutor, backup); throw new Error('Injected failure'); })).rejects.toThrow('Injected failure');
    expect(await loadData(db as unknown as DbExecutor)).toEqual(createInitialData());
    expect((await loadAuthStore(db as unknown as DbExecutor)).system).toBeNull();
    expect(await db.select().from(schema.imports)).toHaveLength(0);
    await db.transaction(tx => importBackup(tx as unknown as DbExecutor, backup));
    const other = await createSystemBackup({ data: backup.payload.data, auth: backup.payload.authentication.credentials, theme: null, revision: 18, origin: 'https://example.test' });
    await expect(db.transaction(tx => importBackup(tx as unknown as DbExecutor, other))).rejects.toThrow('already contains data');
    expect(await inlinePhotos(await loadData(db as unknown as DbExecutor))).toEqual(backup.payload.data);
  }, 30_000);

  it('enforces PostgreSQL uniqueness/FKs and supports closing an open day while inserting its successor first in display order', async () => {
    const { db, client } = await database(); const backup = await backupFixture();
    await db.transaction(tx => importBackup(tx as unknown as DbExecutor, backup));
    await expect(client.query("insert into centerpro.employees select 'duplicate', position, record, department_id, upper(username), 'UNIQUE-CODE' from centerpro.employees limit 1")).rejects.toThrow();
    await expect(client.query("insert into centerpro.attendance select 'duplicate', position, record, employee_id, workday_id from centerpro.attendance limit 1")).rejects.toThrow();
    await expect(client.query("insert into centerpro.workdays values ('second-open', 999, '{}', '2099-01-01', 'OPEN')")).rejects.toThrow();
    await expect(client.query("insert into centerpro.bonuses values ('bad-reference', 999, '{}', 'missing', '2099-01-01')")).rejects.toThrow();
    await db.transaction(async tx => {
      await lockState(tx as unknown as DbExecutor);
      const before = await loadData(tx as unknown as DbExecutor); const after = structuredClone(before);
      const open = after.workdays.find(day => day.state === 'OPEN')!; open.state = 'CLOSED';
      after.workdays.unshift({ ...open, id: 'next-open', date: '2026-10-01', state: 'OPEN' });
      await saveData(tx as unknown as DbExecutor, before, after); await bumpRevision(tx as unknown as DbExecutor);
    });
    const current = await loadData(db as unknown as DbExecutor);
    expect(current.workdays[0].id).toBe('next-open');
    expect(current.workdays.filter(day => day.state === 'OPEN')).toHaveLength(1);
    const revision = await db.select().from(schema.state).where(eq(schema.state.id, 1)); expect(revision[0].revision).toBe(18);
    const rls = await db.execute(sql`select relrowsecurity from pg_class where oid = 'centerpro.credentials'::regclass`);
    expect(rls.rows[0].relrowsecurity).toBe(true);
  }, 30_000);

  it('validates tampering, duplicate names, orphan records and owner availability without database access', async () => {
    const backup = await backupFixture();
    const valid = await inspectBackup(JSON.stringify(backup)); expect(valid.summary.counts.employees).toBe(backup.payload.data.employees.length);
    const bad = structuredClone(backup); bad.payload.data.settings.centerName = 'tampered';
    await expect(inspectBackup(JSON.stringify(bad))).rejects.toThrow();
    const duplicate = structuredClone(backup.payload.data); duplicate.employees[1].username = ` ${duplicate.employees[0].username.toUpperCase()} `;
    expect(() => validateDataReferences(duplicate)).toThrow('employees.username.duplicate=1');
    const orphan = structuredClone(backup.payload.data); orphan.attendance[0].employeeId = 'nonexistent';
    expect(() => validateDataReferences(orphan)).toThrow('attendance.employeeMissing=1');
    const noOwner = await createSystemBackup({ data: backup.payload.data, auth: { ...backup.payload.authentication.credentials, system: null }, theme: null, revision: 17, origin: 'https://example.test' });
    await expect(inspectBackup(JSON.stringify(noOwner))).rejects.toThrow('credentials.systemOwnerMissing=1');
    const orphanAuth = structuredClone(backup.payload.authentication.credentials); orphanAuth.employees['orphan'] = orphanAuth.employees[backup.payload.data.employees[0].id];
    const orphanBackup = await createSystemBackup({ data: backup.payload.data, auth: orphanAuth, theme: null, revision: 17, origin: 'https://example.test' });
    await expect(inspectBackup(JSON.stringify(orphanBackup))).rejects.toThrow('credentials.employeeMissing=1');
    const invalidArchive = structuredClone(backup.payload.data); delete invalidArchive.evaluationSeasons[0].endDate;
    const invalidBackup = await createSystemBackup({ data: invalidArchive, auth: backup.payload.authentication.credentials, theme: null, revision: 17, origin: 'https://example.test' });
    await expect(inspectBackup(JSON.stringify(invalidBackup))).rejects.toThrow('evaluations.invalidState=1');
    const reserved = structuredClone(backup.payload.data); reserved.audit[0].id = '__proto__';
    expect(() => validateDataReferences(reserved)).toThrow('audit.reservedId=1');
    const projected = structuredClone(backup.payload.data); projected.serverEvaluation = { seasons: {} };
    expect(() => validateDataReferences(projected)).toThrow('data.reservedReadModel=1');
  }, 30_000);
});
