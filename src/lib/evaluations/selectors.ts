import type { DemoData, EvaluationCycle, EvaluationSeason, ExamEvaluation } from '../types';

export function getOpenEvaluationCycle(data: DemoData): EvaluationCycle | undefined {
  return data.evaluationCycles.find(cycle => cycle.state === 'OPEN');
}

export function getOpenEvaluationSeason(data: DemoData): EvaluationSeason | undefined {
  return data.evaluationSeasons.find(season => season.state === 'OPEN');
}

export function getLatestEvaluationSeason(data: DemoData): EvaluationSeason | undefined {
  return getOpenEvaluationSeason(data)
    ?? [...data.evaluationSeasons].filter(item => item.state === 'ARCHIVED').sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''))[0];
}

export function getExamEvaluation(data: DemoData, examId: string, employeeId: string, options: { publishedOnly?: boolean } = {}): ExamEvaluation | undefined {
  if (options.publishedOnly && data.evaluationExams.find(item => item.id === examId)?.state !== 'CLOSED') return undefined;
  return data.examEvaluations.find(item => item.examId === examId && item.employeeId === employeeId);
}
