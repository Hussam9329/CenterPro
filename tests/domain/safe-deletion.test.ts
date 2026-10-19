import { describe, expect, it } from 'vitest';
import { applyMutation } from '../../src/server/domain';
import { diffData } from '../../src/lib/server-contract';
import { applyDeletionPlan, getDeletionPlan, type DeletionCollection } from '../../src/lib/safe-deletion';
import { createInitialData } from '../../src/lib/mock-data';
import { createPopulatedTestData } from '../fixtures/populated-data';
import { getCycleLeaderboard, getExamLeaderboard, getSeasonLeaderboard } from '../../src/lib/evaluations';
import { getEmployeePayroll } from '../../src/lib/payroll';
import type { DemoData, DemoSession } from '../../src/lib/types';

const now = new Date('2026-10-12T11:17:43.000Z');
const owner: DemoSession = { kind: 'SYSTEM', role: 'SUPER_ADMIN', name: 'مدير النظام' };
const actor = (data: DemoData, id: string): DemoSession => ({ kind: 'EMPLOYEE', role: data.employees.find(e => e.id === id)!.role, employeeId: id, name: 'مختبر' });
const reason = 'تم إدخال السجل بالخطأ';
function seed(): DemoData {
  const fixture = createPopulatedTestData();
  return { ...createInitialData(), employees: fixture.employees.slice(0, 5), departments: fixture.departments };
}
function remove(data: DemoData, collection: DeletionCollection, id: string, who = owner): DemoData {
  const draft = structuredClone(data);
  applyDeletionPlan(draft, getDeletionPlan(data, collection, id));
  const command = diffData(data, draft, 1, { action: 'forged', entity: 'forged', entityId: 'forged', newValues: { reason } }, { deletion: { collection, id, reason, confirmation: 'حذف' } });
  expect(command.changes).toEqual([]); // Server, not browser, computes the cascade.
  return applyMutation(data, who, command, now);
}
function withDay(): DemoData {
  const state = seed();
  state.workdays = [{ id: 'day', date: '2026-10-12', startTime: '14:00:00', state: 'CLOSED', departmentIds: ['dept-correction'], overrides: {} }];
  state.attendance = state.employees.slice(0, 3).map((employee, index) => ({ id: `record-${index}`, employeeId: employee.id, workdayId: 'day', status: 'PRESENT', checkIn: now.toISOString(), latenessSeconds: 0, source: 'MANUAL', reason: '', updatedAt: now.toISOString() }));
  return state;
}
function withExam(): DemoData {
  const state = seed();
  state.evaluationSeasons.push({ id: 'season', name: 'موسم تجريبي', startDate: '2026-10-01', state: 'OPEN', openedAt: now.toISOString(), openedBy: 'admin' });
  state.evaluationCycles.push({ id: 'cycle', seasonId: 'season', name: 'دورة تجريبية', state: 'OPEN', openedAt: now.toISOString(), openedBy: 'admin' });
  state.evaluationExams.push({ id: 'exam', cycleId: 'cycle', name: 'امتحان تجريبي', date: '2026-10-12', note: '', state: 'OPEN', createdAt: now.toISOString(), createdBy: 'admin' });
  state.examEvaluations.push({ id: 'score', examId: 'exam', employeeId: 'CP-0001', papers: 100, correctionErrors: 1, behaviorErrors: 0, note: '', createdAt: now.toISOString(), createdBy: 'auditor', updatedAt: now.toISOString(), updatedBy: 'auditor' });
  return state;
}

