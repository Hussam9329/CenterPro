import { describe, expect, it } from 'vitest';
import { createTestData } from '../../src/lib/mock-data';
import { assertEvaluationMutation, assertEvaluationState, buildEvaluationCycleSnapshot, calculateAccuracy, calculateEvaluationScore, formatAccuracy, getCycleLeaderboard, getExamLeaderboard } from '../../src/lib/evaluations';
import type { DemoData, DemoSession, ExamEvaluation } from '../../src/lib/types';

const admin: DemoSession = { role: 'SUPER_ADMIN', kind: 'SYSTEM', name: 'مدير النظام' };
const auditor: DemoSession = { role: 'EMPLOYEE', kind: 'EMPLOYEE', name: 'جعفر علي', employeeId: 'employee-jaafar-ali' };
const corrector: DemoSession = { role: 'EMPLOYEE', kind: 'EMPLOYEE', name: 'ابرار حقي', employeeId: 'employee-abrar-haqi' };

function evaluation(overrides: Partial<ExamEvaluation> = {}): ExamEvaluation {
  return {
    id: 'ev-1', examId: 'exam-1', employeeId: 'employee-abrar-haqi', papers: 100, correctionErrors: 1, behaviorErrors: 0, note: '',
    createdBy: auditor.name, createdAt: '2026-10-01T10:00:00.000Z', updatedBy: auditor.name, updatedAt: '2026-10-01T10:00:00.000Z', ...overrides,
  };
}

function openData(): DemoData {
  const data = createTestData();
  data.evaluationCycles.push({ id: 'cycle-1', name: 'دورة التقييم 1', state: 'OPEN', openedAt: '2026-10-01T00:00:00.000Z', openedBy: admin.name });
  data.evaluationExams.push(
    { id: 'exam-1', cycleId: 'cycle-1', name: 'امتحان 1', date: '2026-10-01', note: '', state: 'OPEN', createdBy: admin.name, createdAt: '2026-10-01T00:00:00.000Z' },
    { id: 'exam-2', cycleId: 'cycle-1', name: 'امتحان 2', date: '2026-10-02', note: '', state: 'OPEN', createdBy: admin.name, createdAt: '2026-10-02T00:00:00.000Z' },
  );
  data.examEvaluations.push(evaluation(), evaluation({ id: 'ev-2', examId: 'exam-2', correctionErrors: 0, behaviorErrors: 1 }));
  return data;
}

function archive(data: DemoData): DemoData {
  const next = structuredClone(data);
  next.evaluationCycles[0].snapshot = buildEvaluationCycleSnapshot(data, 'cycle-1');
  Object.assign(next.evaluationCycles[0], { state: 'ARCHIVED', closedAt: '2026-10-03T10:00:00.000Z', closedBy: admin.name });
  next.evaluationExams.forEach(exam => Object.assign(exam, { state: 'CLOSED', closedAt: '2026-10-03T10:00:00.000Z', closedBy: admin.name }));
  return next;
}

