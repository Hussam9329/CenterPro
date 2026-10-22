import { z } from 'zod';
import { hasEmployeePermission, permissionFeatureForCollection } from '@/lib/permissions';
import type { MutationRequest } from '@/lib/server-contract';
import type { DemoData, DemoSession } from '@/lib/types';
import { PAPER_BATCHES_LIMIT } from '@/lib/evaluations/paper-batches';
import { assertUnique, collections, fail, find, same, type Collection, type RecordValue } from './shared';

const identifier = z.string().min(1).max(200).refine(value => !['__proto__', 'prototype', 'constructor'].includes(value));
const text = z.string().max(20_000);
const label = z.string().trim().min(1).max(300);
const adjustmentReason = z.string().trim().min(1).max(1000);
const int = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const signedInt = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const date = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/).refine(value => Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/);
const timestamp = z.string().max(100).refine(value => Number.isFinite(Date.parse(value)));
const salary = z.strictObject({
  mode: z.enum(['FIXED', 'TIERED']),
  dailyRate: int,
  unexcusedRate: int,
  maximum: int,
  fixedSalary: int,
  extraDaysStart: int,
  tiers: z.array(z.strictObject({
    id: identifier, fromDays: int, toDays: int,
    type: z.enum(['FIXED', 'PER_DAY']), amount: int,
  })).max(500),
});
const accountPermission = z.strictObject({ view: z.boolean(), create: z.boolean(), edit: z.boolean(), delete: z.boolean() });
const accountPermissions = z.object({ DASHBOARD: accountPermission.optional(), EMPLOYEES: accountPermission.optional(), ATTENDANCE: accountPermission.optional(), AUDIT_REVIEW: accountPermission.optional(), PAYROLL: accountPermission.optional(), DEDUCTIONS: accountPermission.optional(), BONUSES: accountPermission.optional(), DEPARTMENTS: accountPermission.optional(), REPORTS: accountPermission.optional(), AUDIT_LOG: accountPermission.optional(), SETTINGS: accountPermission.optional() }).optional();
const profile = {
  id: identifier,
  code: z.string(),
  name: label,
  photo: z.string().max(1_500_000).optional(),
  address: text,
  phone: z.string().regex(/^07\d{9}$/),
  guardianPhone: z.string().regex(/^07\d{9}$/),
  departmentId: identifier,
  startDate: date,
  endDate: date.optional(),
  active: z.boolean(),
  gender: z.enum(['MALE', 'FEMALE']),
  birthDate: z.union([z.literal(''), date]),
  notes: text,
  qualification: text,
  telegram: z.string().regex(/^[A-Za-z0-9_]*$/).max(200),
  username: z.string().trim().min(1).max(100).refine(value => !/\s/.test(value)),
  role: z.enum(['EMPLOYEE', 'ADMIN', 'SUPER_ADMIN']),
  permissions: accountPermissions,
  fixedOverride: z.boolean(),
  fixedSalary: int,
  dailyRateOverride: int.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
};
const schemas = {
  employees: z.object(profile),
  departments: z.object({ id: identifier, name: label, active: z.boolean(), description: text, salary }),
  workdays: z.object({
    id: identifier, date, startTime: time, departmentIds: z.array(identifier),
    overrides: z.record(identifier, z.enum(['INCLUDE', 'EXCLUDE'])),
    state: z.enum(['OPEN', 'CLOSED']), createdBy: text.optional(), createdAt: timestamp.optional(),
  }),
  attendance: z.object({
    id: identifier, employeeId: identifier, workdayId: identifier,
    status: z.enum(['PRESENT', 'UNRESOLVED', 'EXCUSED', 'UNEXCUSED', 'EXEMPT']),
    checkIn: timestamp.nullable(), latenessSeconds: int, source: z.enum(['QR', 'MANUAL']).nullable(),
    reason: text, updatedAt: timestamp,
  }),
  deductions: z.object({
    id: identifier, employeeId: identifier, amount: int, date,
    type: z.enum(['اعتراض', 'خصم إداري', 'أخرى']), customType: text,
    reason: adjustmentReason, createdBy: text, createdAt: timestamp,
  }),
  bonuses: z.object({
    id: identifier, employeeId: identifier, amount: int, date,
    reason: adjustmentReason, createdBy: text, createdAt: timestamp,
  }),
  months: z.object({
    id: identifier, month, state: z.enum(['OPEN', 'ARCHIVED', 'REOPENED']),
    archivedAt: timestamp.optional(), snapshots: z.record(identifier, z.unknown()).optional(),
    sourceSnapshot: z.unknown().optional(),
  }),
  payments: z.object({
    id: identifier, employeeId: identifier, month, salaryAtPayment: signedInt,
    amount: int, date, paidBy: text, createdAt: timestamp,
  }),
  evaluationSeasons: z.object({
    id: identifier, name: label, startDate: date, endDate: date.optional(), state: z.enum(['OPEN', 'ARCHIVED']),
    openedAt: timestamp, openedBy: text, closedAt: timestamp.optional(), closedBy: text.optional(), snapshot: z.unknown().optional(),
  }),
  evaluationCycles: z.object({
    id: identifier, seasonId: identifier.optional(), name: label, state: z.enum(['OPEN', 'ARCHIVED']),
    openedAt: timestamp, openedBy: text, closedAt: timestamp.optional(), closedBy: text.optional(), snapshot: z.unknown().optional(),
  }),
  evaluationExams: z.object({
    id: identifier, cycleId: identifier, name: label, date, note: text, state: z.enum(['OPEN', 'CLOSED']),
    createdBy: text, createdAt: timestamp, closedAt: timestamp.optional(), closedBy: text.optional(),
  }),
  examEvaluations: z.object({
    id: identifier, examId: identifier, employeeId: identifier,
    papers: int.nullable(), paperBatches: z.array(int).max(PAPER_BATCHES_LIMIT).optional(),
    // Accepted for shape only; the server recomputes it from the signed-in actor.
    errorsBy: z.record(z.string().max(200), z.object({ name: z.string().max(200), correctionErrors: int, behaviorErrors: int })).optional(), correctionErrors: int.nullable(), behaviorErrors: int.nullable(),
    note: text, createdBy: text, createdAt: timestamp, updatedBy: text, updatedAt: timestamp,
  }),
};

