import { isExpected } from '../attendance';
import type { DemoData, PayrollResult, SalaryConfig } from '../types';
import { applyPaymentStatus } from '../finance/payment-status';
import { monthBounds, isPartialEmploymentMonth } from './calendar';
import { calculateFixedSalary, calculateTieredSalary, getEffectiveSalaryConfig } from './salary-config';

/** Pure preview computation; never persists money or authenticates a payment. */
export function calculateEmployeePayroll(data: DemoData, employeeId: string, month: string, historicalConfig?: SalaryConfig): PayrollResult {
  const employee = data.employees.find((item) => item.id === employeeId);
  if (!employee) throw new Error('لم يتم العثور على الموظف.');
  const { first, last } = monthBounds(month);
  const department = data.departments.find((item) => item.id === employee.departmentId);
  if (!department) throw new Error('لم يتم العثور على قسم الموظف.');
  const config = structuredClone(historicalConfig ?? getEffectiveSalaryConfig(data, employee));
  const workdays = data.workdays.filter((item) => item.date >= first && item.date <= last
    && item.date >= employee.startDate && (!employee.endDate || item.date <= employee.endDate));
  const workdayIds = new Set(workdays.map((item) => item.id));
  // Historical records inside employment dates survive deactivation and current
  // department changes. Records outside the employment window remain stored but
  // do not add required, present or absent days to this payroll calculation.
  const records = data.attendance.filter((item) => item.employeeId === employeeId && workdayIds.has(item.workdayId));
  const recorded = new Set(records.map((item) => item.workdayId));
  const expectedMissing = workdays.filter((item) => !recorded.has(item.id) && isExpected(employee, item)).length;
  const count = (status: (typeof records)[number]['status']) => records.filter((item) => item.status === status).length;
  const attendanceDays = count('PRESENT');
  const excusedDays = count('EXCUSED');
  const unexcusedDays = count('UNEXCUSED');
  // Salary law selection is based on days the employee was required to work, not only days actually attended.
  // Exempt / no-work days never count as required. Missing expected records remain required and unresolved.
  const requiredDays = records.filter((item) => item.status !== 'EXEMPT').length + expectedMissing;
  const partialMonth = isPartialEmploymentMonth(employee, month);
  const employedInMonth = employee.startDate <= last && (!employee.endDate || employee.endDate >= first);
  const baseSalary = !employedInMonth ? 0 : config.mode === 'FIXED'
    ? calculateFixedSalary(requiredDays, config.dailyRate, config.fixedSalary, partialMonth)
    : calculateTieredSalary(requiredDays, config);
  const excusedDeduction = excusedDays * config.dailyRate;
  const unexcusedDeduction = unexcusedDays * config.unexcusedRate;
  const otherDeductions = data.deductions.filter((item) => item.employeeId === employeeId && item.date >= first && item.date <= last).reduce((sum, item) => sum + item.amount, 0);
  const bonuses = data.bonuses.filter((item) => item.employeeId === employeeId && item.date >= first && item.date <= last).reduce((sum, item) => sum + item.amount, 0);
  const presentRecords = records.filter((item) => item.status === 'PRESENT');
  return applyPaymentStatus(data, {
    employeeId,
    employeeName: employee.name,
    employeeCode: employee.code,
    departmentName: department.name,
    month,
    salaryMode: config.mode,
    dailyRate: config.dailyRate,
    requiredDays,
    attendanceDays,
    excusedDays,
    unexcusedDays,
    exemptDays: count('EXEMPT'),
    unresolvedDays: count('UNRESOLVED') + expectedMissing,
    lateDays: presentRecords.filter((item) => item.latenessSeconds > 0).length,
    latenessSeconds: presentRecords.reduce((sum, item) => sum + item.latenessSeconds, 0),
    baseSalary,
    excusedDeduction,
    unexcusedDeduction,
    otherDeductions,
    bonuses,
    finalSalary: baseSalary - excusedDeduction - unexcusedDeduction - otherDeductions + bonuses,
    partialMonth,
    paymentStatus: 'UNPAID',
    paidAmount: 0,
    difference: 0,
    salaryConfig: config,
  });
}
