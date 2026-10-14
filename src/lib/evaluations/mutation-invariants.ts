import type { DemoData, DemoSession } from '../types';
import { changedRecords, sameValue } from './comparison';
import { isAuditEmployee, isCorrectionEmployee } from './roles';
import { buildEvaluationCycleSnapshot, buildEvaluationSeasonSnapshot } from './snapshots';
import { assertEvaluationState } from './state-invariants';

/** Provider boundary for the preview; it does not replace server authorization. */
export function assertEvaluationMutation(before: DemoData, after: DemoData, session: DemoSession | null): void {
  const seasonsChanged = !sameValue(before.evaluationSeasons, after.evaluationSeasons);
  const cyclesChanged = !sameValue(before.evaluationCycles, after.evaluationCycles);
  const examsChanged = !sameValue(before.evaluationExams, after.evaluationExams);
  const evaluationsChanged = !sameValue(before.examEvaluations, after.examEvaluations);
  if (!seasonsChanged && !cyclesChanged && !examsChanged && !evaluationsChanged) return;
  assertEvaluationState(after);
  if (!session) throw new Error('سجّل الدخول قبل تعديل بيانات التقييم.');

  for (const season of before.evaluationSeasons.filter(item => item.state === 'ARCHIVED')) {
    if (!sameValue(season, after.evaluationSeasons.find(item => item.id === season.id))
      || !sameValue(before.evaluationCycles.filter(item => item.seasonId === season.id), after.evaluationCycles.filter(item => item.seasonId === season.id))) throw new Error('المواسم المؤرشفة ودوراتها ثابتة ولا يمكن تعديلها.');
  }
  for (const cycle of before.evaluationCycles.filter(item => item.state === 'ARCHIVED')) {
    const previousExams = before.evaluationExams.filter(item => item.cycleId === cycle.id);
    const nextExams = after.evaluationExams.filter(item => item.cycleId === cycle.id);
    const examIds = new Set(previousExams.map(item => item.id));
    if (!sameValue(cycle, after.evaluationCycles.find(item => item.id === cycle.id))
      || !sameValue(previousExams, nextExams)
      || !sameValue(before.examEvaluations.filter(item => examIds.has(item.examId)), after.examEvaluations.filter(item => examIds.has(item.examId)))) {
      throw new Error('الدورات المؤرشفة وامتحاناتها وتقييماتها ثابتة ولا يمكن تعديلها.');
    }
  }

  if (seasonsChanged || cyclesChanged || examsChanged) {
    if (session.role !== 'ADMIN' && session.role !== 'SUPER_ADMIN') throw new Error('إدارة المواسم ودورات التقييم والامتحانات متاحة للإدارة فقط.');
    if (session.employeeId && [before, after].some(data => !data.employees.some(employee => employee.id === session.employeeId && employee.active && employee.role === session.role))) throw new Error('لم تعد صلاحية الإدارة متاحة لهذا الحساب.');
    for (const cycle of after.evaluationCycles) {
      const previous = before.evaluationCycles.find(item => item.id === cycle.id);
      if (previous && previous.seasonId !== cycle.seasonId) throw new Error('لا يمكن نقل دورة التقييم إلى موسم آخر.');
      if (!previous && after.evaluationSeasons.find(item => item.id === cycle.seasonId)?.state !== 'OPEN') throw new Error('افتح موسماً قبل إنشاء دورة تقييم.');
    }
    for (const exam of after.evaluationExams) {
      const previous = before.evaluationExams.find(item => item.id === exam.id);
      if (previous && previous.cycleId !== exam.cycleId) throw new Error('لا يمكن نقل الامتحان إلى دورة تقييم أخرى.');
    }
    for (const season of after.evaluationSeasons.filter(item => item.state === 'ARCHIVED')) {
      const previous = before.evaluationSeasons.find(item => item.id === season.id);
      if (!previous) throw new Error('افتح الموسم قبل أرشفته.');
      const atClosingDate = { ...before, evaluationSeasons: before.evaluationSeasons.map(item => item.id === season.id ? { ...item, endDate: season.endDate } : item) };
      if (previous.state === 'OPEN' && !sameValue(season.snapshot, buildEvaluationSeasonSnapshot(atClosingDate, season.id))) {
        throw new Error('يجب أن تحفظ أرشفة الموسم أحدث بياناته كاملة.');
      }
    }
    for (const cycle of after.evaluationCycles.filter(item => item.state === 'ARCHIVED')) {
      const previous = before.evaluationCycles.find(item => item.id === cycle.id);
      if (!previous) throw new Error('افتح دورة التقييم قبل أرشفتها.');
      if (previous.state === 'OPEN' && !sameValue(cycle.snapshot, buildEvaluationCycleSnapshot(before, cycle.id))) {
        throw new Error('يجب أن تحفظ الأرشفة أحدث بيانات دورة التقييم كاملة.');
      }
    }
  }

  if (evaluationsChanged) {
    const actor = before.employees.find(item => item.id === session.employeeId);
    const nextActor = after.employees.find(item => item.id === session.employeeId);
    if (session.role !== 'EMPLOYEE' || !actor || !nextActor || actor.role !== 'EMPLOYEE' || nextActor.role !== 'EMPLOYEE'
      || !isAuditEmployee(before, actor) || !isAuditEmployee(after, nextActor)) throw new Error('إدخال التقييمات متاح لموظفي قسم التدقيق النشطين فقط.');
    for (const evaluation of changedRecords(before.examEvaluations, after.examEvaluations)) {
      for (const data of [before, after]) {
        const exam = data.evaluationExams.find(item => item.id === evaluation.examId);
        const cycle = data.evaluationCycles.find(item => item.id === exam?.cycleId);
        const season = data.evaluationSeasons.find(item => item.id === cycle?.seasonId);
        const employee = data.employees.find(item => item.id === evaluation.employeeId);
        if (exam?.state !== 'OPEN' || cycle?.state !== 'OPEN') throw new Error('لا يمكن تعديل تقييم امتحان مغلق أو دورة مؤرشفة.');
        if (cycle.seasonId && season?.state !== 'OPEN') throw new Error('لا يمكن تعديل التقييم بعد إغلاق الموسم.');
        if (!employee || !isCorrectionEmployee(data, employee)) throw new Error('يجب أن يخص التقييم موظفاً نشطاً في قسم التصحيح.');
      }
    }
  }
}
