import { randomUUID } from 'node:crypto';
import { getEmployeePayroll } from '@/lib/payroll';
import type { AuditEntry, DemoData, DemoSession } from '@/lib/types';
import { collections, rows, same, type Collection, type RecordValue } from './shared';

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => key === 'photo' ? [['hasPhoto', Boolean(child)]] : key === 'passwordChanged' ? [[key, Boolean(child)]] : /password|credential|hash|salt|token|secret/i.test(key) ? [] : [[key, scrub(child)]]));
}
export function audit(data: DemoData, actor: DemoSession, now: Date, action: string, entity: string, entityId: string, oldValues: unknown, newValues: unknown, employeeId?: string) {
  const entry: AuditEntry & { actorId: string } = { id: randomUUID(), actorId: actor.employeeId ?? 'SYSTEM', actor: actor.name, role: actor.role, action, entity, entityId, employeeId, oldValues: scrub(oldValues) as Record<string, unknown>, newValues: scrub(newValues) as Record<string, unknown>, timestamp: now.toISOString() };
  data.audit.unshift(entry);
}
export function auditPaidPayrollChanges(before: DemoData, after: DemoData, actor: DemoSession, now: Date, reason: string) {
  for (const key of new Set(before.payments.map(payment => JSON.stringify([payment.employeeId, payment.month])))) {
    const [employeeId, payrollMonth] = JSON.parse(key) as [string, string];
    const oldValue = getEmployeePayroll(before, employeeId, payrollMonth); const newValue = getEmployeePayroll(after, employeeId, payrollMonth);
    if (oldValue.finalSalary !== newValue.finalSalary) audit(after, actor, now, 'تعديل راتب بعد الصرف', 'payroll', payrollMonth, { finalSalary: oldValue.finalSalary, paymentStatus: oldValue.paymentStatus }, { finalSalary: newValue.finalSalary, paymentStatus: newValue.paymentStatus, difference: newValue.difference, ...(reason ? { reason } : {}) }, employeeId);
  }
}

function actionFor(collection: Collection, previous?: RecordValue, next?: RecordValue): string {
  const labels: Record<Collection, string> = { employees: 'موظف', departments: 'قسم', workdays: 'يوم حضور', attendance: 'سجل حضور', deductions: 'خصم', bonuses: 'مكافأة', months: 'رواتب الشهر', payments: 'صرف راتب', evaluationSeasons: 'موسم تقييم', evaluationCycles: 'Drive', evaluationExams: 'امتحان', examEvaluations: 'بيانات تدقيق مصحح' };
  if (collection === 'months') return !next ? 'حذف أرشيف رواتب الشهر' : next.state === 'ARCHIVED' ? 'أرشفة رواتب الشهر' : previous?.state === 'ARCHIVED' ? 'إعادة فتح شهر مؤرشف' : 'إعادة احتساب صريحة لشهر معاد فتحه';
  if (collection === 'workdays' && next && previous?.state !== next.state) return next.state === 'CLOSED' ? 'إغلاق يوم حضور' : previous ? 'إعادة فتح يوم حضور' : 'فتح يوم حضور';
  if (collection === 'employees' && previous && next && previous.active !== next.active) return next.active ? 'تفعيل موظف' : 'إيقاف موظف';
  return `${!next ? 'حذف' : previous ? 'تعديل' : 'إضافة'} ${labels[collection]}`;
}

/** Record canonical changes in collection order, including server-derived cascades. */
export function auditChanges(before: DemoData, after: DemoData, actor: DemoSession, now: Date, details: Record<string, unknown>) {
  for (const collection of collections) {
    const prior = new Map(rows(before, collection).map(item => [item.id, item]));
    const next = new Map(rows(after, collection).map(item => [item.id, item]));
    for (const id of new Set([...prior.keys(), ...next.keys()])) {
      const oldValue = prior.get(id); const newValue = next.get(id);
      if (same(oldValue, newValue)) continue;
      audit(after, actor, now, actionFor(collection, oldValue, newValue), collection, id,
        oldValue ?? {}, { ...newValue, ...details },
        String(newValue?.employeeId ?? oldValue?.employeeId ?? (collection === 'employees' ? id : '')) || undefined);
    }
  }
}
