import { describe, expect, it } from 'vitest';
import { applyMutation, baghdadDate, recordQrAttendance } from '../../src/server/domain';
import { projectData } from '../../src/server/projection';
import { diffData, type MutationOptions } from '../../src/lib/server-contract';
import { createInitialData } from '../../src/lib/mock-data';
import { getEmployeePayroll, getMonthPayroll, recalculateReopenedPayroll } from '../../src/lib/payroll';
import { buildEvaluationCycleSnapshot, buildEvaluationSeasonSnapshot, getSeasonLeaderboard } from '../../src/lib/evaluations';
import { captureMonthSource } from '../../src/components/finance/finance-data';
import { QUICK_PRESENT_NOTE } from '../../src/lib/attendance-quick-review';
import { createPopulatedTestData } from '../fixtures/populated-data';
import type { AuditInput, DemoData, DemoSession, ExamEvaluation, Workday } from '../../src/lib/types';

const now = new Date('2026-10-12T11:17:43.000Z');
const owner: DemoSession = { kind: 'SYSTEM', role: 'SUPER_ADMIN', name: 'مدير النظام' };
function data(): DemoData {
  const populated = createPopulatedTestData(); const next = createInitialData();
  next.departments = populated.departments;
  next.employees = populated.employees.slice(0, 4);
  next.employees.push({ ...structuredClone(next.employees[0]), id: 'manager', code: 'CP-0100', name: 'مدير العمليات', username: 'MANAGER', role: 'ADMIN' });
  return next;
}
function actor(state: DemoData, id = 'CP-0001'): DemoSession { const employee = state.employees.find(item => item.id === id)!; return { kind: 'EMPLOYEE', role: employee.role, name: employee.name, employeeId: id }; }
function change(state: DemoData, updater: (next: DemoData) => void, user = owner, audit?: AuditInput, options?: MutationOptions) {
  const next = structuredClone(state); updater(next); return applyMutation(state, user, diffData(state, next, 1, audit, options), now);
}
const reason: AuditInput = { action: 'غير موثوق', entity: 'غير موثوق', entityId: 'غير موثوق', oldValues: { forged: true }, newValues: { reason: 'مراجعة إدارية', forged: true } };
function day(id = 'day'): Workday { return { id, date: '2026-10-12', startTime: '14:00:00', state: 'OPEN', departmentIds: ['dept-correction'], overrides: {} }; }
function openDay(state = data()): DemoData { return change(state, next => { next.workdays.push(day()); }); }
function resolveDay(state = openDay()): DemoData { return change(state, next => { next.attendance.forEach(item => { item.status = 'EXCUSED'; }); }); }
function archived(state = resolveDay()): DemoData {
  return change(state, next => { next.months.push({ id: 'oct', month: '2026-10', state: 'ARCHIVED', snapshots: Object.fromEntries(getMonthPayroll(state, '2026-10').map(item => [item.employeeId, item])), sourceSnapshot: captureMonthSource(state, '2026-10'), archivedAt: now.toISOString() }); });
}
function evaluationState(): DemoData {
  const state = data();
  state.evaluationSeasons.push({ id: 'season', name: 'الموسم', startDate: '2026-10-01', state: 'OPEN', openedAt: now.toISOString(), openedBy: owner.name });
  state.evaluationCycles.push({ id: 'cycle', seasonId: 'season', name: 'الدورة', state: 'OPEN', openedAt: now.toISOString(), openedBy: owner.name });
  state.evaluationExams.push({ id: 'exam', cycleId: 'cycle', name: 'امتحان', date: '2026-10-12', state: 'OPEN', note: 'ملاحظة إدارية خاصة', createdAt: now.toISOString(), createdBy: owner.name });
  return state;
}
function evaluation(values: Partial<ExamEvaluation> = {}): ExamEvaluation { return { id: 'evaluation', examId: 'exam', employeeId: 'CP-0001', papers: 25, correctionErrors: 2, behaviorErrors: 1, note: '', createdAt: now.toISOString(), createdBy: 'forged', updatedAt: now.toISOString(), updatedBy: 'forged', ...values }; }

