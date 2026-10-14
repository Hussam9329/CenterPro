import { getEmployeePayroll, getMonthPayroll, recalculateReopenedPayroll } from '@/lib/payroll';
import { captureMonthSource } from '@/lib/finance/month-source';
import type { PayrollMonth } from '@/lib/types';
import { assertSafePayroll, editableMonth, fail, find, put, requireAdmin, requireSuper, same, unchanged, type MutationContext, type RecordValue } from './shared';

/** Preserve adjustments, immutable payment entries and explicit archive transitions. */
export function applyPayrollChanges(context: MutationContext) {
  const { before, after, actor, request, upserts, stamp } = context;
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

}