describe('correction evaluation domain', () => {
  it('uses the exact weighted score, including negative and empty scores', () => {
    expect(calculateEvaluationScore(800, 3, 2)).toBe(779);
    expect(calculateEvaluationScore(0, 1, 1)).toBe(-8);
    expect(calculateEvaluationScore(null, null, null)).toBe(0);
    expect(calculateEvaluationScore(undefined, 2, undefined)).toBe(-10);
  });

  it('keeps accuracy unweighted, bounded, and undefined without papers', () => {
    expect(calculateAccuracy(500, 3, 2)).toBe(99);
    expect(calculateAccuracy(0, 0, 0)).toBeNull();
    expect(calculateAccuracy(0, 1, 1)).toBeNull();
    expect(calculateAccuracy(10, 9, 8)).toBe(0);
    expect(calculateAccuracy(10, 0, 0)).toBe(100);
    expect(formatAccuracy(99)).toBe('99.00 / 100');
    expect(formatAccuracy(null)).toBe('—');
  });

  it('sums cycles without multiplying by exam count or averaging exam accuracy', () => {
    const data = openData();
    data.examEvaluations[1].papers = 300;
    expect(getCycleLeaderboard(data, 'cycle-1').find(item => item.employeeId === corrector.employeeId)).toMatchObject({ papers: 400, correctionErrors: 1, behaviorErrors: 1, examsEvaluated: 2, score: 392, accuracy: 99.5 });
    expect(getExamLeaderboard(data, 'exam-1').find(item => item.employeeId === corrector.employeeId)).toMatchObject({ papers: 100, score: 95, examsEvaluated: 1 });
  });

  it('shows all active correctors even without entries and no rows for missing cycles/exams', () => {
    const data = openData();
    data.examEvaluations = [];
    const rows = getExamLeaderboard(data, 'exam-1');
    expect(rows).toHaveLength(4);
    expect(rows.every(row => row.score === 0 && row.examsEvaluated === 0 && row.accuracy === null)).toBe(true);
    data.employees.find(item => item.id === corrector.employeeId)!.active = false;
    expect(getExamLeaderboard(data, 'exam-1')).toHaveLength(3);
    expect(getExamLeaderboard(data, 'missing')).toEqual([]);
    expect(getCycleLeaderboard(data, 'missing')).toEqual([]);
    expect(() => buildEvaluationCycleSnapshot(data, 'missing')).toThrow();
  });

  it('orders by score then papers and keeps new cycles independent of archived scores', () => {
    const data = archive(openData());
    data.evaluationCycles.push({ id: 'cycle-2', name: 'دورة التقييم 2', state: 'OPEN', openedAt: '2026-10-03T11:00:00.000Z', openedBy: admin.name });
    data.evaluationExams.push({ ...data.evaluationExams[0], id: 'exam-3', cycleId: 'cycle-2', state: 'OPEN' });
    expect(getCycleLeaderboard(data, 'cycle-2').every(row => row.score === 0 && row.examsEvaluated === 0)).toBe(true);
    data.examEvaluations.push(
      evaluation({ id: 'ev-3', examId: 'exam-3', papers: 105, correctionErrors: 1 }),
      evaluation({ id: 'ev-4', examId: 'exam-3', employeeId: 'employee-hiba-mohammed', papers: 100, correctionErrors: 0 }),
      evaluation({ id: 'ev-5', examId: 'exam-3', employeeId: 'employee-fatima-firas', papers: 110, correctionErrors: 0 }),
    );
    expect(getCycleLeaderboard(data, 'cycle-2').map(row => row.employeeId)).toEqual(['employee-fatima-firas', 'employee-abrar-haqi', 'employee-hiba-mohammed', 'employee-maryam-issam']);
    expect(getCycleLeaderboard(data, 'cycle-1').find(row => row.employeeId === corrector.employeeId)?.score).toBe(192);
  });
});

describe('evaluation archive snapshots', () => {
  it('freezes cycle/exam identities and results after directory or live-record changes', () => {
    const data = archive(openData());
    const snapshot = structuredClone(data.evaluationCycles[0].snapshot!);
    Object.assign(data.employees.find(item => item.id === corrector.employeeId)!, { name: 'اسم جديد', code: 'CP-9999', departmentId: 'department-audit-test', active: false });
    data.departments[0].name = 'قسم جديد';
    data.examEvaluations[0].papers = 9999;
    Object.assign(data.evaluationExams[0], { name: 'اسم امتحان جديد', date: '2027-01-01' });
    expect(getCycleLeaderboard(data, 'cycle-1')).toEqual(snapshot.rows);
    expect(getExamLeaderboard(data, 'exam-1')).toEqual(snapshot.exams[0].rows);
    expect(buildEvaluationCycleSnapshot(data, 'cycle-1')).toEqual(snapshot);
    expect(data.evaluationCycles[0].snapshot).toEqual(snapshot);
  });

  it('returns defensive copies at every archive read boundary', () => {
    const data = archive(openData());
    const snapshot = structuredClone(data.evaluationCycles[0].snapshot!);
    getCycleLeaderboard(data, 'cycle-1')[0].papers = 5000;
    getExamLeaderboard(data, 'exam-1')[0].employeeName = 'تغيير';
    const rebuilt = buildEvaluationCycleSnapshot(data, 'cycle-1');
    rebuilt.rows.reverse();
    rebuilt.exams[0].rows[0].score = 5000;
    rebuilt.exams[0].name = 'تغيير';
    expect(data.evaluationCycles[0].snapshot).toEqual(snapshot);
  });
});

