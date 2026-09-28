import { isExpected } from './attendance';
import type { DemoData, Employee, PayrollResult, SalaryConfig } from './types';

function integer(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} يجب أن يكون عدداً صحيحاً غير سالب.`);
}

export function validateSalaryConfig(config: SalaryConfig): void {
  integer(config.dailyRate, 'قيمة اليومية');
  integer(config.unexcusedRate, 'خصم الغياب');
  integer(config.fixedSalary, 'الراتب القطعي');
  integer(config.maximum, 'الحد الأعلى');
  if (config.mode === 'FIXED') return;
  integer(config.extraDaysStart, 'بداية الأيام الإضافية');
  if (!config.tiers.length) throw new Error('أضف شريحة راتب واحدة على الأقل.');
  let previousEnd = -1;
  for (const tier of config.tiers) {
    integer(tier.fromDays, 'بداية الشريحة');
    integer(tier.toDays, 'نهاية الشريحة');
    integer(tier.amount, 'مبلغ الشريحة');
    if (tier.fromDays > tier.toDays) throw new Error('بداية الشريحة يجب ألا تتجاوز نهايتها.');
    if (tier.fromDays <= previousEnd) throw new Error('يجب ترتيب شرائح الراتب دون تداخل.');
    if (tier.fromDays !== previousEnd + 1) throw new Error('يجب أن تغطي الشرائح جميع أعداد أيام الحضور بدءاً من 0 دون فجوات.');
    previousEnd = tier.toDays;
  }
  if (config.extraDaysStart <= previousEnd) throw new Error('الأيام الإضافية يجب أن تبدأ بعد نهاية آخر شريحة.');
}

export function calculateTieredSalary(days: number, config: SalaryConfig): number {
  integer(days, 'أيام الحضور');
  validateSalaryConfig(config);
  const tier = config.tiers.find((item) => days >= item.fromDays && days <= item.toDays);
  if (tier) return Math.min(config.maximum, tier.type === 'PER_DAY' ? days * config.dailyRate : tier.amount);
  const finalTier = config.tiers.at(-1);
  if (!finalTier) throw new Error('إعدادات شرائح الراتب غير مكتملة.');
  if (days > finalTier.toDays) {
    const base = finalTier.type === 'PER_DAY' ? finalTier.toDays * config.dailyRate : finalTier.amount;
    const extraDays = Math.max(0, days - config.extraDaysStart + 1);
    return Math.min(config.maximum, base + extraDays * config.dailyRate);
  }
  throw new Error('عدد أيام الحضور غير مغطى بشرائح الراتب.');
}

export function calculateFixedSalary(days: number, rate: number, fixed: number, partial: boolean): number {
  integer(days, 'أيام الحضور');
  integer(rate, 'قيمة اليومية');
  integer(fixed, 'الراتب القطعي');
  return partial ? Math.min(days * rate, fixed) : fixed;
}

function monthBounds(month: string): { first: string; last: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('الشهر غير صالح.');
  const [year, monthNumber] = month.split('-').map(Number);
  return { first: `${month}-01`, last: `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, '0')}` };
}

export function isPartialEmploymentMonth(employee: Employee, month: string): boolean {
  const { first, last } = monthBounds(month);
  return (employee.startDate > first && employee.startDate <= last) || Boolean(employee.endDate && employee.endDate >= first && employee.endDate < last);
}

export function getEffectiveSalaryConfig(data: DemoData, employee: Employee): SalaryConfig {
  const department = data.departments.find((item) => item.id === employee.departmentId);
  if (!department) throw new Error('لم يتم العثور على قسم الموظف.');
  const config = structuredClone(department.salary);
  if (employee.fixedOverride) {
    config.mode = 'FIXED';
    config.fixedSalary = employee.fixedSalary;
    config.dailyRate = employee.dailyRateOverride ?? department.salary.dailyRate;
  }
  return config;
}

function applyPaymentStatus(data: DemoData, result: PayrollResult): PayrollResult {
  const payments = data.payments.filter((item) => item.employeeId === result.employeeId && item.month === result.month);
  const latest = [...payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) return { ...result, paymentStatus: 'UNPAID', paidAmount: 0, difference: 0 };
  return {
    ...result,
    paymentStatus: latest.salaryAtPayment === result.finalSalary ? 'PAID' : 'REVIEW',
    paidAmount: latest.amount,
    difference: result.finalSalary - latest.amount,
  };
}

/** Pure preview computation; never persists money or authenticates a payment. */
export function calculateEmployeePayroll(data: DemoData, employeeId: string, month: string, historicalConfig?: SalaryConfig): PayrollResult {
  const employee = data.employees.find((item) => item.id === employeeId);
  if (!employee) throw new Error('لم يتم العثور على الموظف.');
  const { first, last } = monthBounds(month);
  const department = data.departments.find((item) => item.id === employee.departmentId);
  if (!department) throw new Error('لم يتم العثور على قسم الموظف.');
  const config = structuredClone(historicalConfig ?? getEffectiveSalaryConfig(data, employee));
  const workdays = data.workdays.filter((item) => item.date >= first && item.date <= last);
  const workdayIds = new Set(workdays.map((item) => item.id));
  // Historical records survive deactivation and current department changes.
  const records = data.attendance.filter((item) => item.employeeId === employeeId && workdayIds.has(item.workdayId));
  const recorded = new Set(records.map((item) => item.workdayId));
  const expectedMissing = workdays.filter((item) => !recorded.has(item.id) && isExpected(employee, item)).length;
  const count = (status: (typeof records)[number]['status']) => records.filter((item) => item.status === status).length;
  const attendanceDays = count('PRESENT');
  const partialMonth = isPartialEmploymentMonth(employee, month);
  const employedInMonth = employee.startDate <= last && (!employee.endDate || employee.endDate >= first);
  const baseSalary = !employedInMonth ? 0 : config.mode === 'FIXED'
    ? calculateFixedSalary(attendanceDays, config.dailyRate, config.fixedSalary, partialMonth)
    : calculateTieredSalary(attendanceDays, config);
  const excusedDays = count('EXCUSED');
  const unexcusedDays = count('UNEXCUSED');
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

export function getEmployeePayroll(data: DemoData, employeeId: string, month: string): PayrollResult {
  const payrollMonth = data.months.find((item) => item.month === month);
  const snapshot = payrollMonth?.snapshots[employeeId];
  if (payrollMonth && payrollMonth.state !== 'OPEN') {
    if (!snapshot) throw new Error('لا توجد نسخة أرشيفية لهذا الموظف في الشهر المحدد.');
    // Payment history can grow after archiving; financial snapshot stays immutable.
    return applyPaymentStatus(data, structuredClone(snapshot));
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
