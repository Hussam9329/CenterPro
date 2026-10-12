import { z } from 'zod';
import { assertAuthStoreForBackup, AUTH_PASSWORD_KDF, type AuthStore } from './local-auth';
import { PREVIEW_STORAGE_VERSION } from './preview-config';
import type { DemoData } from './types';

export const SYSTEM_BACKUP_FORMAT = 'centerpro-system-backup';
export const SYSTEM_BACKUP_VERSION = 1;
export const SYSTEM_DATA_SCHEMA_VERSION = 1;

export interface SystemBackupPayload {
  dataSchemaVersion: typeof SYSTEM_DATA_SCHEMA_VERSION;
  storageVersion: typeof PREVIEW_STORAGE_VERSION;
  exportedAt: string;
  source: { origin: string; revision: number };
  preferences: { theme: 'light' | 'dark' | null };
  data: DemoData;
  authentication: { credentials: AuthStore; passwordKdf: typeof AUTH_PASSWORD_KDF };
}
export interface SystemBackup {
  format: typeof SYSTEM_BACKUP_FORMAT;
  formatVersion: typeof SYSTEM_BACKUP_VERSION;
  payload: SystemBackupPayload;
  integrity: { algorithm: 'SHA-256'; serialization: 'JSON.stringify(payload)'; digest: string };
}
export interface CreateSystemBackupInput {
  data: DemoData;
  auth: AuthStore;
  theme: 'light' | 'dark' | null;
  revision: number;
  origin: string;
  exportedAt?: string;
}

