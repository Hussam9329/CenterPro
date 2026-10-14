import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertSingleOpenWorkday, getLatenessSeconds, isExpected } from '@/lib/attendance';
import { assertEvaluationMutation, assertEvaluationState, buildEvaluationCycleSnapshot, buildEvaluationSeasonSnapshot } from '@/lib/evaluations';
import { canManageEmployeeAccount } from '@/lib/permissions';
import { getEmployeePayroll, getMonthPayroll, recalculateReopenedPayroll, validateSalaryConfig } from '@/lib/payroll';
import { captureMonthSource } from '@/components/finance/finance-data';
import type { MutationRequest } from '@/lib/server-contract';
import { applyDeletionPlan, authorizeDeletion, getDeletionPlan } from '@/lib/safe-deletion';
import type { AttendanceRecord, AuditEntry, DemoData, DemoSession, Employee, PayrollMonth, Workday } from '@/lib/types';

const collections = ['employees', 'departments', 'workdays', 'attendance', 'deductions', 'bonuses', 'months', 'payments', 'evaluationSeasons', 'evaluationCycles', 'evaluationExams', 'examEvaluations'] as const;
type Collection = typeof collections[number];
type RecordValue = Record<string, unknown> & { id: string };
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
const salary = z.strictObject({ mode: z.enum(['FIXED', 'TIERED']), dailyRate: int, unexcusedRate: int, maximum: int, fixedSalary: int, extraDaysStart: int, tiers: z.array(z.strictObject({ id: identifier, fromDays: int, toDays: int, type: z.enum(['FIXED', 'PER_DAY']), amount: int })).max(500) });
const profile = { id: identifier, code: z.string(), name: label, photo: z.string().max(1_500_000).optional(), address: text, phone: z.string().regex(/^07\d{9}$/), guardianPhone: z.string().regex(/^07\d{9}$/), departmentId: identifier, startDate: date, endDate: date.optional(), active: z.boolean(), gender: z.enum(['MALE', 'FEMALE']), birthDate: z.union([z.literal(''), date]), notes: text, qualification: text, telegram: z.string().regex(/^[A-Za-z0-9_]*$/).max(200), username: z.string().trim().min(1).max(100).refine(value => !/\s/.test(value)), role: z.enum(['EMPLOYEE', 'ADMIN', 'SUPER_ADMIN']), fixedOverride: z.boolean(), fixedSalary: int, dailyRateOverride: int.nullable(), createdAt: timestamp, updatedAt: timestamp };
const schemas = {
  employees: z.object(profile),
  departments: z.object({ id: identifier, name: label, active: z.boolean(), description: text, salary }),
  workdays: z.object({ id: identifier, date, startTime: time, departmentIds: z.array(identifier), overrides: z.record(identifier, z.enum(['INCLUDE', 'EXCLUDE'])), state: z.enum(['OPEN', 'CLOSED']), createdBy: text.optional(), createdAt: timestamp.optional() }),
  attendance: z.object({ id: identifier, employeeId: identifier, workdayId: identifier, status: z.enum(['PRESENT', 'UNRESOLVED', 'EXCUSED', 'UNEXCUSED', 'EXEMPT']), checkIn: timestamp.nullable(), latenessSeconds: int, source: z.enum(['QR', 'MANUAL']).nullable(), reason: text, updatedAt: timestamp }),
  deductions: z.object({ id: identifier, employeeId: identifier, amount: int, date, type: z.enum(['اعتراض', 'خصم إداري', 'أخرى']), customType: text, reason: adjustmentReason, createdBy: text, createdAt: timestamp }),
  bonuses: z.object({ id: identifier, employeeId: identifier, amount: int, date, reason: adjustmentReason, createdBy: text, createdAt: timestamp }),
  months: z.object({ id: identifier, month, state: z.enum(['OPEN', 'ARCHIVED', 'REOPENED']), archivedAt: timestamp.optional(), snapshots: z.record(identifier, z.unknown()).optional(), sourceSnapshot: z.unknown().optional() }),
  payments: z.object({ id: identifier, employeeId: identifier, month, salaryAtPayment: signedInt, amount: int, date, paidBy: text, createdAt: timestamp }),
  evaluationSeasons: z.object({ id: identifier, name: label, startDate: date, endDate: date.optional(), state: z.enum(['OPEN', 'ARCHIVED']), openedAt: timestamp, openedBy: text, closedAt: timestamp.optional(), closedBy: text.optional(), snapshot: z.unknown().optional() }),
  evaluationCycles: z.object({ id: identifier, seasonId: identifier.optional(), name: label, state: z.enum(['OPEN', 'ARCHIVED']), openedAt: timestamp, openedBy: text, closedAt: timestamp.optional(), closedBy: text.optional(), snapshot: z.unknown().optional() }),
  evaluationExams: z.object({ id: identifier, cycleId: identifier, name: label, date, note: text, state: z.enum(['OPEN', 'CLOSED']), createdBy: text, createdAt: timestamp, closedAt: timestamp.optional(), closedBy: text.optional() }),
  examEvaluations: z.object({ id: identifier, examId: identifier, employeeId: identifier, papers: int.nullable(), correctionErrors: int.nullable(), behaviorErrors: int.nullable(), note: text, createdBy: text, createdAt: timestamp, updatedBy: text, updatedAt: timestamp }),
};
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
function fail(message = 'هذه العملية غير مسموحة أو تغيّرت بياناتها. حدّث الصفحة وحاول مرة أخرى.'): never { throw new Error(message); }
function requireAdmin(actor: DemoSession) { if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') fail('ليس لديك صلاحية تنفيذ هذه العملية.'); }
function requireSuper(actor: DemoSession) { if (actor.role !== 'SUPER_ADMIN') fail('هذه العملية متاحة للمشرف العام فقط.'); }
export function baghdadDate(now: Date): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
function assertActor(data: DemoData, actor: DemoSession) {
  if (actor.kind === 'SYSTEM' && actor.role === 'SUPER_ADMIN' && !actor.employeeId) return;
  if (actor.kind !== 'EMPLOYEE' || !data.employees.some(employee => employee.id === actor.employeeId && employee.active && employee.role === actor.role)) fail('انتهت صلاحية الحساب. سجّل الدخول مجدداً.');
}
function editableMonth(data: DemoData, actor: DemoSession, value: string) {
  const state = data.months.find(item => item.month === value)?.state;
  if (state === 'ARCHIVED' || (state === 'REOPENED' && actor.role !== 'SUPER_ADMIN')) fail('الشهر مؤرشف أو لا تملك صلاحية تعديل الشهر المعاد فتحه.');
}
function rows(data: DemoData, collection: Collection): RecordValue[] { return data[collection] as unknown as RecordValue[]; }
function find(data: DemoData, collection: Collection, id: string) { return rows(data, collection).find(item => item.id === id); }
function put(data: DemoData, collection: Collection, value: RecordValue) {
  const list = rows(data, collection); const index = list.findIndex(item => item.id === value.id);
  if (index < 0) list.push(value); else list[index] = value;
}
function unchanged(previous: object, next: object, fields: readonly string[]) {
  for (const field of fields) if (!same((previous as Record<string, unknown>)[field], (next as Record<string, unknown>)[field])) fail('لا يمكن تعديل هذه البيانات المحمية.');
}
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
function reasonFrom(request: MutationRequest): string {
  const value = request.audit?.newValues?.reason;
  return typeof value === 'string' ? value.trim().slice(0, 20_000) : '';
}
function requireReason(reason: string) { if (!reason) fail('اكتب سبب التعديل لحفظه في سجل العمليات.'); }
function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => key === 'photo' ? [['hasPhoto', Boolean(child)]] : key === 'passwordChanged' ? [[key, Boolean(child)]] : /password|credential|hash|salt|token|secret/i.test(key) ? [] : [[key, scrub(child)]]));
}
function audit(data: DemoData, actor: DemoSession, now: Date, action: string, entity: string, entityId: string, oldValues: unknown, newValues: unknown, employeeId?: string) {
  const entry: AuditEntry & { actorId: string } = { id: randomUUID(), actorId: actor.employeeId ?? 'SYSTEM', actor: actor.name, role: actor.role, action, entity, entityId, employeeId, oldValues: scrub(oldValues) as Record<string, unknown>, newValues: scrub(newValues) as Record<string, unknown>, timestamp: now.toISOString() };
  data.audit.unshift(entry);
}
function assertUnique(values: readonly string[], message: string) { if (new Set(values).size !== values.length) fail(message); }
function validateState(data: DemoData) {
  for (const collection of collections) assertUnique(rows(data, collection).map(item => item.id), 'معرف السجل مستخدم مسبقاً.');
  assertUnique(data.employees.map(item => item.code), 'الرقم الوظيفي مستخدم مسبقاً.');
  assertUnique(data.employees.map(item => item.username.trim().toLocaleLowerCase('en-US')), 'اسم المستخدم مستخدم مسبقاً.');
  assertUnique(data.departments.map(item => item.name.trim()), 'اسم القسم مستخدم مسبقاً.');
  assertUnique(data.months.map(item => item.month), 'يوجد سجل رواتب لهذا الشهر.');
  const employees = new Set(data.employees.map(item => item.id));
  const departments = new Set(data.departments.map(item => item.id));
  const workdays = new Set(data.workdays.map(item => item.id));
  for (const employee of data.employees) if (!departments.has(employee.departmentId)) fail('قسم الموظف غير موجود.');
  for (const department of data.departments) validateSalaryConfig(department.salary);
  for (const day of data.workdays) {
    if (day.departmentIds.some(id => !departments.has(id)) || Object.keys(day.overrides).some(id => !employees.has(id))) fail('يتضمن يوم الحضور موظفاً أو قسماً غير موجود.');
    assertUnique(day.departmentIds, 'لا يمكن تكرار القسم داخل يوم الحضور.');
  }
  for (const record of data.attendance) if (!employees.has(record.employeeId) || !workdays.has(record.workdayId)) fail('مرجع سجل الحضور غير موجود.');
  assertUnique(data.attendance.map(item => JSON.stringify([item.workdayId, item.employeeId])), 'يوجد سجل حضور للموظف في هذا اليوم.');
  for (const record of [...data.deductions, ...data.bonuses, ...data.payments, ...data.examEvaluations]) if (!employees.has(record.employeeId)) fail('الموظف غير موجود.');
  assertSingleOpenWorkday(data.workdays);
  assertEvaluationState(data);
}
function syncWorkday(data: DemoData, previous: Workday | undefined, day: Workday, reason: string, stamp: string, submitted: RecordValue[]) {
  for (const employee of data.employees) {
    const record = data.attendance.find(item => item.employeeId === employee.id && item.workdayId === day.id);
    const eligibleDate = employee.startDate <= day.date && (!employee.endDate || employee.endDate >= day.date);
    const included = isExpected(employee, day);
    const related = day.departmentIds.includes(employee.departmentId) || Boolean(day.overrides[employee.id]);
    if (!record && employee.active && eligibleDate && related) {
      const desired = submitted.find(item => item.employeeId === employee.id && item.workdayId === day.id);
      data.attendance.push({ id: desired?.id ?? randomUUID(), employeeId: employee.id, workdayId: day.id, status: included ? 'UNRESOLVED' : 'EXEMPT', checkIn: null, latenessSeconds: 0, source: null, reason, updatedAt: stamp });
    } else if (record) {
      const historic = { ...employee, active: true };
      const wasIncluded = previous ? isExpected(historic, previous) : false;
      const nowIncluded = isExpected(historic, day);
      if (wasIncluded && !nowIncluded && record.status !== 'EXEMPT') Object.assign(record, { status: 'EXEMPT', checkIn: null, latenessSeconds: 0, source: null, reason });
      else if (!wasIncluded && nowIncluded && record.status === 'EXEMPT') Object.assign(record, { status: 'UNRESOLVED', reason });
      if (record.status === 'PRESENT' && record.checkIn) record.latenessSeconds = getLatenessSeconds(record.checkIn, day.date, day.startTime);
      record.updatedAt = stamp;
    }
  }
}
function unresolved(data: DemoData, day: Workday): boolean {
  return data.employees.some(employee => {
    const record = data.attendance.find(item => item.workdayId === day.id && item.employeeId === employee.id);
    return record ? record.status === 'UNRESOLVED' : isExpected(employee, day);
  });
}
function assertSafePayroll(value: ReturnType<typeof getEmployeePayroll>) {
  for (const [key, amount] of Object.entries(value)) if (typeof amount === 'number' && !Number.isSafeInteger(amount)) fail(`قيمة الراتب خارج النطاق المدعوم: ${key}`);
}

