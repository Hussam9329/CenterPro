import type {
  DemoData,
  DemoSession,
  Employee,
  EvaluationCycle,
  EvaluationCycleSnapshot,
  EvaluationLeaderboardRow,
  EvaluationSeason,
  EvaluationSeasonSnapshot,
  ExamEvaluation,
  SeasonLeaderboardRow,
} from './types';

function normalizeArabic(value: string): string {
  return value.trim().replace(/[أإآ]/g, 'ا').replace(/\s+/g, '');
}

export function isCorrectionDepartmentName(name: string): boolean {
  return normalizeArabic(name) === normalizeArabic('التصحيح');
}

export function isAuditDepartmentName(name: string): boolean {
  return normalizeArabic(name) === normalizeArabic('التدقيق');
}

export function isCorrectionEmployee(data: DemoData, employee: Employee): boolean {
  const department = data.departments.find(item => item.id === employee.departmentId);
  return Boolean(employee.active && department && isCorrectionDepartmentName(department.name));
}

export function isAuditEmployee(data: DemoData, employee: Employee): boolean {
  const department = data.departments.find(item => item.id === employee.departmentId);
  return Boolean(employee.active && department && isAuditDepartmentName(department.name));
}

export function getCorrectionEmployees(data: DemoData): Employee[] {
  return data.employees.filter(employee => isCorrectionEmployee(data, employee));
}

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

export function calculateEvaluationScore(papers: number | null | undefined, correctionErrors: number | null | undefined, behaviorErrors: number | null | undefined): number {
  return (papers ?? 0) - ((correctionErrors ?? 0) * 5) - ((behaviorErrors ?? 0) * 3);
}

export function calculateAccuracy(papers: number, correctionErrors: number, behaviorErrors: number): number | null {
  if (papers <= 0) return null;
  const raw = 100 - (((correctionErrors + behaviorErrors) / papers) * 100);
  return Math.max(0, Math.min(100, raw));
}

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
    examsEvaluated: new Set(evaluations.map(item => item.examId)).size,
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

export function buildEvaluationCycleSnapshot(data: DemoData, cycleId: string): EvaluationCycleSnapshot {
  const cycle = data.evaluationCycles.find(item => item.id === cycleId);
  if (!cycle) throw new Error('لم يتم العثور على دورة التقييم.');
  if (cycle.state === 'ARCHIVED') {
    if (!cycle.snapshot) throw new Error('النسخة الأرشيفية لدورة التقييم غير موجودة.');
    return structuredClone(cycle.snapshot);
  }
  const exams = data.evaluationExams.filter(item => item.cycleId === cycleId);
  return {
    rows: getCycleLeaderboard(data, cycleId),
    exams: exams.map(exam => ({ id: exam.id, name: exam.name, date: exam.date, rows: getExamLeaderboard(data, exam.id) })),
  };
}

export const SEASON_RANKS = [
  { name: 'Bronze 1', tier: 'bronze', level: 1, min: 0, next: 500 },
  { name: 'Bronze 2', tier: 'bronze', level: 2, min: 500, next: 1000 },
  { name: 'Bronze 3', tier: 'bronze', level: 3, min: 1000, next: 1500 },
  { name: 'Silver 1', tier: 'silver', level: 1, min: 1500, next: 2000 },
  { name: 'Silver 2', tier: 'silver', level: 2, min: 2000, next: 2500 },
  { name: 'Silver 3', tier: 'silver', level: 3, min: 2500, next: 3000 },
  { name: 'Gold 1', tier: 'gold', level: 1, min: 3000, next: 3500 },
  { name: 'Gold 2', tier: 'gold', level: 2, min: 3500, next: 4000 },
  { name: 'Gold 3', tier: 'gold', level: 3, min: 4000, next: 4500 },
  { name: 'Platinum 1', tier: 'platinum', level: 1, min: 4500, next: 5000 },
  { name: 'Platinum 2', tier: 'platinum', level: 2, min: 5000, next: 5500 },
  { name: 'Platinum 3', tier: 'platinum', level: 3, min: 5500, next: 6000 },
  { name: 'Diamond 1', tier: 'diamond', level: 1, min: 6000, next: 6500 },
  { name: 'Diamond 2', tier: 'diamond', level: 2, min: 6500, next: 7000 },
  { name: 'Diamond 3', tier: 'diamond', level: 3, min: 7000, next: 7500 },
  { name: 'Emerald 1', tier: 'emerald', level: 1, min: 7500, next: 8000 },
  { name: 'Emerald 2', tier: 'emerald', level: 2, min: 8000, next: 8500 },
  { name: 'Emerald 3', tier: 'emerald', level: 3, min: 8500, next: 9000 },
  { name: 'Master 1', tier: 'master', level: 1, min: 9000, next: 10000 },
  { name: 'Master 2', tier: 'master', level: 2, min: 10000, next: 11000 },
  { name: 'Master 3', tier: 'master', level: 3, min: 11000, next: 12000 },
  { name: 'Grandmaster', tier: 'grandmaster', level: null, min: 12000, next: null },
] as const;

export type SeasonRank = (typeof SEASON_RANKS)[number];

export function getSeasonRank(score: number): SeasonRank {
  const normalized = Math.max(0, score);
  return [...SEASON_RANKS].reverse().find(rank => normalized >= rank.min) ?? SEASON_RANKS[0];
}