// Validate the existing shape only. No defaults, filters, salary calculation,
// referential cleanup or date limits may alter a user's stored history.
// passthrough preserves additional JSON fields in older records and audit values.
const str = z.string();
const num = z.number().finite();
const bool = z.boolean();
const strings = z.array(str);
const role = z.enum(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']);
const salaryMode = z.enum(['TIERED', 'FIXED']);
const object = z.looseObject;
const salary = object({ mode: salaryMode, dailyRate: num, unexcusedRate: num, maximum: num,
  fixedSalary: num, extraDaysStart: num,
  tiers: z.array(object({ id: str, fromDays: num, toDays: num, type: z.enum(['PER_DAY', 'FIXED']), amount: num })),
});
const department = object({ id: str, name: str, active: bool, description: str, salary });
const employee = object({ id: str, code: str, name: str, photo: str.optional(), address: str, phone: str,
  guardianPhone: str, departmentId: str, startDate: str, endDate: str.optional(), active: bool,
  gender: z.enum(['MALE', 'FEMALE']), birthDate: str, notes: str, qualification: str, telegram: str,
  username: str, role, fixedOverride: bool, fixedSalary: num, dailyRateOverride: num.nullable(),
  createdAt: str, updatedAt: str,
});
const workday = object({ id: str, date: str, startTime: str, departmentIds: strings,
  overrides: z.record(str, z.enum(['INCLUDE', 'EXCLUDE'])), state: z.enum(['OPEN', 'CLOSED']),
  createdBy: str.optional(), createdAt: str.optional(),
});
const attendance = object({ id: str, employeeId: str, workdayId: str,
  status: z.enum(['PRESENT', 'UNRESOLVED', 'EXCUSED', 'UNEXCUSED', 'EXEMPT']), checkIn: str.nullable(),
  latenessSeconds: num, source: z.enum(['QR', 'MANUAL']).nullable(), reason: str, updatedAt: str,
});
const deduction = object({ id: str, employeeId: str, amount: num, date: str,
  type: z.enum(['اعتراض', 'خصم إداري', 'أخرى']), customType: str, reason: str, createdBy: str, createdAt: str,
});
const bonus = object({ id: str, employeeId: str, amount: num, date: str, reason: str, createdBy: str, createdAt: str });
const payroll = object({ employeeId: str, employeeName: str, employeeCode: str, departmentName: str,
  month: str, salaryMode, dailyRate: num, requiredDays: num, attendanceDays: num, excusedDays: num,
  unexcusedDays: num, exemptDays: num, unresolvedDays: num, lateDays: num, latenessSeconds: num,
  baseSalary: num, excusedDeduction: num, unexcusedDeduction: num, otherDeductions: num,
  bonuses: num, finalSalary: num, partialMonth: bool, paymentStatus: z.enum(['UNPAID', 'PAID', 'REVIEW']),
  paidAmount: num, difference: num, salaryConfig: salary,
});
const sourceSnapshot = object({ attendance: z.array(attendance), workdays: z.array(workday),
  deductions: z.array(deduction), bonuses: z.array(bonus), employees: z.array(employee), departments: z.array(department),
});
const month = object({ id: str, month: str, state: z.enum(['OPEN', 'ARCHIVED', 'REOPENED']),
  archivedAt: str.optional(), snapshots: z.record(str, payroll), sourceSnapshot: sourceSnapshot.optional(),
});
const payment = object({ id: str, employeeId: str, month: str, salaryAtPayment: num, amount: num,
  date: str, paidBy: str, createdAt: str,
});
const audit = object({ id: str, actor: str, role, action: str, entity: str, entityId: str,
  employeeId: str.optional(), oldValues: z.record(str, z.unknown()), newValues: z.record(str, z.unknown()),
  timestamp: str, ip: str.optional(), userAgent: str.optional(),
});
const leaderboard = object({ employeeId: str, employeeName: str, employeeCode: str, papers: num,
  correctionErrors: num, behaviorErrors: num, examsEvaluated: num, score: num, accuracy: num.nullable(),
});
const seasonLeaderboard = leaderboard.extend({ cyclesEvaluated: num, attendanceDays: num, averagePapersPerDay: num.nullable() });
const evaluationSeason = object({ id: str, name: str, startDate: str, endDate: str.optional(),
  state: z.enum(['OPEN', 'ARCHIVED']), openedAt: str, openedBy: str, closedAt: str.optional(), closedBy: str.optional(),
  snapshot: object({ rows: z.array(seasonLeaderboard), cycleIds: strings }).optional(),
});
const evaluationCycle = object({ id: str, seasonId: str.optional(), name: str, state: z.enum(['OPEN', 'ARCHIVED']),
  openedAt: str, openedBy: str, closedAt: str.optional(), closedBy: str.optional(),
  snapshot: object({ rows: z.array(leaderboard), exams: z.array(object({ id: str, name: str, date: str, rows: z.array(leaderboard) })) }).optional(),
});
const evaluationExam = object({ id: str, cycleId: str, name: str, date: str, note: str, state: z.enum(['OPEN', 'CLOSED']),
  createdBy: str, createdAt: str, closedAt: str.optional(), closedBy: str.optional(),
});
const examEvaluation = object({ id: str, examId: str, employeeId: str, papers: num.nullable(),
  correctionErrors: num.nullable(), behaviorErrors: num.nullable(), note: str,
  createdBy: str, createdAt: str, updatedBy: str, updatedAt: str,
});
const dataSchema = object({ employees: z.array(employee), departments: z.array(department),
  workdays: z.array(workday), attendance: z.array(attendance), deductions: z.array(deduction), bonuses: z.array(bonus),
  months: z.array(month), payments: z.array(payment), audit: z.array(audit),
  evaluationSeasons: z.array(evaluationSeason), evaluationCycles: z.array(evaluationCycle),
  evaluationExams: z.array(evaluationExam), examEvaluations: z.array(examEvaluation),
  settings: object({ centerName: str, qrInterval: num }),
});
const payloadSchema = z.strictObject({
  dataSchemaVersion: z.literal(SYSTEM_DATA_SCHEMA_VERSION), storageVersion: z.literal(PREVIEW_STORAGE_VERSION),
  exportedAt: str.refine(value => Number.isFinite(Date.parse(value))),
  source: z.strictObject({ origin: z.url().refine(value => { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && url.origin === value; }), revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }),
  preferences: z.strictObject({ theme: z.enum(['light', 'dark']).nullable() }), data: dataSchema,
  authentication: z.strictObject({ credentials: z.unknown(), passwordKdf: z.strictObject({
    algorithm: z.literal(AUTH_PASSWORD_KDF.algorithm), hash: z.literal(AUTH_PASSWORD_KDF.hash),
    iterations: z.literal(AUTH_PASSWORD_KDF.iterations), saltBytes: z.literal(AUTH_PASSWORD_KDF.saltBytes),
    derivedKeyBytes: z.literal(AUTH_PASSWORD_KDF.derivedKeyBytes), encoding: z.literal(AUTH_PASSWORD_KDF.encoding),
    passwordEncoding: z.literal(AUTH_PASSWORD_KDF.passwordEncoding), passwordNormalization: z.literal(AUTH_PASSWORD_KDF.passwordNormalization),
  }) }),
});
const backupSchema = z.strictObject({ format: z.literal(SYSTEM_BACKUP_FORMAT), formatVersion: z.literal(SYSTEM_BACKUP_VERSION),
  payload: payloadSchema, integrity: z.strictObject({ algorithm: z.literal('SHA-256'),
    serialization: z.literal('JSON.stringify(payload)'), digest: str.regex(/^[a-f0-9]{64}$/),
  }),
});

function assertPayload(value: unknown): asserts value is SystemBackupPayload {
  if (!payloadSchema.safeParse(value).success) throw new Error('بيانات النسخة الاحتياطية غير مكتملة أو إصدارها غير مدعوم. لم يتم تغيير أي بيانات.');
  assertAuthStoreForBackup((value as SystemBackupPayload).authentication.credentials);
}

// JSON.stringify otherwise silently drops unsupported fields or converts NaN to
// null. Optional undefined object fields are already absent in browser storage.
function assertJsonSafe(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return;
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('تحتوي البيانات على قيمة لا يمكن حفظها في نسخة احتياطية كاملة.');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('تحتوي البيانات على قيمة لا يمكن حفظها في نسخة احتياطية كاملة.');
  ancestors.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    if (child === undefined && !Array.isArray(value)) continue;
    assertJsonSafe(child, ancestors);
  }
  ancestors.delete(value);
}