/** Explicit, revision-locked deletion. Independently rebuild every dependent removal
 * and reject client-side extra changes (including hidden salary or rank edits). */
function applyDeletionMutation(before: DemoData, actor: DemoSession, request: MutationRequest, now: Date): DemoData {
  const intent = request.deletion!;
  if (request.password || request.settings || request.changes.length) fail('نفّذ عملية الحذف وحدها.');
  if (intent.confirmation !== 'حذف' || intent.reason.trim().length < 3 || intent.reason.trim().length > 1000) fail('اكتب كلمة حذف وسبباً واضحاً للحذف.');
  authorizeDeletion(before, actor, intent.collection, intent.id);
  const plan = getDeletionPlan(before, intent.collection, intent.id);
  if (plan.blockers.length) fail(plan.blockers[0]);
  const after = structuredClone(before); delete after.serverEvaluation;
  applyDeletionPlan(after, plan);
  validateState(after);
  // The canonical planner covers archived dependency removals deliberately. Ordinary
  // edits still go through assertEvaluationMutation's strict immutable-archive checks.
  const salaryMonths = new Set([
    ...before.workdays.map(item => item.date.slice(0, 7)),
    ...before.deductions.map(item => item.date.slice(0, 7)),
    ...before.bonuses.map(item => item.date.slice(0, 7)),
    ...after.workdays.map(item => item.date.slice(0, 7)),
    ...after.deductions.map(item => item.date.slice(0, 7)),
    ...after.bonuses.map(item => item.date.slice(0, 7)),
    baghdadDate(now).slice(0, 7),
  ]);
  for (const period of salaryMonths) getMonthPayroll(after, period).forEach(assertSafePayroll);
  for (const collection of collections) {
    const prior = new Map(rows(before, collection).map(item => [item.id, item]));
    const next = new Map(rows(after, collection).map(item => [item.id, item]));
    for (const id of new Set([...prior.keys(), ...next.keys()])) {
      const oldValue = prior.get(id); const newValue = next.get(id);
      if (same(oldValue, newValue)) continue;
      audit(after, actor, now, actionFor(collection, oldValue, newValue), collection, id, oldValue ?? {}, { ...(newValue ?? {}), reason: intent.reason.trim(), deletionRoot: { collection: intent.collection, id: intent.id } },
        String(newValue?.employeeId ?? oldValue?.employeeId ?? (collection === 'employees' ? id : '')) || undefined);
    }
  }
  audit(after, actor, now, 'حذف آمن مؤكد', intent.collection, intent.id, {},
    { reason: intent.reason.trim(), confirmation: 'حذف', removed: Object.fromEntries(Object.entries(plan.removals).map(([key, ids]) => [key, ids.length])), modifiedWorkdays: plan.affectedOverrides });
  if (intent.collection === 'deductions' || intent.collection === 'bonuses') {
    auditPaidPayrollChanges(before, after, actor, now, intent.reason.trim());
  }
  return after;
}

