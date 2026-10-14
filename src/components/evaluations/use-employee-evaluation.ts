'use client';

import { useMemo, useState } from 'react';
import { useDemo } from '@/components/demo-provider';
import { getCycleLeaderboard, getExamLeaderboard, getExamEvaluation, getLatestEvaluationSeason, getRankProgress, getSeasonLeaderboard, isCorrectionEmployee } from '@/lib/evaluations';

/** Keeps selection fallbacks and publication boundaries together. */
export function useEmployeeEvaluation() {
  const { data, session } = useDemo();
  const employee = data.employees.find(item => item.id === session?.employeeId);
  const latestSeason = getLatestEvaluationSeason(data);
  const seasons = useMemo(() => [...data.evaluationSeasons].sort((a, b) => Number(b.state === 'OPEN') - Number(a.state === 'OPEN') || (b.closedAt || b.openedAt).localeCompare(a.closedAt || a.openedAt)), [data.evaluationSeasons]);
  const hasLegacyCycles = data.evaluationCycles.some(item => !item.seasonId);
  const [seasonId, setSeasonId] = useState(latestSeason?.id ?? (hasLegacyCycles ? '__legacy__' : ''));
  const effectiveSeasonId = seasons.some(item => item.id === seasonId) || (seasonId === '__legacy__' && hasLegacyCycles) ? seasonId : latestSeason?.id ?? (hasLegacyCycles ? '__legacy__' : '');
  const season = seasons.find(item => item.id === effectiveSeasonId);
  const cycles = useMemo(() => data.evaluationCycles
    .filter(item => effectiveSeasonId === '__legacy__' ? !item.seasonId : item.seasonId === effectiveSeasonId)
    .sort((a, b) => Number(b.state === 'OPEN') - Number(a.state === 'OPEN') || (b.closedAt || b.openedAt).localeCompare(a.closedAt || a.openedAt)), [data.evaluationCycles, effectiveSeasonId]);
  const [cycleId, setCycleId] = useState('');
  const cycle = cycles.find(item => item.id === cycleId) || cycles[0];
  const currentRows = cycle ? getCycleLeaderboard(data, cycle.id, { publishedOnly: true }) : [];
  const own = currentRows.find(row => row.employeeId === employee?.id);
  const currentExams = cycle ? data.evaluationExams.filter(item => item.cycleId === cycle.id).sort((a,b) => a.date.localeCompare(b.date)) : [];
  const snapshotExams = cycle?.state === 'ARCHIVED' ? cycle.snapshot?.exams || [] : [];
  const examOptions = cycle?.state === 'ARCHIVED' ? snapshotExams.map(exam => ({ id:exam.id, name:exam.name, date:exam.date, state:'CLOSED' as const })) : currentExams;
  const [examId, setExamId] = useState('');
  const effectiveExamId = examOptions.some(item => item.id === examId) ? examId : examOptions[0]?.id || '';
  const selectedExam = examOptions.find(item => item.id === effectiveExamId);
  const examRows = !cycle || !effectiveExamId || selectedExam?.state === 'OPEN' ? [] : cycle.state === 'ARCHIVED' ? snapshotExams.find(exam => exam.id === effectiveExamId)?.rows || [] : getExamLeaderboard(data, effectiveExamId, { publishedOnly: true });
  const seasonRows = season ? getSeasonLeaderboard(data, season.id, { publishedOnly: true }) : [];
  const ownSeason = seasonRows.find(row => row.employeeId === employee?.id);
  const seasonRank = getRankProgress(ownSeason?.score ?? 0);


  const ownExamItems = !employee || !cycle ? [] : (cycle.state === 'ARCHIVED'
    ? snapshotExams.map(exam => ({ exam:{ ...exam, state:'CLOSED' as const }, row:exam.rows.find(row => row.employeeId === employee.id) }))
    : currentExams.map(exam => ({ exam, row:exam.state === 'CLOSED' ? getExamLeaderboard(data, exam.id, { publishedOnly: true }).find(row => row.employeeId === employee.id) : undefined })))
    .map(item => ({
      id:item.exam.id,
      name:item.exam.name,
      date:item.exam.date,
      state:item.exam.state,
      papers:item.row?.papers ?? 0,
      correctionErrors:item.row?.correctionErrors ?? 0,
      behaviorErrors:item.row?.behaviorErrors ?? 0,
      score:item.row?.score ?? 0,
      evaluated: item.exam.state === 'CLOSED' && (cycle?.state === 'ARCHIVED' ? Boolean(item.row && item.row.examsEvaluated > 0) : Boolean(getExamEvaluation(data, item.exam.id, employee.id, { publishedOnly: true }))),
    }));
  const rank = currentRows.findIndex(row => row.employeeId === employee?.id) + 1;
  const seasonPosition = seasonRows.findIndex(row => row.employeeId === employee?.id) + 1;

  return {
    employee, eligible: Boolean(employee && isCorrectionEmployee(data, employee)),
    seasons, hasLegacyCycles, effectiveSeasonId, season, setSeasonId,
    cycles, cycle, setCycleId, currentRows, own, rank,
    examOptions, effectiveExamId, selectedExam, examRows, ownExamItems, setExamId,
    seasonRows, ownSeason, seasonRank, seasonPosition,
  };
}
