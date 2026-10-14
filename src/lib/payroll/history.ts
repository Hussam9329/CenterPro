import type { DemoData, PayrollResult } from '../types';
import { applyPaymentStatus } from '../finance/payment-status';
import { monthBounds } from './calendar';
import { calculateEmployeePayroll } from './calculation';

export function getEmployeePayroll(data: DemoData, employeeId: string, month: string): PayrollResult {
  const payrollMonth = data.months.find((item) => item.month === month);
  const snapshot = payrollMonth?.snapshots[employeeId];
  if (payrollMonth && payrollMonth.state !== 'OPEN') {
    if (!snapshot) throw new Error('لا توجد نسخة أرشيفية لهذا الموظف في الشهر المحدد.');
    const historical = structuredClone(snapshot);
    // Older preview archives predate requiredDays. Fill only this display count
    // from their frozen status totals; never recalculate historical money.
    historical.requiredDays ??= historical.attendanceDays + historical.excusedDays + historical.unexcusedDays + historical.unresolvedDays;
    // Payment history can grow after archiving; financial snapshot stays immutable.
    return applyPaymentStatus(data, historical);
  }
  return calculateEmployeePayroll(data, employeeId, month);
}

export function getMonthPayroll(data: DemoData, month: string): PayrollResult[] {
  const payrollMonth = data.months.find((item) => item.month === month);
  if (payrollMonth && payrollMonth.state !== 'OPEN') {
    return Object.keys(payrollMonth.snapshots).map((employeeId) => getEmployeePayroll(data, employeeId, month));
  }
  const { first, last } = monthBounds(month);
  return data.employees.filter((item) => item.startDate <= last && (!item.endDate || item.endDate >= first))
    .map((item) => getEmployeePayroll(data, item.id, month));
}

/** Call only from an explicit Super Admin preview action; caller audits and saves the result. */
export function recalculateReopenedPayroll(data: DemoData, employeeId: string, month: string): PayrollResult {
  const payrollMonth = data.months.find((item) => item.month === month);
  const snapshot = payrollMonth?.snapshots[employeeId];
  if (payrollMonth?.state !== 'REOPENED' || !snapshot) throw new Error('أعد فتح الشهر المؤرشف قبل إعادة الاحتساب.');
  // Reopened operational changes must not import current employment dates or
  // department membership into the preserved historical employment context.
  const historicalEmployee = payrollMonth.sourceSnapshot?.employees.find((item) => item.id === employeeId);
  const calculationData = historicalEmployee ? {
    ...data,
    employees: [...data.employees.filter((item) => item.id !== employeeId), historicalEmployee],
    departments: payrollMonth.sourceSnapshot!.departments,
  } : data;
  const result = calculateEmployeePayroll(calculationData, employeeId, month, snapshot.salaryConfig);
  return { ...result, employeeName: snapshot.employeeName, employeeCode: snapshot.employeeCode, departmentName: snapshot.departmentName };
}
