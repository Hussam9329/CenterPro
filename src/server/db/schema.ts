import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, jsonb, pgSchema, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { DemoData, DemoSettings } from '@/lib/types';
import type { StoredCredential, StoredSystemCredential } from '@/lib/local-auth';

export const centerpro = pgSchema('centerpro');
const recordColumns = <T>() => ({ id: text('id').primaryKey(), position: integer('position').notNull(), record: jsonb('record').$type<T>().notNull() });

// JSON records retain historical snapshots and future fields exactly. Relational
// columns enforce identity, uniqueness and references without rewriting history.
export const state = centerpro.table('state', {
  id: integer('id').primaryKey(), revision: bigint('revision', { mode: 'number' }).notNull().default(0),
  settings: jsonb('settings').$type<DemoSettings>().notNull(), extras: jsonb('extras').$type<Record<string, unknown>>().notNull().default({}),
}, t => [check('state_singleton', sql`${t.id} = 1`), check('state_revision_safe', sql`${t.revision} between 0 and 9007199254740991`)]);
export const departments = centerpro.table('departments', recordColumns<DemoData['departments'][number]>());
export const employees = centerpro.table('employees', {
  ...recordColumns<DemoData['employees'][number]>(), departmentId: text('department_id').notNull().references(() => departments.id),
  username: text('username').notNull(), code: text('code').notNull(),
}, t => [index('employees_department_idx').on(t.departmentId), uniqueIndex('employees_username_unique').on(sql`lower(btrim(${t.username}))`), uniqueIndex('employees_code_unique').on(t.code)]);
export const workdays = centerpro.table('workdays', {
  ...recordColumns<DemoData['workdays'][number]>(), date: text('date').notNull(), status: text('status').notNull(),
}, t => [uniqueIndex('workdays_date_unique').on(t.date), uniqueIndex('workdays_one_open').on(t.status).where(sql`${t.status} = 'OPEN'`)]);
export const attendance = centerpro.table('attendance', {
  ...recordColumns<DemoData['attendance'][number]>(), employeeId: text('employee_id').notNull().references(() => employees.id), workdayId: text('workday_id').notNull().references(() => workdays.id),
}, t => [uniqueIndex('attendance_employee_workday_unique').on(t.employeeId, t.workdayId), index('attendance_workday_idx').on(t.workdayId)]);
export const deductions = centerpro.table('deductions', {
  ...recordColumns<DemoData['deductions'][number]>(), employeeId: text('employee_id').notNull().references(() => employees.id), date: text('date').notNull(),
}, t => [index('deductions_employee_date_idx').on(t.employeeId, t.date)]);
export const bonuses = centerpro.table('bonuses', {
  ...recordColumns<DemoData['bonuses'][number]>(), employeeId: text('employee_id').notNull().references(() => employees.id), date: text('date').notNull(),
}, t => [index('bonuses_employee_date_idx').on(t.employeeId, t.date)]);
export const months = centerpro.table('months', {
  ...recordColumns<DemoData['months'][number]>(), month: text('month').notNull(), status: text('status').notNull(),
}, t => [uniqueIndex('months_month_unique').on(t.month)]);
export const payments = centerpro.table('payments', {
  ...recordColumns<DemoData['payments'][number]>(), employeeId: text('employee_id').notNull().references(() => employees.id), month: text('month').notNull(),
}, t => [index('payments_employee_month_idx').on(t.employeeId, t.month)]);
// Audit references are deliberately historical text, not foreign keys: deleting
// or renaming a referenced domain record must never delete its audit trail.
export const audit = centerpro.table('audit', {
  ...recordColumns<DemoData['audit'][number]>(), employeeId: text('employee_id'), timestamp: text('timestamp').notNull(),
}, t => [index('audit_employee_timestamp_idx').on(t.employeeId, t.timestamp)]);
export const evaluationSeasons = centerpro.table('evaluation_seasons', recordColumns<DemoData['evaluationSeasons'][number]>());
export const evaluationCycles = centerpro.table('evaluation_cycles', {
  ...recordColumns<DemoData['evaluationCycles'][number]>(), seasonId: text('season_id').references(() => evaluationSeasons.id),
}, t => [index('evaluation_cycles_season_idx').on(t.seasonId)]);
export const evaluationExams = centerpro.table('evaluation_exams', {
  ...recordColumns<DemoData['evaluationExams'][number]>(), cycleId: text('cycle_id').notNull().references(() => evaluationCycles.id),
}, t => [index('evaluation_exams_cycle_idx').on(t.cycleId)]);
export const examEvaluations = centerpro.table('exam_evaluations', {
  ...recordColumns<DemoData['examEvaluations'][number]>(), examId: text('exam_id').notNull().references(() => evaluationExams.id), employeeId: text('employee_id').notNull().references(() => employees.id),
}, t => [uniqueIndex('exam_evaluations_exam_employee_unique').on(t.examId, t.employeeId), index('exam_evaluations_employee_idx').on(t.employeeId)]);
export const credentials = centerpro.table('credentials', {
  accountKey: text('account_key').primaryKey(), employeeId: text('employee_id').references(() => employees.id),
  credential: jsonb('credential').$type<StoredCredential | StoredSystemCredential>().notNull(),
}, t => [uniqueIndex('credentials_employee_unique').on(t.employeeId), check('credentials_kind', sql`(${t.accountKey} in ('SYSTEM', 'QR_DISPLAY') and ${t.employeeId} is null) or (${t.accountKey} not in ('SYSTEM', 'QR_DISPLAY') and ${t.employeeId} is not null and ${t.employeeId} = ${t.accountKey})`)]);
export const sessions = centerpro.table('sessions', {
  tokenHash: text('token_hash').primaryKey(), accountKey: text('account_key').notNull().references(() => credentials.accountKey, { onDelete: 'cascade' }),
  authVersion: bigint('auth_version', { mode: 'number' }).notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), remembered: boolean('remembered').notNull().default(false),
}, t => [index('sessions_account_idx').on(t.accountKey), index('sessions_expires_idx').on(t.expiresAt)]);
export const loginRateLimits = centerpro.table('login_rate_limits', {
  key: text('key').primaryKey(), count: integer('count').notNull(), windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(), blockedUntil: timestamp('blocked_until', { withTimezone: true }),
}, t => [index('login_rate_limits_window_idx').on(t.windowStartedAt)]);
export const imports = centerpro.table('imports', {
  digest: text('digest').primaryKey(), importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  sourceRevision: bigint('source_revision', { mode: 'number' }).notNull(), counts: jsonb('counts').$type<Record<string, number>>().notNull(), metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
});
// Rest area plays (migration 0003). Outside the revisioned state document on purpose.
export const gamePlays = centerpro.table('game_plays', {
  id: text('id').primaryKey(), employeeId: text('employee_id').notNull().references(() => employees.id, { onDelete: 'cascade' }),
  game: text('game').notNull(), startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  durationMs: integer('duration_ms').notNull(), score: integer('score').notNull(), outcome: text('outcome').notNull(),
  playDate: text('play_date').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('game_plays_game_score_idx').on(t.game, t.score), index('game_plays_employee_started_idx').on(t.employeeId, t.startedAt)]);