describe('evaluation state invariants', () => {
  it('allows empty state and archived history without depending on current staff or departments', () => {
    expect(() => assertEvaluationState(createTestData())).not.toThrow();
    const data = archive(openData());
    data.employees = [];
    data.departments = [];
    expect(() => assertEvaluationState(data)).not.toThrow();
  });

  it.each([
    ['multiple open cycles', (data: DemoData) => { data.evaluationCycles.push({ ...data.evaluationCycles[0], id: 'cycle-2' }); }],
    ['duplicate cycle IDs', (data: DemoData) => { data.evaluationCycles.push({ ...data.evaluationCycles[0] }); }],
    ['duplicate exam IDs', (data: DemoData) => { data.evaluationExams.push({ ...data.evaluationExams[0] }); }],
    ['missing cycle reference', (data: DemoData) => { data.evaluationExams[0].cycleId = 'missing'; }],
    ['missing exam reference', (data: DemoData) => { data.examEvaluations[0].examId = 'missing'; }],
    ['duplicate evaluation IDs', (data: DemoData) => { data.examEvaluations.push({ ...data.examEvaluations[0], employeeId: 'employee-hiba-mohammed' }); }],
    ['duplicate exam/employee evaluations', (data: DemoData) => { data.examEvaluations.push({ ...data.examEvaluations[0], id: 'duplicate' }); }],
    ['archive without a snapshot', (data: DemoData) => { data.evaluationCycles[0].state = 'ARCHIVED'; }],
    ['open exam in an archive', (data: DemoData) => { data.evaluationCycles[0].snapshot = buildEvaluationCycleSnapshot(data, 'cycle-1'); data.evaluationCycles[0].state = 'ARCHIVED'; }],
  ] as const)('rejects %s', (_, mutate) => {
    const data = openData();
    mutate(data);
    expect(() => assertEvaluationState(data)).toThrow();
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid count %s in every count field', value => {
    for (const field of ['papers', 'correctionErrors', 'behaviorErrors'] as const) {
      const data = openData();
      data.examEvaluations[0][field] = value;
      expect(() => assertEvaluationState(data)).toThrow();
    }
  });

  it('accepts null counts as empty fields and zero as an explicit value', () => {
    const data = openData();
    Object.assign(data.examEvaluations[0], { papers: null, correctionErrors: 0, behaviorErrors: null });
    expect(() => assertEvaluationState(data)).not.toThrow();
  });
});

