import { assertEvaluationMutation } from '@/lib/evaluations';
import { getMonthPayroll } from '@/lib/payroll';
import type { MutationRequest } from '@/lib/server-contract';
import type { DemoData, DemoSession } from '@/lib/types';
import { applyAttendanceChanges } from './domain/attendance';
import { audit, auditChanges, auditPaidPayrollChanges } from './domain/audit';
import { applyDeletionMutation } from './domain/deletion';
import { applyEvaluationChanges } from './domain/evaluations';
import { applyPayrollChanges } from './domain/payroll';
import { applyPeopleChanges } from './domain/people';
import { parseMutationChanges } from './domain/schemas';
import { assertActor, assertSafePayroll, baghdadDate, fail, reasonFrom, same, validateState, type MutationContext } from './domain/shared';

// Preserve the public server boundary used by routes and domain/integration tests.
export { baghdadDate } from './domain/shared';
export { recordQrAttendance } from './domain/attendance';

/** Called only with database-canonical data and a freshly authenticated actor,
 * inside the API's revision-checked transaction. Client records express intent;
 * protected calculations, actors, audit and timestamps are reconstructed here. */
export function applyMutation(before: DemoData, actor: DemoSession, request: MutationRequest, now: Date): DemoData {
  if (actor.role === 'QR_DISPLAY') fail('حساب شاشة الحضور مخصص لعرض رمز QR فقط.');
  assertActor(before, actor);
  if (request.deletion) return applyDeletionMutation(before, actor, request, now);
  const after = structuredClone(before); delete after.serverEvaluation;
  const stamp = now.toISOString(); const today = baghdadDate(now); const reason = reasonFrom(request);
  const { upserts, used } = parseMutationChanges(before, actor, request);
  const context: MutationContext = { before, after, actor, request, stamp, today, reason, upserts };

  // Keep this order explicit: a feature may rely on canonical data produced by
  // an earlier stage (day/attendance cascades and cycle/exam closure in particular).
  applyPeopleChanges(context);
  applyAttendanceChanges(context);
  applyPayrollChanges(context);
  applyEvaluationChanges(context);

  validateState(after); assertEvaluationMutation(before, after, actor);
  // Protect financial arithmetic from unsafe integer overflow before commit.
  if ([...used].some(collection => ['departments', 'employees', 'attendance', 'deductions', 'bonuses'].includes(collection))) {
    const months = new Set([...after.workdays.map(item => item.date.slice(0, 7)), ...after.deductions.map(item => item.date.slice(0, 7)), ...after.bonuses.map(item => item.date.slice(0, 7)), today.slice(0, 7)]);
    for (const value of months) getMonthPayroll(after, value).forEach(assertSafePayroll);
  }
  auditChanges(before, after, actor, now, reason ? { reason } : {});
  if (!same(before.settings, after.settings)) audit(after, actor, now, 'تعديل إعدادات النظام', 'settings', 'center-settings', before.settings, after.settings);
  if (request.password) audit(after, actor, now, 'تغيير كلمة مرور الموظف', 'employee', request.password.employeeId, {}, { passwordChanged: true, sessionsInvalidated: true }, request.password.employeeId);
  auditPaidPayrollChanges(before, after, actor, now, reason);
  return after;
}
