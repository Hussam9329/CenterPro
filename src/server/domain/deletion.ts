import { getMonthPayroll } from '@/lib/payroll';
import { applyDeletionPlan, authorizeDeletion, getDeletionPlan } from '@/lib/safe-deletion';
import type { MutationRequest } from '@/lib/server-contract';
import type { DemoData, DemoSession } from '@/lib/types';
import { audit, auditChanges, auditPaidPayrollChanges } from './audit';
import { assertSafePayroll, baghdadDate, fail, validateState } from './shared';

/** Explicit, revision-locked deletion. Independently rebuild every dependent removal
 * and reject client-side extra changes (including hidden salary or rank edits). */
export function applyDeletionMutation(before: DemoData, actor: DemoSession, request: MutationRequest, now: Date): DemoData {
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
  auditChanges(before, after, actor, now, {
    reason: intent.reason.trim(), deletionRoot: { collection: intent.collection, id: intent.id },
  });
  audit(after, actor, now, 'حذف آمن مؤكد', intent.collection, intent.id, {},
    { reason: intent.reason.trim(), confirmation: 'حذف', removed: Object.fromEntries(Object.entries(plan.removals).map(([key, ids]) => [key, ids.length])), modifiedWorkdays: plan.affectedOverrides });
  if (intent.collection === 'deductions' || intent.collection === 'bonuses') {
    auditPaidPayrollChanges(before, after, actor, now, intent.reason.trim());
  }
  return after;
}