export function getRankProgress(score: number) {
  const rank = getSeasonRank(score);
  if (rank.next === null) return { rank, progress: 100, pointsToNext: 0 };
  const progress = Math.max(0, Math.min(100, ((Math.max(score, rank.min) - rank.min) / (rank.next - rank.min)) * 100));
  return { rank, progress, pointsToNext: Math.max(0, rank.next - score) };
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

export function buildEvaluationSeasonSnapshot(data: DemoData, seasonId: string): EvaluationSeasonSnapshot {
  const season = data.evaluationSeasons.find(item => item.id === seasonId);
  if (!season) throw new Error('لم يتم العثور على الموسم.');
  if (season.state === 'ARCHIVED') {
    if (!season.snapshot) throw new Error('النسخة الأرشيفية للموسم غير موجودة.');
    return structuredClone(season.snapshot);
  }
  const cycles = data.evaluationCycles.filter(item => item.seasonId === seasonId);
  if (data.evaluationCycles.some(item => item.state === 'OPEN')) throw new Error('أغلق دورة التقييم الحالية قبل أرشفة الموسم.');
  return { rows: getSeasonLeaderboard(data, seasonId), cycleIds: cycles.map(item => item.id) };
}

function sameValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function assertUniqueIds(items: { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id || ids.has(item.id)) throw new Error(`معرّفات ${label} يجب أن تكون فريدة.`);
    ids.add(item.id);
  }
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function sameIds(first: string[], second: string[]): boolean {
  return sameValue([...first].sort(), [...second].sort());
}

/** Structural validation also accepts historical staff who have since moved or left. */
export function assertEvaluationState(data: DemoData): void {
  assertUniqueIds(data.evaluationSeasons, 'المواسم');
  assertUniqueIds(data.evaluationCycles, 'دورات التقييم');
  assertUniqueIds(data.evaluationExams, 'الامتحانات');
  assertUniqueIds(data.examEvaluations, 'التقييمات');
  if (data.evaluationSeasons.filter(item => item.state === 'OPEN').length > 1) throw new Error('لا يمكن فتح أكثر من موسم واحد.');
  if (data.evaluationCycles.filter(item => item.state === 'OPEN').length > 1) throw new Error('لا يمكن فتح أكثر من دورة تقييم واحدة.');
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
      if (!sameIds(season.snapshot!.cycleIds, cycleIds)) throw new Error('دورات الموسم المؤرشف يجب أن تطابق النسخة المحفوظة.');
    }
  }
  for (const cycle of data.evaluationCycles) {
    if (cycle.state !== 'OPEN' && cycle.state !== 'ARCHIVED') throw new Error('حالة دورة التقييم غير صالحة.');
    if (cycle.seasonId) {
      const season = seasons.get(cycle.seasonId);
      if (!season) throw new Error('يجب أن تتبع دورة التقييم موسماً موجوداً.');
      if (season.state === 'ARCHIVED' && cycle.state !== 'ARCHIVED') throw new Error('دورات الموسم المؤرشف يجب أن تكون مؤرشفة.');
    }
    if (cycle.state === 'ARCHIVED' && (!cycle.snapshot || !Array.isArray(cycle.snapshot.rows) || !Array.isArray(cycle.snapshot.exams))) throw new Error('الدورة المؤرشفة تتطلب نسخة محفوظة.');
    if (cycle.state === 'ARCHIVED' && !sameIds(cycle.snapshot!.exams.map(item => item.id), data.evaluationExams.filter(item => item.cycleId === cycle.id).map(item => item.id))) throw new Error('امتحانات الدورة المؤرشفة يجب أن تطابق النسخة المحفوظة.');
  }
  for (const exam of data.evaluationExams) {
    const cycle = cycles.get(exam.cycleId);
    if (!cycle) throw new Error('يجب أن يتبع الامتحان دورة تقييم موجودة.');
    if (exam.state !== 'OPEN' && exam.state !== 'CLOSED') throw new Error('حالة الامتحان غير صالحة.');
    if (cycle.state === 'ARCHIVED' && exam.state !== 'CLOSED') throw new Error('امتحانات الدورة المؤرشفة يجب أن تبقى مغلقة.');
  }
  const pairs = new Set<string>();
  for (const evaluation of data.examEvaluations) {
    if (!exams.has(evaluation.examId)) throw new Error('يجب أن يتبع التقييم امتحاناً موجوداً.');
    const pair = JSON.stringify([evaluation.examId, evaluation.employeeId]);
    if (!evaluation.employeeId || pairs.has(pair)) throw new Error('يسمح بتقييم واحد فقط لكل موظف في الامتحان.');
    pairs.add(pair);
    for (const value of [evaluation.papers, evaluation.correctionErrors, evaluation.behaviorErrors]) {
      if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new Error('أعداد الأوراق والأخطاء يجب أن تكون أعداداً صحيحة غير سالبة أو حقولاً فارغة.');
    }
  }
}

function changedRecords<T extends { id: string }>(before: T[], after: T[]): T[] {
  const previous = new Map(before.map(item => [item.id, item]));
  const next = new Map(after.map(item => [item.id, item]));
  return [...before.filter(item => !sameValue(item, next.get(item.id))), ...after.filter(item => !sameValue(item, previous.get(item.id)))];
}

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

export function formatAccuracy(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)} / 100`;
}

export function formatAveragePapers(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(value >= 100 ? 0 : 1)} ورقة/يوم`;
}
