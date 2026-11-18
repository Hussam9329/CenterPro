import { readFile } from 'node:fs/promises';
import { pbkdf2Sync, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db, DbExecutor } from '@/server/db/connection';
import type { AuthStore } from '@/lib/local-auth';
import type { DemoData } from '@/lib/types';
import type { Todo, TodoInput } from '@/lib/todos';
import { createInitialData } from '@/lib/mock-data';
import { createSystemBackup } from '@/lib/system-backup';
import { createPopulatedTestData } from '../fixtures/populated-data';
import * as schema from '@/server/db/schema';
import { importBackup } from '@/server/db/import-backup';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as getBackup } from '@/app/api/backup/route';
import { GET as getState } from '@/app/api/state/route';
import { GET as getTodos, POST as postTodos } from '@/app/api/todos/route';

// Real routes, sessions and SQL constraints against embedded PostgreSQL with the production migrations.
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
beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', 'synthetic-integration-secret-at-least-32-bytes');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL', '');
  client = new PGlite();
  for (const migration of ['0001_centerpro.sql', '0002_qr_display_account.sql', '0003_game_plays.sql', '0004_todos.sql']) {
    await client.exec(await readFile(new URL(`../../drizzle/${migration}`, import.meta.url), 'utf8'));
  }
  database = drizzle(client, { schema }); holder.db = database as unknown as Db;
  const populated = createPopulatedTestData();
  fixture = { ...createInitialData(), departments: populated.departments, employees: populated.employees.slice(0, 3) };
  fixture.employees[1].role = 'ADMIN';
  const salt = Buffer.alloc(16, 42);
  const credential = { salt: salt.toString('base64'), hash: pbkdf2Sync(password, salt, 150_000, 32, 'sha256').toString('base64'), version: 7, updatedAt: '2026-10-12T12:00:00.000Z' };
  const auth: AuthStore = { schema: 1, system: { ...credential, username: 'test-owner' }, qrDisplay: { ...credential, username: 'test-screen', active: true }, employees: Object.fromEntries(fixture.employees.map(employee => [employee.id, { ...credential }])) };
  const backup = await createSystemBackup({ data: fixture, auth, theme: null, revision: 10, origin });
  await database.transaction(tx => importBackup(tx as unknown as DbExecutor, backup));
}, 60_000);
afterEach(async () => { await client?.close(); vi.unstubAllEnvs(); });

function request(path: string, body?: unknown, cookie?: string): Request {
  return new Request(`${origin}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function signIn(username: string) {
  const response = await login(request('/api/auth/login', { username, password, remember: false }));
  expect(response.status, await response.clone().text()).toBe(200);
  return response.headers.get('set-cookie')!.split(';')[0];
}
const task = (title: string, overrides: Partial<TodoInput> = {}): TodoInput => ({ id: randomUUID(), title, notes: '', priority: 'NORMAL', dueDate: null, dueTime: null, subtasks: [], completed: false, ...overrides });
const save = (todo: TodoInput, cookie?: string) => postTodos(request('/api/todos', { action: 'save', todo }, cookie));
const remove = (ids: string[], cookie?: string) => postTodos(request('/api/todos', { action: 'delete', ids }, cookie));
async function list(cookie: string) {
  const response = await getTodos(request('/api/todos', undefined, cookie));
  expect(response.status).toBe(200);
  return await response.json() as Todo[];
}

describe('private to-do list API on real PostgreSQL', () => {
  it('gives employee, manager and owner accounts separate lists', async () => {
    const employee = await signIn(fixture.employees[0].username);
    const manager = await signIn(fixture.employees[1].username);
    const owner = await signIn('test-owner');
    expect((await save(task('مهمة الموظف', { priority: 'URGENT', dueDate: '2026-11-20', dueTime: '09:30', notes: 'تفاصيل', subtasks: [{ id: randomUUID(), title: 'خطوة', done: true }] }), employee)).status).toBe(200);
    expect((await save(task('مهمة المدير'), manager)).status).toBe(200);
    expect((await save(task('مهمة المالك'), owner)).status).toBe(200);
    const mine = await list(employee);
    expect(mine.map(item => item.title)).toEqual(['مهمة الموظف']);
    expect(mine[0]).toMatchObject({ priority: 'URGENT', dueDate: '2026-11-20', dueTime: '09:30', notes: 'تفاصيل', completedAt: null });
    expect(mine[0].subtasks).toHaveLength(1);
    expect((await list(manager)).map(item => item.title)).toEqual(['مهمة المدير']);
    expect((await list(owner)).map(item => item.title)).toEqual(['مهمة المالك']);
  }, 60_000);

  it('never lets one account read, change or delete a task by guessing its id', async () => {
    const employee = await signIn(fixture.employees[0].username);
    const owner = await signIn('test-owner');
    const secret = task('سر الموظف');
    await save(secret, employee);

    const deleted = await remove([secret.id], owner);
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deleted: 0 });
    // The same id from another account creates that account's own task, leaving the first untouched.
    expect((await save({ ...secret, title: 'محاولة تعديل' }, owner)).status).toBe(200);
    expect((await list(employee)).map(item => item.title)).toEqual(['سر الموظف']);
    expect((await list(owner)).map(item => item.title)).toEqual(['محاولة تعديل']);

    expect(await (await remove([secret.id], employee)).json()).toEqual({ deleted: 1 });
    expect(await list(employee)).toEqual([]);
    expect((await list(owner)).map(item => item.title)).toEqual(['محاولة تعديل']);
  }, 60_000);

  it('rejects signed-out requests, the attendance screen and a body naming another account', async () => {
    expect((await getTodos(request('/api/todos'))).status).toBe(401);
    expect((await save(task('بدون جلسة'))).status).toBe(401);
    const screen = await signIn('test-screen');
    expect((await getTodos(request('/api/todos', undefined, screen))).status).toBe(403);
    expect((await save(task('شاشة'), screen)).status).toBe(403);
    const employee = await signIn(fixture.employees[0].username);
    const forged = await postTodos(request('/api/todos', { action: 'save', todo: { ...task('مزور'), accountKey: 'SYSTEM' } }, employee));
    expect(forged.status).toBe(400);
    expect(await database.select().from(schema.todos)).toHaveLength(0);
  }, 60_000);

  it('keeps tasks out of snapshots, the operations log and the owner backup', async () => {
    const employee = await signIn(fixture.employees[0].username);
    const owner = await signIn('test-owner');
    await save(task('عنوان-خاص-جداً', { notes: 'ملاحظة-خاصة-جداً' }), employee);
    for (const cookie of [employee, owner]) {
      const snapshot = await (await getState(request('/api/state', undefined, cookie))).text();
      expect(snapshot).not.toContain('خاص');
    }
    const backup = await getBackup(request('/api/backup', undefined, owner));
    expect(backup.status).toBe(200);
    expect(await backup.text()).not.toContain('خاص');
  }, 60_000);

  it('records completion once and removes tasks with the account', async () => {
    const employee = await signIn(fixture.employees[0].username);
    const item = task('إنهاء');
    await save({ ...item, completed: true }, employee);
    const first = (await list(employee))[0].completedAt;
    expect(first).not.toBeNull();
    await save({ ...item, completed: true, title: 'إنهاء معدل' }, employee);
    expect((await list(employee))[0]).toMatchObject({ title: 'إنهاء معدل', completedAt: first });
    await save(item, employee);
    expect((await list(employee))[0].completedAt).toBeNull();
    await database.delete(schema.credentials).where(eq(schema.credentials.accountKey, fixture.employees[0].id));
    expect(await database.select().from(schema.todos)).toHaveLength(0);
  }, 60_000);
});
