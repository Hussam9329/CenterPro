import { asc, eq, sql, type SQL } from 'drizzle-orm';
import { AUTH_SCHEMA_VERSION, assertAuthStoreForBackup, normalizeUsername, type AuthStore, type StoredQrDisplayCredential, type StoredSystemCredential } from '@/lib/local-auth';
import type { DemoData } from '@/lib/types';
import { assertPhotosExternalized } from '@/server/photos';
import type { DbExecutor } from './connection';
import * as schema from './schema';

export const collectionNames = ['departments', 'employees', 'workdays', 'attendance', 'deductions', 'bonuses', 'months', 'payments', 'audit', 'evaluationSeasons', 'evaluationCycles', 'evaluationExams', 'examEvaluations'] as const;
export type CollectionName = typeof collectionNames[number];
type JsonRecord = { id: string; [key: string]: unknown };
const descriptors: Record<CollectionName, { table: string; columns: Record<string, string> }> = {
  departments: { table: 'departments', columns: {} },
  employees: { table: 'employees', columns: { department_id: 'departmentId', username: 'username', code: 'code' } },
  workdays: { table: 'workdays', columns: { date: 'date', status: 'state' } },
  attendance: { table: 'attendance', columns: { employee_id: 'employeeId', workday_id: 'workdayId' } },
  deductions: { table: 'deductions', columns: { employee_id: 'employeeId', date: 'date' } },
  bonuses: { table: 'bonuses', columns: { employee_id: 'employeeId', date: 'date' } },
  months: { table: 'months', columns: { month: 'month', status: 'state' } },
  payments: { table: 'payments', columns: { employee_id: 'employeeId', month: 'month' } },
  audit: { table: 'audit', columns: { employee_id: 'employeeId', timestamp: 'timestamp' } },
  evaluationSeasons: { table: 'evaluation_seasons', columns: {} },
  evaluationCycles: { table: 'evaluation_cycles', columns: { season_id: 'seasonId' } },
  evaluationExams: { table: 'evaluation_exams', columns: { cycle_id: 'cycleId' } },
  examEvaluations: { table: 'exam_evaluations', columns: { exam_id: 'examId', employee_id: 'employeeId' } },
};

/** Every writer must call this first in its transaction; never use a browser revision as a lock. */
export async function lockState(db: DbExecutor): Promise<number> {
  const rows = await db.select({ revision: schema.state.revision }).from(schema.state).where(eq(schema.state.id, 1)).for('update');
  if (!rows[0]) throw new Error('Database has not been migrated.');
  return rows[0].revision;
}

export async function bumpRevision(db: DbExecutor): Promise<number> {
  const rows = await db.update(schema.state).set({ revision: sql`${schema.state.revision} + 1` }).where(eq(schema.state.id, 1)).returning({ revision: schema.state.revision });
  if (!rows[0]) throw new Error('Database has not been migrated.');
  return rows[0].revision;
}

/** Use inside a transaction (lockState for writes; repeatable-read for plain reads). */
export async function loadData(db: DbExecutor): Promise<DemoData> {
  const rows = await db.select().from(schema.state).where(eq(schema.state.id, 1));
  if (!rows[0]) throw new Error('Database has not been migrated.');
  const data: Record<string, unknown> = { ...rows[0].extras, settings: rows[0].settings };
  for (const name of collectionNames) {
    const table = schema[name];
    data[name] = (await db.select({ record: table.record }).from(table).orderBy(asc(table.position), asc(table.id))).map(row => row.record);
  }
  return data as unknown as DemoData;
}

function recordArray(data: DemoData, name: CollectionName): JsonRecord[] { return data[name] as unknown as JsonRecord[]; }
function qualifiedTable(name: CollectionName): SQL { return sql`${sql.identifier('centerpro')}.${sql.identifier(descriptors[name].table)}`; }

/** Diff only changed records. The JSON document is authoritative for full fidelity.
 * Must run under lockState in the SAME transaction as authorization and revision. */