describe('evaluation mutation permissions and locks', () => {
  it.each(['ADMIN', 'SUPER_ADMIN'] as const)('allows %s to create cycles/exams, close/reopen a live exam and archive atomically', role => {
    const session = { ...admin, role };
    const data = openData();
    const created = structuredClone(data);
    created.examEvaluations = [];
    expect(() => assertEvaluationMutation(createTestData(), created, session)).not.toThrow();
    const closed = structuredClone(data);
    closed.evaluationExams[0].state = 'CLOSED';
    expect(() => assertEvaluationMutation(data, closed, session)).not.toThrow();
    expect(() => assertEvaluationMutation(closed, data, session)).not.toThrow();
    const archived = archive(data);
    expect(() => assertEvaluationMutation(data, archived, session)).not.toThrow();
    const nextCycle = structuredClone(archived);
    nextCycle.evaluationCycles.push({ ...data.evaluationCycles[0], id: 'cycle-2', name: 'دورة التقييم 2' });
    expect(() => assertEvaluationMutation(archived, nextCycle, session)).not.toThrow();
  });

  it('allows an active auditor to add, edit or clear an evaluation in an open exam', () => {
    const data = openData();
    const added = structuredClone(data);
    added.examEvaluations.push(evaluation({ id: 'ev-3', employeeId: 'employee-hiba-mohammed', papers: null }));
    expect(() => assertEvaluationMutation(data, added, auditor)).not.toThrow();
    const updated = structuredClone(added);
    Object.assign(updated.examEvaluations[2], { papers: 50, note: 'ملاحظة تدقيق' });
    expect(() => assertEvaluationMutation(added, updated, auditor)).not.toThrow();
    expect(() => assertEvaluationMutation(updated, data, auditor)).not.toThrow();
  });

  it.each([admin, { ...admin, role: 'ADMIN' as const }, corrector, null])('rejects evaluation edits by unauthorized actor %s', session => {
    const data = openData();
    const next = structuredClone(data);
    next.examEvaluations[0].papers = 999;
    expect(() => assertEvaluationMutation(data, next, session)).toThrow();
  });

  it.each(['inactive auditor', 'moved auditor', 'promoted auditor', 'inactive corrector', 'moved corrector'] as const)('uses the current directory when an editor becomes stale: %s', change => {
    const data = openData();
    const employee = data.employees.find(item => item.id === (change.endsWith('auditor') ? auditor.employeeId : corrector.employeeId))!;
    if (change.startsWith('inactive')) employee.active = false;
    if (change === 'moved auditor') employee.departmentId = 'department-correction-test';
    if (change === 'moved corrector') employee.departmentId = 'department-audit-test';
    if (change === 'promoted auditor') employee.role = 'ADMIN';
    const next = structuredClone(data);
    next.examEvaluations[0].papers = 999;
    expect(() => assertEvaluationMutation(data, next, auditor)).toThrow();
  });

  it('rejects stale autosaves after an exam has closed or its cycle has archived', () => {
    for (const data of [openData(), archive(openData())]) {
      data.evaluationExams[0].state = 'CLOSED';
      const next = structuredClone(data);
      next.examEvaluations[0].papers = 999;
      expect(() => assertEvaluationMutation(data, next, auditor)).toThrow();
    }
  });

  it('rejects duplicate or cross-exam writes into closed exams', () => {
    const data = openData();
    data.evaluationExams[1].state = 'CLOSED';
    const duplicate = structuredClone(data);
    duplicate.examEvaluations.push(evaluation({ id: 'duplicate' }));
    expect(() => assertEvaluationMutation(data, duplicate, auditor)).toThrow();
    const moved = structuredClone(data);
    moved.examEvaluations[0].examId = 'exam-2';
    moved.examEvaluations[0].employeeId = 'employee-hiba-mohammed';
    expect(() => assertEvaluationMutation(data, moved, auditor)).toThrow();
  });

  it('does not permit an auditor to change the exam or cycle lifecycle', () => {
    const data = openData();
    const next = structuredClone(data);
    next.evaluationExams[0].state = 'CLOSED';
    expect(() => assertEvaluationMutation(data, next, auditor)).toThrow();
    expect(() => assertEvaluationMutation(data, archive(data), auditor)).toThrow();
  });

  it.each([
    ['cycle deletion', (data: DemoData) => { data.evaluationCycles = []; data.evaluationExams = []; data.examEvaluations = []; }],
    ['cycle reopening', (data: DemoData) => { data.evaluationCycles[0].state = 'OPEN'; }],
    ['snapshot change', (data: DemoData) => { data.evaluationCycles[0].snapshot!.rows[0].score++; }],
    ['exam rename', (data: DemoData) => { data.evaluationExams[0].name = 'تغيير'; }],
    ['exam reopening', (data: DemoData) => { data.evaluationExams[0].state = 'OPEN'; }],
    ['evaluation edit', (data: DemoData) => { data.examEvaluations[0].note = 'تغيير'; }],
    ['evaluation deletion', (data: DemoData) => { data.examEvaluations.pop(); }],
    ['new evaluation', (data: DemoData) => { data.examEvaluations.push(evaluation({ id: 'ev-3', employeeId: 'employee-hiba-mohammed' })); }],
  ] as const)('preserves archived data against %s even for administrators', (_, mutate) => {
    const data = archive(openData());
    const next = structuredClone(data);
    mutate(next);
    expect(() => assertEvaluationMutation(data, next, admin)).toThrow();
  });

  it('rejects an archive snapshot built before the most recent auditor save', () => {
    const stale = openData();
    const latest = structuredClone(stale);
    latest.examEvaluations[0].papers = 150;
    const next = archive(latest);
    next.evaluationCycles[0].snapshot = buildEvaluationCycleSnapshot(stale, 'cycle-1');
    expect(() => assertEvaluationMutation(latest, next, admin)).toThrow();
  });

  it('allows unrelated employee and payroll updates without changing evaluation history', () => {
    const data = archive(openData());
    const next = structuredClone(data);
    Object.assign(next.employees[0], { name: 'اسم جديد', active: false, departmentId: 'department-audit-test' });
    next.departments[0].salary.dailyRate = 30_000;
    next.settings.centerName = 'مركز جديد';
    expect(() => assertEvaluationMutation(data, next, admin)).not.toThrow();
    expect(next.evaluationCycles).toEqual(data.evaluationCycles);
  });
});
