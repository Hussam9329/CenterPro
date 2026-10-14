import { readFile } from 'node:fs/promises';
import { pbkdf2Sync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db, DbExecutor } from '@/server/db/connection';
import type { AuthStore } from '@/lib/local-auth';
import type { DemoData } from '@/lib/types';
import type { MutationRequest, RemoteSnapshot } from '@/lib/server-contract';
import type { DeletionCollection } from '@/lib/safe-deletion';
import { createInitialData } from '@/lib/mock-data';
import { createSystemBackup } from '@/lib/system-backup';
import { createPopulatedTestData } from '../fixtures/populated-data';
import * as schema from '@/server/db/schema';
import { importBackup } from '@/server/db/import-backup';
import { loadAuthStore, loadData } from '@/server/db/repository';
import { GET as getState } from '@/app/api/state/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as mutate } from '@/app/api/mutations/route';

// Only replace the network adapter: authorization, migrations, real PostgreSQL
// constraints, SQL transactions, revision checks and session revocation run as shipped.
const holder = vi.hoisted(() => ({ db: null as unknown as Db }));
vi.mock('@/server/db/connection', async importOriginal => ({
  ...await importOriginal<typeof import('@/server/db/connection')>(),
  withDatabase: <T>(operation: (db: Db) => Promise<T>) => operation(holder.db),
}));

const origin = 'https://center.example';
const password = 'synthetic-deletion-fixture-password';
const stamp = '2026-10-14T12:00:00.000Z';
const reason = 'تصحيح سجل تجريبي أضيف بالخطأ';
let client: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
let fixture: DemoData;
let auth: AuthStore;

beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', 'synthetic-deletion-integration-secret-32-bytes');
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('VERCEL', '');
  client = new PGlite();
  for (const migration of ['0001_centerpro.sql', '0002_qr_display_account.sql']) {
    await client.exec(await readFile(new URL(`../../drizzle/${migration}`, import.meta.url), 'utf8'));
  }
  database = drizzle(client, { schema }); holder.db = database as unknown as Db;
  const populated = createPopulatedTestData();
  fixture = { ...createInitialData(), departments: populated.departments, employees: populated.employees.slice(0, 5) };
  fixture.employees[4].role = 'ADMIN';
  fixture.workdays = ['2026-10-13', '2026-10-14'].map((date, index) => ({ id: `day-${index}`, date, startTime: '08:00:00', departmentIds: ['dept-correction'], overrides: { 'CP-0001': 'INCLUDE' }, state: 'CLOSED' }));
  fixture.attendance = fixture.workdays.flatMap(day => fixture.employees.slice(0, 2).map(employee => ({ id: `${day.id}-${employee.id}`, employeeId: employee.id, workdayId: day.id, status: 'PRESENT', checkIn: `${day.date}T05:00:00.000Z`, latenessSeconds: 0, source: 'MANUAL', reason: '', updatedAt: stamp })));
  fixture.bonuses = [{ id: 'bonus', employeeId: 'CP-0001', amount: 100, date: '2026-10-14', reason: 'مكافأة اختبار', createdBy: 'historical', createdAt: stamp }];
  fixture.deductions = [{ id: 'deduction', employeeId: 'CP-0001', amount: 50, date: '2026-10-14', reason: 'خصم اختبار', type: 'خصم إداري', customType: '', createdBy: 'historical', createdAt: stamp }];
  fixture.evaluationSeasons = [{ id: 'season', name: 'موسم الاختبار', startDate: '2026-10-01', state: 'OPEN', openedAt: stamp, openedBy: 'historical' }];
  fixture.evaluationCycles = [{ id: 'cycle', seasonId: 'season', name: 'دورة الاختبار', state: 'OPEN', openedAt: stamp, openedBy: 'historical' }];
  fixture.evaluationExams = [{ id: 'exam', cycleId: 'cycle', name: 'امتحان الاختبار', date: '2026-10-14', note: '', state: 'OPEN', createdAt: stamp, createdBy: 'historical' }];
  fixture.examEvaluations = [{ id: 'score', examId: 'exam', employeeId: 'CP-0001', papers: 100, correctionErrors: 1, behaviorErrors: 0, note: '', createdAt: stamp, createdBy: 'historical', updatedAt: stamp, updatedBy: 'historical' }];
  fixture.audit = [{ id: 'old-audit', employeeId: 'CP-0001', actor: 'historical', role: 'SUPER_ADMIN', action: 'old event', entity: 'employees', entityId: 'CP-0001', oldValues: {}, newValues: { preserved: true }, timestamp: stamp }];
  const salt = Buffer.alloc(16, 47);
  const credential = { salt: salt.toString('base64'), hash: pbkdf2Sync(password, salt, 150_000, 32, 'sha256').toString('base64'), version: 1, updatedAt: stamp };
  auth = { schema: 1, system: { ...credential, username: 'deletion-owner' }, employees: Object.fromEntries(fixture.employees.map(employee => [employee.id, { ...credential }])) };
});
afterEach(async () => { await client?.close(); vi.unstubAllEnvs(); });

