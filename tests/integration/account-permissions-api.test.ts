import { readFile } from 'node:fs/promises';
import { pbkdf2Sync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db, DbExecutor } from '@/server/db/connection';
import type { AuthStore } from '@/lib/local-auth';
import type { AccountPermission, AccountPermissions, DemoData } from '@/lib/types';
import type { MutationRequest, RemoteSnapshot } from '@/lib/server-contract';
import { createInitialData } from '@/lib/mock-data';
import { createSystemBackup } from '@/lib/system-backup';
import { createPopulatedTestData } from '../fixtures/populated-data';
import * as schema from '@/server/db/schema';
import { importBackup } from '@/server/db/import-backup';
import { loadData } from '@/server/db/repository';
import { GET as getState } from '@/app/api/state/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as mutate } from '@/app/api/mutations/route';

// Keep real PostgreSQL transactions, cookie authentication, current-directory
// permissions and projection. Only the remote database adapter is replaced.
const holder = vi.hoisted(() => ({ db: null as unknown as Db }));
vi.mock('@/server/db/connection', async importOriginal => ({
  ...await importOriginal<typeof import('@/server/db/connection')>(),
  withDatabase: <T>(operation: (db: Db) => Promise<T>) => operation(holder.db),
}));
const origin = 'https://center.example';
const password = 'synthetic-account-permissions-password';
const stamp = '2026-10-14T12:00:00.000Z';
const all: AccountPermission = { view: true, create: true, edit: true, delete: true };
const view: AccountPermission = { view: true, create: false, edit: false, delete: false };
let client: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
let fixture: DemoData;
let auth: AuthStore;

beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', 'synthetic-permissions-integration-secret-32-bytes');
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('VERCEL', '');
  client = new PGlite();
  for (const migration of ['0001_centerpro.sql', '0002_qr_display_account.sql', '0003_game_plays.sql']) {
    await client.exec(await readFile(new URL(`../../drizzle/${migration}`, import.meta.url), 'utf8'));
  }
  database = drizzle(client, { schema }); holder.db = database as unknown as Db;
  const populated = createPopulatedTestData();
  fixture = { ...createInitialData(), departments: populated.departments, employees: populated.employees.slice(0, 5) };
  fixture.employees.forEach(employee => { delete employee.permissions; });
  fixture.employees[4].role = 'ADMIN';
  fixture.employees[1].notes = 'private-personnel-note';
  fixture.employees[1].address = 'private-personnel-address';
  fixture.bonuses = [{ id: 'bonus', employeeId: 'CP-0002', amount: 100, date: '2026-10-14', reason: 'peer-bonus-reason', createdBy: 'historical', createdAt: stamp }];
  fixture.deductions = [{ id: 'deduction', employeeId: 'CP-0002', amount: 50, date: '2026-10-14', reason: 'peer-deduction-reason', type: 'خصم إداري', customType: '', createdBy: 'historical', createdAt: stamp }];
  fixture.evaluationSeasons = [{ id: 'season', name: 'موسم الاختبار', startDate: '2026-10-01', state: 'OPEN', openedAt: stamp, openedBy: 'historical' }];
  fixture.evaluationCycles = [{ id: 'cycle', seasonId: 'season', name: 'دورة الاختبار', state: 'OPEN', openedAt: stamp, openedBy: 'historical' }];
  fixture.evaluationExams = [{ id: 'exam', cycleId: 'cycle', name: 'امتحان الاختبار', date: '2026-10-14', note: 'private-open-exam-note', state: 'OPEN', createdAt: stamp, createdBy: 'historical' }];
  fixture.examEvaluations = [{ id: 'score', examId: 'exam', employeeId: 'CP-0002', papers: 100, correctionErrors: 1, behaviorErrors: 0, note: '', createdAt: stamp, createdBy: 'historical', updatedAt: stamp, updatedBy: 'historical' }];
  const salt = Buffer.alloc(16, 59);
  const credential = { salt: salt.toString('base64'), hash: pbkdf2Sync(password, salt, 150_000, 32, 'sha256').toString('base64'), version: 1, updatedAt: stamp };
  auth = { schema: 1, system: { ...credential, username: 'permissions-owner' }, employees: Object.fromEntries(fixture.employees.map(employee => [employee.id, { ...credential }])) };
});
afterEach(async () => { await client?.close(); vi.unstubAllEnvs(); });
function request(path: string, body?: unknown, cookie?: string) {
  return new Request(`${origin}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function seed() {
  await database.transaction(async tx => importBackup(tx as unknown as DbExecutor, await createSystemBackup({ data: fixture, auth, theme: null, revision: 10, origin })));
}
async function signIn(username = 'permissions-owner') {
  const response = await login(request('/api/auth/login', { username, password, remember: true }));
  expect(response.status, await response.clone().text()).toBe(200);
  return { cookie: response.headers.get('set-cookie')!.split(';')[0], state: await response.json() as RemoteSnapshot };
}
async function state(cookie: string) { return await (await getState(request('/api/state', undefined, cookie))).json() as RemoteSnapshot; }
async function write(cookie: string, changes: MutationRequest['changes'], revision = 10) {
  return mutate(request('/api/mutations', { revision, changes }, cookie));
}
async function remove(cookie: string, collection: 'deductions' | 'bonuses' | 'examEvaluations', id: string, revision = 10) {
  return mutate(request('/api/mutations', { revision, changes: [], deletion: { collection, id, reason: 'تصحيح سجل اختبار', confirmation: 'حذف' } }, cookie));
}
async function grant(cookie: string, employeeIndex: number, permissions: AccountPermissions, revision = 10) {
  const employee = (await loadData(database as unknown as DbExecutor)).employees.find(row => row.id === fixture.employees[employeeIndex].id)!;
  return write(cookie, [{ collection: 'employees', upsert: [{ ...employee, permissions }] }], revision);
}

describe('per-account permissions through authenticated API sessions', () => {
  it('denies missing grants even in the auditing department, and only the owner may change grants', async () => {
    await seed(); const owner = await signIn(); const auditor = await signIn(fixture.employees[3].username); const manager = await signIn(fixture.employees[4].username);
    expect(auditor.state.data.evaluationExams).toEqual([]);
    expect(auditor.state.data.examEvaluations).toEqual([]);
    expect((await write(auditor.cookie, [{ collection: 'examEvaluations', upsert: [{ ...fixture.examEvaluations[0], papers: 200 }] }])).status).toBe(400);
    expect((await grant(manager.cookie, 3, { AUDIT_REVIEW: all })).status).toBe(400);
    expect((await grant(auditor.cookie, 3, { AUDIT_REVIEW: all })).status).toBe(400);
    expect((await state(owner.cookie)).revision).toBe(10);
    expect((await loadData(database as unknown as DbExecutor)).employees[3].permissions).toBeUndefined();
    expect((await grant(owner.cookie, 3, { AUDIT_REVIEW: all })).status).toBe(200);
    expect((await state(auditor.cookie)).session).toBeNull();
    const fresh = await signIn(fixture.employees[3].username);
    expect(fresh.state.data.examEvaluations).toHaveLength(1);
    expect((await write(fresh.cookie, [{ collection: 'examEvaluations', upsert: [{ ...fixture.examEvaluations[0], papers: 200 }] }], 11)).status).toBe(200);
    // The list of summed paper numbers is stored with the record and returned to auditors.
    expect((await write(fresh.cookie, [{ collection: 'examEvaluations', upsert: [{ ...fixture.examEvaluations[0], papers: 230, paperBatches: [200, 30] }] }], 12)).status).toBe(200);
    expect((await loadData(database as unknown as DbExecutor)).examEvaluations[0]).toMatchObject({ papers: 230, paperBatches: [200, 30] });
    expect((await state(fresh.cookie)).data.examEvaluations[0]).toMatchObject({ paperBatches: [200, 30] });
    expect((await write(fresh.cookie, [{ collection: 'examEvaluations', upsert: [{ ...fixture.examEvaluations[0], paperBatches: [-1] }] }], 13)).status).toBe(400);
    // Credit for added errors comes from the signed-in auditor; a forged breakdown is ignored.
    const forged = { 'someone-else': { name: 'مزيف', correctionErrors: 9, behaviorErrors: 9 } };
    expect((await write(fresh.cookie, [{ collection: 'examEvaluations', upsert: [{ ...fixture.examEvaluations[0], papers: 230, paperBatches: [200, 30], correctionErrors: 3, errorsBy: forged }] }], 13)).status).toBe(200);
    expect((await loadData(database as unknown as DbExecutor)).examEvaluations[0].errorsBy).toEqual({ [fixture.employees[3].id]: { name: fixture.employees[3].name, correctionErrors: 2, behaviorErrors: 0 } });
    expect((await state(fresh.cookie)).data.examEvaluations[0].errorsBy).toEqual({ [fixture.employees[3].id]: { name: fixture.employees[3].name, correctionErrors: 2, behaviorErrors: 0 } });
  }, 30_000);

  it('fails closed for malformed truthy permission values carried by a legacy imported extension', async () => {
    fixture.employees[3].permissions = {
      DEDUCTIONS: { view: 'false', create: 'true', edit: 'true', delete: 'true' },
      AUDIT_REVIEW: { view: 1, create: 1, edit: 1, delete: 1 },
    } as unknown as AccountPermissions;
    await seed(); const employee = await signIn(fixture.employees[3].username);
    expect(employee.state.data.deductions).toEqual([]); expect(employee.state.data.examEvaluations).toEqual([]);
    expect((await write(employee.cookie, [{ collection: 'deductions', upsert: [{ ...fixture.deductions[0], id: 'forged-deduction' }] }])).status).toBe(400);
    expect((await remove(employee.cookie, 'deductions', 'deduction')).status).toBe(400);
    expect((await write(employee.cookie, [{ collection: 'examEvaluations', upsert: [{ ...fixture.examEvaluations[0], papers: 999 }] }])).status).toBe(400);
    expect((await state(employee.cookie)).revision).toBe(10);
  }, 30_000);

  it('grants by account independently of department and revokes every previous session on permission changes', async () => {
    fixture.employees[0].permissions = { DEDUCTIONS: all, AUDIT_REVIEW: all };
    await seed(); const owner = await signIn(); const first = await signIn(fixture.employees[0].username); const second = await signIn(fixture.employees[0].username);
    expect(first.state.data.examEvaluations).toHaveLength(1);
    expect((await write(first.cookie, [{ collection: 'examEvaluations', upsert: [{ ...fixture.examEvaluations[0], papers: 101 }] }])).status).toBe(200);
    expect((await grant(owner.cookie, 0, {}, 11)).status).toBe(200);
    for (const cookie of [first.cookie, second.cookie]) {
      expect((await state(cookie)).session).toBeNull();
      expect((await write(cookie, [{ collection: 'deductions', upsert: [{ ...fixture.deductions[0], amount: 70 }] }], 12)).status).toBe(401);
    }
    const fresh = await signIn(fixture.employees[0].username);
    expect(fresh.state.data.deductions).toEqual([]); expect(fresh.state.data.examEvaluations).toEqual([]);
    expect((await write(fresh.cookie, [{ collection: 'examEvaluations', upsert: [{ ...fixture.examEvaluations[0], papers: 102 }] }], 12)).status).toBe(400);
    expect((await state(owner.cookie)).revision).toBe(12);
  }, 30_000);

  it('projects only delegated feature records and colleague descriptors, without peer personnel or unpublished audit data', async () => {
    fixture.employees[3].permissions = { DEDUCTIONS: view };
    await seed(); const employee = await signIn(fixture.employees[3].username);
    expect(employee.state.data.deductions).toHaveLength(1);
    expect(employee.state.data.bonuses).toEqual([]); expect(employee.state.data.payments).toEqual([]);
    expect(employee.state.data.evaluationExams).toEqual([]); expect(employee.state.data.examEvaluations).toEqual([]);
    const peer = employee.state.data.employees.find(item => item.id === 'CP-0002')!;
    expect(peer).toMatchObject({ name: fixture.employees[1].name, code: fixture.employees[1].code, phone: '', username: '', address: '', notes: '', fixedSalary: 0 });
    expect(peer).not.toHaveProperty('permissions');
    expect(JSON.stringify(employee.state)).not.toMatch(/private-personnel|private-open-exam|peer-bonus-reason/);
    expect((await write(employee.cookie, [{ collection: 'deductions', upsert: [{ ...fixture.deductions[0], amount: 80 }] }])).status).toBe(400);
    expect((await remove(employee.cookie, 'deductions', 'deduction')).status).toBe(400);
  }, 30_000);

  it('enforces create/edit/delete independently and never treats hidden write grants as authorization', async () => {
    fixture.employees[3].permissions = { DEDUCTIONS: { ...view, create: true }, BONUSES: { view: false, create: true, edit: true, delete: true } };
    await seed(); const employee = await signIn(fixture.employees[3].username);
    expect((await write(employee.cookie, [{ collection: 'deductions', upsert: [{ ...fixture.deductions[0], amount: 80 }] }])).status).toBe(400);
    expect((await remove(employee.cookie, 'deductions', 'deduction')).status).toBe(400);
    expect((await write(employee.cookie, [{ collection: 'bonuses', upsert: [{ ...fixture.bonuses[0], id: 'new-bonus' }] }])).status).toBe(400);
    const added = await write(employee.cookie, [{ collection: 'deductions', upsert: [{ ...fixture.deductions[0], id: 'new-deduction', createdBy: 'forged' }] }]);
    expect(added.status, await added.clone().text()).toBe(200);
    const saved = await loadData(database as unknown as DbExecutor);
    expect(saved.deductions.find(item => item.id === 'new-deduction')?.createdBy).toBe(fixture.employees[3].name);
    expect(saved.audit.some(item => item.actor === fixture.employees[3].name && item.entityId === 'new-deduction')).toBe(true);
  }, 30_000);

  it('allows delegated finance delete but blocks archive edits, moved archived records and unrelated account mutations', async () => {
    fixture.employees[3].permissions = { DEDUCTIONS: all, BONUSES: all };
    fixture.deductions.push({ ...fixture.deductions[0], id: 'archived-deduction', date: '2026-09-30' });
    fixture.months.push({ id: 'archive', month: '2026-09', state: 'ARCHIVED', snapshots: {} });
    await seed(); const employee = await signIn(fixture.employees[3].username);
    expect((await write(employee.cookie, [{ collection: 'deductions', upsert: [{ ...fixture.deductions[1], date: '2026-10-14' }] }])).status).toBe(400);
    expect((await remove(employee.cookie, 'deductions', 'archived-deduction')).status).toBe(400);
    expect((await write(employee.cookie, [{ collection: 'employees', upsert: [{ ...fixture.employees[0], role: 'SUPER_ADMIN' }] }])).status).toBe(400);
    expect((await remove(employee.cookie, 'bonuses', 'bonus')).status).toBe(200);
    const saved = await loadData(database as unknown as DbExecutor);
    expect(saved.bonuses).toEqual([]); expect(saved.deductions).toEqual(fixture.deductions); expect(saved.months).toEqual(fixture.months);
  }, 30_000);

  it('separates audit create/edit/delete capabilities and preserves exam/employee identity and closed-score locks', async () => {
    fixture.employees[3].permissions = { AUDIT_REVIEW: { ...view, edit: true } };
    await seed(); const employee = await signIn(fixture.employees[3].username); const owner = await signIn();
    expect((await write(employee.cookie, [{ collection: 'examEvaluations', upsert: [{ ...fixture.examEvaluations[0], id: 'new-score', employeeId: 'CP-0001' }] }])).status).toBe(400);
    expect((await write(employee.cookie, [{ collection: 'examEvaluations', upsert: [{ ...fixture.examEvaluations[0], employeeId: 'CP-0001' }] }])).status).toBe(400);
    expect((await remove(employee.cookie, 'examEvaluations', 'score')).status).toBe(400);
    expect((await write(employee.cookie, [{ collection: 'examEvaluations', upsert: [{ ...fixture.examEvaluations[0], papers: 110 }] }])).status).toBe(200);
    expect((await write(owner.cookie, [{ collection: 'evaluationExams', upsert: [{ ...fixture.evaluationExams[0], state: 'CLOSED' }] }], 11)).status).toBe(200);
    for (const cookie of [employee.cookie, owner.cookie]) expect((await write(cookie, [{ collection: 'examEvaluations', upsert: [{ ...fixture.examEvaluations[0], papers: 120 }] }], 12)).status).toBe(400);
    expect((await loadData(database as unknown as DbExecutor)).examEvaluations[0].papers).toBe(110);
  }, 30_000);

  it('permits owner exam metadata edits after closing but prevents managers and changes during/after cycle archival', async () => {
    fixture.evaluationExams[0].state = 'CLOSED';
    await seed(); const owner = await signIn(); const manager = await signIn(fixture.employees[4].username);
    const changed = { ...fixture.evaluationExams[0], name: 'عنوان مصحح', note: 'ملاحظة مصححة', date: '2026-10-13' };
    expect((await write(manager.cookie, [{ collection: 'evaluationExams', upsert: [changed] }])).status).toBe(400);
    const renamed = await write(owner.cookie, [{ collection: 'evaluationExams', upsert: [changed] }]);
    expect(renamed.status, await renamed.clone().text()).toBe(200);
    expect((await write(owner.cookie, [
      { collection: 'evaluationCycles', upsert: [{ ...fixture.evaluationCycles[0], state: 'ARCHIVED' }] },
      { collection: 'evaluationExams', upsert: [{ ...changed, name: 'اسم مختلف أثناء الأرشفة' }] },
    ], 11)).status).toBe(400);
    expect((await write(owner.cookie, [{ collection: 'evaluationCycles', upsert: [{ ...fixture.evaluationCycles[0], state: 'ARCHIVED' }] }], 11)).status).toBe(200);
    expect((await write(owner.cookie, [{ collection: 'evaluationExams', upsert: [{ ...changed, note: 'تغيير الأرشيف' }] }], 12)).status).toBe(400);
    const saved = await loadData(database as unknown as DbExecutor);
    expect(saved.evaluationCycles[0].snapshot?.exams[0]).toMatchObject({ name: changed.name, date: changed.date });
    expect(saved.evaluationExams[0]).toMatchObject(changed);
  }, 30_000);
});
