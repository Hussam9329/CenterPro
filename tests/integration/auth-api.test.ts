import { readFile } from 'node:fs/promises';
import { pbkdf2Sync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db, DbExecutor } from '@/server/db/connection';
import type { AuthStore } from '@/lib/local-auth';
import type { DemoData } from '@/lib/types';
import type { RemoteSnapshot } from '@/lib/server-contract';
import { createInitialData } from '@/lib/mock-data';
import { createSystemBackup, parseSystemBackup } from '@/lib/system-backup';
import { createPopulatedTestData } from '../fixtures/populated-data';
import * as schema from '@/server/db/schema';
import { importBackup } from '@/server/db/import-backup';
import { loadAuthStore, loadData } from '@/server/db/repository';
import { hashSessionToken, rateLimitKey } from '@/server/auth-crypto';
import { baghdadDate, LOGIN_ACCOUNT_DAILY_LIMIT, LOGIN_ACCOUNT_LIMIT, LOGIN_DAY_MS, LOGIN_IP_LIMIT, sessionCookieName } from '@/server/auth';
import { GET as getState } from '@/app/api/state/route';
import { GET as getBackup } from '@/app/api/backup/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { POST as manageQrDisplay } from '@/app/api/auth/qr-display/route';
import { POST as mutate } from '@/app/api/mutations/route';
import { GET as getQr } from '@/app/api/qr/route';
import { POST as checkIn } from '@/app/api/attendance/check-in/route';
import { GET as getPhoto } from '@/app/api/photos/[hash]/route';

// Replace the network transport only. Routes, authorization, SQL transactions,
// constraints, password derivation, session cookies and persisted counters run
// against a real embedded PostgreSQL engine with the production migration.
const holder = vi.hoisted(() => ({ db: null as unknown as Db }));
const blobStore = vi.hoisted(() => ({ values: new Map<string, string>(), reads: 0, writes: 0, failWrites: false }));
vi.mock('@/server/db/connection', async importOriginal => ({
  ...await importOriginal<typeof import('@/server/db/connection')>(),
  withDatabase: <T>(operation: (db: Db) => Promise<T>) => operation(holder.db),
}));
vi.mock('@vercel/blob', () => ({
  get: async (path: string) => {
    blobStore.reads += 1;
    const value = blobStore.values.get(path);
    return value === undefined ? null : { statusCode: 200, blob: { size: Buffer.byteLength(value) }, stream: new Response(value).body };
  },
  put: async (path: string, value: string, options: { access: string; allowOverwrite: boolean }) => {
    expect(options.access).toBe('private'); expect(options.allowOverwrite).toBe(false);
    if (blobStore.failWrites) throw new Error('Synthetic object storage failure');
    blobStore.writes += 1; blobStore.values.set(path, value);
    return { url: 'https://private-blob.example/never-exposed' };
  },
}));

const origin = 'https://center.example';
const password = 'fixture-password-only';
const changedPassword = 'changed-fixture-password';
let client: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
let fixture: DemoData;
let auth: AuthStore;
beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', 'synthetic-integration-secret-at-least-32-bytes');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VERCEL', '');
  blobStore.values.clear(); blobStore.reads = 0; blobStore.writes = 0; blobStore.failWrites = false;
  client = new PGlite();
  await client.exec(await readFile(new URL('../../drizzle/0001_centerpro.sql', import.meta.url), 'utf8'));
  await client.exec(await readFile(new URL('../../drizzle/0002_qr_display_account.sql', import.meta.url), 'utf8'));
  database = drizzle(client, { schema }); holder.db = database as unknown as Db;
  const populated = createPopulatedTestData();
  fixture = { ...createInitialData(), departments: populated.departments, employees: populated.employees.slice(0, 3) };
  fixture.employees[1].role = 'ADMIN'; fixture.employees[2].active = false;
  const today = baghdadDate(new Date());
  fixture.workdays = [{ id: 'today-workday', date: today, startTime: '00:00', departmentIds: [fixture.employees[0].departmentId], overrides: {}, state: 'OPEN' }];
  const salt = Buffer.alloc(16, 42);
  const credential = { salt: salt.toString('base64'), hash: pbkdf2Sync(password, salt, 150_000, 32, 'sha256').toString('base64'), version: 7, updatedAt: '2026-10-12T12:00:00.000Z' };
  auth = { schema: 1, system: { ...credential, username: 'test-owner' }, employees: Object.fromEntries(fixture.employees.map(employee => [employee.id, { ...credential }])) };
});
afterEach(async () => { await client?.close(); vi.unstubAllEnvs(); });