export async function saveData(db: DbExecutor, before: DemoData, after: DemoData): Promise<void> {
  validateDataReferences(after);
  assertPhotosExternalized(after);
  // Child deletions first, parent insertions first. Deferred FKs allow one atomic
  // command to move employees or correct references without a transient failure.
  await db.execute(sql`set constraints all deferred`);
  const previousOpen = before.workdays.find(row => row.state === 'OPEN');
  if (previousOpen && after.workdays.find(row => row.id === previousOpen.id)?.state !== 'OPEN') {
    await db.update(schema.workdays).set({ status: 'CLOSED' }).where(eq(schema.workdays.id, previousOpen.id));
  }
  for (const name of [...collectionNames].reverse()) {
    const retained = new Set(recordArray(after, name).map(row => row.id));
    const removed = recordArray(before, name).filter(row => !retained.has(row.id)).map(row => row.id);
    if (removed.length) await db.execute(sql`delete from ${qualifiedTable(name)} where id in (${sql.join(removed.map(id => sql`${id}`), sql`, `)})`);
  }
  for (const name of collectionNames) {
    const old = new Map(recordArray(before, name).map((record, position) => [record.id, { json: JSON.stringify(record), position }]));
    const changed = recordArray(after, name).map((record, position) => ({ record, position, json: JSON.stringify(record) }))
      .filter(row => old.get(row.record.id)?.json !== row.json || old.get(row.record.id)?.position !== row.position);
    const projection = Object.entries(descriptors[name].columns);
    const columns = ['id', 'position', 'record', ...projection.map(([column]) => column)];
    for (let offset = 0; offset < changed.length; offset += 200) {
      const values = changed.slice(offset, offset + 200).map(row => {
        const cells = [sql`${row.record.id}`, sql`${row.position}`, sql`${row.json}::jsonb`, ...projection.map(([, key]) => sql`${row.record[key] ?? null}`)];
        return sql`(${sql.join(cells, sql`, `)})`;
      });
      if (!values.length) continue;
      const assignments = columns.slice(1).map(column => sql`${sql.identifier(column)} = excluded.${sql.identifier(column)}`);
      await db.execute(sql`insert into ${qualifiedTable(name)} (${sql.join(columns.map(column => sql.identifier(column)), sql`, `)}) values ${sql.join(values, sql`, `)} on conflict (id) do update set ${sql.join(assignments, sql`, `)}`);
    }
  }
  const extras = Object.fromEntries(Object.entries(after).filter(([key]) => key !== 'settings' && !collectionNames.includes(key as CollectionName)));
  await db.update(schema.state).set({ settings: after.settings, extras }).where(eq(schema.state.id, 1));
}

export async function loadAuthStore(db: DbExecutor): Promise<AuthStore> {
  const rows = await db.select().from(schema.credentials).orderBy(asc(schema.credentials.accountKey));
  const auth: AuthStore = { schema: AUTH_SCHEMA_VERSION, system: null, employees: {} };
  for (const row of rows) {
    if (row.accountKey === 'SYSTEM') auth.system = row.credential as StoredSystemCredential;
    else if (row.accountKey === 'QR_DISPLAY') auth.qrDisplay = row.credential as StoredQrDisplayCredential;
    else auth.employees[row.accountKey] = row.credential;
  }
  assertAuthStoreForBackup(auth);
  return auth;
}

export async function saveAuthStore(db: DbExecutor, auth: AuthStore): Promise<void> {
  assertAuthStoreForBackup(auth);
  const data = await loadData(db);
  validateAuthReferences(data, auth, false);
  const desired = [ ...(auth.system ? [{ accountKey: 'SYSTEM', employeeId: null, credential: auth.system }] : []),
    ...(auth.qrDisplay ? [{ accountKey: 'QR_DISPLAY', employeeId: null, credential: auth.qrDisplay }] : []),
    ...Object.entries(auth.employees).map(([id, credential]) => ({ accountKey: id, employeeId: id, credential })) ];
  const existing = await db.select().from(schema.credentials);
  const old = new Map(existing.map(row => [row.accountKey, row.credential]));
  const ids = new Set(desired.map(row => row.accountKey));
  for (const row of existing) if (!ids.has(row.accountKey)) await db.delete(schema.credentials).where(eq(schema.credentials.accountKey, row.accountKey));
  for (const row of desired) if (JSON.stringify(old.get(row.accountKey)) !== JSON.stringify(row.credential)) {
    await db.insert(schema.credentials).values(row).onConflictDoUpdate({ target: schema.credentials.accountKey, set: { credential: row.credential, employeeId: row.employeeId } });
  }
}

export function dataCounts(data: DemoData): Record<CollectionName, number> {
  return Object.fromEntries(collectionNames.map(name => [name, data[name].length])) as Record<CollectionName, number>;
}

export class DataReferenceError extends Error {
  constructor(public readonly issues: Record<string, number>) {
    super(`Data cannot be imported or saved until these reference/uniqueness issues are corrected: ${Object.entries(issues).map(([kind, count]) => `${kind}=${count}`).join(', ')}`);
    this.name = 'DataReferenceError';
  }
}