describe('safe, reasoned, authenticated deletion', () => {
  it('deletes an attendance day and its records, recalculates live counts and preserves audit events', () => {
    const before = withDay(); const after = remove(before, 'workdays', 'day');
    expect(after.workdays).toHaveLength(0);
    expect(after.attendance).toHaveLength(0);
    expect(after.audit.some(item => item.action === 'حذف آمن مؤكد' && item.newValues.reason === reason)).toBe(true);
    expect(after.audit.filter(item => item.action === 'حذف سجل حضور')).toHaveLength(3);
    expect(after.audit.some(item => item.action === 'حذف يوم حضور')).toBe(true);
    expect(after.audit.some(item => item.action === 'إعادة فتح يوم حضور')).toBe(false);
    expect(before.attendance).toHaveLength(3);
  });
  it('refuses attendance changes to archived or paid months', () => {
    const before = withDay();
    before.months.push({ id: 'archive', month: '2026-10', state: 'ARCHIVED', snapshots: {} });
    expect(getDeletionPlan(before, 'workdays', 'day').blockers.join(' ')).toMatch(/مؤرشفة/);
    expect(() => remove(before, 'workdays', 'day')).toThrow(/مؤرشف/);
    before.months = []; before.payments.push({ id: 'payment', employeeId: 'CP-0001', month: '2026-10', salaryAtPayment: 100, amount: 100, date: '2026-10-12', paidBy: 'admin', createdAt: now.toISOString() });
    expect(() => remove(before, 'workdays', 'day')).toThrow(/عمليات صرف/);
  });
  it('deletes an exam with all its evaluations and recomputes open rankings', () => {
    const before = withExam(); const after = remove(before, 'evaluationExams', 'exam');
    expect(after.evaluationExams).toEqual([]);
    expect(after.examEvaluations).toEqual([]);
    expect(after.evaluationCycles).toHaveLength(1);
    expect(after.audit.some(item => item.action === 'حذف تقييم مصحح')).toBe(false); // canonical collection label
    expect(after.audit.some(item => item.action === 'حذف بيانات تدقيق مصحح')).toBe(true);
  });
  it('deletes an archived season with its archived cycle, exams and scores atomically', () => {
    const before = withExam();
    before.evaluationExams[0].state = 'CLOSED';
    before.evaluationCycles[0].state = 'ARCHIVED';
    before.evaluationCycles[0].snapshot = { rows: [], exams: [{ id: 'exam', name: 'امتحان تجريبي', date: '2026-10-12', rows: [] }] };
    before.evaluationSeasons[0].state = 'ARCHIVED';
    before.evaluationSeasons[0].endDate = '2026-10-12';
    before.evaluationSeasons[0].snapshot = { rows: [], cycleIds: ['cycle'] };
    expect(() => remove(before, 'evaluationExams', 'exam')).toThrow(/مؤرشفة/);
    expect(() => remove(before, 'evaluationCycles', 'cycle')).toThrow(/مؤرشف/);
    const after = remove(before, 'evaluationSeasons', 'season');
    expect([after.evaluationSeasons.length, after.evaluationCycles.length, after.evaluationExams.length, after.examEvaluations.length]).toEqual([0,0,0,0]);
    expect(after.audit.length).toBeGreaterThan(4);
  });
  it('blocks dependent department deletion; cleans employee-linked records when safe', () => {
    const before = withDay();
    expect(() => remove(before, 'departments', 'dept-correction')).toThrow(/موظف/);
    const after = remove(before, 'employees', 'CP-0001');
    expect(after.employees.some(item => item.id === 'CP-0001')).toBe(false);
    expect(after.attendance.some(item => item.employeeId === 'CP-0001')).toBe(false);
    expect(after.audit.some(item => item.action === 'حذف موظف')).toBe(true);
  });
  it('blocks removing paid employees; deleting a payment requires its own confirmation', () => {
    const before = seed();
    before.payments.push({ id: 'payment', employeeId: 'CP-0001', month: '2026-10', salaryAtPayment: 100, amount: 100, date: '2026-10-12', paidBy: 'admin', createdAt: now.toISOString() });
    expect(() => remove(before, 'employees', 'CP-0001')).toThrow(/صرف/);
    const cleared = remove(before, 'payments', 'payment');
    expect(cleared.payments).toEqual([]);
    expect(remove(cleared, 'employees', 'CP-0001').employees.some(item => item.id === 'CP-0001')).toBe(false);
  });
  it('restricts employee accounts and only allows an auditor to delete an open exam evaluation', () => {
    const before = withExam();
    expect(() => remove(before, 'evaluationExams', 'exam', actor(before, 'CP-0004'))).toThrow(/غير متاح لهذا الحساب/);
    expect(remove(before, 'examEvaluations', 'score', actor(before, 'CP-0004')).examEvaluations).toHaveLength(0);
    expect(() => remove(before, 'examEvaluations', 'score', actor(before, 'CP-0001'))).toThrow(/صلاحية حذف بيانات التدقيق/);
    before.evaluationExams[0].state = 'CLOSED';
    expect(() => remove(before, 'examEvaluations', 'score', actor(before, 'CP-0004'))).toThrow(/امتحاناً مغلقاً/);
    expect(() => remove(before, 'examEvaluations', 'score', owner)).toThrow(/امتحاناً مغلقاً/);
  });
  it('protects the last super admin and archived employee payroll history', () => {
    const before = seed();
    before.employees.push({ ...before.employees[0], id: 'MASTER', code: 'MASTER', username: 'MasterAccount', role: 'SUPER_ADMIN' });
    expect(() => remove(before, 'employees', 'MASTER')).toThrow(/آخر حساب مشرف عام/);
    before.months.push({ id: 'month-2026-10', month: '2026-10', state: 'ARCHIVED', snapshots: {
      'CP-0001': { employeeId: 'CP-0001' } as DemoData['months'][number]['snapshots'][string],
    } });
    expect(() => remove(before, 'employees', 'CP-0001')).toThrow(/مؤرشف/);
  });
  it('limits reopened-month adjustment deletion to super admin and keeps independent payment intent', () => {
    const before = seed();
    before.months.push({ id: 'month-2026-10', month: '2026-10', state: 'REOPENED', snapshots: {} });
    before.bonuses.push({ id: 'bonus-1', employeeId: 'CP-0001', date: '2026-10-12', amount: 10000, reason: 'مكافأة سابقة', createdBy: 'admin', createdAt: now.toISOString() });
    const admin = { ...before.employees[3], role: 'ADMIN' as const };
    before.employees[3] = admin;
    expect(() => remove(before, 'bonuses', 'bonus-1', actor(before, admin.id))).toThrow(/للمشرف العام/);
    expect(remove(before, 'bonuses', 'bonus-1').bonuses).toHaveLength(0);
  });
  it('rejects missing confirmation, missing reason, and extra changes in a deletion request', () => {
    const before = withDay();
    const intent = { collection: 'workdays' as const, id: 'day', reason, confirmation: 'حذف' as const };
    expect(() => applyMutation(before, owner, { revision: 1, changes: [], deletion: { ...intent, reason: '' } }, now)).toThrow(/سبب/);
    expect(() => applyMutation(before, owner, { revision: 1, changes: [{ collection: 'workdays', remove: ['day'] }], deletion: intent }, now)).toThrow(/وحدها/);
    expect(() => applyMutation(before, owner, { revision: 1, changes: [], deletion: { ...intent, confirmation: 'other' as 'حذف' } }, now)).toThrow(/كلمة حذف/);
  });
  it('cannot bypass paid-month attendance protection by deleting a different, unpaid employee', () => {
    const before = withDay();
    before.payments.push({ id: 'paid-other', employeeId: 'CP-0002', month: '2026-10', salaryAtPayment: 100, amount: 100, date: '2026-10-12', paidBy: 'admin', createdAt: now.toISOString() });
    const deletion = { collection: 'employees' as const, id: 'CP-0001', reason, confirmation: 'حذف' as const };
    expect(() => applyMutation(before, owner, { revision: 1, changes: [], deletion }, now)).toThrow(/حماية الحضور/);
    before.attendance = [];
    before.workdays[0].overrides['CP-0001'] = 'EXCLUDE';
    expect(() => applyMutation(before, owner, { revision: 1, changes: [], deletion }, now)).toThrow(/حماية الحضور/);
  });
  it('rejects generic removal commands even for financial and evaluation records', () => {
    const before = withExam();
    before.bonuses.push({ id: 'bonus', employeeId: 'CP-0001', date: '2026-10-12', amount: 100, reason, createdBy: 'admin', createdAt: now.toISOString() });
    for (const [collection, id] of [['bonuses', 'bonus'], ['examEvaluations', 'score']] as const) {
      expect(() => applyMutation(before, owner, { revision: 1, changes: [{ collection, remove: [id] }] }, now)).toThrow(/الحذف الآمن/);
    }
  });
  it('keeps clearing evaluation fields as an edit and preserves the statistics of a missing evaluation', () => {
    const before = withExam();
    const entry = { ...before.examEvaluations[0], papers: null, correctionErrors: null, behaviorErrors: null };
    const after = applyMutation(before, actor(before, 'CP-0004'), { revision: 1, changes: [{ collection: 'examEvaluations', upsert: [entry] }] }, now);
    expect(after.examEvaluations).toHaveLength(1);
    expect(after.examEvaluations[0]).toMatchObject({ id: 'score', papers: null, correctionErrors: null, behaviorErrors: null });
    expect(after.audit.some(item => item.action === 'تعديل بيانات تدقيق مصحح')).toBe(true);
    const missing = structuredClone(after); missing.examEvaluations = [];
    expect(getExamLeaderboard(after, 'exam')).toEqual(getExamLeaderboard(missing, 'exam'));
    expect(getCycleLeaderboard(after, 'cycle')).toEqual(getCycleLeaderboard(missing, 'cycle'));
    expect(getSeasonLeaderboard(after, 'season')).toEqual(getSeasonLeaderboard(missing, 'season'));
    after.examEvaluations[0].papers = 0;
    expect(getExamLeaderboard(after, 'exam').find(item => item.employeeId === 'CP-0001')?.examsEvaluated).toBe(1);
    after.examEvaluations[0].papers = null; after.examEvaluations[0].note = 'ملاحظة محفوظة';
    expect(getExamLeaderboard(after, 'exam').find(item => item.employeeId === 'CP-0001')?.examsEvaluated).toBe(1);
  });
  it('protects the current account even when another super admin remains', () => {
    const before = seed();
    before.employees[0].role = 'SUPER_ADMIN'; before.employees[1].role = 'SUPER_ADMIN';
    const deletion = { collection: 'employees' as const, id: 'CP-0001', reason, confirmation: 'حذف' as const };
    expect(() => applyMutation(before, actor(before, 'CP-0001'), { revision: 1, changes: [], deletion }, now)).toThrow(/حسابك/);
    expect(applyMutation(before, owner, { revision: 1, changes: [], deletion }, now).employees).toHaveLength(before.employees.length - 1);
  });
  it('preserves the post-payment salary change audit when deleting a financial adjustment', () => {
    const before = seed();
    before.bonuses.push({ id: 'bonus', employeeId: 'CP-0001', date: '2026-10-12', amount: 100, reason, createdBy: 'admin', createdAt: now.toISOString() });
    before.payments.push({ id: 'paid', employeeId: 'CP-0001', month: '2026-10', salaryAtPayment: 100, amount: 100, date: '2026-10-12', paidBy: 'admin', createdAt: now.toISOString() });
    const after = remove(before, 'bonuses', 'bonus');
    expect(getEmployeePayroll(after, 'CP-0001', '2026-10')).toMatchObject({ finalSalary: 0, paidAmount: 100, paymentStatus: 'REVIEW' });
    expect(after.audit.find(item => item.action === 'تعديل راتب بعد الصرف')).toMatchObject({ employeeId: 'CP-0001', newValues: { finalSalary: 0, paymentStatus: 'REVIEW', reason } });
    expect(after.payments).toEqual(before.payments);
  });
});
