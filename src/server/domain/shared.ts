import { assertSingleOpenWorkday } from '@/lib/attendance';
import { assertEvaluationState } from '@/lib/evaluations';
import { getEmployeePayroll, validateSalaryConfig } from '@/lib/payroll';
import { MUTABLE_COLLECTIONS, type MutableCollection, type MutationRequest } from '@/lib/server-contract';
import type { DemoData, DemoSession } from '@/lib/types';

export const collections = MUTABLE_COLLECTIONS;
export type Collection = MutableCollection;
export type RecordValue = Record<string, unknown> & { id: string };

/** A transaction-local draft. Feature handlers run in the order defined by applyMutation. */
export interface MutationContext {
  before: DemoData;
  after: DemoData;
  actor: DemoSession;
  request: MutationRequest;
  stamp: string;
  today: string;
  reason: string;
  upserts: Map<Collection, RecordValue[]>;
}

export const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
export function fail(message = 'هذه العملية غير مسموحة أو تغيّرت بياناتها. حدّث الصفحة وحاول مرة أخرى.'): never { throw new Error(message); }
export function requireAdmin(actor: DemoSession) { if (actor.role !== 'ADMIN' && actor.role !== 'SUPER_ADMIN') fail('ليس لديك صلاحية تنفيذ هذه العملية.'); }
export function requireSuper(actor: DemoSession) { if (actor.role !== 'SUPER_ADMIN') fail('هذه العملية متاحة للمشرف العام فقط.'); }
export function baghdadDate(now: Date): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
export function assertActor(data: DemoData, actor: DemoSession) {
  if (actor.kind === 'SYSTEM' && actor.role === 'SUPER_ADMIN' && !actor.employeeId) return;
  if (actor.kind !== 'EMPLOYEE' || !data.employees.some(employee => employee.id === actor.employeeId && employee.active && employee.role === actor.role)) fail('انتهت صلاحية الحساب. سجّل الدخول مجدداً.');
}
export function editableMonth(data: DemoData, actor: DemoSession, value: string) {
  const state = data.months.find(item => item.month === value)?.state;
  if (state === 'ARCHIVED' || (state === 'REOPENED' && actor.role !== 'SUPER_ADMIN')) fail('الشهر مؤرشف أو لا تملك صلاحية تعديل الشهر المعاد فتحه.');
}
export function rows(data: DemoData, collection: Collection): RecordValue[] { return data[collection] as unknown as RecordValue[]; }
export function find(data: DemoData, collection: Collection, id: string) { return rows(data, collection).find(item => item.id === id); }
export function put(data: DemoData, collection: Collection, value: RecordValue) {
  const list = rows(data, collection); const index = list.findIndex(item => item.id === value.id);
  if (index < 0) list.push(value); else list[index] = value;
}
export function unchanged(previous: object, next: object, fields: readonly string[]) {
  for (const field of fields) if (!same((previous as Record<string, unknown>)[field], (next as Record<string, unknown>)[field])) fail('لا يمكن تعديل هذه البيانات المحمية.');
}
export function reasonFrom(request: MutationRequest): string {
  const value = request.audit?.newValues?.reason;
  return typeof value === 'string' ? value.trim().slice(0, 20_000) : '';
}
export function requireReason(reason: string) { if (!reason) fail('اكتب سبب التعديل لحفظه في سجل العمليات.'); }
export function assertUnique(values: readonly string[], message: string) { if (new Set(values).size !== values.length) fail(message); }
export function validateState(data: DemoData) {
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
export function assertSafePayroll(value: ReturnType<typeof getEmployeePayroll>) {
  for (const [key, amount] of Object.entries(value)) if (typeof amount === 'number' && !Number.isSafeInteger(amount)) fail(`قيمة الراتب خارج النطاق المدعوم: ${key}`);
}
