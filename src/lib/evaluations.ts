/** Public evaluation API. Keep callers independent of the domain module layout. */
export { isCorrectionDepartmentName, isCorrectionEmployee, isAuditEmployee, getCorrectionEmployees } from './evaluations/roles';
export { getOpenEvaluationCycle, getOpenEvaluationSeason, getLatestEvaluationSeason, getExamEvaluation } from './evaluations/selectors';
export { calculateEvaluationScore, calculateAccuracy, formatAccuracy, formatAveragePapers } from './evaluations/scoring';
export { getExamLeaderboard, getCycleLeaderboard, getSeasonLeaderboard } from './evaluations/leaderboards';
export { buildEvaluationCycleSnapshot, buildEvaluationSeasonSnapshot } from './evaluations/snapshots';
export { SEASON_RANKS, getSeasonRank, getRankProgress, type SeasonRank } from './evaluations/ranks';
export { assertEvaluationState } from './evaluations/state-invariants';
export { assertEvaluationMutation } from './evaluations/mutation-invariants';
