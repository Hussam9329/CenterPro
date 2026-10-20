import type { DemoData, EvaluationCycleSnapshot, EvaluationSeasonSnapshot } from '../types';
import { getCycleLeaderboard, getExamLeaderboard, getSeasonLeaderboard } from './leaderboards';

export function buildEvaluationCycleSnapshot(data: DemoData, cycleId: string): EvaluationCycleSnapshot {
  const cycle = data.evaluationCycles.find(item => item.id === cycleId);
  if (!cycle) throw new Error('لم يتم العثور على الـ Drive.');
  if (cycle.state === 'ARCHIVED') {
    if (!cycle.snapshot) throw new Error('النسخة الأرشيفية للـ Drive غير موجودة.');
    return structuredClone(cycle.snapshot);
  }
  const exams = data.evaluationExams.filter(item => item.cycleId === cycleId);
  return {
    rows: getCycleLeaderboard(data, cycleId),
    exams: exams.map(exam => ({ id: exam.id, name: exam.name, date: exam.date, rows: getExamLeaderboard(data, exam.id) })),
  };
}

export function buildEvaluationSeasonSnapshot(data: DemoData, seasonId: string): EvaluationSeasonSnapshot {
  const season = data.evaluationSeasons.find(item => item.id === seasonId);
  if (!season) throw new Error('لم يتم العثور على الموسم.');
  if (season.state === 'ARCHIVED') {
    if (!season.snapshot) throw new Error('النسخة الأرشيفية للموسم غير موجودة.');
    return structuredClone(season.snapshot);
  }
  const cycles = data.evaluationCycles.filter(item => item.seasonId === seasonId);
  if (data.evaluationCycles.some(item => item.state === 'OPEN')) throw new Error('أغلق الـ Drive الحالي قبل أرشفة الموسم.');
  return { rows: getSeasonLeaderboard(data, seasonId), cycleIds: cycles.map(item => item.id) };
}
