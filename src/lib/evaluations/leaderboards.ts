import type { DemoData, Employee, EvaluationCycle, EvaluationLeaderboardRow, EvaluationSeason, ExamEvaluation, SeasonLeaderboardRow } from '../types';
import { getCorrectionEmployees } from './roles';
import { calculateAccuracy, calculateEvaluationScore } from './scoring';

function rowForEmployee(employee: Employee, evaluations: ExamEvaluation[]): EvaluationLeaderboardRow {
  const papers = evaluations.reduce((sum, item) => sum + (item.papers ?? 0), 0);
  const correctionErrors = evaluations.reduce((sum, item) => sum + (item.correctionErrors ?? 0), 0);
  const behaviorErrors = evaluations.reduce((sum, item) => sum + (item.behaviorErrors ?? 0), 0);
  return {
    employeeId: employee.id,
    employeeName: employee.name,
    employeeCode: employee.code,
    papers,
    correctionErrors,
    behaviorErrors,
    // Empty retained editor rows have the same statistics as a missing row;
    // explicit zeroes and notes remain meaningful submitted evaluations.
    examsEvaluated: new Set(evaluations.filter(item => [item.papers, item.correctionErrors, item.behaviorErrors].some(value => value !== null) || item.note.trim()).map(item => item.examId)).size,
    score: calculateEvaluationScore(papers, correctionErrors, behaviorErrors),
    accuracy: calculateAccuracy(papers, correctionErrors, behaviorErrors),
  };
}

function sortLeaderboard<T extends EvaluationLeaderboardRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.score - a.score || b.papers - a.papers || a.employeeName.localeCompare(b.employeeName, 'ar'));
}

export function getExamLeaderboard(data: DemoData, examId: string, options: { publishedOnly?: boolean } = {}): EvaluationLeaderboardRow[] {
  const exam = data.evaluationExams.find(item => item.id === examId);
  if (!exam || (options.publishedOnly && exam.state !== 'CLOSED')) return [];
  const cycle = data.evaluationCycles.find(item => item.id === exam.cycleId);
  if (!cycle) return [];
  if (cycle.state === 'ARCHIVED') return structuredClone(cycle.snapshot?.exams.find(item => item.id === examId)?.rows ?? []);
  const employees = getCorrectionEmployees(data);
  return sortLeaderboard(employees.map(employee => rowForEmployee(employee, data.examEvaluations.filter(item => item.examId === examId && item.employeeId === employee.id))));
}

export function getCycleLeaderboard(data: DemoData, cycleId: string, options: { publishedOnly?: boolean } = {}): EvaluationLeaderboardRow[] {
  const cycle = data.evaluationCycles.find(item => item.id === cycleId);
  if (!cycle) return [];
  if (cycle.state === 'ARCHIVED') return structuredClone(cycle.snapshot?.rows ?? []);
  const exams = data.evaluationExams.filter(item => item.cycleId === cycleId && (!options.publishedOnly || item.state === 'CLOSED'));
  const examIds = new Set(exams.map(item => item.id));
  const employees = getCorrectionEmployees(data);
  return sortLeaderboard(employees.map(employee => rowForEmployee(employee, data.examEvaluations.filter(item => examIds.has(item.examId) && item.employeeId === employee.id))));
}

function attendanceDaysForSeason(data: DemoData, employeeId: string, season: EvaluationSeason): number {
  const lastDate = season.endDate ?? '9999-12-31';
  const workdayDates = new Map(data.workdays.map(item => [item.id, item.date]));
  const dates = new Set(
    data.attendance
      .filter(item => item.employeeId === employeeId && item.status === 'PRESENT')
      .map(item => workdayDates.get(item.workdayId))
      .filter((value): value is string => Boolean(value && value >= season.startDate && value <= lastDate)),
  );
  return dates.size;
}

function cycleRowsForSeason(data: DemoData, cycle: EvaluationCycle, publishedOnly: boolean): EvaluationLeaderboardRow[] {
  if (cycle.state === 'ARCHIVED') return structuredClone(cycle.snapshot?.rows ?? []);
  return getCycleLeaderboard(data, cycle.id, { publishedOnly });
}

export function getSeasonLeaderboard(data: DemoData, seasonId: string, options: { publishedOnly?: boolean } = {}): SeasonLeaderboardRow[] {
  // The server provides the authorized aggregate without exposing colleagues'
  // private attendance records to the employee browser.
  if (data.serverEvaluation?.seasons[seasonId]) return structuredClone(data.serverEvaluation.seasons[seasonId]);
  const season = data.evaluationSeasons.find(item => item.id === seasonId);
  if (!season) return [];
  if (season.state === 'ARCHIVED') return structuredClone(season.snapshot?.rows ?? []);
  const publishedOnly = Boolean(options.publishedOnly);
  const cycles = data.evaluationCycles.filter(item => item.seasonId === season.id);
  const cycleRows = cycles.map(cycle => cycleRowsForSeason(data, cycle, publishedOnly));
  const identities = new Map(getCorrectionEmployees(data).map(employee => [employee.id, { employeeId: employee.id, employeeName: employee.name, employeeCode: employee.code }]));
  // Archived contributions remain part of their season even if the employee has
  // since left, moved departments, or disappeared from the current directory.
  for (const rows of cycleRows) {
    for (const row of rows) {
      if (!identities.has(row.employeeId)) identities.set(row.employeeId, { employeeId: row.employeeId, employeeName: row.employeeName, employeeCode: row.employeeCode });
    }
  }
  const rows = [...identities.values()].map(employee => {
    let papers = 0;
    let correctionErrors = 0;
    let behaviorErrors = 0;
    let examsEvaluated = 0;
    let cyclesEvaluated = 0;
    for (const rows of cycleRows) {
      const row = rows.find(item => item.employeeId === employee.employeeId);
      if (!row) continue;
      papers += row.papers;
      correctionErrors += row.correctionErrors;
      behaviorErrors += row.behaviorErrors;
      examsEvaluated += row.examsEvaluated;
      if (row.examsEvaluated > 0) cyclesEvaluated += 1;
    }
    const attendanceDays = attendanceDaysForSeason(data, employee.employeeId, season);
    return {
      ...employee,
      papers,
      correctionErrors,
      behaviorErrors,
      examsEvaluated,
      cyclesEvaluated,
      attendanceDays,
      averagePapersPerDay: attendanceDays > 0 ? papers / attendanceDays : null,
      score: calculateEvaluationScore(papers, correctionErrors, behaviorErrors),
      accuracy: calculateAccuracy(papers, correctionErrors, behaviorErrors),
    } satisfies SeasonLeaderboardRow;
  });
  return sortLeaderboard(rows);
}