async function digestPayload(payload: SystemBackupPayload): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('هذا المتصفح لا يدعم التحقق من سلامة النسخة الاحتياطية.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Captures a detached snapshot before the first await, without reading/writing storage. */
export async function createSystemBackup(input: CreateSystemBackupInput): Promise<SystemBackup> {
  const source: SystemBackupPayload = { dataSchemaVersion: SYSTEM_DATA_SCHEMA_VERSION,
    storageVersion: PREVIEW_STORAGE_VERSION, exportedAt: input.exportedAt ?? new Date().toISOString(),
    source: { origin: input.origin, revision: input.revision }, preferences: { theme: input.theme },
    data: input.data, authentication: { credentials: input.auth, passwordKdf: AUTH_PASSWORD_KDF },
  };
  assertJsonSafe(source);
  assertPayload(source);
  const payload: SystemBackupPayload = JSON.parse(JSON.stringify(source));
  return { format: SYSTEM_BACKUP_FORMAT, formatVersion: SYSTEM_BACKUP_VERSION, payload,
    integrity: { algorithm: 'SHA-256', serialization: 'JSON.stringify(payload)', digest: await digestPayload(payload) },
  };
}

export function serializeSystemBackup(backup: SystemBackup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

/** Read-only integrity/schema check for future migration. This never imports data.
 * SHA-256 detects corruption, not authenticity against an attacker who can rehash.
 */
export async function parseSystemBackup(text: string): Promise<SystemBackup> {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('ملف النسخة الاحتياطية ليس ملف JSON صالحاً.'); }
  if (!backupSchema.safeParse(parsed).success) throw new Error('تنسيق النسخة الاحتياطية غير صالح أو إصدارها غير مدعوم.');
  const backup = parsed as SystemBackup;
  assertPayload(backup.payload);
  if (await digestPayload(backup.payload) !== backup.integrity.digest) throw new Error('تعذر التحقق من سلامة النسخة الاحتياطية: محتوى الملف تغيّر أو تضرر.');
  return backup;
}

export function systemBackupFilename(exportedAt: string): string {
  const date = new Date(exportedAt);
  if (!Number.isFinite(date.getTime())) throw new Error('وقت النسخة الاحتياطية غير صالح.');
  return `CenterPro-backup-${date.toISOString().replace(/[:.]/g, '-')}.json`;
}
