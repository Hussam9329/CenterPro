import { describe, expect, it } from 'vitest';
import { createTestData } from '../../src/lib/mock-data';
import { assertEvaluationMutation, assertEvaluationState, buildEvaluationCycleSnapshot, buildEvaluationSeasonSnapshot, calculateAccuracy, calculateEvaluationScore, formatAccuracy, getCycleLeaderboard, getExamEvaluation, getExamLeaderboard, getRankProgress, getSeasonLeaderboard, getSeasonRank } from '../../src/lib/evaluations';
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
  data.evaluationSeasons.push({ id: 'open-season', name: 'الموسم الحالي', startDate: '2026-09-01', state: 'OPEN', openedAt: '2026-09-01T00:00:00.000Z', openedBy: admin.name });
  data.evaluationCycles.push({ id: 'cycle-1', seasonId: 'open-season', name: 'دورة التقييم 1', state: 'OPEN', openedAt: '2026-10-01T00:00:00.000Z', openedBy: admin.name });
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


describe('season rankings and publication', () => {
  function seasonData() {
    const data = createTestData();
    data.evaluationSeasons.push({ id: 'season-1', name: 'الموسم 1', startDate: '2026-09-01', state: 'OPEN', openedAt: '2026-09-01T00:00:00.000Z', openedBy: admin.name });
    data.evaluationCycles.push({ id: 'cycle-season-1', seasonId: 'season-1', name: 'دورة التقييم 1', state: 'OPEN', openedAt: '2026-09-01T00:00:00.000Z', openedBy: admin.name });
    data.evaluationExams.push(
      { id: 'season-exam-closed', cycleId: 'cycle-season-1', name: 'امتحان منشور', date: '2026-09-10', note: '', state: 'CLOSED', createdBy: admin.name, createdAt: '2026-09-10T00:00:00.000Z', closedAt: '2026-09-10T12:00:00.000Z', closedBy: admin.name },
      { id: 'season-exam-open', cycleId: 'cycle-season-1', name: 'امتحان قيد التدقيق', date: '2026-09-11', note: '', state: 'OPEN', createdBy: admin.name, createdAt: '2026-09-11T00:00:00.000Z' },
    );
    data.examEvaluations.push(
      evaluation({ id: 'season-eval-closed', examId: 'season-exam-closed', papers: 200, correctionErrors: 0, behaviorErrors: 0 }),
      evaluation({ id: 'season-eval-open', examId: 'season-exam-open', papers: 300, correctionErrors: 2, behaviorErrors: 1 }),
    );
    return data;
  }

  it('maps the approved season thresholds including Grandmaster at 12000+', () => {
    const cases = [
      [0, 'Bronze 1'], [499, 'Bronze 1'], [500, 'Bronze 2'], [1499, 'Bronze 3'],
      [1500, 'Silver 1'], [3000, 'Gold 1'], [3500, 'Gold 2'], [4500, 'Platinum 1'],
      [6000, 'Diamond 1'], [7500, 'Emerald 1'], [9000, 'Master 1'], [10000, 'Master 2'],
      [11000, 'Master 3'], [11999, 'Master 3'], [12000, 'Grandmaster'], [18000, 'Grandmaster'],
    ] as const;
    for (const [score, name] of cases) expect(getSeasonRank(score).name).toBe(name);
    expect(getRankProgress(3720)).toMatchObject({ pointsToNext: 280, rank: { name: 'Gold 2' } });
    expect(getRankProgress(12000)).toMatchObject({ progress: 100, pointsToNext: 0, rank: { name: 'Grandmaster' } });
  });

  it('keeps open-exam results live for management but unpublished for the corrector totals', () => {
    const data = seasonData();
    const live = getSeasonLeaderboard(data, 'season-1').find(row => row.employeeId === corrector.employeeId)!;
    const published = getSeasonLeaderboard(data, 'season-1', { publishedOnly: true }).find(row => row.employeeId === corrector.employeeId)!;
    expect(live).toMatchObject({ papers: 500, correctionErrors: 2, behaviorErrors: 1, examsEvaluated: 2, cyclesEvaluated: 1, score: 487 });
    expect(published).toMatchObject({ papers: 200, correctionErrors: 0, behaviorErrors: 0, examsEvaluated: 1, cyclesEvaluated: 1, score: 200 });
  });

  it('adds season attendance and average papers per day as informational fields only', () => {
    const data = seasonData();
    const row = getSeasonLeaderboard(data, 'season-1').find(item => item.employeeId === corrector.employeeId)!;
    expect(row.attendanceDays).toBe(16);
    expect(row.averagePapersPerDay).toBeCloseTo(31.25);
    expect(row.score).toBe(487);
    // Attendance does not alter score or rank ordering.
    data.attendance = data.attendance.filter(item => item.employeeId !== corrector.employeeId);
    const withoutAttendance = getSeasonLeaderboard(data, 'season-1').find(item => item.employeeId === corrector.employeeId)!;
    expect(withoutAttendance.attendanceDays).toBe(0);
    expect(withoutAttendance.averagePapersPerDay).toBeNull();
    expect(withoutAttendance.score).toBe(487);
  });

  it('archives a complete season snapshot only after all cycles are archived', () => {
    const data = seasonData();
    expect(() => buildEvaluationSeasonSnapshot(data, 'season-1')).toThrow('أغلق دورة التقييم الحالية');
    const cycle = data.evaluationCycles[0];
    cycle.snapshot = buildEvaluationCycleSnapshot(data, cycle.id);
    cycle.state = 'ARCHIVED';
    cycle.closedAt = '2026-09-20T00:00:00.000Z';
    cycle.closedBy = admin.name;
    data.evaluationExams.forEach(exam => { exam.state = 'CLOSED'; exam.closedAt ??= '2026-09-20T00:00:00.000Z'; exam.closedBy ??= admin.name; });
    const snapshot = buildEvaluationSeasonSnapshot(data, 'season-1');
    expect(snapshot.cycleIds).toEqual(['cycle-season-1']);
    expect(snapshot.rows.find(row => row.employeeId === corrector.employeeId)).toMatchObject({ score: 487, examsEvaluated: 2, cyclesEvaluated: 1, attendanceDays: 16 });
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
    ['multiple open seasons', (data: DemoData) => { data.evaluationSeasons.push({ id: 'season-1', name: 'موسم 1', startDate: '2026-09-01', state: 'OPEN', openedAt: '2026-09-01T00:00:00.000Z', openedBy: admin.name }, { id: 'season-2', name: 'موسم 2', startDate: '2026-09-02', state: 'OPEN', openedAt: '2026-09-02T00:00:00.000Z', openedBy: admin.name }); }],
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

describe('season boundary regressions', () => {
  function closedSeason(data: DemoData, endDate = '2026-10-04') {
    const next = structuredClone(data);
    next.evaluationSeasons[0].endDate = endDate;
    next.evaluationSeasons[0].snapshot = buildEvaluationSeasonSnapshot(next, 'open-season');
    Object.assign(next.evaluationSeasons[0], { state: 'ARCHIVED', closedAt: `${endDate}T12:00:00.000Z`, closedBy: admin.name });
    return next;
  }

  it('checks every exact tier boundary and the score immediately before it', () => {
    const ranks = [
      [0, 'Bronze 1'], [500, 'Bronze 2'], [1000, 'Bronze 3'],
      [1500, 'Silver 1'], [2000, 'Silver 2'], [2500, 'Silver 3'],
      [3000, 'Gold 1'], [3500, 'Gold 2'], [4000, 'Gold 3'],
      [4500, 'Platinum 1'], [5000, 'Platinum 2'], [5500, 'Platinum 3'],
      [6000, 'Diamond 1'], [6500, 'Diamond 2'], [7000, 'Diamond 3'],
      [7500, 'Emerald 1'], [8000, 'Emerald 2'], [8500, 'Emerald 3'],
      [9000, 'Master 1'], [10000, 'Master 2'], [11000, 'Master 3'], [12000, 'Grandmaster'],
    ] as const;
    ranks.forEach(([minimum, name], index) => {
      expect(getSeasonRank(minimum).name).toBe(name);
      expect(getSeasonRank(minimum - 1).name).toBe(ranks[Math.max(0, index - 1)][1]);
      expect(getRankProgress(minimum).progress).toBe(index === ranks.length - 1 ? 100 : 0);
      expect(getRankProgress(minimum).pointsToNext).toBe(index === ranks.length - 1 ? 0 : ranks[index + 1][0] - minimum);
    });
    expect(getRankProgress(-50)).toMatchObject({ rank: { name: 'Bronze 1' }, progress: 0, pointsToNext: 550 });
    expect(getRankProgress(9500)).toMatchObject({ rank: { name: 'Master 1' }, progress: 50, pointsToNext: 500 });
    expect(getRankProgress(999999)).toMatchObject({ rank: { name: 'Grandmaster' }, progress: 100, pointsToNext: 0 });
  });

  it('hides unpublished exam rows, raw values, cycle totals and seasonal rank until closure', () => {
    const data = openData();
    data.evaluationExams[0].state = 'CLOSED';
    const published = { publishedOnly: true };
    const cycleBefore = getCycleLeaderboard(data, 'cycle-1', published);
    const seasonBefore = getSeasonLeaderboard(data, 'open-season', published);
    expect(getExamLeaderboard(data, 'exam-2', published)).toEqual([]);
    expect(getExamEvaluation(data, 'exam-2', corrector.employeeId!, published)).toBeUndefined();
    expect(getExamEvaluation(data, 'exam-2', corrector.employeeId!)?.papers).toBe(100);
    Object.assign(data.examEvaluations[1], { papers: 50_000, correctionErrors: 20, behaviorErrors: 10 });
    expect(getCycleLeaderboard(data, 'cycle-1', published)).toEqual(cycleBefore);
    expect(getSeasonLeaderboard(data, 'open-season', published)).toEqual(seasonBefore);
    expect(getSeasonRank(seasonBefore[0].score).name).toBe('Bronze 1');
    expect(getSeasonRank(getSeasonLeaderboard(data, 'open-season')[0].score).name).toBe('Grandmaster');
    data.evaluationExams[1].state = 'CLOSED';
    expect(getExamEvaluation(data, 'exam-2', corrector.employeeId!, published)?.papers).toBe(50_000);
    expect(getExamLeaderboard(data, 'exam-2', published)).toEqual(getExamLeaderboard(data, 'exam-2'));
    expect(getCycleLeaderboard(data, 'cycle-1', published)).toEqual(getCycleLeaderboard(data, 'cycle-1'));
    expect(getSeasonLeaderboard(data, 'open-season', published)).toEqual(getSeasonLeaderboard(data, 'open-season'));
    data.evaluationExams[1].state = 'OPEN';
    expect(getSeasonLeaderboard(data, 'open-season', published)).toEqual(seasonBefore);
  });

  it('sums archived and live cycles independently of payroll months, exam counts and attendance', () => {
    const data = archive(openData());
    data.evaluationCycles.push({ id: 'cycle-2', seasonId: 'open-season', name: 'الدورة الثانية', state: 'OPEN', openedAt: '2027-01-01T00:00:00.000Z', openedBy: admin.name });
    data.evaluationExams.push({ ...data.evaluationExams[0], id: 'exam-3', cycleId: 'cycle-2', state: 'OPEN', date: '2027-01-01' });
    data.examEvaluations.push(evaluation({ id: 'ev-3', examId: 'exam-3', papers: 300, correctionErrors: 2, behaviorErrors: 1 }));
    const own = (publishedOnly = false) => getSeasonLeaderboard(data, 'open-season', { publishedOnly }).find(row => row.employeeId === corrector.employeeId)!;
    expect(own()).toMatchObject({ papers: 500, correctionErrors: 3, behaviorErrors: 2, score: 479, examsEvaluated: 3, cyclesEvaluated: 2, accuracy: 99 });
    expect(own(true)).toMatchObject({ papers: 200, score: 192, examsEvaluated: 2, cyclesEvaluated: 1 });
    const order = getSeasonLeaderboard(data, 'open-season').map(row => row.employeeId);
    data.attendance = [];
    data.months = [];
    expect(own()).toMatchObject({ score: 479, attendanceDays: 0, averagePapersPerDay: null });
    expect(getSeasonLeaderboard(data, 'open-season').map(row => row.employeeId)).toEqual(order);
  });

  it('retains archived contributions if a corrector leaves or changes department before the season closes', () => {
    const data = archive(openData());
    const frozen = structuredClone(data.evaluationCycles[0].snapshot!);
    const employee = data.employees.find(item => item.id === corrector.employeeId)!;
    Object.assign(employee, { active: false, departmentId: 'department-audit-test', name: 'اسم آخر', code: 'CP-9999' });
    expect(getSeasonLeaderboard(data, 'open-season').find(row => row.employeeId === employee.id)).toMatchObject({ employeeName: 'ابرار حقي', employeeCode: 'CP-0001', score: 192, papers: 200, cyclesEvaluated: 1 });
    data.employees = data.employees.filter(item => item.id !== employee.id);
    expect(buildEvaluationSeasonSnapshot(data, 'open-season').rows.find(row => row.employeeId === employee.id)?.score).toBe(192);
    expect(data.evaluationCycles[0].snapshot).toEqual(frozen);
  });

  it('counts unique PRESENT dates inside inclusive season boundaries only', () => {
    const data = openData();
    data.evaluationSeasons[0].startDate = '2026-09-05';
    data.evaluationSeasons[0].endDate = '2026-09-07';
    const existing = data.attendance.find(item => item.employeeId === corrector.employeeId && item.workdayId === 'test-workday-05')!;
    data.attendance.push({ ...existing, id: 'duplicate-record' });
    data.workdays.push({ ...data.workdays[4], id: 'duplicate-date' });
    data.attendance.push({ ...existing, id: 'duplicate-date-record', workdayId: 'duplicate-date' }, { ...existing, id: 'missing-day-record', workdayId: 'missing-day' });
    expect(getSeasonLeaderboard(data, 'open-season').find(row => row.employeeId === corrector.employeeId)).toMatchObject({ attendanceDays: 3, averagePapersPerDay: 200 / 3 });
    data.attendance = data.attendance.map(item => item.workdayId === 'test-workday-06' && item.employeeId === corrector.employeeId ? { ...item, status: 'EXCUSED' } : item);
    expect(getSeasonLeaderboard(data, 'open-season').find(row => row.employeeId === corrector.employeeId)?.attendanceDays).toBe(2);
  });

  it('archives at the closing date and rejects a snapshot that includes later attendance', () => {
    const data = archive(openData());
    const next = closedSeason(data, '2026-09-10');
    expect(next.evaluationSeasons[0].snapshot!.rows.find(row => row.employeeId === corrector.employeeId)).toMatchObject({ attendanceDays: 10, averagePapersPerDay: 20, score: 192 });
    expect(() => assertEvaluationMutation(data, next, admin)).not.toThrow();
    next.evaluationSeasons[0].snapshot = buildEvaluationSeasonSnapshot(data, 'open-season');
    expect(() => assertEvaluationMutation(data, next, admin)).toThrow();
  });

  it('freezes season rows, identities, attendance averages, rank inputs and cycle membership', () => {
    const data = closedSeason(archive(openData()));
    const original = structuredClone(data.evaluationSeasons[0].snapshot!);
    Object.assign(data.employees[0], { name: 'تغيير', active: false, departmentId: 'department-audit-test' });
    data.attendance = [];
    data.examEvaluations[0].papers = 99999;
    data.departments[0].salary.dailyRate = 999999;
    const result = getSeasonLeaderboard(data, 'open-season');
    expect(result).toEqual(original.rows);
    result[0].score = 999999;
    const copy = buildEvaluationSeasonSnapshot(data, 'open-season');
    copy.rows[0].employeeName = 'تغيير';
    copy.cycleIds.push('fake');
    expect(data.evaluationSeasons[0].snapshot).toEqual(original);
  });

  it.each([
    ['season snapshot edit', (data: DemoData) => { data.evaluationSeasons[0].snapshot!.rows[0].attendanceDays++; }],
    ['season name edit', (data: DemoData) => { data.evaluationSeasons[0].name = 'تغيير'; }],
    ['season reopening', (data: DemoData) => { data.evaluationSeasons[0].state = 'OPEN'; }],
    ['cycle membership deletion', (data: DemoData) => { data.evaluationSeasons[0].snapshot!.cycleIds = []; }],
    ['cycle reparenting', (data: DemoData) => { delete data.evaluationCycles[0].seasonId; }],
    ['new archived cycle attachment', (data: DemoData) => { data.evaluationCycles.push({ ...data.evaluationCycles[0], id: 'extra-cycle', snapshot: { rows: [], exams: [] } }); }],
  ] as const)('rejects %s in an archived season', (_, mutate) => {
    const before = closedSeason(archive(openData()));
    const after = structuredClone(before);
    mutate(after);
    expect(() => assertEvaluationMutation(before, after, admin)).toThrow();
  });

  it('rejects invalid dates and incomplete archived parent relationships on restoration', () => {
    for (const date of ['2026-02-30', '2026-13-01', 'invalid']) {
      const data = openData();
      data.evaluationSeasons[0].startDate = date;
      expect(() => assertEvaluationState(data)).toThrow();
      data.evaluationSeasons[0].startDate = '2026-09-01';
      data.evaluationSeasons[0].endDate = date;
      expect(() => assertEvaluationState(data)).toThrow();
    }
    const missingCycles = closedSeason(archive(openData()));
    missingCycles.evaluationSeasons[0].snapshot!.cycleIds = ['missing'];
    expect(() => assertEvaluationState(missingCycles)).toThrow();
    const missingExams = archive(openData());
    missingExams.evaluationCycles[0].snapshot!.exams.pop();
    expect(() => assertEvaluationState(missingExams)).toThrow();
  });

  it('allows legacy seasonless cycles to restore and finish, while new cycles require an open season', () => {
    const legacy = openData();
    legacy.evaluationSeasons = [];
    delete legacy.evaluationCycles[0].seasonId;
    expect(() => assertEvaluationState(legacy)).not.toThrow();
    expect(() => assertEvaluationMutation(legacy, archive(legacy), admin)).not.toThrow();
    const newCycle = structuredClone(legacy);
    newCycle.examEvaluations = [];
    expect(() => assertEvaluationMutation(createTestData(), newCycle, admin)).toThrow();
    legacy.evaluationSeasons.push(openData().evaluationSeasons[0]);
    expect(() => buildEvaluationSeasonSnapshot(legacy, 'open-season')).toThrow();
    const attached = structuredClone(legacy);
    attached.evaluationCycles[0].seasonId = 'open-season';
    expect(() => assertEvaluationMutation(legacy, attached, admin)).toThrow();
  });

  it('blocks a stale role and an auditor from season lifecycle changes', () => {
    const data = openData();
    const actor = data.employees.find(item => item.id === auditor.employeeId)!;
    actor.role = 'ADMIN';
    const after = structuredClone(data);
    after.evaluationSeasons[0].name = 'اسم الموسم';
    expect(() => assertEvaluationMutation(data, after, auditor)).toThrow();
    const administrator = { ...auditor, role: 'ADMIN' as const };
    expect(() => assertEvaluationMutation(data, after, administrator)).not.toThrow();
    actor.active = false;
    expect(() => assertEvaluationMutation(data, after, administrator)).toThrow();
  });

  it('permits a new season after archive without changing the archived season', () => {
    const before = closedSeason(archive(openData()));
    const after = structuredClone(before);
    after.evaluationSeasons.push({ ...openData().evaluationSeasons[0], id: 'next-season' });
    after.evaluationCycles.push({ ...openData().evaluationCycles[0], id: 'next-cycle', seasonId: 'next-season' });
    expect(() => assertEvaluationMutation(before, after, admin)).not.toThrow();
    expect(getSeasonLeaderboard(after, 'next-season').every(row => row.score === 0 && row.examsEvaluated === 0 && row.cyclesEvaluated === 0)).toBe(true);
    expect(after.evaluationSeasons[0]).toEqual(before.evaluationSeasons[0]);
  });
});