/** Counts only: no private names, credentials, photos or audit content in errors. */
export function validateDataReferences(data: DemoData): void {
  const issues: Record<string, number> = {};
  const add = (key: string, count = 1) => { if (count) issues[key] = (issues[key] ?? 0) + count; };
  // This is a response-only, actor-scoped projection. Importing it as an
  // extension field could override canonical evaluation calculations.
  if (Object.hasOwn(data, 'serverEvaluation')) add('data.reservedReadModel');
  const unique = (key: string, values: string[]) => {
    const seen = new Set<string>();
    for (const value of values) { if (!value.trim()) add(`${key}.empty`); else if (seen.has(value)) add(`${key}.duplicate`); seen.add(value); }
  };
  for (const name of collectionNames) {
    unique(`${name}.id`, data[name].map(row => row.id));
    add(`${name}.reservedId`, data[name].filter(row => ['__proto__', 'constructor', 'prototype'].includes(row.id)).length);
  }
  const departmentIds = new Set(data.departments.map(row => row.id));
  const employeeIds = new Set(data.employees.map(row => row.id));
  const workdayIds = new Set(data.workdays.map(row => row.id));
  const seasonIds = new Set(data.evaluationSeasons.map(row => row.id));
  const cycleIds = new Set(data.evaluationCycles.map(row => row.id));
  const examIds = new Set(data.evaluationExams.map(row => row.id));
  unique('employees.username', data.employees.map(row => normalizeUsername(row.username)));
  unique('employees.code', data.employees.map(row => row.code));
  unique('departments.name', data.departments.map(row => row.name.trim()));
  unique('workdays.date', data.workdays.map(row => row.date));
  unique('months.month', data.months.map(row => row.month));
  unique('attendance.employeeWorkday', data.attendance.map(row => JSON.stringify([row.employeeId, row.workdayId])));
  unique('examEvaluations.examEmployee', data.examEvaluations.map(row => JSON.stringify([row.examId, row.employeeId])));
  add('workdays.multipleOpen', Math.max(0, data.workdays.filter(row => row.state === 'OPEN').length - 1));
  for (const row of data.employees) { if (!departmentIds.has(row.departmentId)) add('employees.departmentMissing'); if (['SYSTEM', 'QR_DISPLAY'].includes(row.id)) add('employees.reservedId'); }
  for (const row of data.workdays) {
    add('workdays.duplicateDepartment', row.departmentIds.length - new Set(row.departmentIds).size);
    for (const id of row.departmentIds) if (!departmentIds.has(id)) add('workdays.departmentMissing');
    for (const id of Object.keys(row.overrides)) if (!employeeIds.has(id)) add('workdays.overrideEmployeeMissing');
  }
  for (const name of ['attendance', 'deductions', 'bonuses', 'payments', 'examEvaluations'] as const) {
    for (const row of data[name]) if (!employeeIds.has(row.employeeId)) add(`${name}.employeeMissing`);
  }
  for (const row of data.attendance) if (!workdayIds.has(row.workdayId)) add('attendance.workdayMissing');
  for (const row of data.evaluationCycles) if (row.seasonId && !seasonIds.has(row.seasonId)) add('evaluationCycles.seasonMissing');
  for (const row of data.evaluationExams) if (!cycleIds.has(row.cycleId)) add('evaluationExams.cycleMissing');
  for (const row of data.examEvaluations) if (!examIds.has(row.examId)) add('examEvaluations.examMissing');
  if (Object.keys(issues).length) throw new DataReferenceError(issues);
}

export function validateAuthReferences(data: DemoData, auth: AuthStore, requireOwner = true): void {
  assertAuthStoreForBackup(auth);
  const issues: Record<string, number> = {};
  const employees = new Set(data.employees.map(employee => employee.id));
  const orphans = Object.keys(auth.employees).filter(id => !employees.has(id)).length;
  if (orphans) issues['credentials.employeeMissing'] = orphans;
  if (requireOwner && !auth.system) issues['credentials.systemOwnerMissing'] = 1;
  if (auth.system && data.employees.some(row => normalizeUsername(row.username) === normalizeUsername(auth.system!.username))) issues['credentials.ownerUsernameCollision'] = 1;
  if (auth.qrDisplay) {
    const qrName = normalizeUsername(auth.qrDisplay.username);
    if (auth.system && qrName === normalizeUsername(auth.system.username)) issues['credentials.qrDisplayOwnerUsernameCollision'] = 1;
    if (data.employees.some(row => qrName === normalizeUsername(row.username))) issues['credentials.qrDisplayEmployeeUsernameCollision'] = 1;
  }
  if (Object.keys(issues).length) throw new DataReferenceError(issues);
}