function request(path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) {
  return new Request(`${origin}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function seed() {
  const backup = await createSystemBackup({ data: fixture, auth, theme: null, revision: 10, origin });
  await database.transaction(tx => importBackup(tx as unknown as DbExecutor, backup));
}
async function signIn(username = 'deletion-owner') {
  const response = await login(request('/api/auth/login', { username, password, remember: true }));
  expect(response.status, await response.clone().text()).toBe(200);
  return { cookie: response.headers.get('set-cookie')!.split(';')[0], state: await response.json() as RemoteSnapshot };
}
async function state(cookie?: string) { return await (await getState(request('/api/state', undefined, cookie))).json() as RemoteSnapshot; }
function command(collection: DeletionCollection, id: string, revision = 10): MutationRequest {
  return { revision, changes: [], deletion: { collection, id, reason, confirmation: 'حذف' } };
}
async function remove(collection: DeletionCollection, id: string, cookie: string, revision = 10) {
  return mutate(request('/api/mutations', command(collection, id, revision), cookie));
}
async function stored() { return loadData(database as unknown as DbExecutor); }

describe('safe deletion API on real PostgreSQL', () => {
  it('builds a workday cascade on the server, preserves unrelated rows and history, and rejects stale retries', async () => {
    await seed(); const owner = await signIn();
    const response = await remove('workdays', 'day-0', owner.cookie);
    expect(response.status, await response.clone().text()).toBe(200);
    const result = await response.json() as RemoteSnapshot;
    expect(result.revision).toBe(11);
    expect(result.data.workdays.map(item => item.id)).toEqual(['day-1']);
    expect(result.data.attendance.map(item => item.id)).toEqual(fixture.attendance.filter(item => item.workdayId === 'day-1').map(item => item.id));
    expect(result.data.audit.find(item => item.id === 'old-audit')).toEqual(fixture.audit[0]);
    expect(result.data.audit.find(item => item.action === 'حذف يوم حضور')).toMatchObject({ actor: owner.state.session!.name, entityId: 'day-0', newValues: { reason, deletionRoot: { collection: 'workdays', id: 'day-0' } } });
    expect(result.data.audit.find(item => item.action === 'حذف آمن مؤكد')?.newValues).toMatchObject({ removed: { workdays: 1, attendance: 2 }, reason });
    expect(await stored()).toEqual(result.data);
    expect((await remove('workdays', 'day-1', owner.cookie)).status).toBe(409);
    expect(await stored()).toEqual(result.data);
    expect(await loadAuthStore(database as unknown as DbExecutor)).toEqual(auth);
  }, 30_000);

  it('atomically removes safe employee dependencies, credentials and all employee sessions while retaining other accounts and historical audit', async () => {
    await seed(); const owner = await signIn(); const employee = await signIn(fixture.employees[0].username); const secondEmployeeSession = await signIn(fixture.employees[0].username); const other = await signIn(fixture.employees[1].username);
    const response = await remove('employees', 'CP-0001', owner.cookie);
    expect(response.status, await response.clone().text()).toBe(200);
    const data = await stored();
    expect(data.employees.some(item => item.id === 'CP-0001')).toBe(false);
    for (const collection of ['attendance', 'deductions', 'bonuses', 'examEvaluations'] as const) expect(data[collection].some(item => item.employeeId === 'CP-0001')).toBe(false);
    expect(data.workdays.every(day => !Object.hasOwn(day.overrides, 'CP-0001'))).toBe(true);
    expect(data.audit.find(item => item.id === 'old-audit')).toEqual(fixture.audit[0]);
    const remainingAuth = await loadAuthStore(database as unknown as DbExecutor);
    expect(remainingAuth.employees).not.toHaveProperty('CP-0001');
    expect(remainingAuth.system).toEqual(auth.system); expect(remainingAuth.employees['CP-0002']).toEqual(auth.employees['CP-0002']);
    expect((await database.select().from(schema.sessions)).map(item => item.accountKey).sort()).toEqual(['CP-0002', 'SYSTEM']);
    for (const cookie of [employee.cookie, secondEmployeeSession.cookie]) expect((await state(cookie)).session).toBeNull();
    expect((await state(owner.cookie)).session?.role).toBe('SUPER_ADMIN'); expect((await state(other.cookie)).session?.employeeId).toBe('CP-0002');
    expect((await login(request('/api/auth/login', { username: fixture.employees[0].username, password, remember: false }))).status).toBe(401);
  }, 30_000);

  it.each(['ARCHIVED', 'REOPENED', 'PAID'] as const)('blocks direct and employee-cascade attendance deletion in a %s month without any writes', async protection => {
    if (protection === 'PAID') fixture.payments.push({ id: 'payment', employeeId: 'CP-0002', month: '2026-10', salaryAtPayment: 100, amount: 100, date: '2026-10-14', paidBy: 'historical', createdAt: stamp });
    else fixture.months.push({ id: 'archive', month: '2026-10', state: protection, snapshots: {} });
    await seed(); const owner = await signIn();
    for (const [collection, id] of [['workdays', 'day-0'], ['attendance', 'day-0-CP-0001'], ['employees', 'CP-0001']] as const) {
      const response = await remove(collection, id, owner.cookie);
      expect(response.status, await response.clone().text()).toBe(400);
    }
    expect(await stored()).toEqual(fixture); expect((await state(owner.cookie)).revision).toBe(10);
    expect(await loadAuthStore(database as unknown as DbExecutor)).toEqual(auth);
  }, 30_000);

  it('requires separate payment and archive deletions and keeps the original live payroll records', async () => {
    fixture.months.push({ id: 'archive', month: '2026-10', state: 'ARCHIVED', snapshots: {} });
    fixture.payments.push({ id: 'payment', employeeId: 'CP-0001', month: '2026-10', salaryAtPayment: 100, amount: 100, date: '2026-10-14', paidBy: 'historical', createdAt: stamp });
    await seed(); const owner = await signIn();
    expect((await remove('months', 'archive', owner.cookie)).status).toBe(400);
    expect((await remove('payments', 'payment', owner.cookie)).status).toBe(200);
    expect((await stored()).months).toEqual(fixture.months);
    expect((await remove('months', 'archive', owner.cookie, 11)).status).toBe(200);
    const data = await stored(); expect(data.months).toEqual([]); expect(data.payments).toEqual([]);
    for (const collection of ['workdays', 'attendance', 'deductions', 'bonuses'] as const) expect(data[collection]).toEqual(fixture[collection]);
    expect(data.audit.filter(item => item.action === 'حذف آمن مؤكد')).toHaveLength(2);
  }, 30_000);

  it('protects archived evaluation children and deletes their explicitly selected season in one transaction', async () => {
    fixture.evaluationExams[0].state = 'CLOSED';
    Object.assign(fixture.evaluationCycles[0], { state: 'ARCHIVED', snapshot: { rows: [], exams: [{ id: 'exam', name: 'امتحان الاختبار', date: '2026-10-14', rows: [] }] } });
    Object.assign(fixture.evaluationSeasons[0], { state: 'ARCHIVED', endDate: '2026-10-14', snapshot: { rows: [], cycleIds: ['cycle'] } });
    await seed(); const owner = await signIn();
    for (const [collection, id] of [['evaluationCycles', 'cycle'], ['evaluationExams', 'exam'], ['examEvaluations', 'score'], ['employees', 'CP-0001']] as const) expect((await remove(collection, id, owner.cookie)).status).toBe(400);
    expect(await stored()).toEqual(fixture);
    const response = await remove('evaluationSeasons', 'season', owner.cookie);
    expect(response.status, await response.clone().text()).toBe(200);
    const data = await stored();
    for (const collection of ['evaluationSeasons', 'evaluationCycles', 'evaluationExams', 'examEvaluations'] as const) expect(data[collection]).toEqual([]);
    expect(data.employees).toEqual(fixture.employees); expect(data.attendance).toEqual(fixture.attendance);
    expect(data.audit.find(item => item.action === 'حذف آمن مؤكد')?.newValues.removed).toEqual({ evaluationSeasons: 1, evaluationCycles: 1, evaluationExams: 1, examEvaluations: 1 });
  }, 30_000);

  it('rejects forged cascades, ordinary remove bypasses, missing confirmation/reason and forbidden actors, while allowing the auditor to delete an open evaluation', async () => {
    await seed(); const owner = await signIn(); const employee = await signIn(fixture.employees[0].username); const auditor = await signIn(fixture.employees[3].username); const admin = await signIn(fixture.employees[4].username);
    const intent = command('workdays', 'day-0');
    expect((await mutate(request('/api/mutations', intent))).status).toBe(401);
    expect((await mutate(request('/api/mutations', intent, owner.cookie, { Origin: 'https://foreign.example' }))).status).toBe(403);
    for (const body of [
      { ...intent, deletion: { ...intent.deletion, reason: '  ' } },
      { ...intent, deletion: { ...intent.deletion, confirmation: 'yes' } },
      { ...intent, deletion: { ...intent.deletion, removals: { employees: ['CP-0001'] } } },
      { ...intent, changes: [{ collection: 'employees', remove: ['CP-0001'] }] },
      { ...intent, settings: { centerName: 'forged', qrInterval: 45 } },
      { ...intent, password: { employeeId: 'CP-0001', value: 'forged-password' } },
      ...(['employees', 'bonuses', 'deductions', 'examEvaluations'] as const).map(collection => ({ revision: 10, changes: [{ collection, remove: [collection === 'employees' ? 'CP-0001' : collection === 'examEvaluations' ? 'score' : collection === 'bonuses' ? 'bonus' : 'deduction'] }] })),
    ]) expect((await mutate(request('/api/mutations', body, owner.cookie))).status).toBe(400);
    for (const cookie of [employee.cookie, auditor.cookie]) expect((await remove('workdays', 'day-0', cookie)).status).toBe(400);
    expect((await remove('examEvaluations', 'score', employee.cookie)).status).toBe(400);
    expect((await remove('departments', 'dept-sales', admin.cookie)).status).toBe(400);
    expect(await stored()).toEqual(fixture); expect((await state(owner.cookie)).revision).toBe(10);
    const response = await remove('examEvaluations', 'score', auditor.cookie);
    expect(response.status, await response.clone().text()).toBe(200);
    expect((await stored()).examEvaluations).toEqual([]);
    expect((await stored()).audit.find(item => item.action === 'حذف بيانات تدقيق مصحح')).toMatchObject({ actor: fixture.employees[3].name, role: 'EMPLOYEE', newValues: { reason } });
  }, 30_000);

  it('rolls back employee records, credentials, sessions and revision when a database write fails', async () => {
    await seed(); const owner = await signIn(); const employee = await signIn(fixture.employees[0].username);
    const sessionsBefore = await database.select().from(schema.sessions);
    // Fail at the final revision bump, after record, audit, credential and
    // session deletion SQL has run, to prove they share the same transaction.
    await client.exec("CREATE FUNCTION centerpro.reject_deletion_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic private transaction failure'; END $$; CREATE TRIGGER reject_deletion_revision BEFORE UPDATE OF revision ON centerpro.state FOR EACH ROW EXECUTE FUNCTION centerpro.reject_deletion_revision();");
    const response = await remove('employees', 'CP-0001', owner.cookie);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('synthetic private');
    expect(await stored()).toEqual(fixture); expect(await loadAuthStore(database as unknown as DbExecutor)).toEqual(auth);
    expect(await database.select().from(schema.sessions)).toEqual(sessionsBefore);
    expect((await state(owner.cookie)).revision).toBe(10); expect((await state(employee.cookie)).session?.employeeId).toBe('CP-0001');
  }, 30_000);
});
