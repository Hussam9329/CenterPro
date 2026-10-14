import { randomUUID } from 'node:crypto';
import { getLatenessSeconds, isExpected } from '@/lib/attendance';
import type { AttendanceRecord, DemoData, DemoSession, Workday } from '@/lib/types';
import { audit } from './audit';
import { assertActor, baghdadDate, editableMonth, fail, put, requireAdmin, requireReason, same, unchanged, validateState, type MutationContext, type RecordValue } from './shared';

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
/** Apply day configuration first, attendance intent next, then validate day closure. */
export function applyAttendanceChanges(context: MutationContext) {
  const { before, after, actor, upserts, stamp, reason } = context;
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
