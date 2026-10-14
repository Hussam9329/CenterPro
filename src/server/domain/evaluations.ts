import { buildEvaluationCycleSnapshot, buildEvaluationSeasonSnapshot } from '@/lib/evaluations';
import type { DemoData } from '@/lib/types';
import { fail, put, requireAdmin, unchanged, type MutationContext } from './shared';

/** Close seasons/cycles/exams and preserve server-authored evaluation provenance. */
export function applyEvaluationChanges(context: MutationContext) {
  const { before, after, actor, upserts, stamp, today } = context;
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
}