describe('canonical server mutation boundary', () => {
  it('requires a current active actor and prevents employees from writing attendance/profile/settings', () => {
    const state = data();
    expect(() => change(state, next => { next.employees[0].name = 'forged'; }, actor(state))).toThrow();
    expect(() => change(state, next => { next.settings.centerName = 'forged'; }, actor(state))).toThrow();
    expect(() => change(state, next => { next.workdays.push(day()); }, { ...actor(state), role: 'SUPER_ADMIN' })).toThrow();
    state.employees[0].active = false;
    expect(() => applyMutation(state, actor(state), { revision: 1, changes: [] }, now)).toThrow();
  });
  it('protects salary fields, administrator accounts, account permissions and departments from manager requests', () => {
    const state = data(); const manager = actor(state, 'manager');
    expect(() => change(state, next => { next.employees[0].fixedSalary = 500_000; }, manager)).toThrow();
    expect(() => change(state, next => { next.employees[0].permissions = { DEDUCTIONS: { view: true, create: false, edit: false, delete: false } }; }, manager)).toThrow('إدارة صلاحيات الحساب متاحة للمشرف العام فقط.');
    expect(change(state, next => { next.employees[0].permissions = { DEDUCTIONS: { view: true, create: false, edit: false, delete: false } }; }).employees[0].permissions?.DEDUCTIONS?.view).toBe(true);
    expect(() => change(state, next => { next.employees[0].role = 'ADMIN'; }, manager)).toThrow();
    expect(() => change(state, next => { next.employees.at(-1)!.name = 'غير مسموح'; }, manager)).toThrow();
    expect(() => change(state, next => { next.departments[0].name = 'غير مسموح'; }, manager)).toThrow();
    expect(change(state, next => { next.employees[0].name = 'اسم معدل'; }, manager).employees[0].name).toBe('اسم معدل');
  });
  it('creates an employee and password atomically and derives a new non-reused code and timestamps', () => {
    const state = data(); const employee = { ...state.employees[0], id: 'new', username: 'new-user', code: 'CP-9999', createdAt: '2000-01-01T00:00:00Z' };
    expect(() => change(state, next => { next.employees.push(employee); })).toThrow(/كلمة مرور/);
    const saved = change(state, next => { next.employees.push(employee); }, owner, undefined, { password: { employeeId: 'new', value: 'new-secret' } });
    expect(saved.employees.at(-1)).toMatchObject({ code: 'CP-0101', createdAt: now.toISOString(), updatedAt: now.toISOString() });
    expect(JSON.stringify(saved)).not.toContain('new-secret');
    expect(saved.audit.some(item => item.newValues.passwordChanged === true)).toBe(true);
  });
  it('uses Baghdad date for deactivation and preserves history and original source', () => {
    const state = data(); const original = structuredClone(state);
    const saved = change(state, next => { next.employees[0].active = false; next.employees[0].endDate = '2026-09-28'; });
    expect(saved.employees[0].endDate).toBe('2026-10-12'); expect(state).toEqual(original);
    expect(baghdadDate(new Date('2026-10-12T21:30:00Z'))).toBe('2026-10-13');
  });
  it('rejects arbitrary fields, protected deletions and duplicate usernames', () => {
    const state = data();
    expect(() => applyMutation(state, owner, { revision: 1, changes: [{ collection: 'employees', upsert: [{ ...state.employees[0], salaryOverrideBackdoor: 1 }] }] }, now)).toThrow();
    expect(() => change(state, next => { next.employees.splice(0, 1); })).toThrow();
    expect(() => change(state, next => { next.employees[1].username = next.employees[0].username.toLowerCase(); })).toThrow();
    expect(() => change(state, next => { next.employees[0].phone = 'bad'; })).toThrow();
  });
  it('generates audit from canonical changes and never trusts supplied actor/action/old/new payloads', () => {
    const state = data(); const saved = change(state, next => { next.employees[0].name = 'الاسم الجديد'; }, owner, reason);
    expect(saved.audit[0]).toMatchObject({ actor: owner.name, role: 'SUPER_ADMIN', action: 'تعديل موظف', timestamp: now.toISOString(), oldValues: { name: state.employees[0].name }, newValues: { name: 'الاسم الجديد' } });
    expect(JSON.stringify(saved.audit)).not.toContain('forged'); expect(saved.audit[0].entityId).toBe(state.employees[0].id);
  });
  it('validates standalone password targets and emits only sanitized reset flags', () => {
    const state = data(); const options = { password: { employeeId: state.employees[0].id, value: 'new-password' } };
    const saved = applyMutation(state, actor(state, 'manager'), { revision: 1, changes: [], ...options }, now);
    expect(saved.audit[0].newValues).toEqual({ passwordChanged: true, sessionsInvalidated: true });
    expect(() => applyMutation(state, actor(state), { revision: 1, changes: [], ...options }, now)).toThrow();
    expect(() => applyMutation(state, owner, { revision: 1, changes: [], password: { employeeId: 'missing', value: 'new-password' } }, now)).toThrow();
  });
  it('permits retaining an authorized stored photo but rejects copying another employee photo reference', () => {
    const state = data(); const reference = `/api/photos/${'a'.repeat(64)}`; state.employees[0].photo = reference;
    expect(change(state, next => { next.employees[0].name = 'اسم جديد'; }).employees[0].photo).toBe(reference);
    expect(() => change(state, next => { next.employees[1].photo = reference; })).toThrow(/صورة/);
    expect(() => change(state, next => { next.employees[0].photo = `/api/photos/${'b'.repeat(64)}`; })).toThrow(/صورة/);
  });
  it('removes a stored photo when the complete profile omits it over the JSON wire', () => {
    const state = data(); const reference = `/api/photos/${'a'.repeat(64)}`; state.employees[0].photo = reference;
    const draft = structuredClone(state); draft.employees[0].photo = undefined;
    const request = JSON.parse(JSON.stringify(diffData(state, draft, 1)));
    const saved = applyMutation(state, owner, request, now);
    expect(saved.employees[0].photo).toBeUndefined();
    expect(state.employees[0].photo).toBe(reference);
    expect(saved.audit.find(item => item.entityId === 'CP-0001')?.oldValues.hasPhoto).toBe(true);
  });
});

