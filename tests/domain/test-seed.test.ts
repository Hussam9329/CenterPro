import { describe, expect, it } from 'vitest';
import { createInitialData, createTestData, DEMO_MONTH } from '../../src/lib/mock-data';
import { calculateEmployeePayroll, getMonthPayroll } from '../../src/lib/payroll';
import { assertEvaluationState, getCorrectionEmployees, isAuditEmployee } from '../../src/lib/evaluations';

describe('explicit preview test data', () => {
  it('leaves normal startup empty and adds test data only through the explicit factory', () => {
    const empty = createInitialData();
    createTestData();
    for (const [key, value] of Object.entries(empty)) {
      if (key !== 'settings') expect(value).toEqual([]);
    }
    expect(createInitialData()).toEqual(empty);
  });

  it('creates exactly four correction and two audit employees with unique accounts and no evaluation fixtures', () => {
    const data = createTestData();
    expect(data.employees.map(item => item.name)).toEqual(['ابرار حقي', 'هبة محمد', 'فاطمة فراس', 'مريم عصام', 'جعفر علي', 'مريم فهد']);
    expect(getCorrectionEmployees(data)).toHaveLength(4);
    expect(data.employees.filter(item => isAuditEmployee(data, item))).toHaveLength(2);
    expect(data.employees.every(item => item.active && item.role === 'EMPLOYEE')).toBe(true);
    for (const field of ['id', 'code', 'username'] as const) expect(new Set(data.employees.map(item => item[field])).size).toBe(6);
    expect(data.evaluationCycles).toEqual([]);
    expect(data.evaluationExams).toEqual([]);
    expect(data.examEvaluations).toEqual([]);
    expect(() => assertEvaluationState(data)).not.toThrow();
  });

  it('provides linked closed days with one resolved attendance record per employee and day', () => {
    const data = createTestData();
    expect(data.workdays).toHaveLength(18);
    expect(new Set(data.workdays.map(item => item.date)).size).toBe(18);
    expect(data.workdays.every(item => item.state === 'CLOSED')).toBe(true);
    expect(data.attendance).toHaveLength(108);
    expect(new Set(data.attendance.map(item => `${item.employeeId}:${item.workdayId}`)).size).toBe(108);
    for (const record of data.attendance) {
      expect(data.employees.some(item => item.id === record.employeeId)).toBe(true);
      expect(data.workdays.some(item => item.id === record.workdayId)).toBe(true);
      expect(record.status).not.toBe('UNRESOLVED');
      expect(record.latenessSeconds).toBe(0);
      expect(Boolean(record.checkIn)).toBe(record.status === 'PRESENT');
    }
  });

  it.each([
    ['employee-abrar-haqi', 16, 0, 0, 16, 400_000, 0, 0, 400_000],
    ['employee-hiba-mohammed', 7, 2, 0, 9, 400_000, 50_000, 0, 350_000],
    ['employee-fatima-firas', 16, 1, 1, 18, 450_000, 25_000, 50_000, 375_000],
    ['employee-maryam-issam', 18, 0, 0, 18, 450_000, 0, 0, 450_000],
    ['employee-jaafar-ali', 17, 0, 0, 17, 425_000, 0, 0, 425_000],
    ['employee-maryam-fahad', 4, 2, 0, 6, 200_000, 50_000, 0, 150_000],
  ] as const)('matches required-day law and absence deductions for %s', (id, attendanceDays, excusedDays, unexcusedDays, requiredDays, baseSalary, excusedDeduction, unexcusedDeduction, finalSalary) => {
    const result = calculateEmployeePayroll(createTestData(), id, DEMO_MONTH);
    expect(result).toMatchObject({ attendanceDays, excusedDays, unexcusedDays, requiredDays, baseSalary, excusedDeduction, unexcusedDeduction, finalSalary, unresolvedDays: 0, otherDeductions: 0, bonuses: 0, lateDays: 0, latenessSeconds: 0, paymentStatus: 'UNPAID' });
    expect(result.exemptDays).toBe(18 - requiredDays);
  });

  it('keeps evaluation data entirely independent of payroll', () => {
    const data = createTestData();
    const before = getMonthPayroll(data, DEMO_MONTH);
    data.evaluationCycles.push({ id: 'cycle', name: 'دورة التقييم 1', state: 'OPEN', openedAt: '2026-10-01T00:00:00.000Z', openedBy: 'المدير' });
    data.evaluationExams.push({ id: 'exam', cycleId: 'cycle', name: 'امتحان', date: '2026-10-01', note: '', state: 'OPEN', createdAt: '2026-10-01T00:00:00.000Z', createdBy: 'المدير' });
    data.examEvaluations.push({ id: 'evaluation', examId: 'exam', employeeId: 'employee-abrar-haqi', papers: 500, correctionErrors: 10, behaviorErrors: 5, note: '', createdBy: 'جعفر علي', createdAt: '2026-10-01T00:00:00.000Z', updatedBy: 'جعفر علي', updatedAt: '2026-10-01T00:00:00.000Z' });
    expect(getMonthPayroll(data, DEMO_MONTH)).toEqual(before);
    expect(before.reduce((sum, row) => sum + row.finalSalary, 0)).toBe(2_150_000);
  });

  it('returns independent copies that cannot contaminate future loads', () => {
    const data = createTestData();
    const baseline = createTestData();
    data.employees[0].name = 'تعديل';
    data.departments[0].salary.tiers[0].amount = 999_999;
    data.workdays[0].departmentIds.pop();
    data.workdays[0].overrides[data.employees[0].id] = 'EXCLUDE';
    data.attendance[0].status = 'UNEXCUSED';
    data.settings.centerName = 'تعديل';
    expect(createTestData()).toEqual(baseline);
  });
});