/** Called only with database-canonical data and a freshly authenticated actor,
 * inside the API's revision-checked transaction. Client records express intent;
 * protected calculations, actors, audit and timestamps are reconstructed here. */
export function applyMutation(before: DemoData, actor: DemoSession, request: MutationRequest, now: Date): DemoData {
  if (actor.role === 'QR_DISPLAY') fail('حساب شاشة الحضور مخصص لعرض رمز QR فقط.');
  assertActor(before, actor);
  if (request.deletion) return applyDeletionMutation(before, actor, request, now);
  const after = structuredClone(before); delete after.serverEvaluation;
  const stamp = now.toISOString(); const today = baghdadDate(now); const reason = reasonFrom(request);
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
  if (actor.role === 'EMPLOYEE' && ([...used].some(collection => collection !== 'examEvaluations') || request.settings || request.password)) fail('ليس لديك صلاحية تنفيذ هذه العملية.');

  if (request.settings) {
    requireSuper(actor);
    const parsed = z.strictObject({ centerName: label, qrInterval: z.number().int().min(30).max(60) }).safeParse(request.settings);
    if (!parsed.success) fail('تحقق من اسم المركز ومدة صلاحية رمز الحضور (30–60 ثانية).');
    after.settings = parsed.data;
  }
  for (const value of upserts.get('departments') ?? []) {
    requireSuper(actor); const item = value as unknown as DemoData['departments'][number];
    validateSalaryConfig(item.salary); put(after, 'departments', value);
  }
  for (const value of upserts.get('employees') ?? []) {
    const item = value as unknown as Employee; const previous = before.employees.find(employee => employee.id === item.id);
    // Employee upserts are complete editable profiles. JSON omits undefined
    // photo fields, so absence means the form explicitly removed the image;
    // do not inherit the previous reference while preserving extension fields.
    const submittedProfile = request.changes.find(change => change.collection === 'employees')?.upsert?.find(record => record.id === item.id);
    if (submittedProfile?.photo === undefined) delete item.photo;
    if (!canManageEmployeeAccount(actor.role, previous?.role ?? item.role)) fail('إدارة حسابات المسؤولين متاحة للمشرف العام فقط.');
    if (actor.role !== 'SUPER_ADMIN') {
      if (item.role !== 'EMPLOYEE') fail();
      unchanged(previous ?? { role: 'EMPLOYEE', fixedOverride: false, fixedSalary: 0, dailyRateOverride: null }, item, ['role', 'fixedOverride', 'fixedSalary', 'dailyRateOverride']);
    }
    if (previous) { unchanged(previous, item, ['code', 'createdAt']); item.createdAt = previous.createdAt; }
    else {
      if (request.password?.employeeId !== item.id) fail('أدخل كلمة مرور أولية لحساب الموظف.');
      const next = Math.max(0, ...after.employees.map(employee => Number(employee.code.replace(/^CP-/, '')) || 0)) + 1;
      item.code = `CP-${String(next).padStart(4, '0')}`; item.createdAt = stamp;
    }
    const department = after.departments.find(department => department.id === item.departmentId);
    if (!department || (!department.active && previous?.departmentId !== department.id)) fail('اختر قسماً نشطاً للموظف.');
    if (item.birthDate && item.birthDate > today) fail('تاريخ الميلاد يجب أن يكون في الماضي.');
    if (item.photo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(item.photo)
      && !(item.photo === previous?.photo && /^\/api\/photos\/[a-f0-9]{64}$/.test(item.photo))) fail('اختر صورة PNG أو JPG أو WebP صالحة.');
    if (!previous || item.active !== previous.active) item.endDate = item.active ? undefined : today;
    else item.endDate = previous.endDate;
    if (item.endDate && item.endDate < item.startDate) fail('تاريخ انتهاء العمل لا يسبق تاريخ المباشرة.');
    item.updatedAt = stamp; put(after, 'employees', value);
  }
  if (request.password) {
    const employee = after.employees.find(item => item.id === request.password!.employeeId);
    if (!employee || !canManageEmployeeAccount(actor.role, employee.role)) fail('ليس لديك صلاحية تغيير كلمة مرور هذا الحساب.');
    if (typeof request.password.value !== 'string' || request.password.value.length < 6 || request.password.value.length > 1024) fail('كلمة المرور يجب أن تتكون من 6 أحرف أو أرقام على الأقل.');
  }

  for (const value of upserts.get('workdays') ?? []) {
    requireAdmin(actor); const item = value as unknown as Workday; const previous = before.workdays.find(day => day.id === item.id);
    editableMonth(before, actor, item.date.slice(0, 7));
    if (previous) unchanged(previous, item, ['date', 'createdBy', 'createdAt']);
    else if (item.state !== 'OPEN') fail('افتح يوم الحضور قبل إغلاقه.');
    const attendanceChanges = upserts.get('attendance') ?? [];
    const expectedOverrides = { ...(previous?.overrides ?? {}) };
    for (const attendance of attendanceChanges.filter(record => record.workdayId === item.id)) {
      const employeeId = String(attendance.employeeId);
      if (attendance.status === 'EXEMPT') expectedOverrides[employeeId] = 'EXCLUDE';
      else if (expectedOverrides[employeeId] === 'EXCLUDE') expectedOverrides[employeeId] = 'INCLUDE';
    }
    const manualOverrideOnly = previous && same({ ...item, overrides: previous.overrides }, previous) && same(item.overrides, expectedOverrides) && attendanceChanges.length > 0;
    // A new workday is a creation, not a historical edit. Preserve the reason
    // requirement for edits to already-saved workdays and for reopening days.
    if (previous && !manualOverrideOnly && (item.state === previous.state || item.state === 'OPEN')) requireReason(reason);
    if (previous && item.state !== previous.state) unchanged(previous, item, ['startTime', 'departmentIds', 'overrides']);
    if (!item.departmentIds.length && !Object.values(item.overrides).includes('INCLUDE')) fail('اختر قسماً مشاركاً أو أدرج موظفاً واحداً على الأقل.');
    if (!previous && !after.employees.some(employee => isExpected(employee, item))) fail('لا يوجد موظفون مؤهلون ضمن الاختيارات.');
    item.startTime = item.startTime.length === 5 ? `${item.startTime}:00` : item.startTime;
    item.createdAt = previous?.createdAt ?? stamp; item.createdBy = previous?.createdBy ?? actor.name;
    put(after, 'workdays', value);
    if (!previous || !same(previous.startTime, item.startTime) || !same(previous.departmentIds, item.departmentIds) || !same(previous.overrides, item.overrides)) syncWorkday(after, previous, item, reason, stamp, attendanceChanges);
  }
  for (const value of upserts.get('attendance') ?? []) {
    requireAdmin(actor); const item = value as unknown as AttendanceRecord; const previous = before.attendance.find(record => record.id === item.id);
    if (previous) unchanged(previous, item, ['employeeId', 'workdayId']);
    const employee = after.employees.find(employee => employee.id === item.employeeId); const day = after.workdays.find(day => day.id === item.workdayId);
    if (!employee || !day) fail('سجل الحضور أو الموظف غير موجود.');
    editableMonth(before, actor, day.date.slice(0, 7));
    const period = before.months.find(month => month.month === day.date.slice(0, 7));
    if (period?.state === 'REOPENED' && !period.snapshots[item.employeeId]) fail('لا توجد نسخة راتب مؤرشفة لهذا الموظف.');
    const cascade = after.attendance.find(record => record.id === item.id);
    const editedDay = (upserts.get('workdays') ?? []).some(record => record.id === day.id);
    const cascadeOnly = editedDay && cascade && same({ ...item, updatedAt: cascade.updatedAt, latenessSeconds: cascade.latenessSeconds }, cascade);
    if (!cascadeOnly) {
      if (!previous && !isExpected(employee, day) && item.status !== 'EXEMPT') fail('الموظف غير مشمول بهذا اليوم.');
      if (item.status === 'PRESENT') {
        if (!item.checkIn || baghdadDate(new Date(item.checkIn)) !== day.date) fail('وقت الحضور يجب أن يقع ضمن يوم الدوام بتوقيت بغداد.');
        item.checkIn = new Date(item.checkIn).toISOString(); item.source = 'MANUAL'; item.latenessSeconds = getLatenessSeconds(item.checkIn, day.date, day.startTime);
      } else { item.checkIn = null; item.source = null; item.latenessSeconds = 0; }
      item.updatedAt = stamp;
      if (item.status === 'EXEMPT') day.overrides[item.employeeId] = 'EXCLUDE';
      else if (day.overrides[item.employeeId] === 'EXCLUDE') day.overrides[item.employeeId] = 'INCLUDE';
      put(after, 'attendance', value);
    }
  }
  for (const value of upserts.get('workdays') ?? []) {
    const previous = before.workdays.find(day => day.id === value.id); const day = after.workdays.find(day => day.id === value.id)!;
    if (day.state === 'CLOSED' && previous?.state !== 'CLOSED' && unresolved(after, day)) fail('احسم جميع حالات الحضور قبل إغلاق اليوم.');
  }
  for (const collection of ['deductions', 'bonuses'] as const) {
    for (const value of upserts.get(collection) ?? []) {
      requireAdmin(actor); const previous = find(before, collection, value.id);
      editableMonth(before, actor, String(value.date).slice(0, 7)); if (previous) editableMonth(before, actor, String(previous.date).slice(0, 7));
      if (collection === 'deductions' && value.type === 'أخرى' && !String(value.customType).trim()) fail('حدد نوع الخصم.');
      value.createdBy = previous?.createdBy ?? actor.name; value.createdAt = previous?.createdAt ?? stamp;
      put(after, collection, value);
    }
  }
  for (const value of upserts.get('payments') ?? []) {
    requireAdmin(actor); if (find(before, 'payments', value.id)) fail('سجل الصرف ثابت. سجّل عملية صرف جديدة.');
    const result = getEmployeePayroll(before, String(value.employeeId), String(value.month)); assertSafePayroll(result);
    if (value.salaryAtPayment !== result.finalSalary) fail('تغيّر الراتب. حدّث الصفحة قبل تسجيل الصرف.');
    value.salaryAtPayment = result.finalSalary; value.paidBy = actor.name; value.createdAt = stamp; put(after, 'payments', value);
  }
  for (const value of upserts.get('months') ?? []) {
    requireAdmin(actor); const requested = value as unknown as PayrollMonth; const previous = before.months.find(item => item.id === requested.id);
    const suppliedSnapshots = request.changes.find(change => change.collection === 'months')?.upsert?.find(item => item.id === requested.id)?.snapshots;
    if (previous) unchanged(previous, requested, ['month']);
    if (!previous && before.months.some(item => item.month === requested.month)) fail('سجل الشهر موجود مسبقاً.');
    const state = previous?.state ?? 'OPEN'; let target: PayrollMonth;
    if (state === 'OPEN' && requested.state === 'ARCHIVED') {
      const results = getMonthPayroll(before, requested.month); if (!results.length) fail('لا يمكن أرشفة شهر بلا موظفين.');
      if (results.some(item => item.unresolvedDays > 0)) fail('احسم جميع حالات الحضور قبل الأرشفة.');
      results.forEach(assertSafePayroll);
      target = { ...previous, id: requested.id, month: requested.month, state: 'ARCHIVED', archivedAt: stamp, snapshots: Object.fromEntries(results.map(item => [item.employeeId, item])), sourceSnapshot: captureMonthSource(before, requested.month) };
      if (suppliedSnapshots !== undefined && !same(suppliedSnapshots, target.snapshots)) fail('تغيّرت بيانات الرواتب. حدّث الصفحة قبل الأرشفة.');
    } else if (state === 'ARCHIVED' && requested.state === 'REOPENED' && previous) {
      requireSuper(actor); target = { ...previous, state: 'REOPENED' };
    } else if (state === 'REOPENED' && requested.state === 'REOPENED' && previous) {
      requireSuper(actor);
      const results = Object.keys(previous.snapshots).map(id => recalculateReopenedPayroll(before, id, previous.month)); results.forEach(assertSafePayroll);
      const source = captureMonthSource(before, previous.month);
      target = { ...previous, snapshots: Object.fromEntries(results.map(item => [item.employeeId, item])), sourceSnapshot: previous.sourceSnapshot ? { ...source, employees: previous.sourceSnapshot.employees, departments: previous.sourceSnapshot.departments } : source };
      if (suppliedSnapshots !== undefined && !same(suppliedSnapshots, target.snapshots)) fail('تغيّرت بيانات الرواتب. حدّث الصفحة قبل إعادة الاحتساب.');
    } else if (state === 'REOPENED' && requested.state === 'ARCHIVED' && previous) {
      requireSuper(actor); const source = captureMonthSource(before, previous.month);
      if (previous.sourceSnapshot && (['attendance', 'workdays', 'deductions', 'bonuses'] as const).some(key => !same(source[key], previous.sourceSnapshot![key]))) fail('نفّذ إعادة الاحتساب الصريحة قبل إعادة الأرشفة.');
      const results = getMonthPayroll(before, previous.month); if (!results.length || results.some(item => item.unresolvedDays > 0)) fail('احسم حالات الحضور قبل الأرشفة.');
      target = { ...previous, state: 'ARCHIVED', archivedAt: stamp, snapshots: Object.fromEntries(results.map(item => [item.employeeId, item])) };
    } else fail('انتقال حالة الشهر غير مسموح.');
    put(after, 'months', target as unknown as RecordValue);
  }

  for (const value of upserts.get('evaluationSeasons') ?? []) {
    requireAdmin(actor); const item = value as unknown as DemoData['evaluationSeasons'][number]; const previous = before.evaluationSeasons.find(season => season.id === item.id);
    if (!previous) { if (item.state !== 'OPEN' || item.snapshot || item.endDate) fail(); item.openedAt = stamp; item.openedBy = actor.name; delete item.closedAt; delete item.closedBy; }
    else {
      if (previous.state !== 'OPEN' || item.state !== 'ARCHIVED') fail('لا يمكن تعديل موسم مؤرشف.');
      unchanged(previous, item, ['name', 'startDate', 'openedAt', 'openedBy']);
      if (before.evaluationCycles.some(cycle => cycle.state === 'OPEN')) fail('أغلق دورة التقييم الحالية أولاً.');
      item.endDate = today; if (item.endDate < item.startDate) fail('لا يمكن إغلاق موسم قبل تاريخ بدايته.');
      const atClosingDate = { ...before, evaluationSeasons: before.evaluationSeasons.map(season => season.id === item.id ? { ...season, endDate: today } : season) };
      item.snapshot = buildEvaluationSeasonSnapshot(atClosingDate, item.id); item.closedAt = stamp; item.closedBy = actor.name;
    }
    put(after, 'evaluationSeasons', value);
  }
  const archivedCycleIds = new Set<string>();
  for (const value of upserts.get('evaluationCycles') ?? []) {
    requireAdmin(actor); const item = value as unknown as DemoData['evaluationCycles'][number]; const previous = before.evaluationCycles.find(cycle => cycle.id === item.id);
    if (!previous) { if (item.state !== 'OPEN' || item.snapshot) fail(); item.openedAt = stamp; item.openedBy = actor.name; delete item.closedAt; delete item.closedBy; }
    else {
      if (previous.state !== 'OPEN' || item.state !== 'ARCHIVED') fail('لا يمكن تعديل دورة مؤرشفة.');
      unchanged(previous, item, ['name', 'seasonId', 'openedAt', 'openedBy']);
      item.snapshot = buildEvaluationCycleSnapshot(before, item.id); item.closedAt = stamp; item.closedBy = actor.name; archivedCycleIds.add(item.id);
      for (const exam of after.evaluationExams.filter(exam => exam.cycleId === item.id && exam.state === 'OPEN')) { exam.state = 'CLOSED'; exam.closedAt = stamp; exam.closedBy = actor.name; }
    }
    put(after, 'evaluationCycles', value);
  }
  for (const value of upserts.get('evaluationExams') ?? []) {
    requireAdmin(actor); const item = value as unknown as DemoData['evaluationExams'][number]; const previous = before.evaluationExams.find(exam => exam.id === item.id);
    if (previous) {
      unchanged(previous, item, ['cycleId', 'name', 'date', 'note', 'createdAt', 'createdBy']);
      if (before.evaluationCycles.find(cycle => cycle.id === previous.cycleId)?.state !== 'OPEN') fail('الدورة مؤرشفة.');
      if (item.state === previous.state && !archivedCycleIds.has(item.cycleId)) fail();
    } else {
      if (archivedCycleIds.has(item.cycleId) || item.state !== 'OPEN' || after.evaluationCycles.find(cycle => cycle.id === item.cycleId)?.state !== 'OPEN') fail('أضف الامتحان ضمن دورة مفتوحة.');
      item.createdAt = stamp; item.createdBy = actor.name;
    }
    if (archivedCycleIds.has(item.cycleId) && item.state !== 'CLOSED') fail();
    if (item.state === 'CLOSED') { item.closedAt = previous?.state === 'CLOSED' ? previous.closedAt : stamp; item.closedBy = previous?.state === 'CLOSED' ? previous.closedBy : actor.name; }
    else { delete item.closedAt; delete item.closedBy; }
    put(after, 'evaluationExams', value);
  }
  for (const value of upserts.get('examEvaluations') ?? []) {
    const item = value as unknown as DemoData['examEvaluations'][number]; const previous = before.examEvaluations.find(evaluation => evaluation.id === item.id);
    if (previous) unchanged(previous, item, ['employeeId', 'examId', 'note']);
    else if (item.note) fail('تعديل الملاحظات غير متاح من هذا الإجراء.');
    item.createdAt = previous?.createdAt ?? stamp; item.createdBy = previous?.createdBy ?? actor.name; item.updatedAt = stamp; item.updatedBy = actor.name;
    // Clearing a numeric field edits the record; actual removal requires the
    // explicit, reasoned deletion command, even when all fields become empty.
    put(after, 'examEvaluations', value);
  }
  validateState(after); assertEvaluationMutation(before, after, actor);
  // Protect financial arithmetic from unsafe integer overflow before commit.
  if ([...used].some(collection => ['departments', 'employees', 'attendance', 'deductions', 'bonuses'].includes(collection))) {
    const months = new Set([...after.workdays.map(item => item.date.slice(0, 7)), ...after.deductions.map(item => item.date.slice(0, 7)), ...after.bonuses.map(item => item.date.slice(0, 7)), today.slice(0, 7)]);
    for (const value of months) getMonthPayroll(after, value).forEach(assertSafePayroll);
  }
  for (const collection of collections) {
    const prior = new Map(rows(before, collection).map(item => [item.id, item])); const next = new Map(rows(after, collection).map(item => [item.id, item]));
    for (const id of new Set([...prior.keys(), ...next.keys()])) {
      const oldValue = prior.get(id); const newValue = next.get(id); if (same(oldValue, newValue)) continue;
      audit(after, actor, now, actionFor(collection, oldValue, newValue), collection, id, oldValue ?? {}, { ...newValue, ...(reason ? { reason } : {}) }, String(newValue?.employeeId ?? oldValue?.employeeId ?? (collection === 'employees' ? id : '')) || undefined);
    }
  }
  if (!same(before.settings, after.settings)) audit(after, actor, now, 'تعديل إعدادات النظام', 'settings', 'center-settings', before.settings, after.settings);
  if (request.password) audit(after, actor, now, 'تغيير كلمة مرور الموظف', 'employee', request.password.employeeId, {}, { passwordChanged: true, sessionsInvalidated: true }, request.password.employeeId);
  auditPaidPayrollChanges(before, after, actor, now, reason);
  return after;
}