describe('server workday and attendance invariants', () => {
  it('constructs attendance records itself and enforces one open day and unique dates', () => {
    const state = openDay(); expect(state.attendance).toHaveLength(4);
    expect(state.attendance.every(item => item.status === 'UNRESOLVED')).toBe(true);
    expect(state.workdays[0]).toMatchObject({ createdBy: owner.name, createdAt: now.toISOString() });
    expect(() => change(state, next => { next.workdays.push({ ...day('second'), date: '2026-10-13' }); })).toThrow(/مفتوح/);
    expect(() => change(state, next => { next.workdays.push(day('duplicate')); })).toThrow();
    expect(() => change(data(), next => { next.workdays.push({ ...day(), departmentIds: ['missing'] }); })).toThrow();
  });
  it('does not require a modification reason for the first creation of a workday on an earlier date', () => {
    const state = data();
    const first = change(state, next => {
      next.workdays.push({ ...day('historic'), date: '2026-10-11', startTime: '15:00:00' });
    });
    expect(first.workdays[0]).toMatchObject({ date: '2026-10-11', startTime: '15:00:00' });
    expect(first.audit.some(entry => entry.action === 'فتح يوم حضور')).toBe(true);
    expect(first.audit.some(entry => entry.newValues.reason)).toBe(false);
    expect(() => change(first, next => { next.workdays[0].startTime = '16:00:00'; })).toThrow(/سبب/);
    expect(change(first, next => { next.workdays[0].startTime = '16:00:00'; }, owner, reason).workdays[0].startTime).toBe('16:00:00');
  });
  it('keeps archived months protected even though creating new days requires no reason', () => {
    const state = data();
    state.months.push({ id: 'archive', month: '2026-10', state: 'ARCHIVED', snapshots: {} });
    expect(() => change(state, next => { next.workdays.push(day('new')); })).toThrow(/الشهر/);
  });
  it('allows first creation without a reason in a reopened month only for the owner and preserves earlier days and salary snapshots', () => {
    const closed = change(resolveDay(), next => { next.workdays[0].state = 'CLOSED'; });
    const state = change(archived(closed), next => { next.months[0].state = 'REOPENED'; });
    const original = structuredClone(state);
    const add = (next: DemoData) => { next.workdays.push({ ...day('earlier'), date: '2026-10-11', startTime: '15:00:00' }); };
    expect(() => change(state, add, actor(state, 'manager'))).toThrow(/الشهر/);
    const created = change(state, add);
    expect(created.workdays[0]).toEqual(state.workdays[0]);
    expect(created.workdays[1]).toMatchObject({ date: '2026-10-11', startTime: '15:00:00', createdBy: owner.name });
    expect(created.attendance.filter(record => record.workdayId === 'earlier').every(record => record.status === 'UNRESOLVED')).toBe(true);
    expect(created.months).toEqual(state.months);
    expect(created.audit.find(entry => entry.entityId === 'earlier')?.newValues).not.toHaveProperty('reason');
    expect(() => change(created, next => { next.workdays[1].startTime = '15:30:00'; })).toThrow(/سبب/);
    expect(state).toEqual(original);
  });
  it('blocks closing unresolved records and permits resolved close/reopen with reason', () => {
    expect(() => change(openDay(), next => { next.workdays[0].state = 'CLOSED'; })).toThrow(/احسم/);
    const closed = change(resolveDay(), next => { next.workdays[0].state = 'CLOSED'; });
    expect(() => change(closed, next => { next.workdays[0].state = 'OPEN'; })).toThrow(/سبب/);
    expect(change(closed, next => { next.workdays[0].state = 'OPEN'; }, owner, reason).workdays[0].state).toBe('OPEN');
  });
  it('derives manual lateness/source and clears all check-in fields on exemption without requiring a note', () => {
    const state = openDay(); const first = state.attendance[0];
    const present = change(state, next => { Object.assign(next.attendance[0], { status: 'PRESENT', checkIn: now.toISOString(), latenessSeconds: 0, source: 'QR' }); });
    expect(present.attendance[0]).toMatchObject({ source: 'MANUAL', latenessSeconds: 1063, updatedAt: now.toISOString() });
    const exempt = change(present, next => { next.attendance[0].status = 'EXEMPT'; });
    expect(exempt.attendance[0]).toMatchObject({ checkIn: null, source: null, latenessSeconds: 0 });
    expect(exempt.workdays[0].overrides[first.employeeId]).toBe('EXCLUDE');
    expect(() => change(state, next => { Object.assign(next.attendance[0], { status: 'PRESENT', checkIn: '2026-10-11T11:17:43Z' }); })).toThrow(/يوم الدوام/);
    expect(() => change(state, next => { next.attendance[0].status = 'PRESENT'; }, actor(state))).toThrow();
  });
  it('persists a quick presence at the configured start through canonical manual attendance and audit validation', () => {
    const state = change(data(), next => { next.workdays.push({ ...day(), startTime: '15:00:00' }); });
    const manager = actor(state, 'manager');
    const saved = change(state, next => {
      Object.assign(next.attendance[0], { status: 'PRESENT', checkIn: '2026-10-12T15:00:00+03:00', source: 'QR', latenessSeconds: 999, reason: QUICK_PRESENT_NOTE });
    }, manager, { ...reason, newValues: { reason: QUICK_PRESENT_NOTE } });
    const record = saved.attendance[0];
    expect(record).toMatchObject({ status: 'PRESENT', checkIn: '2026-10-12T12:00:00.000Z', source: 'MANUAL', latenessSeconds: 0, reason: QUICK_PRESENT_NOTE });
    expect(saved.audit.find(entry => entry.entityId === record.id)).toMatchObject({ actor: manager.name, role: 'ADMIN', action: 'تعديل سجل حضور', oldValues: { status: 'UNRESOLVED', checkIn: null }, newValues: { status: 'PRESENT', source: 'MANUAL', checkIn: record.checkIn, reason: QUICK_PRESENT_NOTE } });
    const removed = change(saved, next => { next.attendance[0].status = 'UNRESOLVED'; }, manager);
    expect(removed.attendance[0]).toMatchObject({ status: 'UNRESOLVED', checkIn: null, source: null, latenessSeconds: 0 });
    expect(removed.audit.find(entry => entry.entityId === record.id)).toMatchObject({ oldValues: { status: 'PRESENT', checkIn: record.checkIn }, newValues: { status: 'UNRESOLVED', checkIn: null } });
  });
  it('retains archive locks, reopened snapshot eligibility and owner permissions for quick attendance', () => {
    const state = archived();
    const present = (next: DemoData) => { Object.assign(next.attendance[0], { status: 'PRESENT', checkIn: '2026-10-12T14:00:00+03:00', reason: QUICK_PRESENT_NOTE }); };
    expect(() => change(state, present)).toThrow(/الشهر/);
    const reopened = change(state, next => { next.months[0].state = 'REOPENED'; });
    expect(() => change(reopened, present, actor(reopened, 'manager'))).toThrow(/الشهر/);
    const saved = change(reopened, present);
    expect(saved.attendance[0]).toMatchObject({ status: 'PRESENT', source: 'MANUAL', latenessSeconds: 0 });
    expect(saved.months).toEqual(reopened.months);
    expect(() => change(saved, next => { next.months[0].state = 'ARCHIVED'; })).toThrow(/إعادة الاحتساب/);
    const missingSnapshot = structuredClone(reopened);
    delete missingSnapshot.months[0].snapshots[missingSnapshot.attendance[0].employeeId];
    expect(() => change(missingSnapshot, present)).toThrow(/نسخة راتب مؤرشفة/);
  });
  it('keeps paid amounts immutable and marks payroll for review when quick presence replaces a paid absence', () => {
    const state = resolveDay(); const employeeId = state.attendance[0].employeeId;
    const payroll = getEmployeePayroll(state, employeeId, '2026-10');
    const paid = change(state, next => { next.payments.push({ id: 'attendance-payment', employeeId, month: '2026-10', salaryAtPayment: payroll.finalSalary, amount: payroll.finalSalary, date: '2026-10-12', paidBy: owner.name, createdAt: now.toISOString() }); });
    const saved = change(paid, next => { Object.assign(next.attendance[0], { status: 'PRESENT', checkIn: '2026-10-12T14:00:00+03:00', reason: QUICK_PRESENT_NOTE }); });
    expect(saved.payments).toEqual(paid.payments);
    expect(getEmployeePayroll(saved, employeeId, '2026-10')).toMatchObject({ paymentStatus: 'REVIEW', paidAmount: payroll.finalSalary, finalSalary: payroll.finalSalary + payroll.dailyRate, difference: payroll.dailyRate });
    expect(saved.audit.find(entry => entry.action === 'تعديل راتب بعد الصرف')).toMatchObject({ employeeId, oldValues: { finalSalary: payroll.finalSalary, paymentStatus: 'PAID' }, newValues: { finalSalary: payroll.finalSalary + payroll.dailyRate, paymentStatus: 'REVIEW', difference: payroll.dailyRate } });
  });
  it('requires a workday configuration reason and updates associated lateness itself', () => {
    const present = change(openDay(), next => { Object.assign(next.attendance[0], { status: 'PRESENT', checkIn: now.toISOString() }); });
    expect(() => change(present, next => { next.workdays[0].startTime = '14:10:00'; })).toThrow(/سبب/);
    const saved = change(present, next => { next.workdays[0].startTime = '14:10:00'; }, owner, reason);
    expect(saved.attendance[0].latenessSeconds).toBe(463);
  });
  it('trusted QR helper uses the server instant and prevents duplicates/exemptions/historical dates', () => {
    const state = openDay(); const user = actor(state);
    const saved = recordQrAttendance(state, user, 'day', now);
    expect(saved.attendance.find(item => item.employeeId === user.employeeId)).toMatchObject({ source: 'QR', checkIn: now.toISOString(), latenessSeconds: 1063 });
    const duplicate = recordQrAttendance(saved, user, 'day', new Date(now.getTime() + 1000)); expect(duplicate).toEqual(saved);
    expect(() => recordQrAttendance(state, owner, 'day', now)).toThrow();
    expect(() => recordQrAttendance(state, user, 'day', new Date('2026-10-13T11:00:00Z'))).toThrow();
    state.workdays[0].overrides[user.employeeId!] = 'EXCLUDE';
    expect(() => recordQrAttendance(state, user, 'day', now)).toThrow(/مستثنى/);
  });
});

