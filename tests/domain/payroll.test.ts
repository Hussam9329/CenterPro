import { describe, expect, it } from 'vitest';
import { createInitialData, DEMO_MONTH } from '../../src/lib/mock-data';
import { calculateEmployeePayroll, calculateFixedSalary, calculateTieredSalary, getEmployeePayroll, getMonthPayroll, isPartialEmploymentMonth, recalculateReopenedPayroll, validateSalaryConfig } from '../../src/lib/payroll';
import type { SalaryConfig } from '../../src/lib/types';

const correctionConfig: SalaryConfig = {
  mode: 'TIERED', dailyRate: 25000, unexcusedRate: 50000, maximum: 600000, fixedSalary: 0, extraDaysStart: 17,
  tiers: [
    { id: '1', fromDays: 0, toDays: 4, type: 'PER_DAY', amount: 0 },
    { id: '2', fromDays: 5, toDays: 8, type: 'FIXED', amount: 200000 },
    { id: '3', fromDays: 9, toDays: 16, type: 'FIXED', amount: 400000 },
  ],
};

describe('configurable tier payroll', () => {
  it.each([
    [0, 0], [1, 25000], [2, 50000], [3, 75000], [4, 100000],
    [5, 200000], [6, 200000], [7, 200000], [8, 200000],
    [9, 400000], [10, 400000], [11, 400000], [12, 400000], [13, 400000], [14, 400000], [15, 400000], [16, 400000],
    [17, 425000], [18, 450000], [19, 475000], [20, 500000], [21, 525000], [22, 550000], [23, 575000], [24, 600000],
    [25, 600000], [26, 600000], [27, 600000], [28, 600000], [29, 600000], [30, 600000], [31, 600000],
  ])('%i days gives %i IQD', (days, expected) => {
    expect(calculateTieredSalary(days, correctionConfig)).toBe(expected);
  });

  it('uses configured boundaries, rates and maximum for another department', () => {
    const custom: SalaryConfig = { ...correctionConfig, dailyRate: 10000, maximum: 145000, extraDaysStart: 11,
      tiers: [{ id: 'a', fromDays: 0, toDays: 2, type: 'PER_DAY', amount: 0 }, { id: 'b', fromDays: 3, toDays: 10, type: 'FIXED', amount: 90000 }] };
    expect(calculateTieredSalary(2, custom)).toBe(20000);
    expect(calculateTieredSalary(3, custom)).toBe(90000);
    expect(calculateTieredSalary(11, custom)).toBe(100000);
    expect(calculateTieredSalary(18, custom)).toBe(145000);
  });

  it('validates overlap, negative amounts, reversed ranges and order', () => {
    expect(() => validateSalaryConfig({ ...correctionConfig, dailyRate: -1 })).toThrow();
    expect(() => validateSalaryConfig({ ...correctionConfig, dailyRate: 25000.5 })).toThrow();
    expect(() => validateSalaryConfig({ ...correctionConfig, tiers: [{ ...correctionConfig.tiers[0], fromDays: 5, toDays: 4 }] })).toThrow();
    expect(() => validateSalaryConfig({ ...correctionConfig, tiers: [correctionConfig.tiers[0], { ...correctionConfig.tiers[1], fromDays: 4 }] })).toThrow();
    expect(() => validateSalaryConfig({ ...correctionConfig, tiers: [...correctionConfig.tiers].reverse() })).toThrow();
    expect(() => calculateTieredSalary(-1, correctionConfig)).toThrow();
  });
});

describe('fixed salary', () => {
  it.each([0, 16, 24, 30, 31])('full-month %i attendance days stay at fixed 1,000,000', (days) => {
    expect(calculateFixedSalary(days, 25000, 1000000, false)).toBe(1000000);
  });
  it('partial employment pays actual attendance times daily rate, capped at fixed', () => {
    expect(calculateFixedSalary(8, 25000, 1000000, true)).toBe(200000);
    expect(calculateFixedSalary(30, 50000, 1000000, true)).toBe(1000000);
  });
  it('first and final partial months use calendar boundaries', () => {
    const employee = createInitialData().employees[0];
    expect(isPartialEmploymentMonth({ ...employee, startDate: '2026-09-01' }, DEMO_MONTH)).toBe(false);
    expect(isPartialEmploymentMonth({ ...employee, startDate: '2026-09-02' }, DEMO_MONTH)).toBe(true);
    expect(isPartialEmploymentMonth({ ...employee, endDate: '2026-09-29' }, DEMO_MONTH)).toBe(true);
    expect(isPartialEmploymentMonth({ ...employee, endDate: '2026-09-30' }, DEMO_MONTH)).toBe(false);
    expect(isPartialEmploymentMonth({ ...employee, endDate: '2028-02-29' }, '2028-02')).toBe(false);
  });
});

