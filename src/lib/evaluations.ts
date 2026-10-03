import type {
  DemoData,
  DemoSession,
  Employee,
  EvaluationCycle,
  EvaluationCycleSnapshot,
  EvaluationLeaderboardRow,
  ExamEvaluation,
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

export function getExamEvaluation(data: DemoData, examId: string, employeeId: string): ExamEvaluation | undefined {
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

function sortLeaderboard(rows: EvaluationLeaderboardRow[]): EvaluationLeaderboardRow[] {
  return [...rows].sort((a, b) => b.score - a.score || b.papers - a.papers || a.employeeName.localeCompare(b.employeeName, 'ar'));
}

export function getExamLeaderboard(data: DemoData, examId: string): EvaluationLeaderboardRow[] {
  const exam = data.evaluationExams.find(item => item.id === examId);
  if (!exam) return [];
  const cycle = data.evaluationCycles.find(item => item.id === exam.cycleId);
  if (!cycle) return [];
  if (cycle.state === 'ARCHIVED') return structuredClone(cycle.snapshot?.exams.find(item => item.id === examId)?.rows ?? []);
  const employees = getCorrectionEmployees(data);
  return sortLeaderboard(employees.map(employee => rowForEmployee(employee, data.examEvaluations.filter(item => item.examId === examId && item.employeeId === employee.id))));
}

export function getCycleLeaderboard(data: DemoData, cycleId: string): EvaluationLeaderboardRow[] {
  const cycle = data.evaluationCycles.find(item => item.id === cycleId);
  if (!cycle) return [];
  if (cycle.state === 'ARCHIVED') return structuredClone(cycle.snapshot?.rows ?? []);
  const examIds = new Set(data.evaluationExams.filter(item => item.cycleId === cycleId).map(item => item.id));
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

/** Structural validation also accepts historical staff who have since moved or left. */
export function assertEvaluationState(data: DemoData): void {
  assertUniqueIds(data.evaluationCycles, 'دورات التقييم');
  assertUniqueIds(data.evaluationExams, 'الامتحانات');
  assertUniqueIds(data.examEvaluations, 'التقييمات');
  if (data.evaluationCycles.filter(item => item.state === 'OPEN').length > 1) throw new Error('لا يمكن فتح أكثر من دورة تقييم واحدة.');
  const cycles = new Map(data.evaluationCycles.map(item => [item.id, item]));
  const exams = new Map(data.evaluationExams.map(item => [item.id, item]));
  for (const cycle of data.evaluationCycles) {
    if (cycle.state !== 'OPEN' && cycle.state !== 'ARCHIVED') throw new Error('حالة دورة التقييم غير صالحة.');
    if (cycle.state === 'ARCHIVED' && (!cycle.snapshot || !Array.isArray(cycle.snapshot.rows) || !Array.isArray(cycle.snapshot.exams))) throw new Error('الدورة المؤرشفة تتطلب نسخة محفوظة.');
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
  const cyclesChanged = !sameValue(before.evaluationCycles, after.evaluationCycles);
  const examsChanged = !sameValue(before.evaluationExams, after.evaluationExams);
  const evaluationsChanged = !sameValue(before.examEvaluations, after.examEvaluations);
  if (!cyclesChanged && !examsChanged && !evaluationsChanged) return;
  assertEvaluationState(after);
  if (!session) throw new Error('سجّل الدخول قبل تعديل بيانات التقييم.');

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

  if (cyclesChanged || examsChanged) {
    if (session.role !== 'ADMIN' && session.role !== 'SUPER_ADMIN') throw new Error('إدارة دورات التقييم والامتحانات متاحة للإدارة فقط.');
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
        const employee = data.employees.find(item => item.id === evaluation.employeeId);
        if (exam?.state !== 'OPEN' || cycle?.state !== 'OPEN') throw new Error('لا يمكن تعديل تقييم امتحان مغلق أو دورة مؤرشفة.');
        if (!employee || !isCorrectionEmployee(data, employee)) throw new Error('يجب أن يخص التقييم موظفاً نشطاً في قسم التصحيح.');
      }
    }
  }
}

export function formatAccuracy(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(2)} / 100`;
}