describe('server financial snapshots and payments', () => {
  it.each(['deductions', 'bonuses'] as const)('preserves the form\'s 1000-character reason limit for %s', collection => {
    const state = data(); const entry = { id: 'adjustment', employeeId: 'CP-0001', amount: 100, date: '2026-10-12', reason: 'س'.repeat(1000), createdBy: owner.name, createdAt: now.toISOString(), ...(collection === 'deductions' ? { type: 'أخرى', customType: 'توضيح' } : {}) };
    const request = { revision: 1, changes: [{ collection, upsert: [entry] }] };
    expect(applyMutation(state, owner, request, now)[collection][0].reason).toHaveLength(1000);
    entry.reason += 'س';
    expect(() => applyMutation(state, owner, request, now)).toThrow();
  });
  it('rejects forged snapshots, freezes archives and restricts reopening', () => {
    const state = resolveDay(); const snapshots = Object.fromEntries(getMonthPayroll(state, '2026-10').map(item => [item.employeeId, item]));
    const forged = structuredClone(snapshots); forged['CP-0001'].finalSalary = 999;
    expect(() => applyMutation(state, owner, { revision: 1, changes: [{ collection: 'months', upsert: [{ id: 'oct', month: '2026-10', state: 'ARCHIVED', snapshots: forged }] }] }, now)).toThrow();
    const archive = archived(state); const snapshot = structuredClone(archive.months[0].snapshots);
    expect(change(archive, next => { next.departments[0].salary.dailyRate = 99_000; }).months[0].snapshots).toEqual(snapshot);
    expect(() => change(archive, next => { next.months[0].state = 'REOPENED'; }, actor(archive, 'manager'))).toThrow();
    const reopened = change(archive, next => { next.months[0].state = 'REOPENED'; next.months[0].snapshots['CP-0001'].finalSalary = 999; });
    expect(reopened.months[0].snapshots).toEqual(snapshot);
  });
  it('requires explicit historical recalculation with archived salary configuration before rearchiving', () => {
    let state = archived(); state = change(state, next => { next.months[0].state = 'REOPENED'; });
    state = change(state, next => { next.departments[0].salary.dailyRate = 99_000; });
    state = change(state, next => { next.attendance[0].status = 'UNEXCUSED'; });
    expect(() => change(state, next => { next.months[0].state = 'ARCHIVED'; })).toThrow(/إعادة الاحتساب/);
    const before = state;
    state = change(state, next => { next.months[0].snapshots = Object.fromEntries(Object.keys(before.months[0].snapshots).map(id => [id, recalculateReopenedPayroll(before, id, '2026-10')])); });
    expect(state.months[0].snapshots['CP-0001'].dailyRate).toBe(25_000);
    expect(state.months[0].snapshots['CP-0001'].finalSalary).toBe(-25_000);
    expect(change(state, next => { next.months[0].state = 'ARCHIVED'; }).months[0].state).toBe('ARCHIVED');
  });
  it('protects both original and new adjustment months and accepts negative resulting salary', () => {
    const state = data();
    const withDeduction = change(state, next => { next.deductions.push({ id: 'deduction', employeeId: 'CP-0001', amount: 100_000, date: '2026-10-12', type: 'خصم إداري', customType: '', reason: 'سبب', createdBy: 'forged', createdAt: '2000-01-01T00:00:00Z' }); });
    expect(getEmployeePayroll(withDeduction, 'CP-0001', '2026-10').finalSalary).toBe(-100_000);
    expect(withDeduction.deductions[0]).toMatchObject({ createdBy: owner.name, createdAt: now.toISOString() });
    const archive = archived(withDeduction);
    expect(() => change(archive, next => { next.deductions[0].date = '2026-11-01'; })).toThrow(/الشهر/);
    expect(() => change(archive, next => { next.deductions = []; })).toThrow(/الشهر/);
    expect(() => change(withDeduction, next => { next.deductions[0].amount = -1; })).toThrow();
  });
  it('derives payment identity, preserves payment history and audits salary changes after payment', () => {
    const state = data();
    const paid = change(state, next => { next.payments.push({ id: 'paid', employeeId: 'CP-0001', month: '2026-10', salaryAtPayment: 0, amount: 0, date: '2026-10-12', paidBy: 'forged', createdAt: '2000-01-01T00:00:00Z' }); });
    expect(paid.payments[0]).toMatchObject({ paidBy: owner.name, createdAt: now.toISOString() });
    expect(() => change(paid, next => { next.payments[0].amount = 99; })).toThrow(/ثابت/);
    const changed = change(paid, next => { next.bonuses.push({ id: 'bonus', employeeId: 'CP-0001', amount: 100, date: '2026-10-12', reason: 'مكافأة', createdBy: owner.name, createdAt: now.toISOString() }); });
    expect(getEmployeePayroll(changed, 'CP-0001', '2026-10')).toMatchObject({ paymentStatus: 'REVIEW', finalSalary: 100, paidAmount: 0, difference: 100 });
    expect(changed.audit.some(entry => entry.action === 'تعديل راتب بعد الصرف')).toBe(true);
    expect(changed.payments).toEqual(paid.payments);
  });
});

