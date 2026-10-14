import { describe, expect, it } from 'vitest';
import { buildFinanceReport, type ReportFilters } from '../../src/lib/finance/reports';
import { createPopulatedTestData } from '../fixtures/populated-data';

const filters: ReportFilters = {
  type: 'payroll',
  month: '2026-09',
  department: '',
  employee: '',
  status: '',
  from: '',
  to: '',
};

describe('finance report model', () => {
  it('preserves required-day salary calculations and numeric export columns', () => {
    const data = createPopulatedTestData();
    const original = structuredClone(data);
    const model = buildFinanceReport(data, { ...filters, employee: 'CP-0001' });
    const section = model.report.sections[0];

    expect(section.columns.map(column => column.key)).toEqual([
      'code', 'name', 'department', 'mode', 'required', 'attendance', 'excused',
      'unexcused', 'base', 'absence', 'deductions', 'bonuses', 'final', 'payment',
    ]);
    expect(section.rows).toHaveLength(1);
    expect(section.rows[0]).toMatchObject({
      code: 'CP-0001', required: 24, attendance: 22, excused: 1,
      base: 600000, absence: 25000, final: 610000,
    });
    expect(section.columns.find(column => column.key === 'final')?.type).toBe('money');
    expect(data).toEqual(original);
  });

  it('reports a missing expected record as unresolved without persisting it', () => {
    const data = createPopulatedTestData();
    data.attendance = data.attendance.filter(item => item.id !== 'att-2026-09-28-CP-0001');
    const original = structuredClone(data);
    const model = buildFinanceReport(data, {
      ...filters, type: 'attendance', employee: 'CP-0001', status: 'UNRESOLVED',
      from: '2026-09-28', to: '2026-09-28',
    });

    expect(model.report.sections[0].rows).toEqual([expect.objectContaining({
      code: 'CP-0001', date: new Date('2026-09-28T00:00:00.000Z'),
      status: 'غير محسوم', checkin: '—', reason: 'بانتظار حسم حالة الحضور',
    })]);
    expect(data).toEqual(original);
  });

  it('limits absence reports to excused, unexcused, and unresolved statuses', () => {
    const data = createPopulatedTestData();
    const model = buildFinanceReport(data, { ...filters, type: 'absences' });
    const rows = model.report.sections[0].rows;

    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map(row => row.status))).toEqual(new Set(['غياب بعذر', 'غياب بدون عذر', 'غير محسوم']));
    const dates = rows.map(row => (row.date as Date).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it.each(['ARCHIVED', 'REOPENED'] as const)('%s reports keep historical identity, rules, and adjustments', state => {
    const data = createPopulatedTestData();
    const month = data.months.find(item => item.month === '2026-08')!;
    month.state = state;
    const selection: ReportFilters = { ...filters, type: 'employee', month: '2026-08', employee: 'CP-0001' };
    const before = buildFinanceReport(data, selection);

    const employee = data.employees.find(item => item.id === 'CP-0001')!;
    employee.name = 'اسم حالي مختلف';
    employee.departmentId = 'dept-admin';
    data.departments[0].salary.dailyRate = 99999;
    data.deductions.push({
      ...data.deductions[0], id: 'current-edit', employeeId: employee.id,
      date: '2026-08-15', amount: 500000,
    });

    const after = buildFinanceReport(data, selection);
    expect(after.report).toEqual(before.report);
    expect(after.results).toEqual(before.results);
    expect(after.selectedEmployee).toBe(employee.id);
  });

  it('uses current payment history alongside a frozen payslip snapshot', () => {
    const data = createPopulatedTestData();
    const month = data.months.find(item => item.month === '2026-08')!;
    const snapshot = structuredClone(month.snapshots['CP-0001']);
    data.payments.push({
      id: 'after-archive-payment', employeeId: 'CP-0001', month: '2026-08',
      amount: 123000, salaryAtPayment: snapshot.finalSalary, date: '2026-10-01',
      paidBy: 'مسؤول الاختبار', createdAt: '2026-10-01T12:00:00.000Z',
    });

    const model = buildFinanceReport(data, { ...filters, type: 'payslip', month: '2026-08', employee: 'CP-0001' });
    const paymentRows = model.report.sections.find(section => section.title === 'سجل الصرف')!.rows;
    expect(paymentRows).toContainEqual({
      date: new Date('2026-10-01T00:00:00.000Z'), salary: snapshot.finalSalary,
      amount: 123000, actor: 'مسؤول الاختبار',
    });
    expect(model.results[0].finalSalary).toBe(snapshot.finalSalary);
    expect(month.snapshots['CP-0001']).toEqual(snapshot);
  });

  it('rejects reversed date ranges only for report types that support date filtering', () => {
    const data = createPopulatedTestData();
    const reversed = { ...filters, from: '2026-09-28', to: '2026-09-01' };
    const attendance = buildFinanceReport(data, { ...reversed, type: 'attendance' });
    expect(attendance.invalidRange).toBe(true);
    expect(attendance.report.sections).toEqual([]);
    expect(attendance.hasRows).toBe(false);

    const payroll = buildFinanceReport(data, reversed);
    expect(payroll.invalidRange).toBe(false);
    expect(payroll.report).toEqual(buildFinanceReport(data, filters).report);
  });

  it('defaults person reports to the first employee in the selected department', () => {
    const data = createPopulatedTestData();
    const department = data.employees[3].departmentId;
    const expected = data.employees.find(item => item.departmentId === department)!;
    const model = buildFinanceReport(data, { ...filters, type: 'employee', department });
    expect(model.selectedEmployee).toBe(expected.id);
    expect(model.results.map(item => item.employeeId)).toEqual([expected.id]);
    expect(model.report.subtitle).toContain(expected.name);
  });
});