function auditPaidPayrollChanges(before: DemoData, after: DemoData, actor: DemoSession, now: Date, reason: string) {
  for (const key of new Set(before.payments.map(payment => JSON.stringify([payment.employeeId, payment.month])))) {
    const [employeeId, payrollMonth] = JSON.parse(key) as [string, string];
    const oldValue = getEmployeePayroll(before, employeeId, payrollMonth); const newValue = getEmployeePayroll(after, employeeId, payrollMonth);
    if (oldValue.finalSalary !== newValue.finalSalary) audit(after, actor, now, 'تعديل راتب بعد الصرف', 'payroll', payrollMonth, { finalSalary: oldValue.finalSalary, paymentStatus: oldValue.paymentStatus }, { finalSalary: newValue.finalSalary, paymentStatus: newValue.paymentStatus, difference: newValue.difference, ...(reason ? { reason } : {}) }, employeeId);
  }
}

function actionFor(collection: Collection, previous?: RecordValue, next?: RecordValue): string {
  const labels: Record<Collection, string> = { employees: 'موظف', departments: 'قسم', workdays: 'يوم حضور', attendance: 'سجل حضور', deductions: 'خصم', bonuses: 'مكافأة', months: 'رواتب الشهر', payments: 'صرف راتب', evaluationSeasons: 'موسم تقييم', evaluationCycles: 'دورة تقييم', evaluationExams: 'امتحان', examEvaluations: 'بيانات تدقيق مصحح' };
  if (collection === 'months') return !next ? 'حذف أرشيف رواتب الشهر' : next.state === 'ARCHIVED' ? 'أرشفة رواتب الشهر' : previous?.state === 'ARCHIVED' ? 'إعادة فتح شهر مؤرشف' : 'إعادة احتساب صريحة لشهر معاد فتحه';
  if (collection === 'workdays' && next && previous?.state !== next.state) return next.state === 'CLOSED' ? 'إغلاق يوم حضور' : previous ? 'إعادة فتح يوم حضور' : 'فتح يوم حضور';
  if (collection === 'employees' && previous && next && previous.active !== next.active) return next.active ? 'تفعيل موظف' : 'إيقاف موظف';
  return `${!next ? 'حذف' : previous ? 'تعديل' : 'إضافة'} ${labels[collection]}`;
}