describe('evaluation permissions and read projections', () => {
  it('permits the super admin and explicitly delegated employees to edit open corrector results and assigns actor metadata', () => {
    const state = evaluationState(); const auditor = actor(state, 'CP-0004');
    const byOwner = change(state, next => { next.examEvaluations.push(evaluation()); });
    expect(byOwner.examEvaluations[0]).toMatchObject({ createdBy: owner.name, updatedBy: owner.name });
    expect(() => change(state, next => { next.examEvaluations.push(evaluation()); }, actor(state))).toThrow(/صلاحية|مفوضة/);
    const saved = change(state, next => { next.examEvaluations.push(evaluation()); }, auditor);
    expect(saved.examEvaluations[0]).toMatchObject({ createdBy: auditor.name, updatedBy: auditor.name, updatedAt: now.toISOString() });
    const closed = change(saved, next => { next.evaluationExams[0].state = 'CLOSED'; });
    expect(() => change(closed, next => { next.examEvaluations[0].papers = 99; }, auditor)).toThrow(/مغلق/);
  });
  it('archives cycle/exams and season atomically with canonical snapshots', () => {
    const state = evaluationState(); state.examEvaluations.push(evaluation());
    const expected = buildEvaluationCycleSnapshot(state, 'cycle');
    const archivedCycle = change(state, next => { next.evaluationCycles[0].state = 'ARCHIVED'; next.evaluationCycles[0].snapshot = { rows: [], exams: [] }; });
    expect(archivedCycle.evaluationCycles[0].snapshot).toEqual(expected); expect(archivedCycle.evaluationExams[0].state).toBe('CLOSED');
    const closing = structuredClone(archivedCycle); closing.evaluationSeasons[0].endDate = '2026-10-12';
    const season = change(archivedCycle, next => { next.evaluationSeasons[0].state = 'ARCHIVED'; });
    expect(season.evaluationSeasons[0].snapshot).toEqual(buildEvaluationSeasonSnapshot(closing, 'season'));
    expect(() => change(season, next => { next.evaluationExams[0].state = 'OPEN'; })).toThrow();
  });
  it('redacts other employees private/financial data and unpublished results at the API boundary', () => {
    const state = evaluationState(); state.examEvaluations.push(evaluation({ papers: 9999, note: 'PRIVATE-EXAM-NOTE' }));
    state.employees[1].notes = 'PRIVATE-EMPLOYEE-NOTE'; state.employees[1].phone = '07912345678';
    state.audit.push({ id: 'private-audit', actor: owner.name, role: 'SUPER_ADMIN', action: 'PRIVATE-AUDIT', entity: 'employee', entityId: 'CP-0002', timestamp: now.toISOString(), oldValues: {}, newValues: {} });
    const projected = projectData(state, actor(state)); const serialized = JSON.stringify(projected);
    expect(projected.employees.find(item => item.id === 'CP-0002')).toMatchObject({ name: state.employees[1].name, code: 'CP-0002', phone: '', notes: '', fixedSalary: 0 });
    expect(serialized).not.toContain('PRIVATE-EMPLOYEE-NOTE'); expect(serialized).not.toContain('07912345678'); expect(serialized).not.toContain('PRIVATE-EXAM-NOTE'); expect(serialized).not.toContain('PRIVATE-AUDIT'); expect(serialized).not.toContain('9999');
    expect(projected.examEvaluations).toEqual([]); expect(getSeasonLeaderboard(projected, 'season')[0].score).toBe(0);
    expect(projectData(state, actor(state, 'manager')).audit).toEqual([]); expect(projectData(state, owner).audit).toHaveLength(1);
  });
  it('returns server season aggregates without exposing colleagues attendance dates', () => {
    const state = evaluationState(); state.evaluationExams[0].state = 'CLOSED'; state.examEvaluations.push(evaluation({ employeeId: 'CP-0002' }));
    state.workdays.push(day()); state.attendance.push({ id: 'private-attendance', employeeId: 'CP-0002', workdayId: 'day', status: 'PRESENT', checkIn: now.toISOString(), source: 'QR', latenessSeconds: 1063, reason: 'PRIVATE-REASON', updatedAt: now.toISOString() });
    const expected = getSeasonLeaderboard(state, 'season', { publishedOnly: true });
    const projected = projectData(state, actor(state));
    expect(projected.attendance).toEqual([]); expect(JSON.stringify(projected)).not.toContain('PRIVATE-REASON');
    expect(getSeasonLeaderboard(projected, 'season', { publishedOnly: true })).toEqual(expected);
    expect(expected.find(item => item.employeeId === 'CP-0002')?.attendanceDays).toBe(1);
  });
  it('preserves own payroll and deeply filters archived source snapshots', () => {
    const state = archived(); const user = actor(state); const own = getEmployeePayroll(state, user.employeeId!, '2026-10');
    const projected = projectData(state, user);
    expect(getEmployeePayroll(projected, user.employeeId!, '2026-10')).toEqual(own);
    expect(Object.keys(projected.months[0].snapshots)).toEqual([user.employeeId]);
    expect(projected.months[0].sourceSnapshot?.employees.map(item => item.id)).toEqual([user.employeeId]);
    expect(projected.months[0].sourceSnapshot?.attendance.every(item => item.employeeId === user.employeeId)).toBe(true);
    expect(Object.keys(projected.workdays[0].overrides).every(id => id === user.employeeId)).toBe(true);
  });
  it('does not forward unknown imported archive/profile extensions to an employee', () => {
    const state = archived();
    Object.assign(state.months[0], { privateOtherEmployees: 'PRIVATE-ARCHIVE-EXTENSION' });
    Object.assign(state.months[0].snapshots['CP-0001'], { privateOtherEmployees: 'PRIVATE-PAYROLL-EXTENSION' });
    Object.assign(state.months[0].sourceSnapshot!.employees[0], { privateOtherEmployees: 'PRIVATE-PROFILE-EXTENSION' });
    Object.assign(state.employees[0], { privateOtherEmployees: 'PRIVATE-LIVE-EXTENSION' });
    const projected = JSON.stringify(projectData(state, actor(state)));
    expect(projected).not.toContain('PRIVATE-');
    expect(JSON.stringify(projectData(state, owner))).toContain('PRIVATE-ARCHIVE-EXTENSION');
  });
});
