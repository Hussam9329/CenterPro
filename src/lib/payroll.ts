/** Stable payroll API shared by server validation, reports, and employee views. */
export { validateSalaryConfig, calculateTieredSalary, calculateFixedSalary, getEffectiveSalaryConfig } from './payroll/salary-config';
export { isPartialEmploymentMonth } from './payroll/calendar';
export { calculateEmployeePayroll } from './payroll/calculation';
export { getEmployeePayroll, getMonthPayroll, recalculateReopenedPayroll } from './payroll/history';