describe('employee calculations', () => {
  it('14 attendance days and 1 excused day produce 375,000 without increasing tier count', () => {
    const result = getEmployeePayroll(createInitialData(), 'CP-0003', DEMO_MONTH);
    expect(result.attendanceDays).toBe(14);
    expect(result.excusedDays).toBe(1);
    expect(result.baseSalary).toBe(400000);
    expect(result.excusedDeduction).toBe(25000);
    expect(result.finalSalary).toBe(375000);
  });
  it('keeps a negative salary visible', () => {
    const result = getEmployeePayroll(createInitialData(), 'CP-0011', DEMO_MONTH);
    expect(result.baseSalary).toBe(75000);
    expect(result.otherDeductions).toBe(100000);
    expect(result.finalSalary).toBe(-25000);
  });
  it('employee fixed override takes precedence with effective daily rate', () => {
    const data = createInitialData();
    const result = getEmployeePayroll(data, 'CP-0009', DEMO_MONTH);
    expect(result.salaryMode).toBe('FIXED');
    expect(result.partialMonth).toBe(true);
    expect(result.attendanceDays).toBe(8);
    expect(result.baseSalary).toBe(200000);
    const fullFixed = getEmployeePayroll(data, 'CP-0005', DEMO_MONTH);
    expect(fullFixed.baseSalary).toBe(800000);
    expect(fullFixed.dailyRate).toBe(30000);
    data.employees.find((item) => item.id === 'CP-0005')!.dailyRateOverride = 35000;
    expect(getEmployeePayroll(data, 'CP-0005', DEMO_MONTH).dailyRate).toBe(35000);
  });
  it('deducts department unexcused rate independently from effective daily rate', () => {
    const result = getEmployeePayroll(createInitialData(), 'CP-0007', DEMO_MONTH);
    expect(result.dailyRate).toBe(25000);
    expect(result.unexcusedDays).toBe(2);
    expect(result.unexcusedDeduction).toBe(90000);
  });
  it('lateness is statistical and never an automatic deduction', () => {
    const data = createInitialData();
    const before = getEmployeePayroll(data, 'CP-0002', DEMO_MONTH);
    for (const record of data.attendance.filter((item) => item.employeeId === 'CP-0002' && item.status === 'PRESENT')) record.latenessSeconds = 3600;
    const after = getEmployeePayroll(data, 'CP-0002', DEMO_MONTH);
    expect(after.lateDays).toBeGreaterThan(before.lateDays);
    expect(after.finalSalary).toBe(before.finalSalary);
  });
  it('applies excused, unexcused and manual adjustments after full-month fixed base', () => {
    const data = createInitialData();
    const record = data.attendance.find((item) => item.employeeId === 'CP-0012' && item.workdayId === 'wd-2026-09-01')!;
    record.status = 'EXCUSED'; record.checkIn = null; record.latenessSeconds = 0;
    data.bonuses.push({ id: 'bonus-test', employeeId: 'CP-0012', amount: 50000, date: '2026-09-01', reason: 'اختبار', createdBy: 'اختبار', createdAt: '2026-09-01T12:00:00Z' });
    data.deductions.push({ id: 'ded-test', employeeId: 'CP-0012', amount: 25000, date: '2026-09-01', type: 'خصم إداري', customType: '', reason: 'اختبار', createdBy: 'اختبار', createdAt: '2026-09-01T12:00:00Z' });
    const result = getEmployeePayroll(data, 'CP-0012', DEMO_MONTH);
    expect(result.baseSalary).toBe(1000000);
    expect(result.finalSalary).toBe(975000);
  });
  it('a missing expected record stays unresolved and has no automatic absence deduction', () => {
    const data = createInitialData();
    data.attendance = data.attendance.filter((item) => item.id !== 'att-2026-09-28-CP-0001');
    const result = getEmployeePayroll(data, 'CP-0001', DEMO_MONTH);
    expect(result.unresolvedDays).toBe(1);
    expect(result.unexcusedDays).toBe(0);
  });
  it('keeps attendance of inactive historical employees', () => {
    const result = getEmployeePayroll(createInitialData(), 'CP-0014', DEMO_MONTH);
    expect(result.attendanceDays).toBeGreaterThan(0);
    expect(result.unresolvedDays).toBe(0);
  });
});