/** The QR route must verify its signed, expiring token BEFORE calling this
 * helper. Generic mutation requests can never call the employee check-in path. */
export function recordQrAttendance(before: DemoData, actor: DemoSession, workdayId: string, now: Date): DemoData {
  assertActor(before, actor); if (actor.role !== 'EMPLOYEE' || !actor.employeeId) fail('التسجيل متاح لحساب الموظف النشط فقط.');
  const employee = before.employees.find(item => item.id === actor.employeeId)!; const day = before.workdays.find(item => item.id === workdayId);
  if (!day || day.state !== 'OPEN' || day.date !== baghdadDate(now)) fail('لا يوجد يوم حضور مفتوح لهذا التاريخ.');
  if (before.months.some(item => item.month === day.date.slice(0, 7) && item.state !== 'OPEN')) fail('الشهر محمي ولا يقبل تسجيل الحضور الذاتي.');
  const previous = before.attendance.find(item => item.employeeId === employee.id && item.workdayId === day.id);
  if (!isExpected(employee, day) || previous?.status === 'EXEMPT') fail('أنت مستثنى من دوام هذا اليوم.');
  if (previous?.status === 'PRESENT') return structuredClone(before);
  const after = structuredClone(before); delete after.serverEvaluation;
  const record: AttendanceRecord = { id: previous?.id ?? randomUUID(), employeeId: employee.id, workdayId: day.id, status: 'PRESENT', checkIn: now.toISOString(), latenessSeconds: getLatenessSeconds(now.toISOString(), day.date, day.startTime), source: 'QR', reason: '', updatedAt: now.toISOString() };
  put(after, 'attendance', record as unknown as RecordValue); validateState(after);
  audit(after, actor, now, 'تسجيل حضور QR', 'attendance', record.id, previous ?? {}, record, employee.id);
  return after;
}