export const settingsSchema = z.strictObject({ centerName: label, qrInterval: z.number().int().min(30).max(60) });

function parseRecord(collection: Collection, input: Record<string, unknown>, previous?: RecordValue): RecordValue {
  const schema = schemas[collection];
  const result = schema.safeParse(input);
  if (!result.success) fail('البيانات المدخلة غير صالحة. راجع الأرقام والتواريخ والحقول المطلوبة.');
  const fields = new Set(Object.keys(schema.shape));
  // Existing imported extension fields survive ordinary edits, but cannot be
  // used to smuggle new write capabilities into the database.
  for (const key of Object.keys(input)) if (!fields.has(key) && (!previous || !same(input[key], previous[key]))) fail('يوجد حقل غير مسموح بتعديله.');
  return { ...previous, ...result.data } as RecordValue;
}

/** Parse and authorize the request shape before any feature changes the draft. */
export function parseMutationChanges(before: DemoData, actor: DemoSession, request: MutationRequest) {
  const upserts = new Map<Collection, RecordValue[]>();
  const used = new Set<Collection>();
  for (const change of request.changes) {
    const collection = change.collection as Collection;
    if (!collections.includes(collection) || used.has(collection)) fail();
    used.add(collection);
    const inputs = change.upsert ?? []; const deleting = change.remove ?? [];
    if (!Array.isArray(inputs) || !Array.isArray(deleting)) fail();
    const values = inputs.map(input => parseRecord(collection, input, typeof input.id === 'string' ? find(before, collection, input.id) : undefined));
    assertUnique([...values.map(value => value.id), ...deleting], 'لا يمكن تعديل السجل أو حذفه أكثر من مرة في العملية نفسها.');
    upserts.set(collection, values);
    if (deleting.length) fail('استخدم الحذف الآمن مع السبب والتأكيد؛ تُراجع حماية الشهر والسجلات المرتبطة قبل الحذف.');
  }
  const groups: Collection[][] = [['employees'], ['departments'], ['workdays', 'attendance'], ['deductions'], ['bonuses'], ['months'], ['payments'], ['evaluationSeasons'], ['evaluationCycles', 'evaluationExams'], ['evaluationExams'], ['examEvaluations']];
  if (used.size && !groups.some(group => [...used].every(collection => group.includes(collection)))) fail('نفّذ كل إجراء على حدة.');
  if (request.settings && (used.size || request.password)) fail();
  if (request.password && [...used].some(collection => collection !== 'employees')) fail();
  if (actor.role === 'EMPLOYEE') {
    const employee = before.employees.find(item => item.id === actor.employeeId && item.active && item.role === 'EMPLOYEE');
    if (!employee) fail('انتهت صلاحية الحساب. سجّل الدخول مجدداً.');
    if (request.settings && !hasEmployeePermission(employee, 'SETTINGS', 'edit')) fail('ليس لديك صلاحية تعديل الإعدادات.');
    if (request.password && !hasEmployeePermission(employee, 'EMPLOYEES', before.employees.some(item => item.id === request.password!.employeeId) ? 'edit' : 'create')) fail('ليس لديك صلاحية إدارة كلمة مرور هذا الحساب.');
    for (const collection of used) {
      const feature = permissionFeatureForCollection(collection);
      if (!feature) fail('ليس لديك صلاحية تنفيذ هذه العملية.');
      for (const value of upserts.get(collection) ?? []) {
        const action = collection === 'months' ? 'edit' : find(before, collection, value.id) ? 'edit' : 'create';
        if (!hasEmployeePermission(employee, feature, action)) fail('ليس لديك صلاحية تنفيذ هذه العملية.');
      }
    }
  }

  return { upserts, used };
}
