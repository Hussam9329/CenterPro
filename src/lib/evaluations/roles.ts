import { hasEmployeePermission } from '../permissions';
import type { DemoData, Employee } from '../types';

function normalizeArabic(value: string): string {
  return value.trim().replace(/[أإآ]/g, 'ا').replace(/\s+/g, '');
}

export function isCorrectionDepartmentName(name: string): boolean {
  // Existing centers may label this same department with the explicit prefix.
  // This identifies the correction roster only; audit access uses permissions.
  const normalized = normalizeArabic(name);
  return normalized === normalizeArabic('التصحيح') || normalized === normalizeArabic('قسم التصحيح');
}

export function isCorrectionEmployee(data: DemoData, employee: Employee): boolean {
  const department = data.departments.find(item => item.id === employee.departmentId);
  return Boolean(employee.active && department && isCorrectionDepartmentName(department.name));
}

/** Auditing is an explicit per-account permission set by the super admin. */
export function isAuditEmployee(_data: DemoData, employee: Employee): boolean {
  return hasEmployeePermission(employee, 'AUDIT_REVIEW', 'view');
}

export function getCorrectionEmployees(data: DemoData): Employee[] {
  return data.employees.filter(employee => isCorrectionEmployee(data, employee));
}
