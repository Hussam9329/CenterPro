import type { DemoData } from '../types';
import { assertUniqueIds, sameIds, validDate } from './comparison';

/** Structural validation also accepts historical staff who have since moved or left. */
export function assertEvaluationState(data: DemoData): void {
  assertUniqueIds(data.evaluationSeasons, 'المواسم');
  assertUniqueIds(data.evaluationCycles, 'Drives');
  assertUniqueIds(data.evaluationExams, 'الامتحانات');
  assertUniqueIds(data.examEvaluations, 'التقييمات');
  if (data.evaluationSeasons.filter(item => item.state === 'OPEN').length > 1) throw new Error('لا يمكن فتح أكثر من موسم واحد.');
  if (data.evaluationCycles.filter(item => item.state === 'OPEN').length > 1) throw new Error('لا يمكن فتح أكثر من Drive واحد.');
  const seasons = new Map(data.evaluationSeasons.map(item => [item.id, item]));
  const cycles = new Map(data.evaluationCycles.map(item => [item.id, item]));
  const exams = new Map(data.evaluationExams.map(item => [item.id, item]));
  for (const season of data.evaluationSeasons) {
    if (season.state !== 'OPEN' && season.state !== 'ARCHIVED') throw new Error('حالة الموسم غير صالحة.');
    if (!validDate(season.startDate)) throw new Error('تاريخ بداية الموسم غير صالح.');
    if (season.endDate && (!validDate(season.endDate) || season.endDate < season.startDate)) throw new Error('تاريخ نهاية الموسم يجب أن يكون صالحاً وألا يسبق بدايته.');
    if (season.state === 'ARCHIVED' && (!season.snapshot || !Array.isArray(season.snapshot.rows) || !Array.isArray(season.snapshot.cycleIds))) throw new Error('الموسم المؤرشف يتطلب نسخة محفوظة.');
    if (season.state === 'ARCHIVED') {
      if (!season.endDate) throw new Error('الموسم المؤرشف يتطلب تاريخ نهاية.');
      const cycleIds = data.evaluationCycles.filter(item => item.seasonId === season.id).map(item => item.id);
      if (!sameIds(season.snapshot!.cycleIds, cycleIds)) throw new Error('Drives الموسم المؤرشف يجب أن تطابق النسخة المحفوظة.');
    }
  }
  for (const cycle of data.evaluationCycles) {
    if (cycle.state !== 'OPEN' && cycle.state !== 'ARCHIVED') throw new Error('حالة الـ Drive غير صالحة.');
    if (cycle.seasonId) {
      const season = seasons.get(cycle.seasonId);
      if (!season) throw new Error('يجب أن يتبع الـ Drive موسماً موجوداً.');
      if (season.state === 'ARCHIVED' && cycle.state !== 'ARCHIVED') throw new Error('Drives الموسم المؤرشف يجب أن تكون مؤرشفة.');
    }
    if (cycle.state === 'ARCHIVED' && (!cycle.snapshot || !Array.isArray(cycle.snapshot.rows) || !Array.isArray(cycle.snapshot.exams))) throw new Error('الـ Drive المؤرشف يتطلب نسخة محفوظة.');
    if (cycle.state === 'ARCHIVED' && !sameIds(cycle.snapshot!.exams.map(item => item.id), data.evaluationExams.filter(item => item.cycleId === cycle.id).map(item => item.id))) throw new Error('امتحانات الـ Drive المؤرشف يجب أن تطابق النسخة المحفوظة.');
  }
  for (const exam of data.evaluationExams) {
    const cycle = cycles.get(exam.cycleId);
    if (!cycle) throw new Error('يجب أن يتبع الامتحان Drive موجوداً.');
    if (exam.state !== 'OPEN' && exam.state !== 'CLOSED') throw new Error('حالة الامتحان غير صالحة.');
    if (cycle.state === 'ARCHIVED' && exam.state !== 'CLOSED') throw new Error('امتحانات الـ Drive المؤرشف يجب أن تبقى مغلقة.');
  }
  const pairs = new Set<string>();
  for (const evaluation of data.examEvaluations) {
    if (!exams.has(evaluation.examId)) throw new Error('يجب أن يتبع التقييم امتحاناً موجوداً.');
    const pair = JSON.stringify([evaluation.examId, evaluation.employeeId]);
    if (!evaluation.employeeId || pairs.has(pair)) throw new Error('يسمح بتقييم واحد فقط لكل موظف في الامتحان.');
    pairs.add(pair);
    for (const value of [evaluation.papers, ...(evaluation.paperBatches ?? []), evaluation.correctionErrors, evaluation.behaviorErrors]) {
      if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new Error('أعداد الأوراق والأخطاء يجب أن تكون أعداداً صحيحة غير سالبة أو حقولاً فارغة.');
    }
  }
}