function request(path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}): Request {
  return new Request(`${origin}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { Origin: origin, 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), 'User-Agent': 'CenterPro integration fixture', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function seed() {
  const backup = await createSystemBackup({ data: fixture, auth, theme: null, revision: 10, origin });
  await database.transaction(tx => importBackup(tx as unknown as DbExecutor, backup));
}
async function signIn(username = 'test-owner', remember = false, value = password) {
  const response = await login(request('/api/auth/login', { username, password: value, remember }));
  expect(response.status, await response.clone().text()).toBe(200);
  return { response, cookie: response.headers.get('set-cookie')!.split(';')[0], state: await response.json() as RemoteSnapshot };
}
async function state(cookie?: string) { return await (await getState(request('/api/state', undefined, cookie))).json() as RemoteSnapshot; }

describe('real PostgreSQL authentication and API boundaries', () => {
  it('locks an empty installation for import and never exposes persisted data or credentials to an anonymous browser', async () => {
    const empty = await state();
    expect(empty).toMatchObject({ session: null, pendingImport: true, systemConfigured: false, systemUsername: '', revision: 0, backend: 'neon' });
    expect(empty.data).toEqual(createInitialData());
    const pending = await login(request('/api/auth/login', { username: 'new-owner', password, remember: false }));
    expect(pending.status).toBe(503); expect(await database.select().from(schema.credentials)).toHaveLength(0);
    await seed();
    const anonymous = await state();
    expect(anonymous.systemConfigured).toBe(true); expect(anonymous.pendingImport).toBe(false); expect(anonymous.data.employees).toHaveLength(0);
    expect(JSON.stringify(anonymous)).not.toContain(auth.system!.hash); expect(JSON.stringify(anonymous)).not.toContain('test-owner');
    expect((await getBackup(request('/api/backup'))).status).toBe(401);
  }, 30_000);

  it('logs in from imported credentials, sets a secure opaque cookie, enforces session expiration and revokes logout server-side', async () => {
    await seed();
    const result = await signIn(' TEST-OWNER ', true);
    const header = result.response.headers.get('set-cookie')!;
    expect(header).toContain('__Host-centerpro_session='); expect(header).toContain('HttpOnly'); expect(header).toContain('Secure'); expect(header).toContain('SameSite=strict'); expect(header).toContain('Max-Age=2592000');
    expect(result.state.session?.role).toBe('SUPER_ADMIN');
    const rows = await database.select().from(schema.sessions);
    expect(rows).toHaveLength(1); expect(rows[0].tokenHash).toBe(hashSessionToken(result.cookie.split('=')[1])); expect(JSON.stringify(rows)).not.toContain(result.cookie.split('=')[1]);
    const loggedOut = await logout(request('/api/auth/logout', {}, result.cookie));
    expect(loggedOut.status).toBe(200); expect(loggedOut.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await state(result.cookie)).session).toBeNull(); expect(await database.select().from(schema.sessions)).toHaveLength(0);
    const another = await signIn();
    await database.update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1) });
    expect((await state(another.cookie)).session).toBeNull();
  }, 30_000);

  it('creates a dedicated QR display account that can only read the open workday and issue QR tokens', async () => {
    fixture.employees[0].photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKp0AAAAASUVORK5CYII=';
    Object.assign(fixture, { privateExtension: 'root-secret' });
    Object.assign(fixture.workdays[0], { privateNote: 'workday-secret' });
    fixture.workdays[0].overrides[fixture.employees[0].id] = 'INCLUDE';
    fixture.workdays.push({ ...fixture.workdays[0], id: 'closed-day', date: '2025-01-01', state: 'CLOSED' });
    await seed();
    const owner = await signIn();
    const revision = owner.state.revision;
    const configured = await manageQrDisplay(request('/api/auth/qr-display', { revision, username: 'CENTER_QR', password: 'display-password', active: true }, owner.cookie));
    expect(configured.status, await configured.clone().text()).toBe(200);
    const ownerAfter = await configured.json() as RemoteSnapshot;
    expect(ownerAfter).toMatchObject({ qrDisplayConfigured: true, qrDisplayUsername: 'CENTER_QR', qrDisplayActive: true });

    const displayLogin = await login(request('/api/auth/login', { username: 'center_qr', password: 'display-password', remember: true }));
    expect(displayLogin.status, await displayLogin.clone().text()).toBe(200);
    const displayCookie = displayLogin.headers.get('set-cookie')!.split(';')[0];
    const displayState = await displayLogin.json() as RemoteSnapshot;
    expect(displayState.session).toMatchObject({ role: 'QR_DISPLAY', kind: 'QR_DISPLAY', name: 'شاشة الحضور' });
    expect(displayState.session).not.toHaveProperty('employeeId');
    expect(displayState).toMatchObject({ systemUsername: '', qrDisplayConfigured: false, qrDisplayUsername: '', qrDisplayActive: false });
    expect(displayState.data).toEqual({ ...createInitialData(), settings: fixture.settings, workdays: [{ id: fixture.workdays[0].id, date: fixture.workdays[0].date, startTime: '00:00', state: 'OPEN', departmentIds: [], overrides: {} }] });
    const qrResponse = await getQr(request('/api/qr', undefined, displayCookie));
    expect(qrResponse.status).toBe(200);
    const qr = await qrResponse.json() as { token: string };
    const stored = await loadData(database as unknown as DbExecutor);
    const photoHash = stored.employees[0].photo!.split('/').at(-1)!;
    const blobReads = blobStore.reads;
    expect((await getPhoto(request(`/api/photos/${photoHash}`, undefined, displayCookie), { params: Promise.resolve({ hash: photoHash }) })).status).toBe(404);
    expect(blobStore.reads).toBe(blobReads);
    expect((await getBackup(request('/api/backup', undefined, displayCookie))).status).toBe(403);
    expect((await checkIn(request('/api/attendance/check-in', { token: qr.token }, displayCookie))).status).toBe(403);
    expect((await manageQrDisplay(request('/api/auth/qr-display', { revision: displayState.revision, username: 'ESCALATION', password: changedPassword, active: true }, displayCookie))).status).toBe(403);

    const forbidden = await mutate(request('/api/mutations', { revision: displayState.revision, changes: [], settings: { centerName: 'Blocked', qrInterval: 45 } }, displayCookie));
    expect(forbidden.status).toBe(403);
    expect((await mutate(request('/api/mutations', { revision: displayState.revision, changes: [], password: { employeeId: fixture.employees[0].id, value: changedPassword } }, displayCookie))).status).toBe(403);
    expect((await mutate(request('/api/mutations', { revision: displayState.revision, changes: [{ collection: 'employees', upsert: [{ ...fixture.employees[0], role: 'SUPER_ADMIN' }] }] }, displayCookie))).status).toBe(403);
    expect(await loadData(database as unknown as DbExecutor)).toEqual(stored);
    expect((await state(owner.cookie)).session?.role).toBe('SUPER_ADMIN');

    const employee = await signIn(fixture.employees[0].username);
    expect((await checkIn(request('/api/attendance/check-in', { token: qr.token }, employee.cookie))).status).toBe(200);
    const currentDisplay = await state(displayCookie);
    expect(currentDisplay.data).toEqual(displayState.data);

    const disabled = await manageQrDisplay(request('/api/auth/qr-display', { revision: currentDisplay.revision, username: 'CENTER_QR', active: false }, owner.cookie));
    expect(disabled.status, await disabled.clone().text()).toBe(200);
    expect((await state(displayCookie)).session).toBeNull();
    expect((await login(request('/api/auth/login', { username: 'CENTER_QR', password: 'display-password', remember: true }))).status).toBe(401);
    expect((await state(owner.cookie)).session?.role).toBe('SUPER_ADMIN');
  }, 30_000);

  it('restricts QR account management to the owner role and atomically rejects stale, forged and colliding account updates', async () => {
    await seed(); const owner = await signIn(); const employee = await signIn(fixture.employees[0].username); const admin = await signIn(fixture.employees[1].username);
    const command = { revision: owner.state.revision, username: 'CENTER_QR', password: 'display-password', active: true };
    expect((await manageQrDisplay(request('/api/auth/qr-display', command))).status).toBe(401);
    for (const cookie of [employee.cookie, admin.cookie]) expect((await manageQrDisplay(request('/api/auth/qr-display', command, cookie))).status).toBe(403);
    expect((await manageQrDisplay(request('/api/auth/qr-display', command, owner.cookie, { Origin: 'https://foreign.example' }))).status).toBe(403);
    expect((await manageQrDisplay(request('/api/auth/qr-display', { ...command, role: 'SUPER_ADMIN' }, owner.cookie))).status).toBe(400);
    expect((await manageQrDisplay(request('/api/auth/qr-display', { ...command, revision: command.revision - 1 }, owner.cookie))).status).toBe(409);
    for (const username of [' TEST-OWNER ', ` ${fixture.employees[0].username.toUpperCase()} `, fixture.employees[2].username, 'invalid name']) {
      expect((await manageQrDisplay(request('/api/auth/qr-display', { ...command, username }, owner.cookie))).status).toBe(400);
    }
    for (const password of ['', 'short']) expect((await manageQrDisplay(request('/api/auth/qr-display', { ...command, password }, owner.cookie))).status).toBe(400);
    expect(await loadAuthStore(database as unknown as DbExecutor)).toEqual(auth);
    expect(await loadData(database as unknown as DbExecutor)).toEqual(fixture);
    expect((await state(owner.cookie)).revision).toBe(command.revision);

    expect((await manageQrDisplay(request('/api/auth/qr-display', command, owner.cookie))).status).toBe(200);
    const current = await state(owner.cookie);
    const collision = { revision: current.revision, changes: [{ collection: 'employees', upsert: [{ ...fixture.employees[0], username: ' center_qr ' }] }] };
    expect((await mutate(request('/api/mutations', collision, owner.cookie))).status).toBe(400);
    const reservedRole = { revision: current.revision, changes: [{ collection: 'employees', upsert: [{ ...fixture.employees[0], role: 'QR_DISPLAY' }] }] };
    expect((await mutate(request('/api/mutations', reservedRole, owner.cookie))).status).toBe(400);
    expect((await state(owner.cookie)).revision).toBe(current.revision);
    expect((await loadData(database as unknown as DbExecutor)).employees).toEqual(fixture.employees);
  }, 30_000);

  it('renames, rotates, disables and re-enables display credentials without touching owner or employee sessions', async () => {
    await seed(); const owner = await signIn(); const employee = await signIn(fixture.employees[0].username);
    const update = async (username: string, active: boolean, password?: string) => {
      const current = await state(owner.cookie);
      const response = await manageQrDisplay(request('/api/auth/qr-display', { revision: current.revision, username, active, ...(password ? { password } : {}) }, owner.cookie));
      expect(response.status, await response.clone().text()).toBe(200);
      const ownerAfter = await response.json() as RemoteSnapshot;
      expect(ownerAfter.session?.role).toBe('SUPER_ADMIN');
      expect((await state(employee.cookie)).session?.employeeId).toBe(fixture.employees[0].id);
      return ownerAfter;
    };
    await update('CENTER_QR', true, 'display-password');
    const first = await signIn('center_qr', true, 'display-password');
    const second = await signIn('center_qr', false, 'display-password');
    const original = (await loadAuthStore(database as unknown as DbExecutor)).qrDisplay!;
    await update('RENAMED_QR', true);
    for (const cookie of [first.cookie, second.cookie]) expect((await state(cookie)).session).toBeNull();
    expect((await loadAuthStore(database as unknown as DbExecutor)).qrDisplay).toEqual({ ...original, username: 'RENAMED_QR' });
    expect((await login(request('/api/auth/login', { username: 'CENTER_QR', password: 'display-password', remember: false }))).status).toBe(401);
    const renamed = await signIn('renamed_qr', true, 'display-password');
    await update('RENAMED_QR', true, changedPassword);
    expect((await state(renamed.cookie)).session).toBeNull();
    expect((await login(request('/api/auth/login', { username: 'RENAMED_QR', password: 'display-password', remember: false }))).status).toBe(401);
    const rotated = await signIn('renamed_qr', true, changedPassword);
    expect((await loadAuthStore(database as unknown as DbExecutor)).qrDisplay?.version).toBe(original.version + 1);
    await update('RENAMED_QR', false);
    expect((await state(rotated.cookie)).session).toBeNull();
    expect((await login(request('/api/auth/login', { username: 'RENAMED_QR', password: changedPassword, remember: false }))).status).toBe(401);
    await update('RENAMED_QR', true);
    const restored = await signIn('renamed_qr', true, changedPassword);
    expect((await state(rotated.cookie)).session).toBeNull();
    expect((await logout(request('/api/auth/logout', {}, restored.cookie))).status).toBe(200);
    expect((await getQr(request('/api/qr', undefined, restored.cookie))).status).toBe(401);
    expect((await state(owner.cookie)).session?.role).toBe('SUPER_ADMIN');
    expect((await state(employee.cookie)).session?.employeeId).toBe(fixture.employees[0].id);
    const persisted = await loadAuthStore(database as unknown as DbExecutor);
    expect(persisted.system).toEqual(auth.system); expect(persisted.employees).toEqual(auth.employees);
    const backup = await parseSystemBackup(await (await getBackup(request('/api/backup', undefined, owner.cookie))).text());
    expect(backup.payload.authentication.credentials).toEqual(persisted);
    const audit = JSON.stringify((await loadData(database as unknown as DbExecutor)).audit);
    for (const secret of ['display-password', changedPassword, persisted.qrDisplay!.hash, persisted.qrDisplay!.salt]) expect(audit).not.toContain(secret);
  }, 30_000);

  it('commits account/IP rate limits across failed logins and gives identical generic errors for wrong, unknown and inactive accounts', async () => {
    await seed();
    const bodies = [];
    for (const username of ['test-owner', 'unknown-account', fixture.employees[2].username]) {
      const response = await login(request('/api/auth/login', { username, password: username === fixture.employees[2].username ? password : 'wrong-password', remember: false }));
      expect(response.status).toBe(401); bodies.push(await response.text());
    }
    expect(new Set(bodies).size).toBe(1);
    for (let attempt = 1; attempt < LOGIN_ACCOUNT_LIMIT; attempt += 1) expect((await login(request('/api/auth/login', { username: 'unknown-account', password, remember: false }))).status).toBe(401);
    const blocked = await login(request('/api/auth/login', { username: 'UNKNOWN-ACCOUNT', password, remember: false }));
    expect(blocked.status).toBe(429); expect(blocked.headers.get('Retry-After')).toBe('900');
    expect((await database.select().from(schema.loginRateLimits).where(eq(schema.loginRateLimits.key, rateLimitKey('account', 'unknown-account'))))[0].count).toBe(LOGIN_ACCOUNT_LIMIT + 1);
    await database.update(schema.loginRateLimits).set({ count: LOGIN_IP_LIMIT }).where(eq(schema.loginRateLimits.key, rateLimitKey('ip', 'local-server')));
    expect((await login(request('/api/auth/login', { username: 'test-owner', password, remember: false }, undefined, { 'X-Forwarded-For': '1.2.3.4' }))).status).toBe(429);
    expect(await database.select().from(schema.sessions)).toHaveLength(0);
  }, 30_000);

  it('locks a username for a day after repeated failures, even with the right password, and says when to retry', async () => {
    await seed();
    expect((await login(request('/api/auth/login', { username: 'test-owner', password: 'wrong-password-1', remember: false }))).status).toBe(401);
    const dailyKey = rateLimitKey('account-day', 'test-owner');
    expect((await database.select().from(schema.loginRateLimits).where(eq(schema.loginRateLimits.key, dailyKey)))[0].count).toBe(1);
    await database.update(schema.loginRateLimits).set({ count: LOGIN_ACCOUNT_DAILY_LIMIT, blockedUntil: new Date(Date.now() + LOGIN_DAY_MS) }).where(eq(schema.loginRateLimits.key, dailyKey));
    const blocked = await login(request('/api/auth/login', { username: 'test-owner', password, remember: false }));
    expect(blocked.status).toBe(429); expect(blocked.headers.get('Retry-After')).toBe(String(LOGIN_DAY_MS / 1000));
    expect(await database.select().from(schema.sessions)).toHaveLength(0);
  }, 30_000);

  it('projects employee data, protects backups, rejects cross-origin and forged-role writes, and enforces revision conflicts', async () => {
    await seed(); const employee = await signIn(fixture.employees[0].username); const owner = await signIn();
    expect(employee.state.data.employees.find(row => row.id === fixture.employees[0].id)?.phone).toBe(fixture.employees[0].phone);
    // Published ranking names/codes are intentionally visible, private account
    // and personnel fields of colleagues must be removed on the server.
    for (const colleague of employee.state.data.employees.filter(row => row.id !== fixture.employees[0].id)) {
      expect(colleague).toMatchObject({ phone: '', guardianPhone: '', address: '', username: '', notes: '', fixedSalary: 0 });
    }
    expect(employee.state.systemUsername).toBe(''); expect(employee.state.data.audit).toHaveLength(0);
    expect((await getBackup(request('/api/backup', undefined, employee.cookie))).status).toBe(403);
    const backupResponse = await getBackup(request('/api/backup?theme=dark', undefined, owner.cookie));
    expect(backupResponse.status).toBe(200); expect(backupResponse.headers.get('cache-control')).toContain('no-store');
    const backup = await parseSystemBackup(await backupResponse.text()); expect(backup.payload.data).toEqual(fixture); expect(backup.payload.authentication.credentials).toEqual(auth);
    const command = { revision: owner.state.revision, changes: [], settings: { ...fixture.settings, centerName: 'Updated fixture center' } };
    expect((await mutate(request('/api/mutations', command, owner.cookie, { Origin: 'https://evil.example' }))).status).toBe(403);
    expect((await mutate(request('/api/mutations', { ...command, role: 'SUPER_ADMIN' }, employee.cookie))).status).toBe(400);
    expect((await mutate(request('/api/mutations', command, employee.cookie))).status).toBe(400);
    expect((await mutate(request('/api/mutations', command, owner.cookie))).status).toBe(200);
    expect((await mutate(request('/api/mutations', command, owner.cookie))).status).toBe(409);
    const current = await loadData(database as unknown as DbExecutor); expect(current.settings.centerName).toBe('Updated fixture center');
    expect(current.audit[0].userAgent).toBe('CenterPro integration fixture');
  }, 30_000);

  it('changes a password atomically, invalidates old sessions, retains the profile on rejected edits and rejects the owner username collision', async () => {
    await seed(); const owner = await signIn(); const employee = await signIn(fixture.employees[0].username); const admin = await signIn(fixture.employees[1].username);
    const change = { revision: owner.state.revision, changes: [], password: { employeeId: fixture.employees[0].id, value: changedPassword } };
    expect((await mutate(request('/api/mutations', change, owner.cookie))).status).toBe(200);
    expect((await state(employee.cookie)).session).toBeNull();
    expect((await login(request('/api/auth/login', { username: fixture.employees[0].username, password, remember: false }))).status).toBe(401);
    expect((await signIn(fixture.employees[0].username, false, changedPassword)).state.session?.employeeId).toBe(fixture.employees[0].id);
    const storedAuth = await loadAuthStore(database as unknown as DbExecutor); expect(storedAuth.employees[fixture.employees[0].id].version).toBe(8);
    const current = await state(owner.cookie);
    const collision = { revision: current.revision, changes: [{ collection: 'employees', upsert: [{ ...fixture.employees[0], username: 'TEST-OWNER' }] }] };
    expect((await mutate(request('/api/mutations', collision, owner.cookie))).status).toBe(400);
    const selfAdminReset = { revision: current.revision, changes: [], password: { employeeId: fixture.employees[1].id, value: changedPassword } };
    expect((await mutate(request('/api/mutations', selfAdminReset, admin.cookie))).status).toBe(400);
    const after = await loadData(database as unknown as DbExecutor);
    expect(after.employees[0].username).toBe(fixture.employees[0].username);
    expect(JSON.stringify(after.audit)).not.toContain(changedPassword); expect(JSON.stringify(after.audit)).not.toContain(storedAuth.employees[fixture.employees[0].id].hash);
    expect(after.audit.some(row => row.newValues.passwordChanged === true && row.newValues.sessionsInvalidated === true)).toBe(true);
  }, 30_000);

  it('revokes sessions when an account role changes or becomes inactive', async () => {
    await seed(); const owner = await signIn(); const employee = await signIn(fixture.employees[0].username);
    const promotion = { revision: owner.state.revision, changes: [{ collection: 'employees', upsert: [{ ...fixture.employees[0], role: 'ADMIN' }] }] };
    expect((await mutate(request('/api/mutations', promotion, owner.cookie))).status).toBe(200);
    expect((await state(employee.cookie)).session).toBeNull();
    const promoted = await signIn(fixture.employees[0].username); expect(promoted.state.session?.role).toBe('ADMIN');
    const current = await state(owner.cookie);
    const profile = current.data.employees.find(row => row.id === fixture.employees[0].id)!;
    expect((await mutate(request('/api/mutations', { revision: current.revision, changes: [{ collection: 'employees', upsert: [{ ...profile, active: false }] }] }, owner.cookie))).status).toBe(200);
    expect((await state(promoted.cookie)).session).toBeNull();
    expect((await login(request('/api/auth/login', { username: profile.username, password, remember: false }))).status).toBe(401);
  }, 30_000);

  it('allows only a server-signed current QR for the logged-in employee and makes duplicate check-ins idempotent', async () => {
    await seed(); const owner = await signIn(); const employee = await signIn(fixture.employees[0].username);
    expect((await getQr(request('/api/qr', undefined, employee.cookie))).status).toBe(403);
    const qrResponse = await getQr(request('/api/qr', undefined, owner.cookie)); expect(qrResponse.status).toBe(200);
    const qr = await qrResponse.json(); expect(qr.expiresAt - qr.serverTime).toBeGreaterThanOrEqual(30_000);
    expect((await checkIn(request('/api/attendance/check-in', { token: 'forged' }, employee.cookie))).status).toBe(400);
    expect((await checkIn(request('/api/attendance/check-in', { token: qr.token, employeeId: fixture.employees[1].id }, employee.cookie))).status).toBe(400);
    expect((await checkIn(request('/api/attendance/check-in', { token: qr.token }, owner.cookie))).status).toBe(403);
    const first = await checkIn(request('/api/attendance/check-in', { token: qr.token }, employee.cookie)); expect(first.status).toBe(200);
    const firstBody = await first.json(); expect(firstBody.duplicate).toBe(false);
    const repeated = await checkIn(request('/api/attendance/check-in', { token: qr.token }, employee.cookie)); expect(repeated.status).toBe(200); expect(await repeated.json()).toEqual({ ...firstBody, duplicate: true });
    const data = await loadData(database as unknown as DbExecutor); expect(data.attendance).toHaveLength(1); expect(data.attendance[0]).toMatchObject({ employeeId: fixture.employees[0].id, source: 'QR', status: 'PRESENT', checkIn: firstBody.checkIn });
    expect(data.audit).toHaveLength(1); expect((await state(owner.cookie)).revision).toBe(11);
    expect(sessionCookieName()).toBe('__Host-centerpro_session');
  }, 30_000);

  it('stores photos privately, authorizes image access by visible photo fields, and restores exact image bytes in full backups', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aKp0AAAAASUVORK5CYII=';
    const otherPng = `data:image/png;base64,${Buffer.concat([Buffer.from(png.split(',')[1], 'base64'), Buffer.from([0])]).toString('base64')}`;
    fixture.employees[0].photo = png; fixture.employees[1].photo = otherPng;
    await seed(); const owner = await signIn(); const employee = await signIn(fixture.employees[0].username);
    const ownPath = owner.state.data.employees[0].photo!; const otherPath = owner.state.data.employees[1].photo!;
    expect(ownPath).toMatch(/^\/api\/photos\/[a-f0-9]{64}$/); expect(otherPath).not.toBe(ownPath); expect(blobStore.writes).toBe(2);
    expect(JSON.stringify(owner.state)).not.toContain('private-blob.example'); expect(JSON.stringify(owner.state)).not.toContain('data:image');
    const retrieve = (path: string, cookie?: string) => getPhoto(request(path, undefined, cookie), { params: Promise.resolve({ hash: path.split('/').at(-1)! }) });
    const ownImage = await retrieve(ownPath, employee.cookie); expect(ownImage.status).toBe(200); expect(ownImage.headers.get('Content-Type')).toBe('image/png'); expect(ownImage.headers.get('Cache-Control')).toContain('no-store');
    expect(Buffer.from(await ownImage.arrayBuffer())).toEqual(Buffer.from(png.split(',')[1], 'base64'));
    const readsBeforeDenied = blobStore.reads;
    expect((await retrieve(otherPath, employee.cookie)).status).toBe(404); expect((await retrieve(ownPath)).status).toBe(401); expect(blobStore.reads).toBe(readsBeforeDenied);
    // A matching string in an otherwise visible notes field must never turn
    // a guessed hash into authorization for somebody else's image.
    const row = (await database.select().from(schema.employees).where(eq(schema.employees.id, fixture.employees[0].id)))[0];
    await database.update(schema.employees).set({ record: { ...row.record, notes: otherPath } }).where(eq(schema.employees.id, row.id));
    expect((await retrieve(otherPath, employee.cookie)).status).toBe(404);
    expect((await retrieve(otherPath, owner.cookie)).status).toBe(200);
    const backup = await parseSystemBackup(await (await getBackup(request('/api/backup', undefined, owner.cookie))).text());
    expect(backup.payload.data.employees[0].photo).toBe(png); expect(backup.payload.data.employees[1].photo).toBe(otherPng);
    // Failed cloud storage must not commit a profile or credential change.
    const fresh = await state(owner.cookie);
    const thirdPng = `data:image/png;base64,${Buffer.concat([Buffer.from(png.split(',')[1], 'base64'), Buffer.from([1])]).toString('base64')}`;
    blobStore.failWrites = true;
    const mutation = { revision: fresh.revision, changes: [{ collection: 'employees', upsert: [{ ...fresh.data.employees[0], name: 'Must not commit', photo: thirdPng }] }] };
    expect((await mutate(request('/api/mutations', mutation, owner.cookie))).status).toBe(503);
    expect((await state(owner.cookie)).data.employees[0].name).toBe(fixture.employees[0].name);
  }, 30_000);
});