describe('archive and payment', () => {
  it('open rate changes recalculate, archived month stays frozen, reopening is unchanged until explicit recalc', () => {
    const data = createInitialData();
    const employee = data.employees.find((item) => item.id === 'CP-0001')!;
    const config = data.departments.find((item) => item.id === employee.departmentId)!.salary;
    const before = getEmployeePayroll(data, employee.id, DEMO_MONTH);
    config.dailyRate = 30000;
    const changed = getEmployeePayroll(data, employee.id, DEMO_MONTH);
    expect(changed.finalSalary).not.toBe(before.finalSalary);
    const month = data.months.find((item) => item.month === DEMO_MONTH)!;
    month.snapshots = Object.fromEntries(getMonthPayroll(data, DEMO_MONTH).map((item) => [item.employeeId, structuredClone(item)]));
    month.state = 'ARCHIVED';
    const snapshot = structuredClone(month.snapshots[employee.id]);
    config.dailyRate = 40000;
    expect(getEmployeePayroll(data, employee.id, DEMO_MONTH)).toEqual(changed);
    month.state = 'REOPENED';
    expect(getEmployeePayroll(data, employee.id, DEMO_MONTH)).toEqual(changed);
    data.deductions.push({ ...data.deductions[0], id: 'explicit-change', amount: 5000 });
    expect(getEmployeePayroll(data, employee.id, DEMO_MONTH)).toEqual(changed);
    const explicitResult = recalculateReopenedPayroll(data, employee.id, DEMO_MONTH);
    expect(explicitResult.dailyRate).toBe(30000);
    expect(explicitResult.finalSalary).toBe(changed.finalSalary - 5000);
    expect(month.snapshots[employee.id]).toEqual(snapshot);
  });
  it('does not leak current names, departments or salary settings into archived payroll', () => {
    const data = createInitialData();
    const before = getEmployeePayroll(data, 'CP-0001', '2026-08');
    data.employees[0].name = 'اسم معدل';
    data.employees[0].departmentId = 'dept-admin';
    data.departments[0].salary.dailyRate = 99999;
    expect(getEmployeePayroll(data, 'CP-0001', '2026-08')).toEqual(before);
    expect(data.months[1].sourceSnapshot!.employees[0].name).toBe('علي محمد حسن');
  });
  it('650,000 previously paid, then 625,000 salary produces review and -25,000 difference', () => {
    const data = createInitialData();
    const history = structuredClone(data.payments);
    const result = getEmployeePayroll(data, 'CP-0002', DEMO_MONTH);
    expect(result.finalSalary).toBe(625000);
    expect(result.paymentStatus).toBe('REVIEW');
    expect(result.paidAmount).toBe(650000);
    expect(result.difference).toBe(-25000);
    expect(data.payments).toEqual(history);
  });
  it('archived snapshots are cloned, never exposed as mutable shared results', () => {
    const data = createInitialData();
    const result = getEmployeePayroll(data, 'CP-0001', '2026-08');
    result.salaryConfig.dailyRate = 1;
    expect(data.months[1].snapshots['CP-0001'].salaryConfig.dailyRate).toBe(25000);
  });
  it('rejects missing historical snapshot rather than silently calculating with current rules', () => {
    expect(() => getEmployeePayroll(createInitialData(), 'CP-0011', '2026-08')).toThrow();
  });
  it('explicit historical recalculation retains archived employment dates and department', () => {
    const data = createInitialData();
    const month = data.months.find((item) => item.month === '2026-08')!;
    const before = structuredClone(month.snapshots['CP-0012']);
    month.state = 'REOPENED';
    const employee = data.employees.find((item) => item.id === 'CP-0012')!;
    employee.startDate = '2026-08-15';
    employee.departmentId = 'dept-correction';
    employee.name = 'اسم جديد';
    const after = recalculateReopenedPayroll(data, employee.id, month.month);
    expect(after.baseSalary).toBe(before.baseSalary);
    expect(after.partialMonth).toBe(false);
    expect(after.employeeName).toBe(before.employeeName);
    expect(after.departmentName).toBe(before.departmentName);
  });
  it('does not produce a full fixed salary before employee starts', () => {
    expect(calculateEmployeePayroll(createInitialData(), 'CP-0011', '2026-08').baseSalary).toBe(0);
  });
});
